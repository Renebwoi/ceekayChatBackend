import { Router } from "express";
import { login, register } from "./auth.controller";

const router = Router();

// Public auth endpoints for registration and login.
router.post("/register", register);
router.post("/login", login);

export const authRoutes = router;
