"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
exports.requireRole = requireRole;
exports.ensureCourseMembership = ensureCourseMembership;
const http_status_codes_1 = require("http-status-codes");
const prisma_1 = require("../lib/prisma");
const errors_1 = require("../utils/errors");
const jwt_1 = require("../modules/auth/jwt");
const asyncHandler_1 = require("../utils/asyncHandler");
// Parse and verify Authorization headers, attaching the user to the request.
exports.authenticate = (0, asyncHandler_1.asyncHandler)(async (req, _res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Authorization header missing");
    }
    let userId;
    try {
        const token = authHeader.split(" ")[1];
        const payload = (0, jwt_1.verifyToken)(token);
        userId = payload.sub;
    }
    catch {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Invalid or expired token");
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, role: true, isBanned: true },
    });
    if (!user) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "User not found");
    }
    if (user.isBanned) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.FORBIDDEN, "Account is banned");
    }
    req.user = { id: user.id, role: user.role };
    next();
});
// Gate a route to a single role or list of roles.
function requireRole(role) {
    const allowedRoles = Array.isArray(role) ? role : [role];
    return (req, _res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return next(new errors_1.AppError(http_status_codes_1.StatusCodes.FORBIDDEN, "Insufficient permissions"));
        }
        return next();
    };
}
// Verify that the user either teaches or is enrolled in the course.
async function ensureCourseMembership(courseId, userId) {
    const membership = await prisma_1.prisma.course.findUnique({
        where: { id: courseId },
        select: {
            lecturerId: true,
            enrollments: {
                where: { userId },
                select: { id: true },
            },
        },
    });
    if (!membership) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.NOT_FOUND, "Course not found");
    }
    const isLecturer = membership.lecturerId === userId;
    const isEnrolled = membership.enrollments.length > 0;
    if (!isLecturer && !isEnrolled) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.FORBIDDEN, "You are not a member of this course");
    }
    return { isLecturer, isEnrolled };
}
