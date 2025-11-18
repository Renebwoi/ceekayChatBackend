"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRouter = exports.messageRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const message_controller_1 = require("./message.controller");
const upload_1 = require("../../middleware/upload");
// mergeParams lets us reuse :courseId from the parent course router.
const messageRouter = (0, express_1.Router)({ mergeParams: true });
exports.messageRouter = messageRouter;
const uploadRouter = (0, express_1.Router)({ mergeParams: true });
exports.uploadRouter = uploadRouter;
messageRouter.use(auth_1.authenticate);
messageRouter.get("/", message_controller_1.listCourseMessages);
messageRouter.post("/", message_controller_1.createCourseMessage);
uploadRouter.use(auth_1.authenticate);
uploadRouter.post("/", upload_1.upload.single("file"), message_controller_1.uploadCourseFile);
