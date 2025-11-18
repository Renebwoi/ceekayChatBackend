import multer, { FileFilterCallback } from "multer";
import { Request, Express } from "express";
import { AppError } from "../utils/errors";
import { StatusCodes } from "http-status-codes";

// Keep uploads in memory so we can push them straight to Backblaze without touching disk.
const storage = multer.memoryStorage();

// Only allow the document/image formats approved for coursework.
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/png",
  "image/jpeg",
]);

// Pre-configured multer instance with size + mimetype checks.
export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new AppError(StatusCodes.BAD_REQUEST, "Unsupported file type"));
    }
    return cb(null, true);
  },
});
