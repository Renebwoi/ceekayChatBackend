"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.assert = assert;
exports.notFound = notFound;
const http_status_codes_1 = require("http-status-codes");
// Lightweight application error that carries an HTTP status code alongside the message.
class AppError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
exports.AppError = AppError;
// Assertion helper so we can guard invariants with typed narrowings.
function assert(condition, statusCode, message) {
    if (!condition) {
        throw new AppError(statusCode, message);
    }
}
// Shortcut for throwing a NOT_FOUND error with a custom message.
function notFound(message = "Resource not found") {
    throw new AppError(http_status_codes_1.StatusCodes.NOT_FOUND, message);
}
