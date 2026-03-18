import { createHash, randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import type { OAuthMetadata, OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
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
import { LearnForgeOAuthProvider, handleLogin, cleanupExpiredOAuth } from "./auth/oauth-provider.js";

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
  // --- StreamableHTTP transport with OAuth + API key auth ---

  const provider = new LearnForgeOAuthProvider();
  const mcpPublicUrl = config.mcpPublicUrl;

  // OAuth Authorization Server metadata
  const issuerUrl = new URL(mcpPublicUrl);
  // Strip path for issuer (must be origin only or origin+path without trailing slash)
  const issuer = `${issuerUrl.protocol}//${issuerUrl.host}`;

  const oauthMetadata: OAuthMetadata = {
    issuer,
    authorization_endpoint: `${mcpPublicUrl}/authorize`,
    token_endpoint: `${mcpPublicUrl}/token`,
    registration_endpoint: `${mcpPublicUrl}/register`,
    revocation_endpoint: `${mcpPublicUrl}/revoke`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
    grant_types_supported: ["authorization_code", "refresh_token"],
  };

  const protectedResourceMetadata: OAuthProtectedResourceMetadata = {
    resource: mcpPublicUrl,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
  };

  // --- Dual auth middleware: OAuth token first, then API key fallback ---
  async function dualAuth(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing authentication" });
      return;
    }

    const rawToken = authHeader.slice(7);

    // Try OAuth token first
    try {
      const authInfo = await provider.verifyAccessToken(rawToken);
      const userId = authInfo.extra?.userId as string | undefined;
      if (userId) {
        (req as unknown as Record<string, unknown>).userId = userId;
        return next();
      }
    } catch {
      // Not a valid OAuth token, try API key
    }

    // Fallback: API key
    try {
      const userId = await resolveApiKey(rawToken);
      (req as unknown as Record<string, unknown>).userId = userId;
      next();
    } catch {
      res.status(401).json({ error: "Invalid authentication" });
    }
  }

  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const app = express();

  // --- OAuth discovery endpoints (no auth) ---
  app.use("/.well-known/oauth-authorization-server", metadataHandler(oauthMetadata));
  app.use("/.well-known/oauth-protected-resource", metadataHandler(protectedResourceMetadata));

  // --- OAuth flow endpoints (no auth) ---
  app.use("/mcp/authorize", authorizationHandler({ provider }));
  app.use("/mcp/token", tokenHandler({ provider }));
  app.use("/mcp/register", clientRegistrationHandler({ clientsStore: provider.clientsStore }));
  app.use("/mcp/revoke", revocationHandler({ provider }));

  // --- Login handler (processes OAuth login form) ---
  app.post("/mcp/login", express.urlencoded({ extended: false }), async (req: Request, res: Response) => {
    try {
      const result = await handleLogin(req.body as Record<string, string>);
      if ("redirect" in result) {
        res.redirect(result.redirect);
      } else {
        res.setHeader("Content-Type", "text/html");
        res.send(result.html);
      }
    } catch (error) {
      console.error("Login error:", error);
      if (!res.headersSent) {
        res.status(500).send("Internal server error");
      }
    }
  });

  // --- Health check (no auth) ---
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // --- MCP protocol endpoints (dual auth) ---
  app.post("/mcp", express.json(), dualAuth, async (req: Request, res: Response) => {
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

  app.get("/mcp", dualAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", express.json(), dualAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // --- Cleanup interval ---
  const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  const cleanupTimer = setInterval(() => {
    cleanupExpiredOAuth().catch((err) => console.error("OAuth cleanup error:", err));
  }, CLEANUP_INTERVAL_MS);

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`MCP StreamableHTTP server listening on port ${config.port}`);
  });

  process.on("SIGINT", async () => {
    clearInterval(cleanupTimer);
    for (const sid of Object.keys(transports)) {
      await transports[sid].close().catch(() => {});
      delete transports[sid];
    }
    process.exit(0);
  });
}
