import { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/connection.js";
import {
  startAppPairing,
  pollAppPairing,
  getAppPairing,
  claimAppPairing,
  listAppTokens,
  revokeAppToken,
  revokeAppTokenById,
  getAppAccount,
} from "@learnforge/core";
import { config } from "../config.js";
import { getUserId } from "../lib/auth-helpers.js";
import { ForbiddenError } from "../lib/errors.js";

/**
 * Connected apps (Lecture Scribe).
 *
 * Three kinds of caller share this file. The two pairing routes are public and
 * rate limited; info, claim and token management take the user's JWT; `/apps/me`
 * takes the app's bearer token, which the auth plugin resolves into
 * `request.user` (see APP_TOKEN_ROUTES there).
 */

// Same tiny per-IP window as the glasses pairing: the poll leaks only a status,
// but there is no reason to let anyone enumerate codes.
const WINDOW_MS = 60 * 1000;
const START_LIMIT = 10;
const POLL_LIMIT = 90;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, limit: number): void {
  const now = Date.now();
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) {
    const err = new Error("Too many requests, try again in a minute") as Error & { statusCode: number };
    err.statusCode = 429;
    throw err;
  }
}

/** Approving and removing apps is the account owner's call: an app token must not mint or revoke tokens. */
function requireUserLogin(request: FastifyRequest): string {
  if ((request.user as { app?: string }).app) throw new ForbiddenError("Sign in to LearnForge to manage connected apps");
  return getUserId(request);
}

const codeBody = {
  type: "object",
  required: ["code"],
  properties: { code: { type: "string", minLength: 6, maxLength: 12 } },
  additionalProperties: false,
};

export default async function appRoutes(app: FastifyInstance) {
  // --- Pairing (public) ----------------------------------------------------

  // POST /apps/pair/start — the app registers the hash of its own secret and gets the code and the page to open
  app.post<{ Body: { token_hash: string; app: string; device?: string } }>("/apps/pair/start", {
    schema: {
      body: {
        type: "object",
        required: ["token_hash", "app"],
        properties: {
          token_hash: { type: "string", minLength: 64, maxLength: 64 },
          app: { type: "string", minLength: 1, maxLength: 80 },
          device: { type: "string", maxLength: 80 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    rateLimit(`start:${request.ip ?? "unknown"}`, START_LIMIT);
    const started = await startAppPairing(db, request.body);
    reply.status(201);
    return { ...started, verifyUrl: `${config.appUrl.replace(/\/$/, "")}/connect?code=${started.code}` };
  });

  // POST /apps/pair/poll — status only; the token never travels this way
  app.post<{ Body: { code: string } }>("/apps/pair/poll", { schema: { body: codeBody } }, async (request) => {
    rateLimit(`poll:${request.ip ?? "unknown"}`, POLL_LIMIT);
    return pollAppPairing(db, request.body.code);
  });

  // --- The account owner (JWT) ---------------------------------------------

  // GET /apps/pair/info?code= — what the approval page shows
  app.get<{ Querystring: { code?: string } }>("/apps/pair/info", async (request) => {
    requireUserLogin(request);
    return getAppPairing(db, request.query.code ?? "");
  });

  // POST /apps/claim — the user approves the code
  app.post<{ Body: { code: string } }>("/apps/claim", { schema: { body: codeBody } }, async (request, reply) => {
    const userId = requireUserLogin(request);
    reply.status(201);
    return claimAppPairing(db, userId, request.body.code);
  });

  // GET /apps/tokens — connected apps, never hashes
  app.get("/apps/tokens", async (request) => {
    return listAppTokens(db, requireUserLogin(request));
  });

  // DELETE /apps/tokens/:id — the app sees 401 TOKEN_REVOKED on its next call
  app.delete<{ Params: { id: string } }>("/apps/tokens/:id", async (request, reply) => {
    await revokeAppToken(db, requireUserLogin(request), request.params.id);
    reply.status(204);
    return null;
  });

  // --- The app (bearer token) ----------------------------------------------

  // GET /apps/me — the account behind the token, and whether it may create content
  app.get("/apps/me", async (request) => {
    return { ...(await getAppAccount(db, getUserId(request))), appUrl: config.appUrl.replace(/\/$/, "") };
  });

  // DELETE /apps/me — "disconnect" in the app ends its own access here as well
  app.delete("/apps/me", async (request, reply) => {
    const tokenId = (request.user as { app?: string }).app;
    if (!tokenId) throw new ForbiddenError("Only a connected app can disconnect itself");
    await revokeAppTokenById(db, tokenId);
    reply.status(204);
    return null;
  });
}
