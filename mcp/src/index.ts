import { createHash, randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { eq } from "drizzle-orm";
import { runMigrations } from "./db/migrate.js";
import { db } from "./db/connection.js";
import { users } from "./db/schema/index.js";
import { registerTopicTools } from "./tools/topics.js";
import { registerCardTools } from "./tools/cards.js";
import { registerReviewTools } from "./tools/reviews.js";
import { registerStudyTools } from "./tools/study.js";
import { registerContextTools } from "./tools/context.js";
import { registerImageTools } from "./tools/images.js";
import { registerSkillTools } from "./tools/skill.js";
import { config } from "./config.js";

await runMigrations();

// --- Build a fresh McpServer per session ---
function createServer(userId: string): McpServer {
  const server = new McpServer({ name: "learnforge", version: "1.0.0" });
  registerTopicTools(server, userId);
  registerCardTools(server, userId);
  registerReviewTools(server, userId);
  registerStudyTools(server, userId);
  registerContextTools(server, userId);
  registerImageTools(server, userId);
  registerSkillTools(server);
  return server;
}

async function resolveApiKey(rawKey: string): Promise<string> {
  const hash = createHash("sha256").update(rawKey).digest("hex");
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.mcpApiKeyHash, hash));
  if (!user) throw new Error("Invalid API key");
  return user.id;
}

const isStdio = process.argv.includes("--stdio");

if (isStdio) {
  // --- Stdio transport (for Claude Desktop) ---
  const keyIdx = process.argv.indexOf("--api-key");
  if (keyIdx === -1 || !process.argv[keyIdx + 1]) {
    console.error("Error: --api-key <key> is required in stdio mode");
    process.exit(1);
  }
  const rawKey = process.argv[keyIdx + 1];
  const userId = await resolveApiKey(rawKey);

  const server = createServer(userId);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  // --- StreamableHTTP transport ---

  async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
    if (req.path === "/health") return next();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }
    try {
      const userId = await resolveApiKey(authHeader.slice(7));
      (req as unknown as Record<string, unknown>).userId = userId;
      next();
    } catch {
      res.status(403).json({ error: "Invalid API key" });
    }
  }

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const app = express();
  app.use(express.json());
  app.use(apiKeyAuth);

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    const userId = (req as unknown as Record<string, unknown>).userId as string;
    try {
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }
      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => { transports[sid] = transport; },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) delete transports[sid];
        };
        const server = createServer(userId);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }
      res.status(400).json({ error: "Bad Request: No valid session ID" });
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`MCP StreamableHTTP server listening on port ${config.port}`);
  });

  process.on("SIGINT", async () => {
    for (const sid of Object.keys(transports)) {
      await transports[sid].close().catch(() => {});
      delete transports[sid];
    }
    process.exit(0);
  });
}
