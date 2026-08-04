import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { focusTopics, topics } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export interface FocusTopicInput {
  topic_id: string;
  expires_at?: string | null;
}

export interface FocusTopicRow {
  id: string;
  topicId: string;
  topicName: string;
  priority: number;
  expiresAt: string | null;
  createdAt: string;
}

export interface ExpandedFocusEntry {
  topicId: string;
  rootTopicId: string;
  priority: number;
  expiresAt: string | null;
  inherited: boolean;
}

export async function getFocusTopics(db: Db, userId: string): Promise<FocusTopicRow[]> {
  const rows = await db
    .select({
      id: focusTopics.id,
      topicId: focusTopics.topicId,
      topicName: topics.name,
      priority: focusTopics.priority,
      expiresAt: focusTopics.expiresAt,
      createdAt: focusTopics.createdAt,
    })
    .from(focusTopics)
    .innerJoin(topics, eq(focusTopics.topicId, topics.id))
    .where(eq(focusTopics.userId, userId))
    .orderBy(focusTopics.priority);

  return rows.map((r) => ({
    id: r.id,
    topicId: r.topicId,
    topicName: r.topicName,
    priority: r.priority,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function setFocusTopics(
  db: Db,
  userId: string,
  items: FocusTopicInput[],
): Promise<FocusTopicRow[]> {
  if (items.length > 20) {
    throw new ValidationError("Cannot set more than 20 focus topics");
  }

  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.topic_id)) {
      throw new ValidationError(`Duplicate topic_id in focus list: ${item.topic_id}`);
    }
    seen.add(item.topic_id);
  }

  if (items.length > 0) {
    const topicIds = items.map((i) => i.topic_id);
    const ownedTopics = await db
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.userId, userId), inArray(topics.id, topicIds)));
    const ownedSet = new Set(ownedTopics.map((t) => t.id));
    for (const item of items) {
      if (!ownedSet.has(item.topic_id)) {
        throw new NotFoundError(`Topic not found: ${item.topic_id}`);
      }
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(focusTopics).where(eq(focusTopics.userId, userId));
    if (items.length > 0) {
      await tx.insert(focusTopics).values(
        items.map((item, idx) => ({
          userId,
          topicId: item.topic_id,
          priority: idx + 1,
          expiresAt: item.expires_at ? new Date(item.expires_at) : null,
        })),
      );
    }
  });

  return getFocusTopics(db, userId);
}

export async function clearFocusTopics(db: Db, userId: string): Promise<void> {
  await db.delete(focusTopics).where(eq(focusTopics.userId, userId));
}

export async function getExpandedFocus(db: Db, userId: string): Promise<ExpandedFocusEntry[]> {
  const result = await db.execute<{
    topic_id: string;
    root_topic_id: string;
    priority: number;
    expires_at: string | null;
    inherited: boolean;
  }>(sql`
    WITH RECURSIVE active_focus AS (
      SELECT topic_id, priority, expires_at
      FROM focus_topics
      WHERE user_id = ${userId}
        AND (expires_at IS NULL OR expires_at > NOW())
    ),
    focus_tree AS (
      SELECT
        af.topic_id AS root_topic_id,
        af.topic_id,
        af.priority,
        af.expires_at,
        false AS inherited
      FROM active_focus af
      UNION ALL
      SELECT
        ft.root_topic_id,
        t.id AS topic_id,
        ft.priority,
        ft.expires_at,
        true AS inherited
      FROM topics t
      JOIN focus_tree ft ON t.parent_id = ft.topic_id
      WHERE t.user_id = ${userId}
    ),
    ranked AS (
      SELECT
        topic_id,
        root_topic_id,
        priority,
        expires_at,
        inherited,
        ROW_NUMBER() OVER (PARTITION BY topic_id ORDER BY priority ASC, inherited ASC) AS rn
      FROM focus_tree
    )
    SELECT topic_id, root_topic_id, priority, expires_at, inherited
    FROM ranked
    WHERE rn = 1
  `);

  return result.rows.map((r) => ({
    topicId: r.topic_id,
    rootTopicId: r.root_topic_id,
    priority: r.priority,
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
    inherited: r.inherited,
  }));
}
