"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.asyncHandler = void 0;
// Wrap async controllers so unhandled rejections automatically flow into Express error middleware.
const asyncHandler = (handler) => {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
};
exports.asyncHandler = asyncHandler;
