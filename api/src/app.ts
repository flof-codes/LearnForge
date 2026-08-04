import Fastify from "fastify";
import cors from "@fastify/cors";
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
import { sql } from "drizzle-orm";
import { db } from "./db/connection.js";
import { NotFoundError, ValidationError, UnauthorizedError, ForbiddenError } from "./lib/errors.js";

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, {
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  app.register(rawBody, { field: "rawBody", global: false, runFirst: true });
  app.register(authPlugin);

  app.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, _request, reply) => {
    if (error instanceof UnauthorizedError) {
      return reply.status(401).send({ error: error.message });
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
