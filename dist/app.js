"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
exports.buildApp = buildApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const env_1 = require("./config/env");
const auth_routes_1 = require("./modules/auth/auth.routes");
const user_routes_1 = require("./modules/user/user.routes");
const course_routes_1 = require("./modules/course/course.routes");
const admin_routes_1 = require("./modules/admin/admin.routes");
const errorHandler_1 = require("./middleware/errorHandler");
// Build and configure the Express instance with all middleware/routes.
function buildApp() {
    const app = (0, express_1.default)();
    // Allow browser clients from CLIENT_ORIGIN to make authenticated requests.
    app.use((0, cors_1.default)({
        origin: env_1.appConfig.clientOrigin,
        credentials: true,
    }));
    // Parse incoming JSON/form payloads before hitting route handlers.
    app.use(express_1.default.json({ limit: "10mb" }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // Simple health probe for uptime checks and monitors.
    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    // Domain routers keep controllers isolated by feature area.
    app.use("/api/auth", auth_routes_1.authRoutes);
    app.use("/api/users", user_routes_1.userRoutes);
    app.use("/api/courses", course_routes_1.courseRoutes);
    app.use("/api/admin", admin_routes_1.adminRoutes);
    // Last middleware handles all errors bubbled up from routes.
    app.use(errorHandler_1.errorHandler);
    return app;
}
exports.app = buildApp();
