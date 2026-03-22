import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";
import { db } from "../db/connection.js";
import { users } from "@learnforge/core";

const PUBLIC_PATHS = new Set(["/health", "/auth/login", "/auth/register", "/billing/webhook"]);

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
    if (request.method === "OPTIONS") return;

    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }
  });

  app.addHook("onRequest", async (request: FastifyRequest, _reply: FastifyReply) => {
    const path = request.url.split("?")[0];
    if (PUBLIC_PATHS.has(path)) return;
    if (SUBSCRIPTION_EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return;
    if (READ_METHODS.has(request.method)) return;

    const userId = (request.user as { sub: string })?.sub;
    if (!userId) return;

    const [user] = await db
      .select({
        trialEndsAt: users.trialEndsAt,
        subscriptionStatus: users.subscriptionStatus,
        subscriptionCurrentPeriodEnd: users.subscriptionCurrentPeriodEnd,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) return;

    const now = new Date();
    const trialActive = user.trialEndsAt > now;
    const subscriptionActive =
      user.subscriptionStatus === "active" &&
      user.subscriptionCurrentPeriodEnd != null &&
      user.subscriptionCurrentPeriodEnd > now;

    if (!trialActive && !subscriptionActive) {
      throw new ForbiddenError(
        "Your trial has expired. Please subscribe to continue creating and editing content.",
      );
    }
  });
});
