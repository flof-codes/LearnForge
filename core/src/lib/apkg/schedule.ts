import type { Grade } from "ts-fsrs";
import { createInitialFsrsState, processReview, type FsrsDbState } from "../../services/fsrs.js";
import type { AnkiCard, AnkiRevlog } from "./package.js";

/**
 * Anki scheduling → LearnForge FSRS state. Anki's own due date always wins, so
 * an imported deck keeps its workload. Memory state comes from, in order:
 * 1. `cards.data` (`s`, `d`), written by Anki when the deck used FSRS;
 * 2. a replay of the card's review log through FSRS, filtered as Anki's own
 *    optimizer filters it (rated answers only, no cram, history cut at a reset);
 * 3. a rough conversion of SM-2 interval and ease.
 */

const DAY_MS = 86_400_000;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Anki card types map 1:1 onto ts-fsrs states: new, learning, review, relearning. */
const STATE_OF_TYPE: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3 };

export function reviewsForFsrs(revlog: AnkiRevlog[]): AnkiRevlog[] {
  const sorted = [...revlog].sort((a, b) => a.id - b.id);
  let start = 0;
  sorted.forEach((r, i) => { if (r.type === 4 && r.factor === 0) start = i + 1; }); // "forget" resets the card
  return sorted.slice(start).filter(r =>
    r.ease >= 1 && r.ease <= 4 && r.type <= 3 && !(r.type === 3 && r.factor === 0),
  );
}

/** Due date from Anki's `due`, which is epoch seconds for intraday learning and days since `crt` otherwise. */
function ankiDue(card: AnkiCard, crt: number): Date | null {
  const due = card.odid ? card.odue : card.due;
  if (card.type === 0) return null;
  if (due > 1_000_000_000) return new Date(due * 1000);
  return new Date((crt + due * 86_400) * 1000);
}

function sm2Difficulty(factor: number): number {
  if (factor <= 0) return 5;
  return clamp(11 - (factor / 1000) * 3.7, 1, 10);
}

export interface ImportedSchedule extends FsrsDbState {
  /** Where the memory state came from, for the import report. */
  source: "new" | "anki-fsrs" | "replay" | "sm2";
}

export function scheduleFromAnki(card: AnkiCard, revlog: AnkiRevlog[], crt: number, now = new Date()): ImportedSchedule {
  const initial = createInitialFsrsState();
  if (card.type === 0 || STATE_OF_TYPE[card.type] === undefined) return { ...initial, due: now, source: "new" };

  const rated = reviewsForFsrs(revlog);
  const lrt = typeof card.data.lrt === "number" && card.data.lrt > 0 ? new Date(card.data.lrt * 1000) : null;
  const lastRated = rated.length ? new Date(rated[rated.length - 1].id) : null;
  const due = ankiDue(card, crt) ?? now;
  const base = {
    due,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_OF_TYPE[card.type],
  };

  const s = card.data.s, d = card.data.d;
  if (typeof s === "number" && typeof d === "number" && s > 0) {
    const last = lrt ?? lastRated ?? new Date(due.getTime() - Math.max(card.ivl, 0) * DAY_MS);
    return { ...base, stability: s, difficulty: clamp(d, 1, 10), lastReview: last, source: "anki-fsrs" };
  }

  if (rated.length) {
    let state: FsrsDbState = { ...initial, due: new Date(rated[0].id) };
    for (const r of rated) state = processReview(state, r.ease as Grade, null, new Date(r.id));
    return { ...base, stability: state.stability, difficulty: state.difficulty, lastReview: lastRated, source: "replay" };
  }

  const learning = card.type === 1 || card.type === 3;
  const stability = learning ? 0.1 : Math.max(card.ivl, 1);
  const last = lrt ?? (learning ? null : new Date(due.getTime() - Math.max(card.ivl, 1) * DAY_MS));
  return { ...base, stability, difficulty: sm2Difficulty(card.factor), lastReview: last, source: "sm2" };
}
