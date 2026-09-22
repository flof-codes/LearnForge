import { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/connection.js";
import {
  startGlassesPairing,
  pollGlassesPairing,
  claimGlassesPairing,
  listGlassesTokens,
  revokeGlassesToken,
  getGlassesBatch,
  submitGlassesAnswer,
  getGlassesSummary,
  ValidationError,
} from "@learnforge/core";
import { getUserId, requireAdmin } from "../lib/auth-helpers.js";

/**
 * Even Realities G2 glasses.
 *
 * Three kinds of caller share this file. The two pairing routes are public and
 * rate limited; claim and token management take the admin's JWT; summary, next
 * and reviews take the glasses bearer token that the auth plugin resolves into
 * `request.user` (see GLASSES_TOKEN_PATHS there).
 */

// --- Tiny per-IP window for the public pairing routes ---------------------
// A 6-character code out of 32 symbols is ~30 bits; the poll leaks only a status,
// but there is no reason to let anyone enumerate. app.ts sets trustProxy so
// `request.ip` is the client behind the reverse proxy, not the proxy itself.
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

function ipOf(request: FastifyRequest): string {
  return request.ip ?? "unknown";
}

export default async function glassesRoutes(app: FastifyInstance) {
  // --- Pairing (public) ----------------------------------------------------

  // POST /glasses/pair/start — the glasses register the hash of their own secret and get a code to display
  app.post<{ Body: { token_hash: string } }>("/glasses/pair/start", {
    schema: {
      body: {
        type: "object",
        required: ["token_hash"],
        properties: { token_hash: { type: "string", minLength: 64, maxLength: 64 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    rateLimit(`start:${ipOf(request)}`, START_LIMIT);
    reply.status(201);
    return startGlassesPairing(db, request.body.token_hash);
  });

  // POST /glasses/pair/poll — status only; the token never travels this way
  app.post<{ Body: { code: string } }>("/glasses/pair/poll", {
    schema: {
      body: {
        type: "object",
        required: ["code"],
        properties: { code: { type: "string", minLength: 6, maxLength: 12 } },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    rateLimit(`poll:${ipOf(request)}`, POLL_LIMIT);
    return pollGlassesPairing(db, request.body.code);
  });

  // --- Admin (JWT) ----------------------------------------------------------

  // POST /glasses/claim — the admin types the code shown on the glasses
  app.post<{ Body: { code: string } }>("/glasses/claim", {
    schema: {
      body: {
        type: "object",
        required: ["code"],
        properties: { code: { type: "string", minLength: 6, maxLength: 12 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const userId = await requireAdmin(request);
    reply.status(201);
    return claimGlassesPairing(db, userId, request.body.code);
  });

  // GET /glasses/tokens — paired devices, never hashes
  app.get("/glasses/tokens", async (request) => {
    const userId = await requireAdmin(request);
    return listGlassesTokens(db, userId);
  });

  // DELETE /glasses/tokens/:id — revoke; the glasses see 401 TOKEN_REVOKED on their next call
  app.delete<{ Params: { id: string } }>("/glasses/tokens/:id", async (request, reply) => {
    const userId = await requireAdmin(request);
    await revokeGlassesToken(db, userId, request.params.id);
    reply.status(204);
    return null;
  });

  // --- Glasses (bearer token resolved by the auth plugin) -------------------

  // GET /glasses/summary — the Home screen numbers
  app.get("/glasses/summary", async (request) => {
    return getGlassesSummary(db, getUserId(request));
  });

  // GET /glasses/next — compiled questions with tickets; starts or resumes the glasses session
  app.get<{ Querystring: { mode?: string; limit?: string; session_id?: string; exclude?: string } }>("/glasses/next", {
    schema: {
      querystring: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["single", "multi"] },
          limit: { type: "string", pattern: "^[0-9]{1,2}$" },
          session_id: { type: "string", format: "uuid" },
          exclude: { type: "string", maxLength: 2000 },
        },
        additionalProperties: false,
      },
    },
  }, async (request) => {
    const mode = request.query.mode;
    if (mode !== "single" && mode !== "multi") throw new ValidationError("mode must be single or multi");
    const limit = parseInt(request.query.limit ?? "5", 10) || 5;
    const exclude = request.query.exclude ? request.query.exclude.split(",").filter(Boolean).slice(0, 50) : [];
    return getGlassesBatch(db, getUserId(request), { mode, limit, session_id: request.query.session_id, exclude });
  });

  // POST /glasses/reviews — a ring answer; the review service grades it
  app.post<{ Body: { question_id: string; selected?: string[]; dont_know?: boolean } }>("/glasses/reviews", {
    schema: {
      body: {
        type: "object",
        required: ["question_id"],
        properties: {
          question_id: { type: "string", format: "uuid" },
          selected: { type: "array", items: { type: "string", minLength: 1, maxLength: 1 }, maxItems: 4 },
          dont_know: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const result = await submitGlassesAnswer(db, getUserId(request), {
      question_id: request.body.question_id,
      selected: request.body.selected ?? [],
      dont_know: request.body.dont_know,
    });
    reply.status(201);
    return result;
  });
}
