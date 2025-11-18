import { StatusCodes } from "http-status-codes";

// Lightweight application error that carries an HTTP status code alongside the message.
export class AppError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// Assertion helper so we can guard invariants with typed narrowings.
export function assert(
  condition: any,
  statusCode: number,
  message: string
): asserts condition {
  if (!condition) {
    throw new AppError(statusCode, message);
  }
}

// Shortcut for throwing a NOT_FOUND error with a custom message.
export function notFound(message = "Resource not found") {
  throw new AppError(StatusCodes.NOT_FOUND, message);
}
