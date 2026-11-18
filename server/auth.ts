/**
 * requireUser: Express middleware for routes that need a signed-in user.
 *
 * The browser sends `Authorization: Bearer <Supabase access token>`; the server
 * checks it with Supabase Auth (getUser) and puts the user on res.locals.user.
 */
import type { RequestHandler, Response } from "express";
import { parseBearerToken } from "../src/utils/authGuards.js";
import { getAdminClient } from "./supabase.js";

export type AuthedUser = { id: string; email: string | null; phone: string | null };

export type VerifyToken = (token: string) => Promise<AuthedUser | null>;

export const verifyAccessToken: VerifyToken = async (token) => {
  const admin = getAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, phone: data.user.phone ?? null };
};

export function requireUser(verify: VerifyToken = verifyAccessToken): RequestHandler {
  return async (req, res, next) => {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ error: "sign_in_required" });
      return;
    }
    try {
      const user = await verify(token);
      if (!user) {
        res.status(401).json({ error: "invalid_session" });
        return;
      }
      res.locals.user = user;
      res.locals.accessToken = token;
      next();
    } catch (error) {
      console.error("Auth check failed:", error instanceof Error ? error.message : error);
      res.status(503).json({ error: "auth_unavailable" });
    }
  };
}

export function currentUser(res: Response): AuthedUser | null {
  return (res.locals.user as AuthedUser | undefined) ?? null;
}

/** The verified access token from requireUser, for a user-scoped (RLS) Supabase client. */
export function currentAccessToken(res: Response): string | null {
  return (res.locals.accessToken as string | undefined) ?? null;
}

/** Like requireUser but never blocks: sets res.locals.user when a valid token is present. */
export function optionalUser(verify: VerifyToken = verifyAccessToken): RequestHandler {
  return async (req, res, next) => {
    const token = parseBearerToken(req.headers.authorization);
    if (token) {
      try {
        const user = await verify(token);
        if (user) res.locals.user = user;
      } catch {
        // signed-out is fine here
      }
    }
    next();
  };
}
