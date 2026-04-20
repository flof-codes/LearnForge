import { sql, type SQL } from "drizzle-orm";
import type { Db } from "../db/types.js";

export type CardListStatus = "all" | "new" | "learning" | "due";
export type CardListSort = "newest" | "oldest" | "updated" | "studied" | "concept";

export interface ListCardsInput {
  topicId?: string;
  /** When topicId is set: include cards in descendant topics. Defaults to true. */
  includeDescendants?: boolean;
  search?: string;
  bloomLevel?: number;
  status?: CardListStatus;
  sort?: CardListSort;
  offset?: number;
  limit?: number;
}

export interface ListCardsResult {
  cards: Array<{
    id: string;
    concept: string;
    tags: string[] | null;
    topicId: string;
    frontHtml: string;
    createdAt: string;
    updatedAt: string;
    bloomState: { currentLevel: number | null; highestReached: number | null };
    fsrsState: { due: string; state: number; lastReview: string | null } | null;
  }>;
  total: number;
  hasMore: boolean;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function listCards(
  db: Db,
  userId: string,
  input: ListCardsInput = {},
): Promise<ListCardsResult> {
  const limit = Math.min(Math.max(1, input.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, input.offset ?? 0);

  // Build topic filter.
  // - No topicId: flat user scope.
  // - topicId + includeDescendants (default): recursive CTE over topic subtree.
  // - topicId + !includeDescendants: only cards directly in that topic.
  const includeDescendants = input.includeDescendants ?? true;
  const topicCte = input.topicId && includeDescendants
    ? sql`WITH RECURSIVE topic_tree AS (
        SELECT id FROM topics WHERE id = ${input.topicId} AND user_id = ${userId}
        UNION ALL
        SELECT t.id FROM topics t JOIN topic_tree tt ON t.parent_id = tt.id
      )`
    : sql``;
  let topicJoin: SQL;
  if (input.topicId && includeDescendants) {
    topicJoin = sql`JOIN topic_tree tt ON c.topic_id = tt.id`;
  } else if (input.topicId) {
    topicJoin = sql`JOIN topics t ON c.topic_id = t.id AND t.id = ${input.topicId} AND t.user_id = ${userId}`;
  } else {
    topicJoin = sql`JOIN topics t ON c.topic_id = t.id AND t.user_id = ${userId}`;
  }

  // Compose predicates.
  const conds: SQL[] = [];
  if (input.search && input.search.trim()) {
    const pattern = `%${input.search.trim()}%`;
    conds.push(
      sql`(c.concept ILIKE ${pattern} OR array_to_string(c.tags, ' ') ILIKE ${pattern})`,
    );
  }
  if (input.bloomLevel !== undefined && input.bloomLevel !== null) {
    conds.push(sql`COALESCE(bs.current_level, 0) = ${input.bloomLevel}`);
  }
  if (input.status === "new") {
    conds.push(sql`(fs.state IS NULL OR fs.state = 0)`);
  } else if (input.status === "learning") {
    conds.push(sql`fs.state IN (1, 3)`);
  } else if (input.status === "due") {
    conds.push(sql`fs.state IS NOT NULL AND fs.state <> 0 AND fs.due <= NOW()`);
  }
  const whereSql = conds.length > 0 ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;

  // Sort expression.
  let orderSql: SQL;
  switch (input.sort) {
    case "oldest":
      orderSql = sql`c.created_at ASC`;
      break;
    case "updated":
      orderSql = sql`c.updated_at DESC`;
      break;
    case "studied":
      orderSql = sql`fs.last_review DESC NULLS LAST`;
      break;
    case "concept":
      orderSql = sql`c.concept ASC`;
      break;
    case "newest":
    default:
      orderSql = sql`c.created_at DESC`;
      break;
  }

  // Count query (no order, no limit).
  const countResult = await db.execute<{ total: string }>(sql`
    ${topicCte}
    SELECT COUNT(*)::text AS total
    FROM cards c
    ${topicJoin}
    LEFT JOIN bloom_state bs ON bs.card_id = c.id
    LEFT JOIN fsrs_state fs ON fs.card_id = c.id
    ${whereSql}
  `);
  const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

  if (total === 0) {
    return { cards: [], total: 0, hasMore: false };
  }

  // Page query.
  const pageResult = await db.execute<{
    id: string; concept: string; tags: string[] | null; topic_id: string;
    front_html: string; created_at: string; updated_at: string;
    current_level: number | null; highest_reached: number | null;
    due: string | null; fsrs_state: number | null; last_review: string | null;
  }>(sql`
    ${topicCte}
    SELECT c.id, c.concept, c.tags, c.topic_id, c.front_html,
      c.created_at, c.updated_at,
      bs.current_level, bs.highest_reached,
      fs.due, fs.state AS fsrs_state, fs.last_review
    FROM cards c
    ${topicJoin}
    LEFT JOIN bloom_state bs ON bs.card_id = c.id
    LEFT JOIN fsrs_state fs ON fs.card_id = c.id
    ${whereSql}
    ORDER BY ${orderSql}, c.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const cards = pageResult.rows.map((row) => ({
    id: row.id,
    concept: row.concept,
    tags: row.tags,
    topicId: row.topic_id,
    frontHtml: row.front_html,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bloomState: {
      currentLevel: row.current_level ?? null,
      highestReached: row.highest_reached ?? null,
    },
    fsrsState: row.due
      ? {
          due: row.due,
          state: row.fsrs_state ?? 0,
          lastReview: row.last_review,
        }
      : null,
  }));

  return {
    cards,
    total,
    hasMore: offset + cards.length < total,
  };
}
