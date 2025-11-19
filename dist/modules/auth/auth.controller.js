"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const http_status_codes_1 = require("http-status-codes");
const zod_1 = require("zod");
const asyncHandler_1 = require("../../utils/asyncHandler");
const auth_service_1 = require("./auth.service");
const client_1 = require("@prisma/client");
// Input validation for registration body.
const registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    role: zod_1.z.nativeEnum(client_1.UserRole).refine((role) => role !== client_1.UserRole.ADMIN, {
        message: "Self-service admin registration is not allowed",
    }),
    department: zod_1.z.string().trim().min(1, "Department is required"),
});
// Input validation for login body.
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
// POST /api/auth/register
exports.register = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = registerSchema.parse(req.body);
    const result = await (0, auth_service_1.registerUser)(data);
    res.status(http_status_codes_1.StatusCodes.CREATED).json(result);
});
// POST /api/auth/login
exports.login = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const data = loginSchema.parse(req.body);
    const result = await (0, auth_service_1.loginUser)(data);
    res.status(http_status_codes_1.StatusCodes.OK).json(result);
});
