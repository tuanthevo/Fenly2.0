/**
 * Server side of the feature flags: FENLY_FLAGS (comma list in .env.local / Vercel)
 * on top of the 2.0 defaults, plus middleware that turns a hidden feature's API off.
 */
import type { RequestHandler } from "express";
import {
  DEFAULT_FLAGS,
  parseFlagList,
  resolveFlags,
  type FeatureFlag,
  type FeatureFlags,
} from "../src/config/featureFlags.js";

export function getFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  return resolveFlags(DEFAULT_FLAGS, parseFlagList(env.FENLY_FLAGS));
}

/** 404s the route while `flag` is off, as if the feature didn't exist. */
export function requireFlag(flag: FeatureFlag, flags: () => FeatureFlags = getFlags): RequestHandler {
  return (_req, res, next) => {
    if (flags()[flag]) return next();
    res.status(404).json({ error: "feature_off", feature: flag });
  };
}
