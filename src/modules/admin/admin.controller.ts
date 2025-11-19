import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  addCourseEnrollment,
  assignCourseLecturer,
  createCourse,
  deleteCourse,
  getCourseRoster,
  listCourses,
  listLecturers,
  listStudents,
  removeCourseEnrollment,
  setUserBanStatus,
  updateCourse,
} from "./admin.service";

const createCourseSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(2),
  lecturerId: z.string().min(1),
});

const updateCourseSchema = z
  .object({
    code: z.string().min(2).optional(),
    title: z.string().min(2).optional(),
  })
  .refine((data) => data.code || data.title, {
    message: "Provide at least one field to update",
  });

const assignLecturerSchema = z.object({
  lecturerId: z.string().min(1),
});

const enrollmentSchema = z
  .object({
    userId: z.string().min(1).optional(),
    studentId: z.string().min(1).optional(),
  })
  .refine((data) => data.userId || data.studentId, {
    message: "Student identifier is required",
    path: ["userId"],
  });

function parseCourseId(req: Request) {
  const schema = z.object({ courseId: z.string().min(1) });
  return schema.parse(req.params).courseId;
}

function parseUserId(req: Request) {
  const schema = z.object({ userId: z.string().min(1) });
  return schema.parse(req.params).userId;
}

export const adminCreateCourse = asyncHandler(
  async (req: Request, res: Response) => {
    const payload = createCourseSchema.parse(req.body);
    const course = await createCourse(payload);
    res.status(StatusCodes.CREATED).json({ course });
  }
);

export const adminListCourses = asyncHandler(
  async (_req: Request, res: Response) => {
    const courses = await listCourses();
    res.status(StatusCodes.OK).json({ courses });
  }
);

export const adminListLecturers = asyncHandler(
  async (_req: Request, res: Response) => {
    const lecturers = await listLecturers();
    res.status(StatusCodes.OK).json({ lecturers });
  }
);

export const adminListStudents = asyncHandler(
  async (_req: Request, res: Response) => {
    const students = await listStudents();
    res.status(StatusCodes.OK).json({ students });
  }
);

export const adminUpdateCourse = asyncHandler(
  async (req: Request, res: Response) => {
    const courseId = parseCourseId(req);
    const payload = updateCourseSchema.parse(req.body);
    const course = await updateCourse(courseId, payload);
    res.status(StatusCodes.OK).json({ course });
  }
);

export const adminDeleteCourse = asyncHandler(
  async (req: Request, res: Response) => {
    const courseId = parseCourseId(req);
    await deleteCourse(courseId);
    res.sendStatus(StatusCodes.NO_CONTENT);
  }
);

export const adminAssignLecturer = asyncHandler(
  async (req: Request, res: Response) => {
    const courseId = parseCourseId(req);
    const payload = assignLecturerSchema.parse(req.body);
    const course = await assignCourseLecturer(courseId, payload.lecturerId);
    res.status(StatusCodes.OK).json({ course });
  }
);

export const adminAddEnrollment = asyncHandler(
  async (req: Request, res: Response) => {
    const courseId = parseCourseId(req);
    const payload = enrollmentSchema.parse(req.body);
    const targetUserId = payload.userId ?? payload.studentId!;
    const enrollment = await addCourseEnrollment(courseId, targetUserId);
    res.status(StatusCodes.CREATED).json({ enrollment });
  }
);

export const adminGetCourseRoster = asyncHandler(
  async (req: Request, res: Response) => {
    const courseId = parseCourseId(req);
    const roster = await getCourseRoster(courseId);
    res.status(StatusCodes.OK).json(roster);
  }
);

export const adminRemoveEnrollment = asyncHandler(
  async (req: Request, res: Response) => {
    const courseId = parseCourseId(req);
    const userId = parseUserId(req);
    await removeCourseEnrollment(courseId, userId);
    res.sendStatus(StatusCodes.NO_CONTENT);
  }
);

export const adminBanUser = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = parseUserId(req);
    const user = await setUserBanStatus(userId, true);
    res.status(StatusCodes.OK).json({ user });
  }
);

export const adminUnbanUser = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = parseUserId(req);
    const user = await setUserBanStatus(userId, false);
    res.status(StatusCodes.OK).json({ user });
  }
);
