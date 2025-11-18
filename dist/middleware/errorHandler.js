"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const http_status_codes_1 = require("http-status-codes");
const errors_1 = require("../utils/errors");
// Global Express error boundary that serializes known error types.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(err, req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
            message: "Validation error",
            issues: err.flatten()
        });
    }
    if (err instanceof errors_1.AppError) {
        return res.status(err.statusCode).json({
            message: err.message
        });
    }
    // Anything else is unexpected, so log the stack and return a generic 500.
    console.error("Unhandled error", err);
    return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: http_status_codes_1.ReasonPhrases.INTERNAL_SERVER_ERROR
    });
}
