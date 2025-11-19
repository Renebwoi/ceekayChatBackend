import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ensureCourseMembership } from "../../middleware/auth";
import {
  fetchCourseMessages,
  createTextMessage,
  messageSelect,
  serializeMessage,
  pinMessage,
  unpinMessage,
  searchCourseMessages,
} from "./message.service";
import { AppError } from "../../utils/errors";
import { uploadToB2 } from "../../lib/b2";
import { prisma } from "../../lib/prisma";
import { MessageType, Prisma } from "@prisma/client";
import {
  broadcastCourseMessage,
  broadcastCourseMessagePinned,
  broadcastCourseMessageUnpinned,
} from "../../sockets/chat.handlers";
import { UserRole } from "@prisma/client";
import { Server } from "socket.io";

// Querystring guard for message pagination.
const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const searchQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(1, "Search term is required"),
});

// POST payload guard for message creation.
const createMessageSchema = z.object({
  content: z.string().min(1),
});

// Optional caption text for file uploads.
const uploadBodySchema = z.object({
  content: z.string().optional(),
});

// Helper to access the Socket.io instance injected by server.ts.
function getSocketInstance(req: Request) {
  return req.app.get("io") as Server | undefined;
}

// GET /api/courses/:courseId/messages
export const listCourseMessages = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const courseId = req.params.courseId;
    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "User missing from request context"
      );
    }

    await ensureCourseMembership(courseId, userId);
    const { limit, cursor } = paginationSchema.parse(req.query);
    const result = await fetchCourseMessages(courseId, limit, cursor);
    res.status(StatusCodes.OK).json(result);
  }
);

// GET /api/courses/:courseId/messages/search
export const searchCourseMessagesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const courseId = req.params.courseId;

    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "User missing from request context"
      );
    }

    if (!courseId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Course ID is required");
    }

    const { q, limit, cursor } = searchQuerySchema.parse(req.query);

    if (userRole === UserRole.ADMIN) {
      await prisma.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { id: true },
      });
    } else {
      await ensureCourseMembership(courseId, userId);
    }

    const result = await searchCourseMessages(courseId, q, limit, cursor);

    res.status(StatusCodes.OK).json(result);
  }
);

// POST /api/courses/:courseId/messages (text only)
export const createCourseMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const courseId = req.params.courseId;
    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "User missing from request context"
      );
    }

    await ensureCourseMembership(courseId, userId);
    const { content } = createMessageSchema.parse(req.body);
    const message = await createTextMessage(courseId, userId, content);

    broadcastCourseMessage(getSocketInstance(req), message);

    res.status(StatusCodes.CREATED).json(message);
  }
);

// POST /api/courses/:courseId/uploads
export const uploadCourseFile = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const courseId = req.params.courseId;
    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "User missing from request context"
      );
    }

    await ensureCourseMembership(courseId, userId);
    const body = uploadBodySchema.parse(req.body ?? {});

    if (!req.file) {
      throw new AppError(StatusCodes.BAD_REQUEST, "File is required");
    }

    const fileName = `${courseId}/${Date.now()}_${req.file.originalname}`;
    const uploadResult = await uploadToB2({
      fileName,
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    });

    const message = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const createdMessage = await tx.message.create({
          data: {
            courseId,
            senderId: userId,
            content: body.content ?? null,
            type: MessageType.FILE,
          },
        });

        await tx.attachment.create({
          data: {
            messageId: createdMessage.id,
            fileName: req.file!.originalname,
            mimeType: req.file!.mimetype,
            size: req.file!.size,
            url: uploadResult.fileUrl,
          },
        });

        const hydrated = await tx.message.findUniqueOrThrow({
          where: { id: createdMessage.id },
          select: messageSelect,
        });

        return serializeMessage(hydrated);
      }
    );

    broadcastCourseMessage(getSocketInstance(req), message);

    res.status(StatusCodes.CREATED).json(message);
  }
);

// POST /api/courses/:courseId/messages/:messageId/pin
export const pinCourseMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const courseId = req.params.courseId;
    const messageId = req.params.messageId;

    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "User missing from request context"
      );
    }

    if (!messageId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Message id is required");
    }

    const membership = await ensureCourseMembership(courseId, userId);
    if (!membership.isLecturer) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Only the course lecturer can pin messages"
      );
    }

    const message = await pinMessage(courseId, messageId, userId);

    broadcastCourseMessagePinned(getSocketInstance(req), message);

    res.status(StatusCodes.OK).json(message);
  }
);

// DELETE /api/courses/:courseId/messages/:messageId/pin
export const unpinCourseMessage = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const courseId = req.params.courseId;
    const messageId = req.params.messageId;

    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "User missing from request context"
      );
    }

    if (!messageId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Message id is required");
    }

    const membership = await ensureCourseMembership(courseId, userId);
    if (!membership.isLecturer) {
      throw new AppError(
        StatusCodes.FORBIDDEN,
        "Only the course lecturer can unpin messages"
      );
    }

    const message = await unpinMessage(courseId, messageId);

    broadcastCourseMessageUnpinned(getSocketInstance(req), message);

    res.status(StatusCodes.OK).json(message);
  }
);
