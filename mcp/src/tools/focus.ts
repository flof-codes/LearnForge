import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "@learnforge/core";
import {
  getFocusTopics,
  setFocusTopics,
  clearFocusTopics,
} from "@learnforge/core";

export function registerFocusTools(server: McpServer, db: Db, userId: string) {
  server.tool(
    "list_focus_topics",
    "List the user's current focus topics (priority study queue). Active focus topics are ordered first when fetching due cards via get_study_cards (no topic filter). Returns ordered by priority (1 = highest). Includes expires_at — entries past their expiry are filtered out automatically when ordering study cards.",
    {},
    async () => {
      try {
        const rows = await getFocusTopics(db, userId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "set_focus_topics",
    "Replace the full ordered list of focus topics. Priority is derived from array order (first = highest). Subtopics inherit focus from their parent. Optional expires_at (ISO 8601) auto-disables a focus entry after that time. Empty array clears all focus.",
    {
      topics: z
        .array(
          z.object({
            topic_id: z.string().uuid(),
            expires_at: z
              .string()
              .datetime()
              .nullable()
              .optional()
              .describe("ISO 8601 timestamp; null/omitted = indefinite"),
          }),
        )
        .max(20),
    },
    async ({ topics }) => {
      try {
        const rows = await setFocusTopics(db, userId, topics);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "clear_focus_topics",
    "Remove all focus topics for the user. Study card ordering reverts to plain due-ASC.",
    {},
    async () => {
      try {
        await clearFocusTopics(db, userId);
        return {
          content: [{ type: "text" as const, text: "Focus topics cleared." }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
