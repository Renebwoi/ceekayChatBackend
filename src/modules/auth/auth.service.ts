import bcrypt from "bcrypt";
import { StatusCodes } from "http-status-codes";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/errors";
import { signToken } from "./jwt";
import { UserRole } from "@prisma/client";

const SALT_ROUNDS = 10;

export interface RegisterDto {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  department: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

// Create a new user account and return the sanitized user + JWT.
export async function registerUser(payload: RegisterDto) {
  const existing = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (existing) {
    throw new AppError(StatusCodes.CONFLICT, "Email already registered");
  }

  if (payload.role === UserRole.ADMIN) {
    throw new AppError(
      StatusCodes.FORBIDDEN,
      "Admin accounts must be created by an administrator"
    );
  }

  const department = payload.department.trim();
  if (!department) {
    throw new AppError(StatusCodes.BAD_REQUEST, "Department is required");
  }

  const hashedPassword = await bcrypt.hash(payload.password, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      name: payload.name,
      email: payload.email,
      password: hashedPassword,
      role: payload.role,
      department,
    },
  });

  const token = signToken({ sub: user.id, role: user.role });

  return {
    user: sanitizeUser(user),
    token,
  };
}

// Verify credentials and issue a fresh JWT on success.
export async function loginUser(payload: LoginDto) {
  const user = await prisma.user.findUnique({
    where: { email: payload.email },
  });
  if (!user) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid credentials");
  }

  const passwordMatch = await bcrypt.compare(payload.password, user.password);
  if (!passwordMatch) {
    throw new AppError(StatusCodes.UNAUTHORIZED, "Invalid credentials");
  }

  if (user.isBanned) {
    throw new AppError(StatusCodes.FORBIDDEN, "Account is banned");
  }

  const token = signToken({ sub: user.id, role: user.role });

  return {
    user: sanitizeUser(user),
    token,
  };
}

// Strip the hashed password before sending a user to the client.
function sanitizeUser<T extends { password: string }>(user: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...rest } = user;
  return rest;
}
