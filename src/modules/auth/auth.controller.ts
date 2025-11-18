import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { asyncHandler } from "../../utils/asyncHandler";
import { registerUser, loginUser, RegisterDto, LoginDto } from "./auth.service";
import { UserRole } from "@prisma/client";

// Input validation for registration body.
const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole),
});

// Input validation for login body.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// POST /api/auth/register
export const register = asyncHandler(async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body) as RegisterDto;
  const result = await registerUser(data);
  res.status(StatusCodes.CREATED).json(result);
});

// POST /api/auth/login
export const login = asyncHandler(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body) as LoginDto;
  const result = await loginUser(data);
  res.status(StatusCodes.OK).json(result);
});
