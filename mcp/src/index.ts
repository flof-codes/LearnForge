import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { eq } from "drizzle-orm";
import { runMigrations } from "./db/migrate.js";
import { db } from "./db/connection.js";
import { users, checkSubscriptionAccess } from "@learnforge/core";
import { registerTopicTools } from "./tools/topics.js";
import { registerCardTools } from "./tools/cards.js";
import { registerReviewTools } from "./tools/reviews.js";
import { registerStudyTools } from "./tools/study.js";
import { registerContextTools } from "./tools/context.js";
import { registerImageTools } from "./tools/images.js";
import { registerSkillTools } from "./tools/skill.js";
import { registerFocusTools } from "./tools/focus.js";
import { registerDialTools } from "./tools/dials.js";
import { registerGlassesTools } from "./tools/glasses.js";
import { config } from "./config.js";
import { createMcpHttpApp } from "./http.js";

await runMigrations();

async function resolveApiKey(rawKey: string): Promise<string> {
  const hash = createHash("sha256").update(rawKey).digest("hex");
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.mcpApiKeyHash, hash));
  if (!user) throw new Error("Invalid API key");
  return user.id;
}

async function checkSubscription(userId: string): Promise<void> {
  const [user] = await db.select({
    emailVerifiedAt: users.emailVerifiedAt,
    trialEndsAt: users.trialEndsAt,
    subscriptionStatus: users.subscriptionStatus,
    subscriptionCurrentPeriodEnd: users.subscriptionCurrentPeriodEnd,
  }).from(users).where(eq(users.id, userId));

  if (!user) throw new Error("User not found");

  // Mirrors the API's write gate — otherwise MCP would be an open side door
  // into the same mutations for an unverified account.
  if (!user.emailVerifiedAt) {
    throw new Error("Please confirm your e-mail address at learnforge.eu before using MCP tools.");
  }

  if (!checkSubscriptionAccess(user).isActive) {
    throw new Error("Subscription expired. Please subscribe at learnforge.eu to continue using MCP tools.");
  }
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
  await checkSubscription(userId);

  function createServer(userId: string): McpServer {
    const server = new McpServer(
      { name: "learnforge", version: "1.0.0" },
      {
        instructions: `LearnForge spaced repetition tutor with Bloom's Taxonomy progression.

Session start: Call get_instructions to load the tutor workflow before doing anything else.
Study session: get_study_summary → start_session (ask the learner for the difficulty: Commute / Desk / Deep) → get_study_cards with session_id → [question loop: show the next question, then submit_review with the previous card's question_id ticket].
Every question derives from the card's original question; at change rate 0 ask it word for word with the options in their stored order. Show the difficulty on every question.
Card creation: Generate preview → wait for user approval → create_card. Call get_templates for HTML templates.
Cross-concept questions (Bloom 3+): Use get_similar_cards for context.
Question presentation: Print the stem and full lettered options as chat text; where the client has the visualizer, collect the answer with show_widget and the mcq-selector template, otherwise let the learner type the letters.`,
      },
    );
    registerTopicTools(server, db, userId);
    registerCardTools(server, db, userId);
    registerReviewTools(server, db, userId);
    registerStudyTools(server, db, userId);
    registerContextTools(server, db, userId);
    registerImageTools(server, db, userId, config.imagePath);
    registerSkillTools(server);
    registerFocusTools(server, db, userId);
    registerDialTools(server, db, userId);
    registerGlassesTools(server, db, userId);
    return server;
  }

  const server = createServer(userId);
  const transport = new StdioServerTransport();
  await server.connect(transport);
} else {
  // --- HTTP standalone mode (uses factory) ---
  const { app, cleanup } = createMcpHttpApp(db, {
    mcpPublicUrl: config.mcpPublicUrl,
    imagePath: config.imagePath,
  });

  app.listen(config.port, "0.0.0.0", () => {
    console.log(`MCP StreamableHTTP server listening on port ${config.port}`);
  });

  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
}
