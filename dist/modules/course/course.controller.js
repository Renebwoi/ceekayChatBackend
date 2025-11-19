"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markCourseAsRead = exports.getMyCourses = void 0;
const http_status_codes_1 = require("http-status-codes");
const asyncHandler_1 = require("../../utils/asyncHandler");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../utils/errors");
const auth_1 = require("../../middleware/auth");
// GET /api/courses/my — both lecturers and students see their assigned courses.
exports.getMyCourses = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!req.user) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Not authenticated");
    }
    const courses = await prisma_1.prisma.course.findMany({
        where: {
            OR: [
                { lecturerId: req.user.id },
                { enrollments: { some: { userId: req.user.id } } },
            ],
        },
        include: {
            lecturer: {
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    department: true,
                },
            },
            enrollments: {
                select: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            department: true,
                        },
                    },
                },
            },
            readStates: {
                where: { userId: req.user.id },
                select: { lastReadAt: true },
            },
            _count: {
                select: {
                    messages: true,
                },
            },
        },
    });
    const toCourseResponse = async (course) => {
        const lastReadAt = course.readStates[0]?.lastReadAt ?? null;
        const unreadCount = lastReadAt
            ? await prisma_1.prisma.message.count({
                where: {
                    courseId: course.id,
                    createdAt: { gt: lastReadAt },
                },
            })
            : course._count.messages;
        const { readStates, _count, ...rest } = course;
        return { ...rest, unreadCount };
    };
    const coursesWithUnread = await Promise.all(courses.map(toCourseResponse));
    res.status(http_status_codes_1.StatusCodes.OK).json({ courses: coursesWithUnread });
});
// POST /api/courses/:courseId/read — mark all messages up to now as read for the user.
exports.markCourseAsRead = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Not authenticated");
    }
    const courseId = req.params.courseId;
    if (!courseId) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "Course ID is required");
    }
    await (0, auth_1.ensureCourseMembership)(courseId, userId);
    const now = new Date();
    await prisma_1.prisma.courseReadState.upsert({
        where: {
            userId_courseId: {
                userId,
                courseId,
            },
        },
        update: { lastReadAt: now },
        create: {
            userId,
            courseId,
            lastReadAt: now,
        },
    });
    res.status(http_status_codes_1.StatusCodes.OK).json({ success: true });
});
