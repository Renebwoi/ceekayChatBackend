import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { asyncHandler } from "../../utils/asyncHandler";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/errors";
import { ensureCourseMembership } from "../../middleware/auth";

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
        readStates: {
          where: { userId: req.user.id },
          select: { lastReadAt: true },
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    type CourseWithExtras = (typeof courses)[number];

    const toCourseResponse = async (course: CourseWithExtras) => {
      const lastReadAt = course.readStates[0]?.lastReadAt ?? null;

      const unreadCount = lastReadAt
        ? await prisma.message.count({
            where: {
              courseId: course.id,
              createdAt: { gt: lastReadAt },
            },
          })
        : course._count.messages;

      const { readStates, _count, ...rest } = course;
      return { ...rest, unreadCount };
    };

    const coursesWithUnread = await Promise.all(courses.map(toCourseResponse));

    res.status(StatusCodes.OK).json({ courses: coursesWithUnread });
  }
);

// POST /api/courses/:courseId/read — mark all messages up to now as read for the user.
export const markCourseAsRead = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      throw new AppError(StatusCodes.UNAUTHORIZED, "Not authenticated");
    }

    const courseId = req.params.courseId;
    if (!courseId) {
      throw new AppError(StatusCodes.BAD_REQUEST, "Course ID is required");
    }

    await ensureCourseMembership(courseId, userId);

    const now = new Date();

    await prisma.courseReadState.upsert({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      update: { lastReadAt: now },
      create: {
        userId,
        courseId,
        lastReadAt: now,
      },
    });

    res.status(StatusCodes.OK).json({ success: true });
  }
);
