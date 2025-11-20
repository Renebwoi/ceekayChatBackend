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

const latestReplySelect = {
  id: true,
  courseId: true,
  parentMessageId: true,
  content: true,
  createdAt: true,
  sender: {
    select: userSelect,
  },
  attachment: {
    select: {
      fileName: true,
    },
  },
};

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
} satisfies Prisma.MessageSelect;

export type MessageWithRelations = Prisma.MessageGetPayload<{
  select: typeof messageSelect;
}>;

type ReplySummary = {
  replyCount: number;
  latestReply: LatestReply | null;
};

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

function defaultReplySummary(): ReplySummary {
  return { replyCount: 0, latestReply: null };
}

function previewFromMessage(
  message: Pick<MessageWithRelations, "content"> & {
    attachment?: { fileName: string } | null;
  }
) {
  if (message.content && message.content.trim().length > 0) {
    return message.content;
  }

  if (message.attachment?.fileName) {
    return message.attachment.fileName;
  }

  return null;
}

function toLatestReplyPayload(
  message: Prisma.MessageGetPayload<{ select: typeof latestReplySelect }>
) {
  return {
    id: message.id,
    sender: message.sender,
    preview: previewFromMessage(message),
    createdAt: message.createdAt,
  };
}

export type LatestReply = ReturnType<typeof toLatestReplyPayload>;

export function serializeMessage(
  message: MessageWithRelations,
  summary: ReplySummary = defaultReplySummary()
) {
  const attachment = message.attachment
    ? {
        ...message.attachment,
        downloadUrl: `/api/courses/${message.courseId}/messages/${message.id}/attachment`,
      }
    : null;

  return {
    ...message,
    senderId: message.senderId,
    attachment,
    pinned: message.pinned ?? false,
    pinnedAt: message.pinnedAt ?? null,
    pinnedBy: message.pinnedBy ?? null,
    parentMessageId: message.parentMessageId ?? null,
    deleted: message.deleted ?? false,
    replyCount: summary.replyCount,
    latestReply: summary.latestReply,
  };
}

export type SerializedMessage = ReturnType<typeof serializeMessage>;

async function fetchReplySummaries(
  messageIds: string[],
  client: PrismaClientOrTx = prisma
) {
  const ids = Array.from(new Set(messageIds.filter(Boolean)));
  const summaries = new Map<string, ReplySummary>();

  ids.forEach((id) => summaries.set(id, defaultReplySummary()));

  if (ids.length === 0) {
    return summaries;
  }

  const counts = await client.message.groupBy({
    by: ["parentMessageId"],
    where: {
      parentMessageId: { in: ids },
      deleted: false,
    },
    _count: {
      parentMessageId: true,
    },
  });

  counts.forEach((row) => {
    const parentId = row.parentMessageId;
    if (!parentId) return;
    const summary = summaries.get(parentId);
    if (summary) {
      summary.replyCount = row._count.parentMessageId;
    }
  });

  const latestReplies = await client.message.findMany({
    where: {
      parentMessageId: { in: ids },
      deleted: false,
    },
    orderBy: [{ parentMessageId: "asc" }, { createdAt: "desc" }],
    distinct: [Prisma.MessageScalarFieldEnum.parentMessageId],
    select: latestReplySelect,
  });

  latestReplies.forEach(
    (reply: Prisma.MessageGetPayload<{ select: typeof latestReplySelect }>) => {
      const parentId = reply.parentMessageId;
      if (!parentId) return;
      const summary = summaries.get(parentId);
      if (summary) {
        summary.latestReply = toLatestReplyPayload(reply);
      }
    }
  );

  return summaries;
}

async function serializeMessagesWithSummaries(
  messages: MessageWithRelations[],
  client: PrismaClientOrTx = prisma
) {
  const topLevelIds = messages
    .filter((message) => !message.parentMessageId)
    .map((message) => message.id);

  const summaries = await fetchReplySummaries(topLevelIds, client);

  return messages.map((message) =>
    serializeMessage(
      message,
      message.parentMessageId
        ? defaultReplySummary()
        : summaries.get(message.id) ?? defaultReplySummary()
    )
  );
}

// Cursor-paginated read of a course's top-level messages ordered chronologically.
export async function fetchCourseMessages(
  courseId: string,
  limit = 20,
  cursor?: string
) {
  const messages = await prisma.message.findMany({
    where: { courseId, parentMessageId: null, deleted: false },
    orderBy: { createdAt: "asc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const serialized = await serializeMessagesWithSummaries(messages);
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

  const serialized = await serializeMessagesWithSummaries(messages);
  const nextCursor =
    messages.length === limit ? messages[messages.length - 1].id : null;

  return {
    messages: serialized,
    nextCursor,
  };
}

export type ReplySummaryPayload = {
  courseId: string;
  messageId: string;
  replyCount: number;
  latestReply: LatestReply | null;
};

export type CreateMessageResult = {
  message: SerializedMessage;
  parentUpdate?: ReplySummaryPayload;
};

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
): Promise<CreateMessageResult> {
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
): Promise<CreateMessageResult> {
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
      parentMessageId: true,
      deleted: true,
    },
  });

  if (!parent || parent.courseId !== courseId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Parent message not found in this course"
    );
  }

  if (parent.parentMessageId) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Replies can only target top-level messages"
    );
  }

  if (parent.deleted) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Cannot reply to a deleted message"
    );
  }

  return { id: parent.id, courseId: parent.courseId };
}

async function buildParentSummary(
  client: PrismaClientOrTx,
  parent: { id: string; courseId: string }
): Promise<ReplySummaryPayload> {
  const summaries = await fetchReplySummaries([parent.id], client);
  const summary = summaries.get(parent.id) ?? defaultReplySummary();

  return {
    courseId: parent.courseId,
    messageId: parent.id,
    replyCount: summary.replyCount,
    latestReply: summary.latestReply,
  };
}

async function createMessageInternal({
  courseId,
  senderId,
  content,
  type,
  parentMessageId = null,
  attachment = null,
}: CreateMessageArgs): Promise<CreateMessageResult> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const parent = parentMessageId
      ? await loadParentMessage(tx, courseId, parentMessageId)
      : null;

    const created = await tx.message.create({
      data: {
        courseId,
        senderId,
        content,
        type,
        parentMessageId: parent?.id ?? null,
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

    const [serialized] = await serializeMessagesWithSummaries([hydrated], tx);

    const parentUpdate = parent
      ? await buildParentSummary(tx, parent)
      : undefined;

    return {
      message: serialized,
      parentUpdate,
    };
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

export async function fetchMessageReplies(
  courseId: string,
  messageId: string,
  limit = 20,
  cursor?: string
) {
  const replies = await prisma.message.findMany({
    where: {
      courseId,
      parentMessageId: messageId,
      deleted: false,
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const serialized = await serializeMessagesWithSummaries(replies);
  const nextCursor =
    replies.length === limit ? replies[replies.length - 1].id : null;

  return {
    replies: serialized,
    nextCursor,
  };
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

      const [serialized] = await serializeMessagesWithSummaries(
        [updated as MessageWithRelations],
        tx
      );

      return serialized;
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

  const [serialized] = await serializeMessagesWithSummaries([
    updated as MessageWithRelations,
  ]);

  return serialized;
}
