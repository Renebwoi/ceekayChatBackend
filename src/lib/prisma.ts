import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads to avoid exhausting DB connections.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Create (or reuse) the Prisma client with verbose logs enabled in development only.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "info", "warn", "error"]
        : ["warn", "error"],
  });

// Cache the instance globally during development to survive module reloads.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
