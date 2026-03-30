import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "@learnforge/core";
import { listTopics, getTopicTree, createTopic, updateTopic, deleteTopic } from "@learnforge/core";

export function registerTopicTools(server: McpServer, db: Db, userId: string) {
  // ── list_topics ──────────────────────────────────────────────────────
  server.tool(
    "list_topics",
    "List all root-level topics with child and card counts (including descendant topics)",
    {},
    async () => {
      try {
        const rows = await listTopics(db, userId);
        return { content: [{ type: "text" as const, text: JSON.stringify(rows, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── get_topic_tree ───────────────────────────────────────────────────
  server.tool(
    "get_topic_tree",
    "Get a topic and its full subtree as nested JSON using a recursive CTE",
    { topic_id: z.string().uuid() },
    async ({ topic_id }) => {
      try {
        const root = await getTopicTree(db, userId, topic_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(root, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── create_topic ─────────────────────────────────────────────────────
  server.tool(
    "create_topic",
    "Create a new topic, optionally nested under a parent",
    {
      name: z.string(),
      description: z.string().optional(),
      parent_id: z.string().uuid().optional(),
    },
    async ({ name, description, parent_id }) => {
      try {
        const created = await createTopic(db, userId, { name, description, parentId: parent_id });
        return { content: [{ type: "text" as const, text: JSON.stringify(created, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── update_topic ─────────────────────────────────────────────────────
  server.tool(
    "update_topic",
    "Update a topic's name, description, or parent",
    {
      topic_id: z.string().uuid(),
      name: z.string().optional(),
      description: z.string().optional(),
      parent_id: z.string().uuid().optional(),
    },
    async ({ topic_id, name, description, parent_id }) => {
      try {
        const updated = await updateTopic(db, userId, topic_id, { name, description, parentId: parent_id });
        return { content: [{ type: "text" as const, text: JSON.stringify(updated, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );

  // ── delete_topic ─────────────────────────────────────────────────────
  server.tool(
    "delete_topic",
    "Delete a topic. Only allowed when topic has no cards. Children are orphaned (set to root).",
    { topic_id: z.string().uuid() },
    async ({ topic_id }) => {
      try {
        const deleted = await deleteTopic(db, userId, topic_id);
        return { content: [{ type: "text" as const, text: `Deleted topic "${deleted.name}" (${deleted.id})` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
