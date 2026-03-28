import { eq, and, sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { topics, cards } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export async function listTopics(db: Db, userId: string) {
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
    WHERE t.parent_id IS NULL AND t.user_id = ${userId}
  `);
  return result.rows.map(r => ({
    id: r.id, name: r.name, description: r.description, parentId: r.parent_id, createdAt: r.created_at,
    childCount: r.child_count, cardCount: r.card_count, newCount: r.new_count, learningCount: r.learning_count, dueCount: r.due_count,
  }));
}

export async function getTopic(db: Db, userId: string, topicId: string) {
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
    WHERE t.id = ${topicId} AND t.user_id = ${userId}
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
    WHERE t.parent_id = ${topicId} AND t.user_id = ${userId}
  `);
  const children = childResult.rows.map(c => ({
    id: c.id, name: c.name, description: c.description, parentId: c.parent_id, createdAt: c.created_at,
    childCount: c.child_count, cardCount: c.card_count, newCount: c.new_count, learningCount: c.learning_count, dueCount: c.due_count,
  }));

  return { ...topic, children };
}

export async function getTopicTree(db: Db, userId: string, topicId: string) {
  const rows = await db.execute<{
    id: string; name: string; description: string | null; parent_id: string | null; card_count: number;
  }>(sql`
    WITH RECURSIVE topic_tree AS (
      SELECT id, name, description, parent_id FROM topics WHERE id = ${topicId} AND user_id = ${userId}
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
    if (node.id === topicId) root = node;
  }
  return root;
}

export async function getTopicBreadcrumb(db: Db, userId: string, topicId: string) {
  const result = await db.execute<{ id: string; name: string }>(sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, name, parent_id FROM topics WHERE id = ${topicId} AND user_id = ${userId}
      UNION ALL
      SELECT t.id, t.name, t.parent_id
      FROM topics t JOIN ancestors a ON t.id = a.parent_id
    )
    SELECT id, name FROM ancestors
  `);

  if (result.rows.length === 0) throw new NotFoundError("Topic not found");

  // Result is leaf-first, reverse to get root-first
  return result.rows.reverse();
}

export interface CreateTopicInput {
  name: string;
  description?: string;
  parentId?: string;
}

export async function createTopic(db: Db, userId: string, input: CreateTopicInput) {
  const { name, description, parentId } = input;
  if (!name) throw new ValidationError("name is required");

  if (parentId) {
    const [parent] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, parentId), eq(topics.userId, userId)));
    if (!parent) throw new NotFoundError("Parent topic not found");
  }

  const [created] = await db.insert(topics).values({
    name,
    description: description ?? null,
    parentId: parentId ?? null,
    userId,
  }).returning();

  return created;
}

export interface UpdateTopicInput {
  name?: string;
  description?: string;
  parentId?: string;
}

export async function updateTopic(db: Db, userId: string, topicId: string, input: UpdateTopicInput) {
  const { name, description, parentId } = input;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .set() partial update
  const updates: Record<string, any> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (parentId !== undefined) {
    if (parentId === topicId) throw new ValidationError("A topic cannot be its own parent");
    if (parentId !== null) {
      // Verify parent belongs to user
      const [parent] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, parentId), eq(topics.userId, userId)));
      if (!parent) throw new NotFoundError("Parent topic not found");

      const cycleCheck = await db.execute<{ would_cycle: boolean }>(sql`
        WITH RECURSIVE ancestors AS (
          SELECT id, parent_id, 0 as depth FROM topics WHERE id = ${parentId}
          UNION ALL
          SELECT t.id, t.parent_id, a.depth + 1
          FROM topics t JOIN ancestors a ON t.id = a.parent_id
          WHERE a.depth < 100
        )
        SELECT count(*) > 0 as would_cycle FROM ancestors WHERE id = ${topicId}
      `);
      if (cycleCheck.rows[0]?.would_cycle) {
        throw new ValidationError("Setting this parent would create a circular hierarchy");
      }
    }
    updates.parentId = parentId;
  }

  const [updated] = await db.update(topics).set(updates).where(and(eq(topics.id, topicId), eq(topics.userId, userId))).returning();
  if (!updated) throw new NotFoundError("Topic not found");
  return updated;
}

export async function deleteTopic(db: Db, userId: string, topicId: string) {
  // Verify topic belongs to user
  const [topic] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, topicId), eq(topics.userId, userId)));
  if (!topic) throw new NotFoundError("Topic not found");

  // Guard: block deletion if topic still has cards
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cards)
    .where(eq(cards.topicId, topicId));

  if (count > 0) {
    throw new ValidationError(`Cannot delete topic with ${count} card(s). Move or delete cards first.`);
  }

  // Orphan children (set parent_id to null)
  await db.update(topics).set({ parentId: null }).where(eq(topics.parentId, topicId));

  // Delete the topic (cards cascade via FK)
  const [deleted] = await db.delete(topics).where(and(eq(topics.id, topicId), eq(topics.userId, userId))).returning();
  if (!deleted) throw new NotFoundError("Topic not found");

  return deleted;
}
