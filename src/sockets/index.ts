import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { appConfig } from "../config/env";
import { verifyToken } from "../modules/auth/jwt";
import { registerChatHandlers } from "./chat.handlers";

// Wire up Socket.io with auth middleware and event handlers.
export function initSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: appConfig.clientOrigin,
      credentials: true,
    },
  });

  // Require a valid JWT for every socket connection before joining rooms.
  io.use((socket: Socket, next: (err?: Error) => void) => {
    try {
      const token =
        socket.handshake.auth?.token ??
        socket.handshake.headers?.authorization?.split(" ")[1];
      if (!token) {
        return next(new Error("Authentication token missing"));
      }
      const payload = verifyToken(token);
      socket.data.user = { id: payload.sub, role: payload.role };
      return next();
    } catch (error) {
      return next(error as Error);
    }
  });

  registerChatHandlers(io);

  return io;
}
