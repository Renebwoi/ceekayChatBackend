import { UserRole } from "@prisma/client";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/errors";

const courseInclude = {
  lecturer: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
    },
  },
  enrollments: {
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
        },
      },
    },
  },
} as const;

const enrollmentInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
    },
  },
} as const;

const courseSummarySelect = {
  id: true,
  code: true,
  title: true,
  lecturer: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
    },
  },
  _count: {
    select: {
      enrollments: true,
    },
  },
} as const;

type CourseSummary = {
  id: string;
  code: string;
  title: string;
  lecturer:
    | { id: string; name: string; email: string; role: UserRole; department: string | null }
    | null;
  _count: { enrollments: number };
};

type StudentRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string | null;
  isBanned: boolean;
};

type CourseRoster = {
  id: string;
  enrollments: Array<{
    user: {
      id: string;
      name: string;
      email: string;
      role: UserRole;
      department: string | null;
    };
  }>;
};

type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

export interface CreateCourseInput {
  code: string;
  title: string;
  lecturerId: string;
}

export interface UpdateCourseInput {
  code?: string;
  title?: string;
}

function isPrismaNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2025"
  );
}

function handleNotFound(error: unknown, message: string): never {
  if (isPrismaNotFound(error)) {
    throw new AppError(StatusCodes.NOT_FOUND, message);
  }

  throw error;
}

async function ensureLecturer(userId: string) {
  const lecturer = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isBanned: true },
  });

  if (!lecturer) {
    throw new AppError(StatusCodes.NOT_FOUND, "Lecturer not found");
  }

  if (lecturer.role !== UserRole.LECTURER) {
    throw new AppError(StatusCodes.BAD_REQUEST, "User is not a lecturer");
  }

  if (lecturer.isBanned) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Cannot assign a banned lecturer"
    );
  }

  return lecturer.id;
}

async function ensureStudent(userId: string) {
  const student = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isBanned: true },
  });

  if (!student) {
    throw new AppError(StatusCodes.NOT_FOUND, "Student not found");
  }

  if (student.role !== UserRole.STUDENT) {
    throw new AppError(StatusCodes.BAD_REQUEST, "User is not a student");
  }

  if (student.isBanned) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Cannot enroll a banned student"
    );
  }

  return student.id;
}

export async function createCourse(input: CreateCourseInput) {
  const lecturerId = await ensureLecturer(input.lecturerId);

  return prisma.course.create({
    data: {
      code: input.code,
      title: input.title,
      lecturerId,
    },
    include: courseInclude,
  });
}

export async function listCourses() {
  const courses = (await prisma.course.findMany({
    select: courseSummarySelect,
    orderBy: { code: "asc" },
  })) as CourseSummary[];

  return courses.map((course) => ({
    id: course.id,
    code: course.code,
    title: course.title,
    lecturer: course.lecturer ?? null,
    studentCount: course._count.enrollments,
  }));
}

export async function updateCourse(courseId: string, input: UpdateCourseInput) {
  if (!input.code && !input.title) {
    throw new AppError(
      StatusCodes.BAD_REQUEST,
      "Provide at least one field to update"
    );
  }

  try {
    return await prisma.course.update({
      where: { id: courseId },
      data: {
        ...(input.code ? { code: input.code } : {}),
        ...(input.title ? { title: input.title } : {}),
      },
      include: courseInclude,
    });
  } catch (error) {
    handleNotFound(error, "Course not found");
  }
}

export async function deleteCourse(courseId: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx: TransactionClient) => {
      await tx.attachment.deleteMany({
        where: { message: { courseId } },
      });
      await tx.message.deleteMany({ where: { courseId } });
      await tx.enrollment.deleteMany({ where: { courseId } });
      await tx.course.delete({ where: { id: courseId } });
    });
  } catch (error) {
    handleNotFound(error, "Course not found");
  }
}

export async function assignCourseLecturer(
  courseId: string,
  lecturerId: string
) {
  const validatedLecturerId = await ensureLecturer(lecturerId);

  try {
    return await prisma.course.update({
      where: { id: courseId },
      data: { lecturerId: validatedLecturerId },
      include: courseInclude,
    });
  } catch (error) {
    handleNotFound(error, "Course not found");
  }
}

export async function addCourseEnrollment(courseId: string, userId: string) {
  const validatedUserId = await ensureStudent(userId);

  const courseExists = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true },
  });

  if (!courseExists) {
    throw new AppError(StatusCodes.NOT_FOUND, "Course not found");
  }

  return prisma.enrollment.upsert({
    where: {
      userId_courseId: {
        userId: validatedUserId,
        courseId,
      },
    },
    update: {},
    create: {
      courseId,
      userId: validatedUserId,
    },
    include: enrollmentInclude,
  });
}

export async function listLecturers() {
  const lecturers = await prisma.user.findMany({
    where: { role: UserRole.LECTURER, isBanned: false },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
    },
    orderBy: { name: "asc" },
  });

  return lecturers;
}

export async function listStudents() {
  const students = (await prisma.user.findMany({
    where: { role: UserRole.STUDENT },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      isBanned: true,
    },
    orderBy: { name: "asc" },
  })) as StudentRow[];

  return students.map((student) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    role: student.role,
    department: student.department,
    banned: student.isBanned,
  }));
}

export async function getCourseRoster(courseId: string) {
  const course = (await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      enrollments: {
        select: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              department: true,
            },
          },
        },
        orderBy: { user: { name: "asc" } },
      },
    },
  })) as CourseRoster | null;

  if (!course) {
    throw new AppError(StatusCodes.NOT_FOUND, "Course not found");
  }

  return {
    courseId: course.id,
    students: course.enrollments.map((enrollment) => enrollment.user),
  };
}

export async function removeCourseEnrollment(courseId: string, userId: string) {
  try {
    await prisma.enrollment.delete({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });
  } catch (error) {
    handleNotFound(error, "Enrollment not found");
  }
}

export async function setUserBanStatus(userId: string, isBanned: boolean) {
  try {
    return await prisma.user.update({
      where: { id: userId },
      data: { isBanned },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    handleNotFound(error, "User not found");
  }
}
