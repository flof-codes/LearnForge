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

  app.setErrorHandler((error: Error & { validation?: unknown }, _request, reply) => {
    if (error instanceof UnauthorizedError) {
      return reply.status(401).send({ error: error.message });
    }
    if (error instanceof NotFoundError) {
      return reply.status(404).send({ error: error.message });
    }
    if (error instanceof ForbiddenError) {
      return reply.status(403).send({ error: error.message });
    }
    if (error instanceof ValidationError) {
      return reply.status(400).send({ error: error.message });
    }
    if (error.validation) {
      return reply.status(400).send({ error: error.message });
    }
    app.log.error(error);
    return reply.status(500).send({ error: "Internal server error" });
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

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}
