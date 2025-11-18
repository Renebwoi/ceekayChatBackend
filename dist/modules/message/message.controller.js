"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadCourseFile = exports.createCourseMessage = exports.listCourseMessages = void 0;
const http_status_codes_1 = require("http-status-codes");
const zod_1 = require("zod");
const asyncHandler_1 = require("../../utils/asyncHandler");
const auth_1 = require("../../middleware/auth");
const message_service_1 = require("./message.service");
const errors_1 = require("../../utils/errors");
const b2_1 = require("../../lib/b2");
const prisma_1 = require("../../lib/prisma");
const client_1 = require("@prisma/client");
const chat_handlers_1 = require("../../sockets/chat.handlers");
// Querystring guard for message pagination.
const paginationSchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().min(1).max(100).default(20),
    cursor: zod_1.z.string().optional()
});
// POST payload guard for message creation.
const createMessageSchema = zod_1.z.object({
    content: zod_1.z.string().min(1)
});
// Optional caption text for file uploads.
const uploadBodySchema = zod_1.z.object({
    content: zod_1.z.string().optional()
});
// Helper to access the Socket.io instance injected by server.ts.
function getSocketInstance(req) {
    return req.app.get("io");
}
// GET /api/courses/:courseId/messages
exports.listCourseMessages = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    const courseId = req.params.courseId;
    if (!userId) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "User missing from request context");
    }
    await (0, auth_1.ensureCourseMembership)(courseId, userId);
    const { limit, cursor } = paginationSchema.parse(req.query);
    const result = await (0, message_service_1.fetchCourseMessages)(courseId, limit, cursor);
    res.status(http_status_codes_1.StatusCodes.OK).json(result);
});
// POST /api/courses/:courseId/messages (text only)
exports.createCourseMessage = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    const courseId = req.params.courseId;
    if (!userId) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "User missing from request context");
    }
    await (0, auth_1.ensureCourseMembership)(courseId, userId);
    const { content } = createMessageSchema.parse(req.body);
    const message = await (0, message_service_1.createTextMessage)(courseId, userId, content);
    (0, chat_handlers_1.broadcastCourseMessage)(getSocketInstance(req), message);
    res.status(http_status_codes_1.StatusCodes.CREATED).json(message);
});
// POST /api/courses/:courseId/uploads
exports.uploadCourseFile = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    const courseId = req.params.courseId;
    if (!userId) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "User missing from request context");
    }
    await (0, auth_1.ensureCourseMembership)(courseId, userId);
    const body = uploadBodySchema.parse(req.body ?? {});
    if (!req.file) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "File is required");
    }
    const fileName = `${courseId}/${Date.now()}_${req.file.originalname}`;
    const uploadResult = await (0, b2_1.uploadToB2)({
        fileName,
        buffer: req.file.buffer,
        mimeType: req.file.mimetype
    });
    const message = await prisma_1.prisma.$transaction(async (tx) => {
        const createdMessage = await tx.message.create({
            data: {
                courseId,
                senderId: userId,
                content: body.content ?? null,
                type: client_1.MessageType.FILE
            }
        });
        await tx.attachment.create({
            data: {
                messageId: createdMessage.id,
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
                url: uploadResult.fileUrl
            }
        });
        const hydrated = await tx.message.findUniqueOrThrow({
            where: { id: createdMessage.id },
            select: message_service_1.messageSelect
        });
        return (0, message_service_1.serializeMessage)(hydrated);
    });
    (0, chat_handlers_1.broadcastCourseMessage)(getSocketInstance(req), message);
    res.status(http_status_codes_1.StatusCodes.CREATED).json(message);
});
