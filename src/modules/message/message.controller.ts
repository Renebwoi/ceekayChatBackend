import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { ensureCourseMembership } from "../../middleware/auth";
import {
  fetchCourseMessages,
  createTextMessage,
  pinMessage,
  unpinMessage,
  searchCourseMessages,
  fetchMessageReplies,
  createFileMessage,
} from "./message.service";
import { AppError } from "../../utils/errors";
import { getSignedDownloadUrl, uploadToB2 } from "../../lib/b2";
import { prisma } from "../../lib/prisma";
import {
  broadcastCourseMessage,
  broadcastCourseMessagePinned,
  broadcastCourseMessageUnpinned,
  broadcastCourseReplySummary,
} from "../../sockets/chat.handlers";
import { UserRole } from "@prisma/client";
import { Server } from "socket.io";
import { appConfig } from "../../config/env";

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
  parentMessageId: z.string().trim().min(1).optional(),
});

// Optional caption text for file uploads.
const uploadBodySchema = z.object({
  content: z.string().optional(),
  parentMessageId: z.string().trim().min(1).optional(),
});

function getStoragePathFromUrl(url: string) {
  const base = appConfig.b2.publicBaseUrl.replace(/\/+$/, "");

  if (!url.startsWith(`${base}/`)) {
    throw new AppError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      "Attachment URL is not compatible with configured Backblaze public base URL"
    );
  }

  return url.slice(base.length + 1);
}

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

// GET /api/courses/:courseId/messages/:messageId/replies
export const listMessageReplies = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const courseId = req.params.courseId;
    const messageId = req.params.messageId;

    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "User missing from request context"
      );
    }

    if (!courseId || !messageId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Course ID and message ID are required"
      );
    }

    if (userRole === UserRole.ADMIN) {
      await prisma.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { id: true },
      });
    } else {
      await ensureCourseMembership(courseId, userId);
    }

    const parentMessage = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, courseId: true, parentMessageId: true },
    });

    if (!parentMessage || parentMessage.courseId !== courseId) {
      throw new AppError(StatusCodes.NOT_FOUND, "Message not found");
    }

    if (parentMessage.parentMessageId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Replies can only be fetched for top-level messages"
      );
    }

    const { limit, cursor } = paginationSchema.parse(req.query);
    const result = await fetchMessageReplies(courseId, messageId, limit, cursor);

    res.status(StatusCodes.OK).json(result);
  }
);

// GET /api/courses/:courseId/messages/:messageId/attachment
export const downloadCourseAttachment = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const userRole = req.user?.role;
    const courseId = req.params.courseId;
    const messageId = req.params.messageId;

    if (!userId) {
      throw new AppError(
        StatusCodes.UNAUTHORIZED,
        "User missing from request context"
      );
    }

    if (!courseId || !messageId) {
      throw new AppError(
        StatusCodes.BAD_REQUEST,
        "Course ID and message ID are required"
      );
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        courseId: true,
        attachment: {
          select: {
            fileName: true,
            mimeType: true,
            size: true,
            url: true,
          },
        },
      },
    });

    if (!message || message.courseId !== courseId) {
      throw new AppError(StatusCodes.NOT_FOUND, "Message not found");
    }

    if (!message.attachment) {
      throw new AppError(StatusCodes.NOT_FOUND, "Message has no attachment");
    }

    if (userRole === UserRole.ADMIN) {
      await prisma.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { id: true },
      });
    } else {
      await ensureCourseMembership(courseId, userId);
    }

    const storagePath = getStoragePathFromUrl(message.attachment.url);
    const signed = await getSignedDownloadUrl(storagePath);

    res.status(StatusCodes.OK).json({
      url: signed.url,
      expiresIn: signed.expiresIn,
      fileName: message.attachment.fileName,
      mimeType: message.attachment.mimeType,
      size: message.attachment.size,
    });
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
    const { content, parentMessageId } = createMessageSchema.parse(req.body);
    const result = await createTextMessage(
      courseId,
      userId,
      content,
      parentMessageId ?? null
    );

    broadcastCourseMessage(getSocketInstance(req), result.message);
    if (result.parentUpdate) {
      broadcastCourseReplySummary(getSocketInstance(req), result.parentUpdate);
    }

    res.status(StatusCodes.CREATED).json(result.message);
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

    const result = await createFileMessage({
      courseId,
      senderId: userId,
      content: body.content ?? null,
      parentMessageId: body.parentMessageId ?? null,
      attachment: {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: uploadResult.fileUrl,
      },
    });

    broadcastCourseMessage(getSocketInstance(req), result.message);
    if (result.parentUpdate) {
      broadcastCourseReplySummary(getSocketInstance(req), result.parentUpdate);
    }

    res.status(StatusCodes.CREATED).json(result.message);
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
