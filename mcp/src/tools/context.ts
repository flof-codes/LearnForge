import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { getTopicContext, getSimilarCards, searchCards } from "@learnforge/core";

export function registerContextTools(server: McpServer, userId: string) {
  server.tool(
    "get_topic_context",
    "Get all cards for a topic and its descendants (recursive). Returns card concept, tags, bloom state, and review history.",
    {
      topic_id: z.string().uuid(),
      depth: z.number().int().positive().default(100).describe("Maximum recursion depth for subtopics"),
    },
    async ({ topic_id, depth }) => {
      try {
        const cards = await getTopicContext(db, userId, topic_id, depth);
        return { content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "get_similar_cards",
    "Find cards similar to a given card using pgvector cosine similarity. Returns similarity score, concept, tags, bloom state, and review history.",
    {
      card_id: z.string().uuid(),
      limit: z.number().int().positive().max(100).default(15).describe("Maximum number of similar cards to return"),
    },
    async ({ card_id, limit }) => {
      try {
        const cards = await getSimilarCards(db, userId, card_id, limit);
        return { content: [{ type: "text" as const, text: JSON.stringify(cards, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  // ── search_cards ─────────────────────────────────────────────────────
  server.tool(
    "search_cards",
    "Search cards using hybrid text + semantic search. Combines keyword matching on concept/tags with semantic similarity via embeddings, ranked by Reciprocal Rank Fusion.",
    {
      query: z.string().min(1).describe("Search query text"),
      topic_id: z.string().uuid().optional().describe("Optional: restrict to topic and its descendants"),
      limit: z.number().int().positive().max(100).default(10).describe("Maximum results to return"),
    },
    async ({ query, topic_id, limit }) => {
      try {
        const results = await searchCards(db, userId, query, topic_id, limit);
        return { content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
