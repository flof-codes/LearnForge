import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { STUDYABLE } from "./study-filters.js";
import {
  processReview, applyIntervalFactor, applyModalityMultiplier, isValidModality, type FsrsDbState,
} from "./fsrs.js";

// Card count over time, split by card state. Only the current state is stored,
// so each card's past is rebuilt from its reviews: a review's outcome is the
// next review's `state_before`, or the card's current state for the last one.
// Reviews from before release 1 have no `state_before`; there the outcome is
// replayed with FSRS from the rating, which matches closely but not exactly.
// A reset deletes a card's reviews, so a reset card reads as new back to its creation.
// Anki imports carry no review rows and count from the import date.
// The due history uses the same timelines and counts what was due at each point;
// suspension and disputes have no history, so today's flags apply throughout.

export type CardHistoryRange = "30d" | "1y" | "all";

export const HISTORY_STATES = ["new", "learning", "relearning", "recall", "shortTerm", "midTerm", "longTerm"] as const;
export type HistoryState = (typeof HISTORY_STATES)[number];

export type CardHistoryPoint = { at: string; total: number } & Record<HistoryState, number>;

/** What feeds the due count: every started card whose due date has passed. */
export const DUE_STATES = ["learning", "relearning", "recall"] as const;
export type DueState = (typeof DUE_STATES)[number];
export type DueHistoryPoint = { at: string; total: number } & Record<DueState, number>;

const DAY_MS = 24 * 60 * 60 * 1000;

interface CardRow extends Record<string, unknown> {
  id: string; created_at: Date;
  stability: number; difficulty: number; due: Date; last_review: Date | null;
  reps: number; lapses: number; state: number;
}

interface ReviewRow extends Record<string, unknown> {
  card_id: string; reviewed_at: Date; rating: number; modality: string;
  interval_factor: number | null; fsrs_before: Record<string, unknown> | null;
}

/** Same buckets as the dashboard's Bloom × state chart, evaluated at `at`. */
export function classifyState(s: { state: number; stability: number; dueMs: number }, at: number): HistoryState {
  if (s.state === 0) return "new";
  if (s.state === 1) return "learning";
  if (s.state === 3) return "relearning";
  if (s.dueMs <= at) return "recall";
  if (s.stability < 21) return "shortTerm";
  if (s.stability < 90) return "midTerm";
  return "longTerm";
}

function dueState(s: { state: number; dueMs: number }, at: number): DueState | null {
  if (s.state === 0 || s.dueMs > at) return null;
  return s.state === 1 ? "learning" : s.state === 3 ? "relearning" : "recall";
}

function fromJson(j: Record<string, unknown>): FsrsDbState {
  return {
    stability: Number(j.stability), difficulty: Number(j.difficulty), due: new Date(j.due as string),
    lastReview: j.lastReview ? new Date(j.lastReview as string) : null,
    reps: Number(j.reps), lapses: Number(j.lapses), state: Number(j.state),
  };
}

/** The states a card went through, each from the time it took effect. */
function cardTimeline(
  card: { createdAt: number; current: FsrsDbState },
  reviews: ReviewRow[],
  userParams: { w: number[] } | null,
): { from: number; state: FsrsDbState }[] {
  if (reviews.length === 0) return [{ from: card.createdAt, state: card.current }];
  const first = reviews[0].fsrs_before;
  let prev: FsrsDbState = first ? fromJson(first) : { ...card.current, state: 0, stability: 0, reps: 0, lapses: 0, lastReview: null };
  const timeline = [{ from: card.createdAt, state: prev }];
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    const next = reviews[i + 1];
    if (r.fsrs_before) prev = fromJson(r.fsrs_before);
    let after: FsrsDbState;
    if (next?.fsrs_before) after = fromJson(next.fsrs_before);
    else if (!next) after = card.current;
    else {
      const at = new Date(r.reviewed_at);
      const raw = processReview(prev, Math.min(4, Math.max(1, r.rating)) as 1 | 2 | 3 | 4, userParams, at);
      after = r.interval_factor != null ? applyIntervalFactor(raw, r.interval_factor, at)
        : isValidModality(r.modality) ? applyModalityMultiplier(raw, r.modality)
        : raw;
    }
    timeline.push({ from: new Date(r.reviewed_at).getTime(), state: after });
    prev = after;
  }
  return timeline;
}

