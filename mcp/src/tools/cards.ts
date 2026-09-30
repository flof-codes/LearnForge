import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "@learnforge/core";
import { createCard, getCard, updateCard, deleteCard, resetCard, parseClozeText, loadCardMedia } from "@learnforge/core";
import { withCardMedia } from "./media-blocks.js";

export function registerCardTools(server: McpServer, db: Db, userId: string, imagePath: string) {
  // ── create_card ──────────────────────────────────────────────────────
  server.tool(
    "create_card",
    "Create a Freeform flashcard from your own front_html/back_html. For typed cards (open, choice, cloze) use create_note instead; cloze_source is kept for compatibility and creates a Cloze note with one card per gap.",
    {
      topic_id: z.string().uuid(),
      concept: z.string().optional().describe("Short label for search; defaults to the first line of the front"),
      front_html: z.string().optional(),
      back_html: z.string().optional(),
      tags: z.array(z.string()).optional(),
      card_type: z.enum(["standard", "cloze"]).default("standard").optional(),
      cloze_source: z.string().optional(),
    },
    async ({ topic_id, concept, front_html, back_html, tags, card_type, cloze_source }) => {
      try {
        if (cloze_source) {
          if (front_html || back_html) {
            return { content: [{ type: "text" as const, text: "Error: Provide cloze_source OR front_html/back_html, not both" }], isError: true };
          }
          const cloze_data = parseClozeText(cloze_source);
          const result = await createCard(db, userId, { topic_id, concept, tags, card_type: "cloze", cloze_data });
          return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
        }

        if (!front_html || !back_html) {
          return { content: [{ type: "text" as const, text: "Error: front_html and back_html are required for standard cards" }], isError: true };
        }
        const result = await createCard(db, userId, { topic_id, concept, front_html, back_html, tags, card_type });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── get_card ─────────────────────────────────────────────────────────
  server.tool(
    "get_card",
    "Get a card with its bloom state, FSRS scheduling state, and review history. Pictures the card shows come along as images; `media` lists every file the card has, and audio cannot be played in chat (say so, and ask the learner to listen in the web app).",
    { card_id: z.string().uuid() },
    async ({ card_id }) => {
      try {
        const result = await getCard(db, userId, card_id);
        const media = await loadCardMedia(db, userId, [result.frontHtml, result.backHtml], { imagePath });
        return withCardMedia({ ...result, media: media.entries }, media.images);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── update_card ──────────────────────────────────────────────────────
  server.tool(
    "update_card",
    "Update a card's content. Recomputes embedding if concept, content, or tags change. For cloze cards, provide cloze_source to update deletions and re-render HTML.",
    {
      card_id: z.string().uuid(),
      concept: z.string().optional(),
      front_html: z.string().optional(),
      back_html: z.string().optional(),
      tags: z.array(z.string()).optional(),
      topic_id: z.string().uuid().optional(),
      cloze_source: z.string().optional(),
    },
    async ({ card_id, concept, front_html, back_html, tags, topic_id, cloze_source }) => {
      try {
        let cloze_data;
        if (cloze_source) {
          cloze_data = parseClozeText(cloze_source);
        }
        const result = await updateCard(db, userId, card_id, { concept, front_html, back_html, tags, topic_id, cloze_data });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── delete_card ──────────────────────────────────────────────────────
  server.tool(
    "delete_card",
    "Delete a card. A typed card is one rendering of its note: deleting it deletes the note and all its sibling cards (as in Anki); use update_note to drop a single gap instead. Freeform cards are deleted alone; Bloom state, FSRS state and reviews cascade-delete via FK",
    { card_id: z.string().uuid() },
    async ({ card_id }) => {
      try {
        const deleted = await deleteCard(db, userId, card_id);
        return { content: [{ type: "text" as const, text: `Deleted card "${deleted.concept}" (${deleted.id})` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── reset_card ─────────────────────────────────────────────────────
  server.tool(
    "reset_card",
    "Reset a card to initial state: Bloom level 0, fresh FSRS scheduling, all reviews deleted. Use when the user wants to start over with a card.",
    { card_id: z.string().uuid() },
    async ({ card_id }) => {
      try {
        const result = await resetCard(db, userId, card_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
