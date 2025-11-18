"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerChatHandlers = registerChatHandlers;
exports.broadcastCourseMessage = broadcastCourseMessage;
const zod_1 = require("zod");
const prisma_1 = require("../lib/prisma");
const auth_1 = require("../middleware/auth");
const message_service_1 = require("../modules/message/message.service");
const errors_1 = require("../utils/errors");
const socketMessageSchema = zod_1.z.object({
    courseId: zod_1.z.string().min(1),
    content: zod_1.z.string().min(1)
});
// Attach course messaging handlers to the Socket.io instance.
function registerChatHandlers(io) {
    io.on("connection", async (socket) => {
        try {
            await joinUserRooms(socket);
        }
        catch (error) {
            console.error("Failed to join rooms", error);
            socket.disconnect(true);
            return;
        }
        socket.on("course_message", async (payload, callback) => {
            try {
                const data = socketMessageSchema.parse(payload);
                const userId = socket.data.user?.id;
                if (!userId) {
                    throw new errors_1.AppError(401, "Unauthenticated");
                }
                await (0, auth_1.ensureCourseMembership)(data.courseId, userId);
                const message = await (0, message_service_1.createTextMessage)(data.courseId, userId, data.content);
                broadcastCourseMessage(io, message);
                callback?.({ status: "ok", message });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                callback?.({ status: "error", message });
            }
        });
    });
}
// Join every course room the user is teaching or enrolled in.
async function joinUserRooms(socket) {
    const userId = socket.data.user?.id;
    if (!userId) {
        throw new errors_1.AppError(401, "Unauthenticated");
    }
    const courses = await prisma_1.prisma.course.findMany({
        where: {
            OR: [
                { lecturerId: userId },
                { enrollments: { some: { userId } } }
            ]
        },
        select: { id: true }
    });
    courses.forEach((course) => socket.join(course.id));
}
// Helper used by HTTP + Socket flows to fan messages out to course rooms.
function broadcastCourseMessage(io, message) {
    if (!io)
        return;
    io.to(message.courseId).emit("course_message:new", message);
}
