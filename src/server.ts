import http from "http";
import pino from "pino";
import { app } from "./app";
import { appConfig } from "./config/env";
import { initSocketServer } from "./sockets";

// Structured logger for startup/shutdown and future server logs.
const logger = pino({ name: "chatroomx" });

// Create HTTP server manually so Socket.io can share the same port.
const server = http.createServer(app);
const io = initSocketServer(server);
app.set("io", io);

const PORT = appConfig.port;

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
