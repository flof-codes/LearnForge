import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "@learnforge/core";
import { createCard, getCard, updateCard, deleteCard, resetCard } from "@learnforge/core";

export function registerCardTools(server: McpServer, db: Db, userId: string) {
  // ── create_card ──────────────────────────────────────────────────────
  server.tool(
    "create_card",
    "Create a flashcard with embedding, bloom state, and FSRS scheduling state",
    {
      topic_id: z.string().uuid(),
      concept: z.string(),
      front_html: z.string(),
      back_html: z.string(),
      tags: z.array(z.string()).optional(),
    },
    async ({ topic_id, concept, front_html, back_html, tags }) => {
      try {
        const result = await createCard(db, userId, { topic_id, concept, front_html, back_html, tags });
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
    "Get a card with its bloom state, FSRS scheduling state, and review history",
    { card_id: z.string().uuid() },
    async ({ card_id }) => {
      try {
        const result = await getCard(db, userId, card_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── update_card ──────────────────────────────────────────────────────
  server.tool(
    "update_card",
    "Update a card's content. Recomputes embedding if concept, content, or tags change",
    {
      card_id: z.string().uuid(),
      concept: z.string().optional(),
      front_html: z.string().optional(),
      back_html: z.string().optional(),
      tags: z.array(z.string()).optional(),
      topic_id: z.string().uuid().optional(),
    },
    async ({ card_id, concept, front_html, back_html, tags, topic_id }) => {
      try {
        const result = await updateCard(db, userId, card_id, { concept, front_html, back_html, tags, topic_id });
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
    "Delete a card. Bloom state, FSRS state, and reviews cascade-delete via FK",
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
