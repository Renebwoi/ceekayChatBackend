"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courseRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const course_controller_1 = require("./course.controller");
const message_routes_1 = require("../message/message.routes");
const router = (0, express_1.Router)();
// All course endpoints require authentication first.
router.use(auth_1.authenticate);
router.get("/my", course_controller_1.getMyCourses);
router.post("/:courseId/read", course_controller_1.markCourseAsRead);
router.use("/:courseId/messages", message_routes_1.messageRouter);
router.use("/:courseId/uploads", message_routes_1.uploadRouter);
exports.courseRoutes = router;
