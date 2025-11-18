import { Prisma, MessageType } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { notFound } from "../../utils/errors";

// Shared selection used by both REST and Socket.io responses.
export const messageSelect = {
  id: true,
  courseId: true,
  senderId: true,
  content: true,
  type: true,
  createdAt: true,
  pinned: true,
  pinnedAt: true,
  sender: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  pinnedBy: {
    select: {
      id: true,
      name: true,
      role: true,
    },
  },
  attachment: {
    select: {
      id: true,
      fileName: true,
      mimeType: true,
      size: true,
      url: true,
    },
  },
} satisfies Prisma.MessageSelect;

export type MessageWithRelations = Prisma.MessageGetPayload<{
  select: typeof messageSelect;
}>;

// Normalize optional relations and provide a consistent shape.
export function serializeMessage(message: MessageWithRelations) {
  return {
    ...message,
    attachment: message.attachment ?? null,
    pinned: message.pinned ?? false,
    pinnedAt: message.pinnedAt ?? null,
    pinnedBy: message.pinnedBy ?? null,
  };
}

// Cursor-paginated read of a course's messages ordered chronologically.
export async function fetchCourseMessages(
  courseId: string,
  limit = 20,
  cursor?: string
) {
  const messages = await prisma.message.findMany({
    where: { courseId },
    orderBy: { createdAt: "asc" },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: messageSelect,
  });

  const nextCursor =
    messages.length === limit ? messages[messages.length - 1].id : null;

  return {
    messages: messages.map(serializeMessage),
    nextCursor,
  };
}

// Persist a TEXT message and return the hydrated representation.
export async function createTextMessage(
  courseId: string,
  senderId: string,
  content: string
) {
  const message = (await prisma.message.create({
    data: {
      courseId,
      senderId,
      content,
      type: MessageType.TEXT,
    },
    select: messageSelect,
  })) as MessageWithRelations;

  return serializeMessage(message);
}

async function ensureMessageInCourse(messageId: string, courseId: string) {
  const exists = await prisma.message.findFirst({
    where: { id: messageId, courseId },
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
      // Unpin any other message in this course before setting the new pin.
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

      return updated as MessageWithRelations;
    }
  );

  return serializeMessage(message);
}

export async function unpinMessage(courseId: string, messageId: string) {
  await ensureMessageInCourse(messageId, courseId);

  const message = (await prisma.message.update({
    where: { id: messageId },
    data: {
      pinned: false,
      pinnedAt: null,
      pinnedById: null,
    },
    select: messageSelect,
  })) as MessageWithRelations;

  return serializeMessage(message);
}
