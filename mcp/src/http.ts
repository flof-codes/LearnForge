import { createHash, randomUUID } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import type { OAuthMetadata, OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { eq } from "drizzle-orm";
import type { Db } from "@learnforge/core";
import { users, checkSubscriptionAccess } from "@learnforge/core";
import { registerTopicTools } from "./tools/topics.js";
import { registerCardTools } from "./tools/cards.js";
import { registerReviewTools } from "./tools/reviews.js";
import { registerStudyTools } from "./tools/study.js";
import { registerContextTools } from "./tools/context.js";
import { registerImageTools } from "./tools/images.js";
import { registerSkillTools } from "./tools/skill.js";
import { LearnForgeOAuthProvider, handleLogin, cleanupExpiredOAuth } from "./auth/oauth-provider.js";

export interface McpHttpConfig {
  mcpPublicUrl: string;
  imagePath: string;
}

export function createMcpHttpApp(db: Db, mcpConfig: McpHttpConfig): {
  app: express.Express;
  cleanup: () => void;
} {
  const { mcpPublicUrl, imagePath } = mcpConfig;

  // --- Build a fresh McpServer per session ---
  function createServer(userId: string): McpServer {
    const server = new McpServer(
      { name: "learnforge", version: "1.0.0" },
      {
        instructions: `LearnForge spaced repetition tutor with Bloom's Taxonomy progression.

Session start: Call get_instructions to load the tutor workflow before doing anything else.
Study session: get_study_summary → get_study_cards → [question loop with submit_review after each card].
Card creation: Generate preview → wait for user approval → create_card. Call get_templates for HTML templates.
Cross-concept questions (Bloom 3+): Use get_similar_cards for context.
Question presentation: Use ask_user_input_v0 for MCQ. Use optionShuffle array to order options.`,
      },
    );
    registerTopicTools(server, db, userId);
    registerCardTools(server, db, userId);
    registerReviewTools(server, db, userId);
    registerStudyTools(server, db, userId);
    registerContextTools(server, db, userId);
    registerImageTools(server, db, userId, imagePath);
    registerSkillTools(server);
    return server;
  }

  async function resolveApiKey(rawKey: string): Promise<string> {
    const hash = createHash("sha256").update(rawKey).digest("hex");
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.mcpApiKeyHash, hash));
    if (!user) throw new Error("Invalid API key");
    return user.id;
  }

  async function checkSubscription(userId: string): Promise<void> {
    const [user] = await db.select({
      trialEndsAt: users.trialEndsAt,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionCurrentPeriodEnd: users.subscriptionCurrentPeriodEnd,
    }).from(users).where(eq(users.id, userId));

    if (!user) throw new Error("User not found");

    if (!checkSubscriptionAccess(user).isActive) {
      throw new Error("Subscription expired. Please subscribe at learnforge.eu to continue using MCP tools.");
    }
  }

  const provider = new LearnForgeOAuthProvider(db);

  // OAuth Authorization Server metadata
  const issuerUrl = new URL(mcpPublicUrl);
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
        try {
          await checkSubscription(userId);
        } catch (err) {
          res.status(403).json({ error: (err as Error).message });
          return;
        }
        (req as unknown as Record<string, unknown>).userId = userId;
        return next();
      }
    } catch {
      // Not a valid OAuth token, try API key
    }

    // Fallback: API key
    try {
      const userId = await resolveApiKey(rawToken);
      try {
        await checkSubscription(userId);
      } catch (err) {
        res.status(403).json({ error: (err as Error).message });
        return;
      }
      (req as unknown as Record<string, unknown>).userId = userId;
      next();
    } catch {
      res.status(401).json({ error: "Invalid authentication" });
    }
  }

  const transports: Record<string, StreamableHTTPServerTransport> = {};
  const sessionLastActive: Record<string, number> = {};
  const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

  const app = express();
  app.set("trust proxy", 1);

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
      const result = await handleLogin(db, req.body as Record<string, string>);
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
        sessionLastActive[sessionId] = Date.now();
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }
      // Allow (re-)initialization even with a stale session ID
      if (isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            transports[sid] = transport;
            sessionLastActive[sid] = Date.now();
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            delete transports[sid];
            delete sessionLastActive[sid];
          }
        };
        const server = createServer(userId);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }
      if (sessionId) {
        res.status(404).json({ error: "Session not found" });
      } else {
        res.status(400).json({ error: "Missing session ID. Send an initialize request first." });
      }
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
      res.status(sessionId ? 404 : 400).json({ error: sessionId ? "Session not found" : "Missing session ID." });
      return;
    }
    sessionLastActive[sessionId] = Date.now();
    await transports[sessionId].handleRequest(req, res);
  });

  app.delete("/mcp", express.json(), dualAuth, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(sessionId ? 404 : 400).json({ error: sessionId ? "Session not found" : "Missing session ID." });
      return;
    }
    await transports[sessionId].handleRequest(req, res);
  });

  // --- Cleanup interval ---
  const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  const cleanupTimer = setInterval(async () => {
    cleanupExpiredOAuth(db).catch((err) => console.error("OAuth cleanup error:", err));

    // Evict stale MCP sessions
    const now = Date.now();
    for (const sid of Object.keys(sessionLastActive)) {
      if (now - sessionLastActive[sid] > SESSION_TTL_MS) {
        try {
          await transports[sid]?.close();
        } catch { /* ignore close errors */ }
        delete transports[sid];
        delete sessionLastActive[sid];
      }
    }
  }, CLEANUP_INTERVAL_MS);

  function cleanup() {
    clearInterval(cleanupTimer);
    for (const sid of Object.keys(transports)) {
      transports[sid].close().catch(() => {});
      delete transports[sid];
      delete sessionLastActive[sid];
    }
  }

  return { app, cleanup };
}
