"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUser = registerUser;
exports.loginUser = loginUser;
const bcrypt_1 = __importDefault(require("bcrypt"));
const http_status_codes_1 = require("http-status-codes");
const prisma_1 = require("../../lib/prisma");
const errors_1 = require("../../utils/errors");
const jwt_1 = require("./jwt");
const SALT_ROUNDS = 10;
// Create a new user account and return the sanitized user + JWT.
async function registerUser(payload) {
    const existing = await prisma_1.prisma.user.findUnique({ where: { email: payload.email } });
    if (existing) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.CONFLICT, "Email already registered");
    }
    const hashedPassword = await bcrypt_1.default.hash(payload.password, SALT_ROUNDS);
    const user = await prisma_1.prisma.user.create({
        data: {
            name: payload.name,
            email: payload.email,
            password: hashedPassword,
            role: payload.role
        }
    });
    const token = (0, jwt_1.signToken)({ sub: user.id, role: user.role });
    return {
        user: sanitizeUser(user),
        token
    };
}
// Verify credentials and issue a fresh JWT on success.
async function loginUser(payload) {
    const user = await prisma_1.prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Invalid credentials");
    }
    const passwordMatch = await bcrypt_1.default.compare(payload.password, user.password);
    if (!passwordMatch) {
        throw new errors_1.AppError(http_status_codes_1.StatusCodes.UNAUTHORIZED, "Invalid credentials");
    }
    const token = (0, jwt_1.signToken)({ sub: user.id, role: user.role });
    return {
        user: sanitizeUser(user),
        token
    };
}
// Strip the hashed password before sending a user to the client.
function sanitizeUser(user) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...rest } = user;
    return rest;
}
