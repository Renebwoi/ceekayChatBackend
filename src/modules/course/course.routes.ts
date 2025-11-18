import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/auth";
import {
  createCourse,
  getMyCourses,
  enrollInCourse,
} from "./course.controller";
import { UserRole } from "@prisma/client";
import { messageRouter, uploadRouter } from "../message/message.routes";

const router = Router();

// All course endpoints require authentication first.
router.use(authenticate);
router.post("/", requireRole(UserRole.LECTURER), createCourse);
router.get("/my", getMyCourses);
router.post("/:courseId/enroll", requireRole(UserRole.STUDENT), enrollInCourse);
router.use("/:courseId/messages", messageRouter);
router.use("/:courseId/uploads", uploadRouter);

export const courseRoutes = router;
