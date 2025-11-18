"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = void 0;
const express_1 = require("express");
const auth_controller_1 = require("./auth.controller");
const router = (0, express_1.Router)();
// Public auth endpoints for registration and login.
router.post("/register", auth_controller_1.register);
router.post("/login", auth_controller_1.login);
exports.authRoutes = router;
