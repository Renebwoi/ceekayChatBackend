import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/errors";

// GET /api/courses/my — both lecturers and students see their assigned courses.
export const getMyCourses = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Not authenticated");
    }

    const courses = await prisma.course.findMany({
      where: {
        OR: [
          { lecturerId: req.user.id },
          { enrollments: { some: { userId: req.user.id } } },
        ],
      },
      include: {
        lecturer: {
          select: { id: true, name: true, email: true },
        },
        enrollments: {
          select: {
            user: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });

    res.status(StatusCodes.OK).json({ courses });
  }
);
