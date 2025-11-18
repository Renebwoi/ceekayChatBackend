import { Prisma, MessageType } from "@prisma/client";
import { prisma } from "../../lib/prisma";

// Shared selection used by both REST and Socket.io responses.
export const messageSelect = {
  id: true,
  courseId: true,
  senderId: true,
  content: true,
  type: true,
  createdAt: true,
  sender: {
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
  };
}

// Cursor-paginated read of a course's messages ordered chronologically.
export async function fetchCourseMessages(
  courseId: string,
  limit = 20,
  cursor?: string
) {
  const query: Prisma.MessageFindManyArgs = {
    where: { courseId },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: messageSelect,
  };

  if (cursor) {
    query.cursor = { id: cursor };
    query.skip = 1;
  }

  const messages = (await prisma.message.findMany(
    query
  )) as MessageWithRelations[];
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
