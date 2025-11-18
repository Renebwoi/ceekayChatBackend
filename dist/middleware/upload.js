"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const errors_1 = require("../utils/errors");
const http_status_codes_1 = require("http-status-codes");
// Keep uploads in memory so we can push them straight to Backblaze without touching disk.
const storage = multer_1.default.memoryStorage();
// Only allow the document/image formats approved for coursework.
const ALLOWED_MIME_TYPES = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/png",
    "image/jpeg"
]);
// Pre-configured multer instance with size + mimetype checks.
exports.upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            return cb(new errors_1.AppError(http_status_codes_1.StatusCodes.BAD_REQUEST, "Unsupported file type"));
        }
        return cb(null, true);
    }
});
