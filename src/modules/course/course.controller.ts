import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/errors";

// Lecturer-facing payload validator.
const createCourseSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(2),
});

// POST /api/courses — lecturers create a new course shell.
export const createCourse = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Not authenticated");
    }

    const data = createCourseSchema.parse(req.body);
    const course = await prisma.course.create({
      data: {
        code: data.code,
        title: data.title,
        lecturerId: req.user.id,
      },
    });

    res.status(StatusCodes.CREATED).json({ course });
  }
);

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

// POST /api/courses/:courseId/enroll — students enroll themselves.
export const enrollInCourse = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Not authenticated");
    }

    const courseId = req.params.courseId;
    if (!courseId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Course ID is required");
    }

    await prisma.course.findUniqueOrThrow({ where: { id: courseId } });

    const enrollment = await prisma.enrollment.upsert({
      where: {
        userId_courseId: {
          userId: req.user.id,
          courseId,
        },
      },
      update: {},
      create: {
        userId: req.user.id,
        courseId,
      },
    });

    res.status(StatusCodes.CREATED).json({ enrollment });
  }
);
