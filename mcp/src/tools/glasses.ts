import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { Db } from "@learnforge/core";
import {
  users,
  getGlassesCompileQueue,
  storeGlassesQuestion,
  GLASSES_CAPS,
  GLASSES_PROMPT_VERSION,
} from "@learnforge/core";

function ok(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

/**
 * The glasses feature is admin-only. The MCP session auth checks the API key or
 * OAuth token, not the role, so the tools check it themselves.
 */
async function requireAdmin(db: Db, userId: string): Promise<void> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  if (!user || user.role !== "admin") throw new Error("Glasses tools are only available to admin accounts");
}

export function registerGlassesTools(server: McpServer, db: Db, userId: string) {
  server.tool(
    "get_glasses_compile_queue",
    `Cards due soon that have no compiled question for the Even Realities G2 glasses at their current Bloom level. Each entry carries everything needed to compile in one step: concept, card type, cloze data, plain-text front and back, the current original question, change rate, and for level 3+ up to three similar cards. Compile each entry with store_glasses_question, or skip it when it cannot be compressed. Caps: stem ${GLASSES_CAPS.stem} chars on ${GLASSES_CAPS.stemLines} lines, ${GLASSES_CAPS.options} options of ${GLASSES_CAPS.option} chars, explanation ${GLASSES_CAPS.explanation} chars, Latin text only. Admin only.`,
    {
      limit: z.number().int().min(1).max(50).optional().describe("Entries to return, default 10"),
      topic_id: z.string().uuid().optional().describe("Restrict to a topic and its descendants"),
      horizon_days: z.number().int().min(0).max(60).optional().describe("Include cards due within this many days, default 3"),
      include_html: z.boolean().optional().describe("Also return the raw front and back HTML"),
    },
    async ({ limit, topic_id, horizon_days, include_html }) => {
      try {
        await requireAdmin(db, userId);
        const entries = await getGlassesCompileQueue(db, userId, { limit, topic_id, horizon_days, include_html });
        return ok({ promptVersion: GLASSES_PROMPT_VERSION, caps: GLASSES_CAPS, entries });
      } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "store_glasses_question",
    `Store the compiled glasses question of one card at one Bloom level, replacing an earlier one. options are exactly four texts in display order; correct lists the zero-based indices that are right (one index = single choice, two or three = multiple choice). Pass skip=true with a reason instead when the card needs formulas, images or more room than the display has; skipped cards leave the queue. Admin only.`,
    {
      card_id: z.string().uuid(),
      bloom_level: z.number().int().min(0).max(5).describe("The card's current level from the queue entry"),
      stem: z.string().max(GLASSES_CAPS.stem).optional(),
      options: z.array(z.string().max(GLASSES_CAPS.option)).length(GLASSES_CAPS.options).optional(),
      correct: z.array(z.number().int().min(0).max(3)).min(1).max(3).optional(),
      explanation: z.string().max(GLASSES_CAPS.explanation).optional(),
      skip: z.boolean().optional(),
      reason: z.string().max(200).optional().describe("Why the card cannot be compiled; required with skip"),
    },
    async (input) => {
      try {
        await requireAdmin(db, userId);
        return ok(await storeGlassesQuestion(db, userId, input));
      } catch (err) { return fail(err); }
    },
  );
}
