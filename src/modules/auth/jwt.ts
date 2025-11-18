import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { appConfig } from "../../config/env";

export interface TokenPayload {
  sub: string;
  role: UserRole;
}

// Issue a signed JWT containing the user id + role metadata.
export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, appConfig.jwtSecret, {
    algorithm: "HS256",
    expiresIn: "7d",
  });
}

// Validate a token and return the decoded payload (throws if invalid).
export function verifyToken(token: string) {
  return jwt.verify(token, appConfig.jwtSecret) as TokenPayload;
}
