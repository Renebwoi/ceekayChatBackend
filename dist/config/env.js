"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appConfig = void 0;
const dotenv_1 = require("dotenv");
const zod_1 = require("zod");
// Load .env variables into process.env before we attempt to read or validate them.
(0, dotenv_1.config)();
// Central schema describing the required configuration knobs for the backend.
const envSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.string().default("development"),
    PORT: zod_1.z.string().default("4000"),
    DATABASE_URL: zod_1.z.string().url(),
    JWT_SECRET: zod_1.z.string().min(16, "JWT_SECRET must be at least 16 characters"),
    CLIENT_ORIGIN: zod_1.z.string().url(),
    B2_KEY_ID: zod_1.z.string(),
    B2_APPLICATION_KEY: zod_1.z.string(),
    B2_BUCKET_ID: zod_1.z.string(),
    B2_PUBLIC_BASE_URL: zod_1.z.string().url(),
});
// Validate the current process.env snapshot so we fail fast during boot.
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error("❌ Invalid environment configuration", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables. Check your .env file");
}
const env = parsed.data;
// appConfig is the single source of truth for configuration the rest of the
// application should consume instead of touching process.env directly.
exports.appConfig = {
    nodeEnv: env.NODE_ENV,
    port: Number(env.PORT),
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    clientOrigin: env.CLIENT_ORIGIN,
    b2: {
        keyId: env.B2_KEY_ID,
        applicationKey: env.B2_APPLICATION_KEY,
        bucketId: env.B2_BUCKET_ID,
        publicBaseUrl: env.B2_PUBLIC_BASE_URL,
    },
};