type Snapshot = { state: number; stability: number; dueMs: number };

async function sampleHistory<S extends string>(
  db: Db, userId: string, rawRange: string | undefined,
  opts: { states: readonly S[]; bucket: (s: Snapshot, at: number) => S | null; studyableOnly: boolean },
) {
  const range: CardHistoryRange = rawRange === "30d" || rawRange === "1y" ? rawRange : "all";

  const cardRows = await db.execute<CardRow>(sql`
    SELECT c.id, c.created_at, fs.stability, fs.difficulty, fs.due, fs.last_review, fs.reps, fs.lapses, fs.state
    FROM cards c
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    JOIN fsrs_state fs ON fs.card_id = c.id
    WHERE ${opts.studyableOnly ? STUDYABLE : sql`true`}
  `);
  const reviewRows = await db.execute<ReviewRow>(sql`
    SELECT r.card_id, r.reviewed_at, r.rating, r.modality, r.interval_factor, r.state_before->'fsrs' AS fsrs_before
    FROM reviews r
    JOIN cards c ON c.id = r.card_id
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    ORDER BY r.card_id, r.reviewed_at, r.id
  `);
  const paramsRow = await db.execute<{ fsrs_params: { w: number[] } | null }>(sql`
    SELECT fsrs_params FROM users WHERE id = ${userId}
  `);
  const userParams = paramsRow.rows[0]?.fsrs_params ?? null;

  const reviewsByCard = new Map<string, ReviewRow[]>();
  for (const r of reviewRows.rows) {
    const list = reviewsByCard.get(r.card_id);
    if (list) list.push(r); else reviewsByCard.set(r.card_id, [r]);
  }

  // Sample points run back from now, so the last one matches the dashboard's total.
  const now = Date.now();
  const firstCreated = cardRows.rows.reduce((min, c) => Math.min(min, new Date(c.created_at).getTime()), now);
  const span = range === "30d" ? 30 : range === "1y" ? 365 : Math.max(1, Math.ceil((now - firstCreated) / DAY_MS));
  const step = span > 400 ? 7 : 1;
  const count = Math.ceil(span / step);
  const times = Array.from({ length: count + 1 }, (_, i) => now - (count - i) * step * DAY_MS);

  const points = times.map(at => ({
    at: new Date(at).toISOString(), total: 0,
    ...Object.fromEntries(opts.states.map(s => [s, 0])),
  }) as { at: string; total: number } & Record<S, number>);

  for (const c of cardRows.rows) {
    const createdAt = new Date(c.created_at).getTime();
    const current: FsrsDbState = {
      stability: c.stability, difficulty: c.difficulty, due: c.due, lastReview: c.last_review,
      reps: c.reps, lapses: c.lapses, state: c.state,
    };
    const timeline = cardTimeline({ createdAt, current }, reviewsByCard.get(c.id) ?? [], userParams)
      .map(t => ({ from: t.from, state: { state: t.state.state, stability: t.state.stability, dueMs: new Date(t.state.due).getTime() } }));
    let seg = 0;
    for (let i = 0; i < times.length; i++) {
      const at = times[i];
      if (at < createdAt) continue;
      while (seg + 1 < timeline.length && timeline[seg + 1].from <= at) seg++;
      const bucket = opts.bucket(timeline[seg].state, at);
      if (bucket === null) continue;
      const p = points[i];
      p.total++;
      p[bucket]++;
    }
  }

  return { range, step: step === 7 ? "week" as const : "day" as const, points };
}

export function getCardHistory(db: Db, userId: string, rawRange?: string) {
  return sampleHistory(db, userId, rawRange, { states: HISTORY_STATES, bucket: classifyState, studyableOnly: false });
}

/** Due cards over time, matching the dashboard's due count at the last point. */
export function getDueHistory(db: Db, userId: string, rawRange?: string) {
  return sampleHistory(db, userId, rawRange, { states: DUE_STATES, bucket: dueState, studyableOnly: true });
}
