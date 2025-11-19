import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import {
  listCourseMessages,
  createCourseMessage,
  uploadCourseFile,
  pinCourseMessage,
  unpinCourseMessage,
  searchCourseMessagesHandler,
  downloadCourseAttachment,
} from "./message.controller";
import { upload } from "../../middleware/upload";

// mergeParams lets us reuse :courseId from the parent course router.
const messageRouter = Router({ mergeParams: true });
const uploadRouter = Router({ mergeParams: true });

messageRouter.use(authenticate);
messageRouter.get("/", listCourseMessages);
messageRouter.get("/search", searchCourseMessagesHandler);
messageRouter.post("/", createCourseMessage);
messageRouter.get("/:messageId/attachment", downloadCourseAttachment);
messageRouter.post("/:messageId/pin", pinCourseMessage);
messageRouter.delete("/:messageId/pin", unpinCourseMessage);

uploadRouter.use(authenticate);
uploadRouter.post("/", upload.single("file"), uploadCourseFile);

export { messageRouter, uploadRouter };
