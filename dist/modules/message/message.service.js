"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageSelect = void 0;
exports.serializeMessage = serializeMessage;
exports.fetchCourseMessages = fetchCourseMessages;
exports.createTextMessage = createTextMessage;
const client_1 = require("@prisma/client");
const prisma_1 = require("../../lib/prisma");
// Shared selection used by both REST and Socket.io responses.
exports.messageSelect = {
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
            role: true
        }
    },
    attachment: {
        select: {
            id: true,
            fileName: true,
            mimeType: true,
            size: true,
            url: true
        }
    }
};
// Normalize optional relations and provide a consistent shape.
function serializeMessage(message) {
    return {
        ...message,
        attachment: message.attachment ?? null
    };
}
// Cursor-paginated read of a course's messages ordered chronologically.
async function fetchCourseMessages(courseId, limit = 20, cursor) {
    const query = {
        where: { courseId },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: exports.messageSelect
    };
    if (cursor) {
        query.cursor = { id: cursor };
        query.skip = 1;
    }
    const messages = (await prisma_1.prisma.message.findMany(query));
    const nextCursor = messages.length === limit ? messages[messages.length - 1].id : null;
    return {
        messages: messages.map(serializeMessage),
        nextCursor
    };
}
// Persist a TEXT message and return the hydrated representation.
async function createTextMessage(courseId, senderId, content) {
    const message = (await prisma_1.prisma.message.create({
        data: {
            courseId,
            senderId,
            content,
            type: client_1.MessageType.TEXT
        },
        select: exports.messageSelect
    }));
    return serializeMessage(message);
}
