import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { topics, cards } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";

export function registerTopicTools(server: McpServer, userId: string) {
  // ── list_topics ──────────────────────────────────────────────────────
  server.tool(
    "list_topics",
    "List all root-level topics with child and card counts (including descendant topics)",
    {},
    async () => {
      try {
        const result = await db.execute<{
          id: string; name: string; description: string | null; parent_id: string | null; created_at: string;
          child_count: number; card_count: number;
        }>(sql`
          SELECT t.*,
            (SELECT count(*)::int FROM topics c WHERE c.parent_id = t.id) as child_count,
            (SELECT count(*)::int FROM cards WHERE cards.topic_id IN (
              WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
            )) as card_count
          FROM topics t
          WHERE t.parent_id IS NULL AND t.user_id = ${userId}
        `);
        const rows = result.rows.map(r => ({
          id: r.id, name: r.name, description: r.description, parentId: r.parent_id, createdAt: r.created_at,
          childCount: r.child_count, cardCount: r.card_count,
        }));

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
        const rows = await db.execute<{
          id: string;
          name: string;
          description: string | null;
          parent_id: string | null;
          card_count: number;
        }>(sql`
          WITH RECURSIVE topic_tree AS (
            SELECT id, name, description, parent_id FROM topics WHERE id = ${topic_id} AND user_id = ${userId}
            UNION ALL
            SELECT t.id, t.name, t.description, t.parent_id
            FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
          )
          SELECT tt.*, (SELECT count(*)::int FROM cards WHERE cards.topic_id = tt.id) as card_count
          FROM topic_tree tt
        `);

        if (rows.rows.length === 0) {
          return { content: [{ type: "text" as const, text: "Error: Topic not found" }], isError: true };
        }

        // Build nested tree
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive tree node
        const map = new Map<string, any>();
        for (const row of rows.rows) {
          map.set(row.id, { ...row, children: [] });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recursive tree node
        let root: any = null;
        for (const node of map.values()) {
          if (node.parent_id && map.has(node.parent_id)) {
            map.get(node.parent_id).children.push(node);
          }
          if (node.id === topic_id) root = node;
        }

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
        if (parent_id) {
          const [parent] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, parent_id));
          if (!parent) {
            return { content: [{ type: "text" as const, text: "Error: Parent topic not found" }], isError: true };
          }
        }

        const [created] = await db.insert(topics).values({
          name,
          description: description ?? null,
          parentId: parent_id ?? null,
          userId,
        }).returning();

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .set() partial update
        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (parent_id !== undefined) {
          if (parent_id === topic_id) {
            return { content: [{ type: "text" as const, text: "Error: A topic cannot be its own parent" }], isError: true };
          }
          if (parent_id !== null) {
            const cycleCheck = await db.execute<{ would_cycle: boolean }>(sql`
              WITH RECURSIVE ancestors AS (
                SELECT id, parent_id, 0 as depth FROM topics WHERE id = ${parent_id}
                UNION ALL
                SELECT t.id, t.parent_id, a.depth + 1
                FROM topics t JOIN ancestors a ON t.id = a.parent_id
                WHERE a.depth < 100
              )
              SELECT count(*) > 0 as would_cycle FROM ancestors WHERE id = ${topic_id}
            `);
            if (cycleCheck.rows[0]?.would_cycle) {
              return { content: [{ type: "text" as const, text: "Error: Setting this parent would create a circular hierarchy" }], isError: true };
            }
          }
          updates.parentId = parent_id;
        }

        const [updated] = await db.update(topics).set(updates)
          .where(sql`${topics.id} = ${topic_id} AND ${topics.userId} = ${userId}`)
          .returning();
        if (!updated) {
          return { content: [{ type: "text" as const, text: "Error: Topic not found" }], isError: true };
        }

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
        // Guard: block deletion if topic still has cards
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(cards)
          .where(eq(cards.topicId, topic_id));

        if (count > 0) {
          return {
            content: [{ type: "text" as const, text: `Error: Cannot delete topic with ${count} card(s). Move or delete cards first.` }],
            isError: true,
          };
        }

        // Orphan children (set parent_id to null)
        await db.update(topics).set({ parentId: null }).where(eq(topics.parentId, topic_id));

        // Delete the topic (cards cascade via FK)
        const [deleted] = await db.delete(topics)
          .where(sql`${topics.id} = ${topic_id} AND ${topics.userId} = ${userId}`)
          .returning();
        if (!deleted) {
          return { content: [{ type: "text" as const, text: "Error: Topic not found" }], isError: true };
        }

        return { content: [{ type: "text" as const, text: `Deleted topic "${deleted.name}" (${deleted.id})` }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
