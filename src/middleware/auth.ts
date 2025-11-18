import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/errors";
import { UserRole } from "@prisma/client";
import { verifyToken, TokenPayload } from "../modules/auth/jwt";

// Parse and verify Authorization headers, attaching the user to the request.
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return next(
      new AppError(StatusCodes.UNAUTHORIZED, "Authorization header missing")
    );
  }

  try {
    const token = authHeader.split(" ")[1];
    const payload = verifyToken(token) as TokenPayload;
    req.user = { id: payload.sub, role: payload.role };
    return next();
  } catch (error) {
    return next(
      new AppError(StatusCodes.UNAUTHORIZED, "Invalid or expired token")
    );
  }
}

// Gate a route to a single role or list of roles.
export function requireRole(role: UserRole | UserRole[]) {
  const allowedRoles = Array.isArray(role) ? role : [role];

  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(StatusCodes.FORBIDDEN, "Insufficient permissions")
      );
    }
    return next();
  };
}

// Verify that the user either teaches or is enrolled in the course.
export async function ensureCourseMembership(courseId: string, userId: string) {
  const membership = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      lecturerId: true,
      enrollments: {
        where: { userId },
        select: { id: true },
      },
    },
  });

  if (!membership) {
    throw new AppError(StatusCodes.NOT_FOUND, "Course not found");
  }

  const isLecturer = membership.lecturerId === userId;
  const isEnrolled = membership.enrollments.length > 0;

  if (!isLecturer && !isEnrolled) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "You are not a member of this course"
    );
  }

  return { isLecturer, isEnrolled };
}
