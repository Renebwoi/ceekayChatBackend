"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageSelect = void 0;
exports.serializeMessage = serializeMessage;
exports.fetchCourseMessages = fetchCourseMessages;
exports.createTextMessage = createTextMessage;
exports.pinMessage = pinMessage;
exports.unpinMessage = unpinMessage;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../utils/errors");
// Shared selection used by both REST and Socket.io responses.
exports.messageSelect = {
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
};
// Normalize optional relations and provide a consistent shape.
function serializeMessage(message) {
    return {
        ...message,
        senderId: message.senderId,
        attachment: message.attachment ?? null,
        pinned: message.pinned ?? false,
        pinnedAt: message.pinnedAt ?? null,
        pinnedBy: message.pinnedBy ?? null,
    };
}
// Cursor-paginated read of a course's messages ordered chronologically.
async function fetchCourseMessages(courseId, limit = 20, cursor) {
    const messages = await prisma_1.prisma.message.findMany({
        where: { courseId },
        orderBy: { createdAt: "asc" },
        take: limit,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: exports.messageSelect,
    });
    const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;
    return {
        messages: messages.map(serializeMessage),
        nextCursor,
    };
}
// Persist a TEXT message and return the hydrated representation.
async function createTextMessage(courseId, senderId, content) {
    const message = (await prisma_1.prisma.message.create({
        data: {
            courseId,
            senderId,
            content,
            type: client_1.MessageType.TEXT,
        },
        select: exports.messageSelect,
    }));
    return serializeMessage(message);
}
async function ensureMessageInCourse(messageId, courseId) {
    const exists = await prisma_1.prisma.message.findFirst({
        where: { id: messageId, courseId },
        select: { id: true },
    });
    if (!exists) {
        (0, errors_1.notFound)("Message not found in this course");
    }
}
async function pinMessage(courseId, messageId, lecturerId) {
    await ensureMessageInCourse(messageId, courseId);
    const message = await prisma_1.prisma.$transaction(async (tx) => {
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
            select: exports.messageSelect,
        });
        return updated;
    });
    return serializeMessage(message);
}
async function unpinMessage(courseId, messageId) {
    await ensureMessageInCourse(messageId, courseId);
    const message = (await prisma_1.prisma.message.update({
        where: { id: messageId },
        data: {
            pinned: false,
            pinnedAt: null,
            pinnedById: null,
        },
        select: exports.messageSelect,
    }));
    return serializeMessage(message);
}
