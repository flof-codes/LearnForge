import Fastify, { type FastifyRequest } from "fastify";
import cors, { type FastifyCorsOptions } from "@fastify/cors";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import topicRoutes from "./routes/topics.js";
import cardRoutes from "./routes/cards.js";
import reviewRoutes from "./routes/reviews.js";
import studyRoutes from "./routes/study.js";
import contextRoutes from "./routes/context.js";
import imageRoutes from "./routes/images.js";
import mcpKeyRoutes from "./routes/mcp-keys.js";
import billingRoutes from "./routes/billing.js";
import exportRoutes from "./routes/export.js";
import adminRoutes from "./routes/admin.js";
import shareRoutes from "./routes/shares.js";
import focusRoutes from "./routes/focus.js";
import glassesRoutes from "./routes/glasses.js";
import appRoutes from "./routes/apps.js";
import noteRoutes from "./routes/notes.js";
import ankiImportRoutes from "./routes/anki-import.js";
import { sql } from "drizzle-orm";
import { db } from "./db/connection.js";
import { NotFoundError, ValidationError, UnauthorizedError, ForbiddenError } from "./lib/errors.js";
import { signMediaRefs, unsignMediaRefsDeep, referencedMediaIds, textArray } from "@learnforge/core";
import { config, mediaUrlSecret } from "./config.js";

export function buildApp() {
  // trustProxy: the api sits behind a reverse proxy; without it request.ip is the
  // proxy and every per-IP limit (glasses pairing) collapses into one global bucket.
  const app = Fastify({ logger: true, trustProxy: true });

  // Browsers may call the API from the web app only (APP_URL plus CORS_ORIGINS).
  // The glasses run in Even's app, whose webview has no web origin, so their
  // routes take any origin; the bearer token is their credential.
  app.register(cors, () => (request: FastifyRequest, callback: (err: Error | null, options: FastifyCorsOptions) => void) => {
    const path = request.url.split("?")[0];
    const open = path.startsWith("/glasses/") || path === "/health";
    callback(null, {
      origin: open ? true : [...config.corsOrigins],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    });
  });
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.register(rawBody, { field: "rawBody", global: false, runFirst: true });
  app.register(authPlugin);

  app.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, _request, reply) => {
    if (error instanceof UnauthorizedError) {
      return reply.status(401).send({ error: error.message, ...(error.code ? { code: error.code } : {}) });
    }
    if (error instanceof NotFoundError) {
      return reply.status(404).send({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return reply.status(403).send({ error: error.message, ...(error.code ? { code: error.code } : {}) });
    }
    if (error instanceof ValidationError) {
      return reply.status(400).send({ error: error.message });
    }
    if (error.validation) {
      return reply.status(400).send({ error: error.message });
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "Internal server error" });
  });

  // Card HTML keeps media as /images/<id>; the sandboxed card frame cannot send
  // the login token, so JSON responses carry signed /media URLs instead, and
  // bodies that write HTML are turned back before any handler sees them.
  const requester = (request: FastifyRequest) => (request.user as { sub?: string } | undefined)?.sub;
  app.addHook("preValidation", async (request) => {
    const userId = requester(request);
    if (userId && request.body && typeof request.body === "object" && !request.isMultipart()) {
      request.body = unsignMediaRefsDeep(request.body, mediaUrlSecret, userId);
    }
  });
  app.addHook("onSend", async (request, reply, payload) => {
    if (typeof payload !== "string" || !payload.includes("/images/")) return payload;
    if (!String(reply.getHeader("content-type") ?? "").includes("application/json")) return payload;
    if (request.url.startsWith("/export")) return payload; // exports keep the stored form
    const userId = requester(request);
    if (!userId) return payload;
    // Relative by default: the web app resolves /media/… against its own API address
    // (a <base> in the card frame), so the proxy's Host handling cannot misdirect it.
    const base = config.apiPublicUrl;
    const ids = referencedMediaIds(payload);
    if (ids.length === 0) return payload;
    // Only the requester's own files get a URL: an id copied from someone else stays inert.
    const owned = await db.execute<{ id: string }>(sql`
      SELECT id FROM images WHERE user_id = ${userId} AND id = ANY(${textArray(ids)}::uuid[])
    `);
    return signMediaRefs(payload, base, mediaUrlSecret, userId, new Set(owned.rows.map(r => r.id.toLowerCase())));
  });

  // Validate UUID route params (e.g. :id, :card_id) before handlers run
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  app.addHook("preHandler", async (request) => {
    const params = request.params as Record<string, string> | undefined;
    if (!params) return;
    for (const [key, value] of Object.entries(params)) {
      if (key.toLowerCase().includes("id") && !UUID_RE.test(value)) {
        throw new ValidationError(`Invalid UUID: ${key}`);
      }
    }
  });

  app.register(authRoutes);
  app.register(topicRoutes);
  app.register(cardRoutes);
  app.register(noteRoutes);
  app.register(ankiImportRoutes);
  app.register(reviewRoutes);
  app.register(studyRoutes);
  app.register(contextRoutes);
  app.register(imageRoutes);
  app.register(mcpKeyRoutes);
  app.register(billingRoutes);
  app.register(exportRoutes);
  app.register(adminRoutes);
  app.register(shareRoutes);
  app.register(focusRoutes);
  app.register(glassesRoutes);
  app.register(appRoutes);

  // The body names this service on purpose, and the check touches the database.
  //
  // A bare {"status":"ok"} proves only that something is listening. Once several
  // migrated containers share one host, a port collision with a SIBLING container
  // false-passes a generic sentinel -- which is the exact failure a health check
  // exists to catch. Separately, an api that is up but cannot reach Postgres
  // serves 500s on every real route while reporting itself healthy, so the deploy
  // that broke it looks like it succeeded.
  app.get("/health", async (_request, reply) => {
    try {
      await db.execute(sql`select 1`);
    } catch (err) {
      app.log.error({ err }, "health check: database unreachable");
      return reply.code(503).send({
        status: "error",
        service: "learnforge-api",
        database: "unreachable",
      });
    }
    return { status: "ok", service: "learnforge-api", database: "ok" };
  });

  return app;
}
