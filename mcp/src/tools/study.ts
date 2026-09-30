import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "@learnforge/core";
import { getStudyCards, getStudySummary, getDueForecast, loadCardMedia, type AttachedImage } from "@learnforge/core";
import { withCardMedia } from "./media-blocks.js";

/** Pictures per study batch; a long batch of photo cards must still fit one turn. */
const MAX_STUDY_IMAGES = 12;

export function registerStudyTools(server: McpServer, db: Db, userId: string, imagePath: string) {
  server.tool(
    "get_study_cards",
    "Get cards ready to study (new + due for review), optionally filtered by topic (includes descendants). Pass the session_id from start_session: each card then carries a question_id ticket that submit_review needs, plus its original question, effective change rate, level and progress. Each card's `media` lists its files; pictures follow as images in the order of the cards (`imageIndex` on the entry), audio cannot be played in chat.",
    {
      topic_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(5).optional(),
      session_id: z.string().uuid().optional().describe("From start_session; issues one ticket per card"),
    },
    async ({ topic_id, limit, session_id }) => {
      try {
        const cards = await getStudyCards(db, userId, topic_id, limit ?? 5, { sessionId: session_id });
        const images: AttachedImage[] = [];
        const withMedia = [];
        for (const card of cards) {
          const media = await loadCardMedia(db, userId, [card.frontHtml, card.backHtml], { imagePath, maxImages: Math.max(0, MAX_STUDY_IMAGES - images.length) });
          const entries = media.entries.map(e => ({ ...e, imageIndex: e.attached ? images.length + media.images.findIndex(i => i.id === e.id) : null }));
          images.push(...media.images);
          withMedia.push({ ...card, media: entries });
        }
        return withCardMedia(withMedia, images);
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
    "Get a study session summary with total cards, due count, Bloom level distribution, 7-day accuracy, and streak info (review streak, creation streak)",
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
