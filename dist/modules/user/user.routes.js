"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = void 0;
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const user_controller_1 = require("./user.controller");
const router = (0, express_1.Router)();
router.get("/me", auth_1.authenticate, user_controller_1.getCurrentUser);
exports.userRoutes = router;
