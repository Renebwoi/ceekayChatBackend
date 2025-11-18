import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { StatusCodes, ReasonPhrases } from "http-status-codes";
import { AppError } from "../utils/errors";

// Global Express error boundary that serializes known error types.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof ZodError) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Validation error",
      issues: err.flatten(),
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message,
    });
  }

  // Anything else is unexpected, so log the stack and return a generic 500.
  console.error("Unhandled error", err);
  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    message: ReasonPhrases.INTERNAL_SERVER_ERROR,
  });
}
