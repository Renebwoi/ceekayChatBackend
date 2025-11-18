"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
const socket_io_1 = require("socket.io");
const env_1 = require("../config/env");
const jwt_1 = require("../modules/auth/jwt");
const chat_handlers_1 = require("./chat.handlers");
// Wire up Socket.io with auth middleware and event handlers.
function initSocketServer(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: env_1.appConfig.clientOrigin,
            credentials: true
        }
    });
    // Require a valid JWT for every socket connection before joining rooms.
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token ?? socket.handshake.headers?.authorization?.split(" ")[1];
            if (!token) {
                return next(new Error("Authentication token missing"));
            }
            const payload = (0, jwt_1.verifyToken)(token);
            socket.data.user = { id: payload.sub, role: payload.role };
            return next();
        }
        catch (error) {
            return next(error);
        }
    });
    (0, chat_handlers_1.registerChatHandlers)(io);
    return io;
}
