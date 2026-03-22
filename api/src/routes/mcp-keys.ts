import { FastifyInstance } from "fastify";
import { randomBytes, createHash } from "node:crypto";
import { db } from "../db/connection.js";
import { users } from "@learnforge/core";
import { eq } from "drizzle-orm";
import { getUserId } from "../lib/auth-helpers.js";

export default async function mcpKeyRoutes(app: FastifyInstance) {
  // GET /auth/mcp-key/status
  app.get("/auth/mcp-key/status", async (request) => {
    const userId = getUserId(request);
    const [user] = await db.select({
      mcpApiKeyHash: users.mcpApiKeyHash,
      mcpApiKeyCreatedAt: users.mcpApiKeyCreatedAt,
    }).from(users).where(eq(users.id, userId));
    return {
      hasKey: !!user?.mcpApiKeyHash,
      createdAt: user?.mcpApiKeyCreatedAt ?? null,
    };
  });

  // POST /auth/mcp-key — generate new key
  app.post("/auth/mcp-key", async (request) => {
    const userId = getUserId(request);
    const rawKey = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(rawKey).digest("hex");
    await db.update(users).set({
      mcpApiKeyHash: hash,
      mcpApiKeyCreatedAt: new Date(),
    }).where(eq(users.id, userId));
    return { key: rawKey };
  });

  // DELETE /auth/mcp-key — revoke key
  app.delete("/auth/mcp-key", async (request, reply) => {
    const userId = getUserId(request);
    await db.update(users).set({
      mcpApiKeyHash: null,
      mcpApiKeyCreatedAt: null,
    }).where(eq(users.id, userId));
    reply.status(204);
  });
}
