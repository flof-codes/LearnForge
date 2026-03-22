import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { getStudyCards, getStudySummary, getDueForecast } from "@learnforge/core";

export function registerStudyTools(server: McpServer, userId: string) {
  server.tool(
    "get_study_cards",
    "Get cards ready to study (new + due for review), optionally filtered by topic (includes descendants)",
    {
      topic_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(10).optional(),
    },
    async ({ topic_id, limit }) => {
      try {
        const cards = await getStudyCards(db, userId, topic_id, limit ?? 10);
        return { content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "get_due_forecast",
    "Get a forecast of when cards are due, bucketed by day (month range) or month (year range)",
    {
      topic_id: z.string().uuid().optional(),
      range: z.enum(["month", "year"]).optional().default("month"),
    },
    async ({ topic_id, range }) => {
      try {
        const result = await getDueForecast(db, userId, topic_id, range ?? "month");
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "get_study_summary",
    "Get a study session summary with total cards, due count, Bloom level distribution, and 7-day accuracy",
    {
      topic_id: z.string().uuid().optional(),
    },
    async ({ topic_id }) => {
      try {
        const summary = await getStudySummary(db, userId, topic_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(summary, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
