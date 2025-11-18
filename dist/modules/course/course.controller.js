"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enrollInCourse = exports.getMyCourses = exports.createCourse = void 0;
const http_status_codes_1 = require("http-status-codes");
const zod_1 = require("zod");
const asyncHandler_1 = require("../../utils/asyncHandler");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../utils/errors");
// Lecturer-facing payload validator.
const createCourseSchema = zod_1.z.object({
    code: zod_1.z.string().min(2),
    title: zod_1.z.string().min(2),
});
// POST /api/courses — lecturers create a new course shell.
exports.createCourse = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!req.user) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Not authenticated");
    }
    const data = createCourseSchema.parse(req.body);
    const course = await prisma_1.prisma.course.create({
        data: {
            code: data.code,
            title: data.title,
            lecturerId: req.user.id,
        },
    });
    res.status(http_status_codes_1.StatusCodes.CREATED).json({ course });
});
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
                select: { id: true, name: true, email: true },
            },
            enrollments: {
                select: {
                    user: { select: { id: true, name: true, email: true, role: true } },
                },
            },
        },
    });
    res.status(http_status_codes_1.StatusCodes.OK).json({ courses });
});
// POST /api/courses/:courseId/enroll — students enroll themselves.
exports.enrollInCourse = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!req.user) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Not authenticated");
    }
    const courseId = req.params.courseId;
    if (!courseId) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "Course ID is required");
    }
    await prisma_1.prisma.course.findUniqueOrThrow({ where: { id: courseId } });
    const enrollment = await prisma_1.prisma.enrollment.upsert({
        where: {
            userId_courseId: {
                userId: req.user.id,
                courseId,
            },
        },
        update: {},
        create: {
            userId: req.user.id,
            courseId,
        },
    });
    res.status(http_status_codes_1.StatusCodes.CREATED).json({ enrollment });
});
