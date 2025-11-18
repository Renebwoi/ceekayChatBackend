"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const pino_1 = __importDefault(require("pino"));
const app_1 = require("./app");
const env_1 = require("./config/env");
const sockets_1 = require("./sockets");
// Structured logger for startup/shutdown and future server logs.
const logger = (0, pino_1.default)({ name: "chatroomx" });
// Create HTTP server manually so Socket.io can share the same port.
const server = http_1.default.createServer(app_1.app);
const io = (0, sockets_1.initSocketServer)(server);
app_1.app.set("io", io);
const PORT = env_1.appConfig.port;
// Begin listening once all wiring is in place.
server.listen(PORT, () => {
    logger.info(` ChatRoomX backend running on port ${PORT}`);
});
// Gracefully close the server when the process receives termination signals.
process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down");
    server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down");
    server.close(() => process.exit(0));
});
