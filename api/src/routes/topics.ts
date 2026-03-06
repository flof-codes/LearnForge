import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { topics, cards } from "../db/schema/index.js";
import { eq, sql } from "drizzle-orm";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export default async function topicRoutes(app: FastifyInstance) {

  // GET /topics — root topics with child count + card stats (including descendants)
  app.get("/topics", async () => {
    const result = await db.execute<{
      id: string; name: string; description: string | null; parent_id: string | null; created_at: string;
      child_count: number; card_count: number; new_count: number; learning_count: number; due_count: number;
    }>(sql`
      SELECT t.*,
        (SELECT count(*)::int FROM topics c WHERE c.parent_id = t.id) as child_count,
        (SELECT count(*)::int FROM cards WHERE cards.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        )) as card_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND fs.state = 0) as new_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND (fs.state = 1 OR fs.state = 3)) as learning_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND fs.due <= NOW() AND fs.state > 0) as due_count
      FROM topics t
      WHERE t.parent_id IS NULL
    `);
    return result.rows.map(r => ({
      id: r.id, name: r.name, description: r.description, parentId: r.parent_id, createdAt: r.created_at,
      childCount: r.child_count, cardCount: r.card_count, newCount: r.new_count, learningCount: r.learning_count, dueCount: r.due_count,
    }));
  });

  // GET /topics/:id — single topic with children + card count
  app.get<{ Params: { id: string } }>("/topics/:id", async (req) => {
    const { id } = req.params;

    const topicResult = await db.execute<{
      id: string; name: string; description: string | null; parent_id: string | null; created_at: string;
      card_count: number; new_count: number; learning_count: number; due_count: number;
    }>(sql`
      SELECT t.*,
        (SELECT count(*)::int FROM cards WHERE cards.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        )) as card_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND fs.state = 0) as new_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND (fs.state = 1 OR fs.state = 3)) as learning_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND fs.due <= NOW() AND fs.state > 0) as due_count
      FROM topics t
      WHERE t.id = ${id}
    `);

    if (topicResult.rows.length === 0) throw new NotFoundError("Topic not found");
    const r = topicResult.rows[0];
    const topic = {
      id: r.id, name: r.name, description: r.description, parentId: r.parent_id, createdAt: r.created_at,
      cardCount: r.card_count, newCount: r.new_count, learningCount: r.learning_count, dueCount: r.due_count,
    };

    const childResult = await db.execute<{
      id: string; name: string; description: string | null; parent_id: string | null; created_at: string;
      child_count: number; card_count: number; new_count: number; learning_count: number; due_count: number;
    }>(sql`
      SELECT t.*,
        (SELECT count(*)::int FROM topics c WHERE c.parent_id = t.id) as child_count,
        (SELECT count(*)::int FROM cards WHERE cards.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        )) as card_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND fs.state = 0) as new_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND (fs.state = 1 OR fs.state = 3)) as learning_count,
        (SELECT count(*)::int FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id WHERE c.topic_id IN (
          WITH RECURSIVE tree AS (SELECT t.id UNION ALL SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id) SELECT id FROM tree
        ) AND fs.due <= NOW() AND fs.state > 0) as due_count
      FROM topics t
      WHERE t.parent_id = ${id}
    `);
    const children = childResult.rows.map(c => ({
      id: c.id, name: c.name, description: c.description, parentId: c.parent_id, createdAt: c.created_at,
      childCount: c.child_count, cardCount: c.card_count, newCount: c.new_count, learningCount: c.learning_count, dueCount: c.due_count,
    }));

    return { ...topic, children };
  });

  // GET /topics/:id/tree — recursive CTE for full subtree
  app.get<{ Params: { id: string } }>("/topics/:id/tree", async (req) => {
    const { id } = req.params;

    const rows = await db.execute<{
      id: string;
      name: string;
      description: string | null;
      parent_id: string | null;
      card_count: number;
    }>(sql`
      WITH RECURSIVE topic_tree AS (
        SELECT id, name, description, parent_id FROM topics WHERE id = ${id}
        UNION ALL
        SELECT t.id, t.name, t.description, t.parent_id
        FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
      )
      SELECT tt.*, (SELECT count(*)::int FROM cards WHERE cards.topic_id = tt.id) as card_count
      FROM topic_tree tt
    `);

    if (rows.rows.length === 0) throw new NotFoundError("Topic not found");

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
      if (node.id === id) root = node;
    }
    return root;
  });

  // GET /topics/:id/breadcrumb — ancestor chain from root to this topic
  app.get<{ Params: { id: string } }>("/topics/:id/breadcrumb", async (req) => {
    const { id } = req.params;

    const result = await db.execute<{ id: string; name: string }>(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, name, parent_id FROM topics WHERE id = ${id}
        UNION ALL
        SELECT t.id, t.name, t.parent_id
        FROM topics t JOIN ancestors a ON t.id = a.parent_id
      )
      SELECT id, name FROM ancestors
    `);

    if (result.rows.length === 0) throw new NotFoundError("Topic not found");

    // Result is leaf-first, reverse to get root-first
    return result.rows.reverse();
  });

  // POST /topics
  app.post<{ Body: { name: string; description?: string; parentId?: string } }>("/topics", async (req, reply) => {
    const { name, description, parentId } = req.body;
    if (!name) throw new ValidationError("name is required");

    if (parentId) {
      const [parent] = await db.select({ id: topics.id }).from(topics).where(eq(topics.id, parentId));
      if (!parent) throw new NotFoundError("Parent topic not found");
    }

    const [created] = await db.insert(topics).values({
      name,
      description: description ?? null,
      parentId: parentId ?? null,
    }).returning();

    reply.status(201);
    return created;
  });

  // PUT /topics/:id
  app.put<{ Params: { id: string }; Body: { name?: string; description?: string; parentId?: string } }>("/topics/:id", async (req) => {
    const { id } = req.params;
    const { name, description, parentId } = req.body;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .set() partial update
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (parentId !== undefined) {
      if (parentId === id) throw new ValidationError("A topic cannot be its own parent");
      if (parentId !== null) {
        const cycleCheck = await db.execute<{ would_cycle: boolean }>(sql`
          WITH RECURSIVE ancestors AS (
            SELECT id, parent_id, 0 as depth FROM topics WHERE id = ${parentId}
            UNION ALL
            SELECT t.id, t.parent_id, a.depth + 1
            FROM topics t JOIN ancestors a ON t.id = a.parent_id
            WHERE a.depth < 100
          )
          SELECT count(*) > 0 as would_cycle FROM ancestors WHERE id = ${id}
        `);
        if (cycleCheck.rows[0]?.would_cycle) {
          throw new ValidationError("Setting this parent would create a circular hierarchy");
        }
      }
      updates.parentId = parentId;
    }

    const [updated] = await db.update(topics).set(updates).where(eq(topics.id, id)).returning();
    if (!updated) throw new NotFoundError("Topic not found");
    return updated;
  });

  // DELETE /topics/:id — only allowed when topic has no cards
  app.delete<{ Params: { id: string } }>("/topics/:id", async (req, reply) => {
    const { id } = req.params;

    // Guard: block deletion if topic still has cards
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(cards)
      .where(eq(cards.topicId, id));

    if (count > 0) {
      throw new ValidationError(`Cannot delete topic with ${count} card(s). Move or delete cards first.`);
    }

    // Orphan children (set parent_id to null)
    await db.update(topics).set({ parentId: null }).where(eq(topics.parentId, id));

    // Delete the topic (cards cascade via FK)
    const [deleted] = await db.delete(topics).where(eq(topics.id, id)).returning();
    if (!deleted) throw new NotFoundError("Topic not found");

    reply.status(204);
  });
}
