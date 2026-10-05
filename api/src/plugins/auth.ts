import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";
import { db } from "../db/connection.js";
import { users, checkSubscriptionAccess, resolveGlassesToken, resolveAppToken, APP_TOKEN_PREFIX } from "@learnforge/core";

const PUBLIC_PATHS = new Set([
  "/health",
  "/auth/login",
  "/auth/register",
  "/auth/verify-email/confirm",
  "/auth/password-reset/request",
  "/auth/password-reset/confirm",
  "/billing/webhook",
  "/glasses/pair/start",
  "/glasses/pair/poll",
  "/apps/pair/start",
  "/apps/pair/poll",
]);
// /media/<id>/<sig> carries its own HMAC signature; see core lib/media-url.ts.
const PUBLIC_PREFIXES = ["/shares/preview/", "/media/"];

/**
 * Routes the G2 glasses call with their own bearer token instead of a JWT.
 * Exact paths on purpose: `/glasses/claim` and `/glasses/tokens` stay behind the
 * admin's JWT, and a glasses token presented anywhere else still fails jwtVerify,
 * which is the whole scope check.
 */
const GLASSES_TOKEN_PATHS = new Set(["/glasses/summary", "/glasses/next", "/glasses/reviews", "/glasses/ask"]);

/**
 * Everything a connected app (Lecture Scribe) may call with its own bearer token:
 * read the topics, look for cards that exist already, create topics and cards.
 * No study, no edit, no delete, nothing under /auth or /billing. A token that
 * asks for anything else gets a 403, so a leaked one cannot touch existing cards.
 */
const UUID = "[0-9a-fA-F-]{36}";
const APP_TOKEN_ROUTES: Array<[method: string, path: RegExp]> = [
  ["GET", /^\/apps\/me$/],
  ["DELETE", /^\/apps\/me$/],
  ["GET", /^\/topics$/],
  ["GET", new RegExp(`^/topics/${UUID}/tree$`)],
  ["POST", /^\/topics$/],
  ["GET", /^\/cards\/search$/],
  ["GET", new RegExp(`^/context/topic/${UUID}$`)],
  ["POST", /^\/notes$/],
  ["POST", /^\/cards$/],
];

const SUBSCRIPTION_EXEMPT_PREFIXES = ["/auth/", "/billing/", "/health"];
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export default fp(async function authPlugin(app: FastifyInstance) {
  app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const path = request.url.split("?")[0];
    if (PUBLIC_PATHS.has(path)) return;
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;
    if (request.method === "OPTIONS") return;

    if (GLASSES_TOKEN_PATHS.has(path)) {
      const header = request.headers.authorization ?? "";
      const raw = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
      const check = await resolveGlassesToken(db, raw);
      if (!check.ok) {
        // The glasses clear their stored token on a revocation, so the reason has to be distinguishable.
        if (check.reason === "revoked") throw new UnauthorizedError("Glasses token revoked", "TOKEN_REVOKED");
        if (check.reason === "expired") throw new UnauthorizedError("Glasses token expired", "TOKEN_EXPIRED");
        throw new UnauthorizedError("Invalid glasses token");
      }
      request.user = { sub: check.userId, glasses: true };
      return;
    }

    const bearer = request.headers.authorization ?? "";
    if (bearer.startsWith(`Bearer ${APP_TOKEN_PREFIX}`)) {
      const check = await resolveAppToken(db, bearer.slice(7).trim());
      if (!check.ok) {
        // The app drops its stored token on a revocation, so the reason has to be distinguishable.
        if (check.reason === "revoked") throw new UnauthorizedError("Access was removed in LearnForge", "TOKEN_REVOKED");
        if (check.reason === "expired") throw new UnauthorizedError("Access expired after 90 days without use", "TOKEN_EXPIRED");
        throw new UnauthorizedError("Invalid app token");
      }
      if (!APP_TOKEN_ROUTES.some(([m, re]) => m === request.method && re.test(path))) {
        throw new ForbiddenError("A connected app may not do this", "APP_TOKEN_SCOPE");
      }
      request.user = { sub: check.userId, app: check.tokenId };
      return;
    }

    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }
  });

  app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const path = request.url.split("?")[0];
    if (PUBLIC_PATHS.has(path)) return;
    if (PUBLIC_PREFIXES.some((p) => path.startsWith(p))) return;
    if (SUBSCRIPTION_EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return;
    if (READ_METHODS.has(request.method)) return;

    const userId = (request.user as { sub: string })?.sub;
    if (!userId) return;

    const [user] = await db
      .select({
        emailVerifiedAt: users.emailVerifiedAt,
        trialEndsAt: users.trialEndsAt,
        subscriptionStatus: users.subscriptionStatus,
        subscriptionCurrentPeriodEnd: users.subscriptionCurrentPeriodEnd,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return;

    // Verification is checked first: it is the earlier step in the account
    // lifecycle and the one the user can actually resolve right now.
    if (!user.emailVerifiedAt) {
      throw new ForbiddenError(
        "Please confirm your e-mail address to continue creating and editing content.",
        "EMAIL_NOT_VERIFIED",
      );
    }

    if (!checkSubscriptionAccess(user).isActive) {
      throw new ForbiddenError(
        "Your trial has expired. Please subscribe to continue creating and editing content.",
        "TRIAL_EXPIRED",
      );
    }
  });
});
