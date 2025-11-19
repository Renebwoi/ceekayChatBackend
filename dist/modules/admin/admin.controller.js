"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUnbanUser = exports.adminBanUser = exports.adminRemoveEnrollment = exports.adminGetCourseRoster = exports.adminAddEnrollment = exports.adminAssignLecturer = exports.adminDeleteCourse = exports.adminUpdateCourse = exports.adminListStudents = exports.adminListLecturers = exports.adminListCourses = exports.adminCreateCourse = void 0;
const http_status_codes_1 = require("http-status-codes");
const zod_1 = require("zod");
const asyncHandler_1 = require("../../utils/asyncHandler");
const admin_service_1 = require("./admin.service");
const createCourseSchema = zod_1.z.object({
    code: zod_1.z.string().min(2),
    title: zod_1.z.string().min(2),
    lecturerId: zod_1.z.string().min(1),
});
const updateCourseSchema = zod_1.z
    .object({
    code: zod_1.z.string().min(2).optional(),
    title: zod_1.z.string().min(2).optional(),
})
    .refine((data) => data.code || data.title, {
    message: "Provide at least one field to update",
});
const assignLecturerSchema = zod_1.z.object({
    lecturerId: zod_1.z.string().min(1),
});
const enrollmentSchema = zod_1.z
    .object({
    userId: zod_1.z.string().min(1).optional(),
    studentId: zod_1.z.string().min(1).optional(),
})
    .refine((data) => data.userId || data.studentId, {
    message: "Student identifier is required",
    path: ["userId"],
});
function parseCourseId(req) {
    const schema = zod_1.z.object({ courseId: zod_1.z.string().min(1) });
    return schema.parse(req.params).courseId;
}
function parseUserId(req) {
    const schema = zod_1.z.object({ userId: zod_1.z.string().min(1) });
    return schema.parse(req.params).userId;
}
exports.adminCreateCourse = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const payload = createCourseSchema.parse(req.body);
    const course = await (0, admin_service_1.createCourse)(payload);
    res.status(http_status_codes_1.StatusCodes.CREATED).json({ course });
});
exports.adminListCourses = (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const courses = await (0, admin_service_1.listCourses)();
    res.status(http_status_codes_1.StatusCodes.OK).json({ courses });
});
exports.adminListLecturers = (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const lecturers = await (0, admin_service_1.listLecturers)();
    res.status(http_status_codes_1.StatusCodes.OK).json({ lecturers });
});
exports.adminListStudents = (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
    const students = await (0, admin_service_1.listStudents)();
    res.status(http_status_codes_1.StatusCodes.OK).json({ students });
});
exports.adminUpdateCourse = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const courseId = parseCourseId(req);
    const payload = updateCourseSchema.parse(req.body);
    const course = await (0, admin_service_1.updateCourse)(courseId, payload);
    res.status(http_status_codes_1.StatusCodes.OK).json({ course });
});
exports.adminDeleteCourse = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const courseId = parseCourseId(req);
    await (0, admin_service_1.deleteCourse)(courseId);
    res.sendStatus(http_status_codes_1.StatusCodes.NO_CONTENT);
});
exports.adminAssignLecturer = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const courseId = parseCourseId(req);
    const payload = assignLecturerSchema.parse(req.body);
    const course = await (0, admin_service_1.assignCourseLecturer)(courseId, payload.lecturerId);
    res.status(http_status_codes_1.StatusCodes.OK).json({ course });
});
exports.adminAddEnrollment = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const courseId = parseCourseId(req);
    const payload = enrollmentSchema.parse(req.body);
    const targetUserId = payload.userId ?? payload.studentId;
    const enrollment = await (0, admin_service_1.addCourseEnrollment)(courseId, targetUserId);
    res.status(http_status_codes_1.StatusCodes.CREATED).json({ enrollment });
});
exports.adminGetCourseRoster = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const courseId = parseCourseId(req);
    const roster = await (0, admin_service_1.getCourseRoster)(courseId);
    res.status(http_status_codes_1.StatusCodes.OK).json(roster);
});
exports.adminRemoveEnrollment = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const courseId = parseCourseId(req);
    const userId = parseUserId(req);
    await (0, admin_service_1.removeCourseEnrollment)(courseId, userId);
    res.sendStatus(http_status_codes_1.StatusCodes.NO_CONTENT);
});
exports.adminBanUser = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = parseUserId(req);
    const user = await (0, admin_service_1.setUserBanStatus)(userId, true);
    res.status(http_status_codes_1.StatusCodes.OK).json({ user });
});
exports.adminUnbanUser = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const userId = parseUserId(req);
    const user = await (0, admin_service_1.setUserBanStatus)(userId, false);
    res.status(http_status_codes_1.StatusCodes.OK).json({ user });
});
