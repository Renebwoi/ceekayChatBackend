import { Router } from "express";
import { UserRole } from "@prisma/client";
import { authenticate, requireRole } from "../../middleware/auth";
import {
  adminAddEnrollment,
  adminAssignLecturer,
  adminBanUser,
  adminCreateCourse,
  adminGetCourseRoster,
  adminListCourses,
  adminListLecturers,
  adminListStudents,
  adminDeleteCourse,
  adminRemoveEnrollment,
  adminUnbanUser,
  adminUpdateCourse,
} from "./admin.controller";

const router = Router();

router.use(authenticate);
router.use(requireRole(UserRole.ADMIN));

router.get("/courses", adminListCourses);
router.get("/lecturers", adminListLecturers);
router.get("/students", adminListStudents);
router.post("/courses", adminCreateCourse);
router.patch("/courses/:courseId", adminUpdateCourse);
router.delete("/courses/:courseId", adminDeleteCourse);
router.post("/courses/:courseId/lecturer", adminAssignLecturer);
router.post("/courses/:courseId/enrollments", adminAddEnrollment);
router.get("/courses/:courseId/enroll", adminGetCourseRoster);
router.delete("/courses/:courseId/enrollments/:userId", adminRemoveEnrollment);
router.post("/users/:userId/ban", adminBanUser);
router.delete("/users/:userId/ban", adminUnbanUser);

export const adminRoutes = router;
