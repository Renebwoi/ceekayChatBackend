import { Prisma, MessageType } from "@prisma/client";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { AppError, notFound } from "../../utils/errors";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
};

const attachmentSelect = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  url: true,
};

const parentSelect = {
  id: true,
  type: true,
  content: true,
  sender: {
    select: {
      id: true,
      name: true,
    },
  },
  attachment: {
    select: {
      fileName: true,
    },
  },
} satisfies Prisma.MessageSelect;

const CONTENT_SNIPPET_MAX_LENGTH = 120;

// Shared selection used by both REST and Socket.io responses.
export const messageSelect = {
  id: true,
  courseId: true,
  senderId: true,
  parentMessageId: true,
  content: true,
  type: true,
  createdAt: true,
  pinned: true,
  pinnedAt: true,
  pinnedBy: {
    select: userSelect,
  },
  sender: {
    select: userSelect,
  },
  attachment: {
    select: attachmentSelect,
  },
  deleted: true,
  parent: {
    select: parentSelect,
  },
} satisfies Prisma.MessageSelect;

export type MessageWithRelations = Prisma.MessageGetPayload<{
  select: typeof messageSelect;
}>;

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

function truncateSnippet(value: string, maxLength = CONTENT_SNIPPET_MAX_LENGTH) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function buildReplyTo(message: MessageWithRelations) {
  const parent = message.parent;
  if (!parent) {
    return null;
  }

  const trimmedContent = parent.content?.trim();
  let snippet: string | null = null;

  if (trimmedContent) {
    snippet = truncateSnippet(trimmedContent);
  } else if (parent.attachment?.fileName) {
    snippet = parent.attachment.fileName;
  } else if (parent.type === MessageType.FILE) {
    snippet = "File attachment";
  }

  return {
    id: parent.id,
    senderName: parent.sender.name,
    contentSnippet: snippet,
    type: parent.type,
  } as const;
}

export function serializeMessage(message: MessageWithRelations) {
  const attachment = message.attachment
    ? {
        ...message.attachment,
        downloadUrl: `/api/courses/${message.courseId}/messages/${message.id}/attachment`,
      }
    : null;

  return {
    id: message.id,
    courseId: message.courseId,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    createdAt: message.createdAt,
    attachment,
    sender: message.sender,
    pinned: message.pinned ?? false,
    pinnedAt: message.pinnedAt ?? null,
    pinnedBy: message.pinnedBy ?? null,
    parentMessageId: message.parentMessageId ?? null,
    replyTo: buildReplyTo(message),
    deleted: message.deleted ?? false,
  } as const;
}

export type SerializedMessage = ReturnType<typeof serializeMessage>;

// Cursor-paginated read of a course's messages ordered chronologically.
export async function fetchCourseMessages(
  courseId: string,
  limit = 20,
  cursor?: string
) {
  const messages = await prisma.message.findMany({
    where: { courseId, deleted: false },
    orderBy: { createdAt: "asc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const serialized = messages.map(serializeMessage);
  const nextCursor =
    messages.length === limit ? messages[messages.length - 1].id : null;

  return {
    messages: serialized,
    nextCursor,
  };
}

export async function searchCourseMessages(
  courseId: string,
  term: string,
  limit = 20,
  cursor?: string
) {
  const messages = await prisma.message.findMany({
    where: {
      courseId,
      deleted: false,
      OR: [
        {
          content: {
            contains: term,
            mode: "insensitive",
          },
        },
        {
          attachment: {
            fileName: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const serialized = messages.map(serializeMessage);
  const nextCursor =
    messages.length === limit ? messages[messages.length - 1].id : null;

  return {
    messages: serialized,
    nextCursor,
  };
}

type CreateMessageArgs = {
  courseId: string;
  senderId: string;
  content: string | null;
  type: MessageType;
  parentMessageId?: string | null;
  attachment?: {
    fileName: string;
    mimeType: string;
    size: number;
    url: string;
  } | null;
};

export async function createTextMessage(
  courseId: string,
  senderId: string,
  content: string,
  parentMessageId: string | null = null
): Promise<SerializedMessage> {
  return createMessageInternal({
    courseId,
    senderId,
    content,
    type: MessageType.TEXT,
    parentMessageId,
  });
}

export async function createFileMessage(
  args: Omit<CreateMessageArgs, "type">
): Promise<SerializedMessage> {
  return createMessageInternal({ ...args, type: MessageType.FILE });
}

async function loadParentMessage(
  client: PrismaClientOrTx,
  courseId: string,
  parentMessageId: string
) {
  const parent = await client.message.findUnique({
    where: { id: parentMessageId },
    select: {
      id: true,
      courseId: true,
      deleted: true,
    },
  });

  if (!parent || parent.courseId !== courseId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Parent message not found in this course"
    );
  }

  if (parent.deleted) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Cannot reply to a deleted message"
    );
  }

  return parent.id;
}
async function createMessageInternal({
  courseId,
  senderId,
  content,
  type,
  parentMessageId = null,
  attachment = null,
}: CreateMessageArgs): Promise<SerializedMessage> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const parentId = parentMessageId
      ? await loadParentMessage(tx, courseId, parentMessageId)
      : null;

    const created = await tx.message.create({
      data: {
        courseId,
        senderId,
        content,
        type,
        parentMessageId: parentId,
      },
    });

    if (attachment) {
      await tx.attachment.create({
        data: {
          messageId: created.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          url: attachment.url,
        },
      });
    }

    const hydrated = await tx.message.findUniqueOrThrow({
      where: { id: created.id },
      select: messageSelect,
    });

    return serializeMessage(hydrated as MessageWithRelations);
  });
}

async function ensureMessageInCourse(messageId: string, courseId: string) {
  const exists = await prisma.message.findFirst({
    where: { id: messageId, courseId, deleted: false },
    select: { id: true },
  });

  if (!exists) {
    notFound("Message not found in this course");
  }
}

export async function pinMessage(
  courseId: string,
  messageId: string,
  lecturerId: string
) {
  await ensureMessageInCourse(messageId, courseId);

  const message = await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      await tx.message.updateMany({
        where: {
          courseId,
          pinned: true,
          NOT: { id: messageId },
        },
        data: {
          pinned: false,
          pinnedAt: null,
          pinnedById: null,
        },
      });

      const updated = await tx.message.update({
        where: { id: messageId },
        data: {
          pinned: true,
          pinnedAt: new Date(),
          pinnedById: lecturerId,
        },
        select: messageSelect,
      });
 
      return serializeMessage(updated as MessageWithRelations);
    }
  );

  return message;
}

export async function unpinMessage(courseId: string, messageId: string) {
  await ensureMessageInCourse(messageId, courseId);

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: {
      pinned: false,
      pinnedAt: null,
      pinnedById: null,
    },
    select: messageSelect,
  });
 
  return serializeMessage(updated as MessageWithRelations);
}
