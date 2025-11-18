"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Reuse a single PrismaClient across hot reloads to avoid exhausting DB connections.
const globalForPrisma = globalThis;
// Create (or reuse) the Prisma client with verbose logs enabled in development only.
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === "development"
            ? ["query", "info", "warn", "error"]
            : ["warn", "error"],
    });
// Cache the instance globally during development to survive module reloads.
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = exports.prisma;
}
