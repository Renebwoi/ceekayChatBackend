import express, { Request, Response } from "express";
import cors from "cors";
import { appConfig } from "./config/env";
import { authRoutes } from "./modules/auth/auth.routes";
import { userRoutes } from "./modules/user/user.routes";
import { courseRoutes } from "./modules/course/course.routes";
import { adminRoutes } from "./modules/admin/admin.routes";
import { errorHandler } from "./middleware/errorHandler";

// Build and configure the Express instance with all middleware/routes.
export function buildApp() {
  const app = express();

  // Allow browser clients from CLIENT_ORIGIN to make authenticated requests.
  app.use(
    cors({
      origin: appConfig.clientOrigin,
      credentials: true,
    })
  );

  // Parse incoming JSON/form payloads before hitting route handlers.
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Simple health probe for uptime checks and monitors.
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Domain routers keep controllers isolated by feature area.
  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/courses", courseRoutes);
  app.use("/api/admin", adminRoutes);

  // Last middleware handles all errors bubbled up from routes.
  app.use(errorHandler);

  return app;
}

export const app = buildApp();
