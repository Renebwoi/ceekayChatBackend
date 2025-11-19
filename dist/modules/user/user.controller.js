"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentUser = void 0;
const http_status_codes_1 = require("http-status-codes");
const asyncHandler_1 = require("../../utils/asyncHandler");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../utils/errors");
// Returns the authenticated user's profile sans password.
exports.getCurrentUser = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    if (!req.user) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Not authenticated");
    }
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.user.id },
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
    if (!user) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.NOT_FOUND, "User not found");
    }
    res.status(http_status_codes_1.StatusCodes.OK).json({ user });
});
