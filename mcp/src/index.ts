import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { runMigrations } from "./db/migrate.js";
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
function createServer(): McpServer {
  const server = new McpServer({ name: "learnforge", version: "1.0.0" });
  registerTopicTools(server);
  registerCardTools(server);
  registerReviewTools(server);
  registerStudyTools(server);
  registerContextTools(server);
  registerImageTools(server);
  registerSkillTools(server);
  return server;
}

const isStdio = process.argv.includes("--stdio");

if (isStdio) {
  // --- Stdio transport (for Claude Desktop) ---
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  // --- StreamableHTTP transport ---

  function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
    if (req.path === "/health") return next();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing API key" });
      return;
    }
    if (authHeader.slice(7) !== config.mcpApiKey) {
      res.status(403).json({ error: "Invalid API key" });
      return;
    }
    next();
  }

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const app = express();
  app.use(express.json());
  app.use(apiKeyAuth);

  app.post("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
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
        const server = createServer();
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
