"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courseRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const course_controller_1 = require("./course.controller");
const client_1 = require("@prisma/client");
const message_routes_1 = require("../message/message.routes");
const router = (0, express_1.Router)();
// All course endpoints require authentication first.
router.use(auth_1.authenticate);
router.post("/", (0, auth_1.requireRole)(client_1.UserRole.LECTURER), course_controller_1.createCourse);
router.get("/my", course_controller_1.getMyCourses);
router.post("/:courseId/enroll", (0, auth_1.requireRole)(client_1.UserRole.STUDENT), course_controller_1.enrollInCourse);
router.use("/:courseId/messages", message_routes_1.messageRouter);
router.use("/:courseId/uploads", message_routes_1.uploadRouter);
exports.courseRoutes = router;
