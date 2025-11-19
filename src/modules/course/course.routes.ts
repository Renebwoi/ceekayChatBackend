import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { getMyCourses, markCourseAsRead } from "./course.controller";
import { messageRouter, uploadRouter } from "../message/message.routes";

const router = Router();

// All course endpoints require authentication first.
router.use(authenticate);
router.get("/my", getMyCourses);
router.post("/:courseId/read", markCourseAsRead);
router.use("/:courseId/messages", messageRouter);
router.use("/:courseId/uploads", uploadRouter);

export const courseRoutes = router;
