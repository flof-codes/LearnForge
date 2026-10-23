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
// The review history counts reviews per calendar day, each by the state the card was in.

export type CardHistoryRange = "30d" | "1y" | "all";

export const HISTORY_STATES = ["new", "learning", "relearning", "recall", "shortTerm", "midTerm", "longTerm"] as const;
export type HistoryState = (typeof HISTORY_STATES)[number];

export type CardHistoryPoint = { at: string; total: number } & Record<HistoryState, number>;

/** What feeds the due count: every started card whose due date has passed. */
export const DUE_STATES = ["learning", "relearning", "recall"] as const;
export type DueState = (typeof DUE_STATES)[number];
export type DueHistoryPoint = { at: string; total: number } & Record<DueState, number>;

/** A review's kind: the card's state before it, review cards by their stability then. */
export const REVIEW_STATES = ["new", "learning", "relearning", "shortTerm", "midTerm", "longTerm"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

interface CardRow extends Record<string, unknown> {
  id: string; created_at: Date;
  stability: number; difficulty: number; due: Date; last_review: Date | null;
  reps: number; lapses: number; state: number;
}

interface ReviewRow extends Record<string, unknown> {
  card_id: string; reviewed_at: Date; rating: number; modality: string;
  interval_factor: number | null; fsrs_before: Record<string, unknown> | null;
  /** Calendar day in the database's time zone, as the dashboard's "reviews today" counts it. */
  day: string;
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

function reviewState(s: { state: number; stability: number }): ReviewState {
  if (s.state === 0) return "new";
  if (s.state === 1) return "learning";
  if (s.state === 3) return "relearning";
  return s.stability < 21 ? "shortTerm" : s.stability < 90 ? "midTerm" : "longTerm";
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

function parseRange(rawRange: string | undefined): CardHistoryRange {
  return rawRange === "30d" || rawRange === "1y" ? rawRange : "all";
}

/** Every card's timeline and reviews; `timeline[i]` is the state review `i` started from. */
async function loadTimelines(db: Db, userId: string, studyableOnly: boolean) {
  const cardRows = await db.execute<CardRow>(sql`
    SELECT c.id, c.created_at, fs.stability, fs.difficulty, fs.due, fs.last_review, fs.reps, fs.lapses, fs.state
    FROM cards c
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    JOIN fsrs_state fs ON fs.card_id = c.id
    WHERE ${studyableOnly ? STUDYABLE : sql`true`}
  `);
  const reviewRows = await db.execute<ReviewRow>(sql`
    SELECT r.card_id, r.reviewed_at, r.rating, r.modality, r.interval_factor, r.state_before->'fsrs' AS fsrs_before,
      to_char(r.reviewed_at::date, 'YYYY-MM-DD') AS day
    FROM reviews r
    JOIN cards c ON c.id = r.card_id
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    ORDER BY r.card_id, r.reviewed_at, r.id
  `);
  const metaRow = await db.execute<{ fsrs_params: { w: number[] } | null; today: string }>(sql`
    SELECT fsrs_params, to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today FROM users WHERE id = ${userId}
  `);
  const userParams = metaRow.rows[0]?.fsrs_params ?? null;

  const reviewsByCard = new Map<string, ReviewRow[]>();
  for (const r of reviewRows.rows) {
    const list = reviewsByCard.get(r.card_id);
    if (list) list.push(r); else reviewsByCard.set(r.card_id, [r]);
  }

  const cards = cardRows.rows.map(c => {
    const createdAt = new Date(c.created_at).getTime();
    const current: FsrsDbState = {
      stability: c.stability, difficulty: c.difficulty, due: c.due, lastReview: c.last_review,
      reps: c.reps, lapses: c.lapses, state: c.state,
    };
    const reviews = reviewsByCard.get(c.id) ?? [];
    const timeline = cardTimeline({ createdAt, current }, reviews, userParams)
      .map(t => ({ from: t.from, state: { state: t.state.state, stability: t.state.stability, dueMs: new Date(t.state.due).getTime() } as Snapshot }));
    return { createdAt, timeline, reviews };
  });
  return { cards, today: metaRow.rows[0]?.today ?? new Date().toISOString().slice(0, 10) };
}

async function sampleHistory<S extends string>(
  db: Db, userId: string, rawRange: string | undefined,
  opts: { states: readonly S[]; bucket: (s: Snapshot, at: number) => S | null; studyableOnly: boolean },
) {
  const range = parseRange(rawRange);
  const { cards } = await loadTimelines(db, userId, opts.studyableOnly);

  // Sample points run back from now, so the last one matches the dashboard's total.
  const now = Date.now();
  const firstCreated = cards.reduce((min, c) => Math.min(min, c.createdAt), now);
  const span = range === "30d" ? 30 : range === "1y" ? 365 : Math.max(1, Math.ceil((now - firstCreated) / DAY_MS));
  const step = span > 400 ? 7 : 1;
  const count = Math.ceil(span / step);
  const times = Array.from({ length: count + 1 }, (_, i) => now - (count - i) * step * DAY_MS);

  const points = times.map(at => ({
    at: new Date(at).toISOString(), total: 0,
    ...Object.fromEntries(opts.states.map(s => [s, 0])),
  }) as { at: string; total: number } & Record<S, number>);

  for (const { createdAt, timeline } of cards) {
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

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
const dayString = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);

/**
 * Reviews per calendar day (per week beyond 400 days), the last bucket ending today,
 * so a daily range ends on the dashboard's "reviews today". Points sit at noon UTC
 * of their first day; the chart formats them in UTC.
 */
export async function getReviewHistory(db: Db, userId: string, rawRange?: string) {
  const range = parseRange(rawRange);
  const { cards, today } = await loadTimelines(db, userId, false);
  const last = dayNumber(today);

  let first = last;
  for (const c of cards) for (const r of c.reviews) first = Math.min(first, dayNumber(r.day));
  const span = range === "30d" ? 30 : range === "1y" ? 365 : last - first + 1;
  const step = span > 400 ? 7 : 1;
  const count = Math.ceil(span / step);
  const start = last - count * step + 1;

  const points = Array.from({ length: count }, (_, i) => ({
    at: `${dayString(start + i * step)}T12:00:00.000Z`, total: 0,
    ...Object.fromEntries(REVIEW_STATES.map(s => [s, 0])),
  }) as { at: string; total: number } & Record<ReviewState, number>);

  for (const { timeline, reviews } of cards) {
    reviews.forEach((r, i) => {
      const bucket = Math.floor((dayNumber(r.day) - start) / step);
      if (bucket < 0 || bucket >= count) return;
      const p = points[bucket];
      p.total++;
      p[reviewState(timeline[i].state)]++;
    });
  }

  return { range, step: step === 7 ? "week" as const : "day" as const, points };
}
