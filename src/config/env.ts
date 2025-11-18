import { config as loadEnv } from "dotenv";
import { z } from "zod";

// Load .env variables into process.env before we attempt to read or validate them.
loadEnv();

// Central schema describing the required configuration knobs for the backend.
const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().default("4000"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  CLIENT_ORIGIN: z.string().url(),
  B2_KEY_ID: z.string(),
  B2_APPLICATION_KEY: z.string(),
  B2_BUCKET_ID: z.string(),
  B2_PUBLIC_BASE_URL: z.string().url(),
});

// Validate the current process.env snapshot so we fail fast during boot.
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment configuration",
    parsed.error.flatten().fieldErrors
  );
  throw new Error("Invalid environment variables. Check your .env file");
}

const env = parsed.data;

// appConfig is the single source of truth for configuration the rest of the
// application should consume instead of touching process.env directly.
export const appConfig = {
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
