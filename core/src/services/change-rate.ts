import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { DEFAULT_CHANGE_RATE } from "./bloom.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export type RateSource = "card" | "topic" | "default";

export interface EffectiveRate {
  changeRate: number;
  rateSource: RateSource;
  /** The topic the value comes from, when rateSource is "topic". */
  sourceTopicId: string | null;
  sourceTopicName: string | null;
}

interface TopicRateRow extends Record<string, unknown> { id: string; name: string; parent_id: string | null; change_rate: number | null }

/**
 * Loads the user's whole topic list once so many cards can be resolved in memory.
 * Resolution: card → topic → parent topics → root default.
 */
export async function loadTopicRates(db: Db, userId: string): Promise<Map<string, TopicRateRow>> {
  const rows = await db.execute<TopicRateRow>(sql`
    SELECT id, name, parent_id, change_rate FROM topics WHERE user_id = ${userId}
  `);
  return new Map(rows.rows.map(r => [r.id, r]));
}

export function resolveTopicRate(topicId: string | null, topicRates: Map<string, TopicRateRow>): EffectiveRate {
  let current = topicId;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const t = topicRates.get(current);
    if (!t) break;
    if (t.change_rate !== null && t.change_rate !== undefined) {
      return { changeRate: t.change_rate, rateSource: "topic", sourceTopicId: t.id, sourceTopicName: t.name };
    }
    current = t.parent_id;
  }
  return { changeRate: DEFAULT_CHANGE_RATE, rateSource: "default", sourceTopicId: null, sourceTopicName: null };
}

export function resolveCardRate(
  card: { changeRate: number | null; topicId: string },
  topicRates: Map<string, TopicRateRow>,
): EffectiveRate {
  if (card.changeRate !== null && card.changeRate !== undefined) {
    return { changeRate: card.changeRate, rateSource: "card", sourceTopicId: null, sourceTopicName: null };
  }
  return resolveTopicRate(card.topicId, topicRates);
}

/** Effective change rate of one card, resolved through its topic chain. */
export async function getEffectiveCardRate(db: Db, userId: string, cardId: string): Promise<EffectiveRate> {
  const rows = await db.execute<{ change_rate: number | null; topic_id: string }>(sql`
    SELECT c.change_rate, c.topic_id
    FROM cards c JOIN topics t ON t.id = c.topic_id
    WHERE c.id = ${cardId} AND t.user_id = ${userId}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Card not found");
  const topicRates = await loadTopicRates(db, userId);
  return resolveCardRate({ changeRate: rows.rows[0].change_rate, topicId: rows.rows[0].topic_id }, topicRates);
}

/** Effective change rate that cards directly below a topic inherit. */
export async function getEffectiveTopicRate(db: Db, userId: string, topicId: string): Promise<EffectiveRate> {
  const topicRates = await loadTopicRates(db, userId);
  if (!topicRates.has(topicId)) throw new NotFoundError("Topic not found");
  return resolveTopicRate(topicId, topicRates);
}

export function validateChangeRate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new ValidationError("change_rate must be between 0 and 1, or null to inherit");
  }
  return value;
}

export interface SetChangeRateInput {
  topic_id?: string;
  card_id?: string;
  change_rate: number | null;
}

/** Sets or clears (null = inherit) the change rate on a topic or a card. */
export async function setChangeRate(db: Db, userId: string, input: SetChangeRateInput) {
  const value = validateChangeRate(input.change_rate);
  if (!!input.topic_id === !!input.card_id) {
    throw new ValidationError("Provide exactly one of topic_id or card_id");
  }

  if (input.topic_id) {
    const res = await db.execute<{ id: string }>(sql`
      UPDATE topics SET change_rate = ${value} WHERE id = ${input.topic_id} AND user_id = ${userId} RETURNING id
    `);
    if (res.rows.length === 0) throw new NotFoundError("Topic not found");
    const effective = await getEffectiveTopicRate(db, userId, input.topic_id);
    return { topicId: input.topic_id, changeRate: value, effective };
  }

  const res = await db.execute<{ id: string }>(sql`
    UPDATE cards c SET change_rate = ${value}
    FROM topics t
    WHERE c.id = ${input.card_id} AND t.id = c.topic_id AND t.user_id = ${userId}
    RETURNING c.id
  `);
  if (res.rows.length === 0) throw new NotFoundError("Card not found");
  const effective = await getEffectiveCardRate(db, userId, input.card_id!);
  return { cardId: input.card_id, changeRate: value, effective };
}
