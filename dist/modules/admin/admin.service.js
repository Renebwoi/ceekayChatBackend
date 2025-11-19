"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCourse = createCourse;
exports.listCourses = listCourses;
exports.updateCourse = updateCourse;
exports.deleteCourse = deleteCourse;
exports.assignCourseLecturer = assignCourseLecturer;
exports.addCourseEnrollment = addCourseEnrollment;
exports.listLecturers = listLecturers;
exports.listStudents = listStudents;
exports.getCourseRoster = getCourseRoster;
exports.removeCourseEnrollment = removeCourseEnrollment;
exports.setUserBanStatus = setUserBanStatus;
const client_1 = require("@prisma/client");
const http_status_codes_1 = require("http-status-codes");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../utils/errors");
const courseInclude = {
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
            id: true,
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
};
const enrollmentInclude = {
    user: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
        },
    },
};
const courseSummarySelect = {
    id: true,
    code: true,
    title: true,
    lecturer: {
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
        },
    },
    _count: {
        select: {
            enrollments: true,
        },
    },
};
function isPrismaNotFound(error) {
    return (typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2025");
}
function handleNotFound(error, message) {
    if (isPrismaNotFound(error)) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.NOT_FOUND, message);
    }
    throw error;
}
async function ensureLecturer(userId) {
    const lecturer = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isBanned: true },
    });
    if (!lecturer) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.NOT_FOUND, "Lecturer not found");
    }
    if (lecturer.role !== client_1.UserRole.LECTURER) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "User is not a lecturer");
    }
    if (lecturer.isBanned) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "Cannot assign a banned lecturer");
    }
    return lecturer.id;
}
async function ensureStudent(userId) {
    const student = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isBanned: true },
    });
    if (!student) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.NOT_FOUND, "Student not found");
    }
    if (student.role !== client_1.UserRole.STUDENT) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "User is not a student");
    }
    if (student.isBanned) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "Cannot enroll a banned student");
    }
    return student.id;
}
async function createCourse(input) {
    const lecturerId = await ensureLecturer(input.lecturerId);
    return prisma_1.prisma.course.create({
        data: {
            code: input.code,
            title: input.title,
            lecturerId,
        },
        include: courseInclude,
    });
}
async function listCourses() {
    const courses = (await prisma_1.prisma.course.findMany({
        select: courseSummarySelect,
        orderBy: { code: "asc" },
    }));
    return courses.map((course) => ({
        id: course.id,
        code: course.code,
        title: course.title,
        lecturer: course.lecturer ?? null,
        studentCount: course._count.enrollments,
    }));
}
async function updateCourse(courseId, input) {
    if (!input.code && !input.title) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "Provide at least one field to update");
    }
    try {
        return await prisma_1.prisma.course.update({
            where: { id: courseId },
            data: {
                ...(input.code ? { code: input.code } : {}),
                ...(input.title ? { title: input.title } : {}),
            },
            include: courseInclude,
        });
    }
    catch (error) {
        handleNotFound(error, "Course not found");
    }
}
async function deleteCourse(courseId) {
    try {
        await prisma_1.prisma.$transaction(async (tx) => {
            await tx.attachment.deleteMany({
                where: { message: { courseId } },
            });
            await tx.message.deleteMany({ where: { courseId } });
            await tx.enrollment.deleteMany({ where: { courseId } });
            await tx.course.delete({ where: { id: courseId } });
        });
    }
    catch (error) {
        handleNotFound(error, "Course not found");
    }
}
async function assignCourseLecturer(courseId, lecturerId) {
    const validatedLecturerId = await ensureLecturer(lecturerId);
    try {
        return await prisma_1.prisma.course.update({
            where: { id: courseId },
            data: { lecturerId: validatedLecturerId },
            include: courseInclude,
        });
    }
    catch (error) {
        handleNotFound(error, "Course not found");
    }
}
async function addCourseEnrollment(courseId, userId) {
    const validatedUserId = await ensureStudent(userId);
    const courseExists = await prisma_1.prisma.course.findUnique({
        where: { id: courseId },
        select: { id: true },
    });
    if (!courseExists) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.NOT_FOUND, "Course not found");
    }
    return prisma_1.prisma.enrollment.upsert({
        where: {
            userId_courseId: {
                userId: validatedUserId,
                courseId,
            },
        },
        update: {},
        create: {
            courseId,
            userId: validatedUserId,
        },
        include: enrollmentInclude,
    });
}
async function listLecturers() {
    const lecturers = await prisma_1.prisma.user.findMany({
        where: { role: client_1.UserRole.LECTURER, isBanned: false },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
        },
        orderBy: { name: "asc" },
    });
    return lecturers;
}
async function listStudents() {
    const students = (await prisma_1.prisma.user.findMany({
        where: { role: client_1.UserRole.STUDENT },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
            isBanned: true,
        },
        orderBy: { name: "asc" },
    }));
    return students.map((student) => ({
        id: student.id,
        name: student.name,
        email: student.email,
        role: student.role,
        department: student.department,
        banned: student.isBanned,
    }));
}
async function getCourseRoster(courseId) {
    const course = (await prisma_1.prisma.course.findUnique({
        where: { id: courseId },
        select: {
            id: true,
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
                orderBy: { user: { name: "asc" } },
            },
        },
    }));
    if (!course) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.NOT_FOUND, "Course not found");
    }
    return {
        courseId: course.id,
        students: course.enrollments.map((enrollment) => enrollment.user),
    };
}
async function removeCourseEnrollment(courseId, userId) {
    try {
        await prisma_1.prisma.enrollment.delete({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
        });
    }
    catch (error) {
        handleNotFound(error, "Enrollment not found");
    }
}
async function setUserBanStatus(userId, isBanned) {
    try {
        return await prisma_1.prisma.user.update({
            where: { id: userId },
            data: { isBanned },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                department: true,
                isBanned: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }
    catch (error) {
        handleNotFound(error, "User not found");
    }
}
