import { Server, Socket } from "socket.io";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ensureCourseMembership } from "../middleware/auth";
import {
  createTextMessage,
  serializeMessage,
  ReplySummaryPayload,
} from "../modules/message/message.service";
import { AppError } from "../utils/errors";

const socketMessageSchema = z.object({
  courseId: z.string().min(1),
  content: z.string().min(1),
  parentMessageId: z.string().trim().min(1).optional(),
});

export type CourseSocketMessage = ReturnType<typeof serializeMessage>;

// Attach course messaging handlers to the Socket.io instance.
export function registerChatHandlers(io: Server) {
  io.on("connection", async (socket: Socket) => {
    try {
      await joinUserRooms(socket);
    } catch (error) {
      console.error("Failed to join rooms", error);
      socket.disconnect(true);
      return;
    }

    socket.on(
      "course_message",
      async (
        payload: unknown,
        callback?: (
          response:
            | { status: "ok"; message: CourseSocketMessage }
            | { status: "error"; message: string }
        ) => void
      ) => {
        try {
          const data = socketMessageSchema.parse(payload);
          const userId = socket.data.user?.id;
          if (!userId) {
            throw new AppError(401, "Unauthenticated");
          }

          await ensureCourseMembership(data.courseId, userId);
          const result = await createTextMessage(
            data.courseId,
            userId,
            data.content,
            data.parentMessageId ?? null
          );
          broadcastCourseMessage(io, result.message);
          if (result.parentUpdate) {
            broadcastCourseReplySummary(io, result.parentUpdate);
          }
          callback?.({ status: "ok", message: result.message });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          callback?.({ status: "error", message });
        }
      }
    );
  });
}

// Join every course room the user is teaching or enrolled in.
async function joinUserRooms(socket: Socket) {
  const userId = socket.data.user?.id;
  if (!userId) {
    throw new AppError(401, "Unauthenticated");
  }

  const courses: Array<{ id: string }> = await prisma.course.findMany({
    where: {
      OR: [{ lecturerId: userId }, { enrollments: { some: { userId } } }],
    },
    select: { id: true },
  });

  courses.forEach((course) => socket.join(course.id));
}

// Helper used by HTTP + Socket flows to fan messages out to course rooms.
export function broadcastCourseMessage(
  io: Server | undefined,
  message: CourseSocketMessage
) {
  if (!io) return;
  io.to(message.courseId).emit("course_message:new", message);
}

export function broadcastCourseReplySummary(
  io: Server | undefined,
  payload: ReplySummaryPayload
) {
  if (!io) return;
  io.to(payload.courseId).emit("course_message:reply_count", payload);
}

export function broadcastCourseMessagePinned(
  io: Server | undefined,
  message: CourseSocketMessage
) {
  if (!io) return;
  io.to(message.courseId).emit("course_message:pinned", {
    courseId: message.courseId,
    message,
  });
}

export function broadcastCourseMessageUnpinned(
  io: Server | undefined,
  message: CourseSocketMessage
) {
  if (!io) return;
  io.to(message.courseId).emit("course_message:unpinned", {
    courseId: message.courseId,
    message,
  });
}
