import { Router } from "express";
import { authenticate } from "../../middleware/auth";
import { getCurrentUser } from "./user.controller";

const router = Router();

router.get("/me", authenticate, getCurrentUser);

export const userRoutes = router;
