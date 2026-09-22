/**
 * Ring-driven state machine for the glasses app.
 *
 * Pure: `reduce(state, action)` returns the next state plus a list of effects
 * for main.ts to run (network calls, bridge calls). Nothing here touches the
 * SDK or fetch, so it can be reasoned about and tested without a device.
 *
 * Grading is the server's job: an answer leaves as the picked letters plus the
 * ticket, and the review service decides style, correctness and rating. The
 * outcome computed here only drives what the result screen shows.
 */

export type Mode = "single" | "multi";

export interface Option {
  id: string;
  text: string;
}

export interface Question {
  /** Ticket from the server; the review needs it, and a retry with it is safe. */
  questionId: string;
  cardId: string;
  bloomLevel: number;
  mode: Mode;
  stem: string;
  options: Option[];
  correctIds: string[];
  explanation: string;
}

export interface Summary {
  dueCount: number;
  newCount: number;
  reviewStreak: number;
  accuracy7d: number | null;
  bloomLevels: Record<number, number>;
}

export type Outcome = "correct" | "partial" | "wrong" | "dontknow";

export const MODE_ROWS = ["MCQ single", "MCQ multi", "Speech"] as const;

export type View =
  | { kind: "boot" }
  | { kind: "pair"; code: string; expiresAt: number }
  | { kind: "home"; summary: Summary | null; cursor: number }
  | { kind: "preparing"; mode: Mode }
  | { kind: "empty"; mode: Mode; pendingCompile: number; compiling: boolean }
  | { kind: "question"; mode: Mode; q: Question; cursor: number; selected: string[]; shownAt: number }
  | { kind: "result"; mode: Mode; q: Question; outcome: Outcome; selected: string[] }
  | { kind: "done"; reviewed: number; correct: number }
  | { kind: "error"; message: string }
  /** The learner asked about the card; the reply overlays the screen underneath (`back`). */
  | { kind: "asking"; back: View; text: string }
  | { kind: "answer"; back: View; answer: string; page: number };

export interface State {
  view: View;
  sessionId: string | null;
  mode: Mode;
  queue: Question[];
  reviewed: number;
  correct: number;
  /** Ticket ids answered or skipped this session; a ticket is never answered twice. */
  answered: string[];
  /** Card ids seen this session, so a prefetch cannot serve a card whose review is still in flight. */
  seenCards: string[];
  /** A batch request is in flight; a second one would only duplicate tickets. */
  fetching: boolean;
  /** The last batch brought nothing new: stop prefetching until the next session starts. */
  exhausted: boolean;
}

export interface ReviewPayload {
  question_id: string;
  selected: string[];
  dont_know?: boolean;
  /** The session mode; the server grades multiple choice with partial credit. */
  multi?: boolean;
}

export type MenuItem = "skip" | "home" | "close";

export type Action =
  | { type: "SCROLL_UP" }
  | { type: "SCROLL_DOWN" }
  | { type: "CLICK"; now: number }
  | { type: "CLICK_ROW"; index: number; now: number }
  | { type: "MENU"; item: MenuItem }
  | { type: "PAIR_STARTED"; code: string; expiresAt: number }
  | { type: "PAIRED" }
  | { type: "SUMMARY_LOADED"; summary: Summary }
  | { type: "BATCH_LOADED"; sessionId: string; questions: Question[]; pendingCompile: number; compiling: boolean }
  | { type: "RETRY_BATCH" }
  | { type: "CLICK_PREPARING" }
  | { type: "BATCH_FAILED"; message: string }
  | { type: "FAILED"; message: string }
  | { type: "ASK"; text: string }
  | { type: "ANSWER_LOADED"; answer: string }
  | { type: "ASK_FAILED"; message: string }
  | { type: "ANSWER_NEXT"; pageCount: number }
  /** Double tap on a question: submit what is selected. */
  | { type: "CONFIRM" };

export type Effect =
  | { type: "FETCH_SUMMARY" }
  | { type: "FETCH_BATCH"; mode: Mode; sessionId: string | null; exclude: string[] }
  | { type: "SUBMIT_REVIEW"; review: ReviewPayload }
  | { type: "ASK"; questionId: string; text: string }
  | { type: "SHUTDOWN" };

/** Ask for more when this many unanswered questions are left. */
export const PREFETCH_AT = 2;

export function initialState(): State {
  return { view: { kind: "boot" }, sessionId: null, mode: "single", queue: [], reviewed: 0, correct: 0, answered: [], seenCards: [], fetching: false, exhausted: false };
}

export type QuestionRow = { kind: "option"; id: string } | { kind: "confirm" } | { kind: "dontknow" };

/** Rows of the question view: options, then Confirm (multi only), then I don't know. */
export function questionRows(q: Question, mode: Mode): QuestionRow[] {
  const rows: QuestionRow[] = q.options.map(o => ({ kind: "option" as const, id: o.id }));
  if (mode === "multi") rows.push({ kind: "confirm" });
  rows.push({ kind: "dontknow" });
  return rows;
}

export function gradeOutcome(q: Question, selected: string[], mode: Mode): Outcome {
  const correct = new Set(q.correctIds);
  const picked = new Set(selected);
  if (picked.size === 0) return "dontknow";
  let hits = 0, wrong = 0;
  for (const id of picked) { if (correct.has(id)) hits++; else wrong++; }
  if (hits === correct.size && wrong === 0) return "correct";
  if (mode === "multi" && hits > 0) return "partial";
  return "wrong";
}

/** The question a view is about, if any. */
export function questionOf(v: View): Question | null {
  if (v.kind === "question" || v.kind === "result") return v.q;
  if (v.kind === "asking" || v.kind === "answer") return questionOf(v.back);
  return null;
}

function fetchEffect(state: State): Effect {
  return { type: "FETCH_BATCH", mode: state.mode, sessionId: state.sessionId, exclude: state.seenCards };
}

function goHome(state: State): { state: State; effects: Effect[] } {
  return {
    state: { ...state, view: { kind: "home", summary: null, cursor: 0 }, queue: [], reviewed: 0, correct: 0 },
    effects: [{ type: "FETCH_SUMMARY" }],
  };
}

/** Records the answer locally, shows the result, and hands grading to the server. Empty = I don't know. */
function submitAnswer(state: State, v: Extract<View, { kind: "question" }>, selected: string[]): { state: State; effects: Effect[] } {
  const outcome = gradeOutcome(v.q, selected, v.mode);
  const multi = v.mode === "multi";
  const review: ReviewPayload = selected.length === 0
    ? { question_id: v.q.questionId, selected: [], dont_know: true, multi }
    : { question_id: v.q.questionId, selected, multi };
  return {
    state: {
      ...state,
      reviewed: state.reviewed + 1,
      correct: state.correct + (outcome === "correct" ? 1 : 0),
      answered: [...state.answered, v.q.questionId],
      view: { kind: "result", mode: v.mode, q: v.q, outcome, selected },
    },
    effects: [{ type: "SUBMIT_REVIEW", review }],
  };
}

/** Shows the next queued question, or waits for the batch that is (or is now) on its way. */
function nextQuestion(state: State, now: number): { state: State; effects: Effect[] } {
  const queue = state.queue.filter(q => !state.answered.includes(q.questionId));
  const effects: Effect[] = [];
  let fetching = state.fetching;
  if (queue.length <= PREFETCH_AT && !fetching && !state.exhausted) {
    effects.push(fetchEffect(state));
    fetching = true;
  }
  const [q, ...rest] = queue;
  if (!q) {
    return { state: { ...state, queue: [], fetching, view: { kind: "preparing", mode: state.mode } }, effects };
  }
  return {
    // The session mode decides how a question is asked, whatever the compiled row looks like.
    state: { ...state, queue: rest, fetching, view: { kind: "question", mode: state.mode, q, cursor: 0, selected: [], shownAt: now } },
    effects,
  };
}

export function reduce(state: State, action: Action): { state: State; effects: Effect[] } {
  const none: Effect[] = [];
  const v = state.view;

  switch (action.type) {
    case "FAILED":
      return { state: { ...state, fetching: false, view: { kind: "error", message: action.message } }, effects: none };

    case "PAIR_STARTED":
      return { state: { ...state, view: { kind: "pair", code: action.code, expiresAt: action.expiresAt } }, effects: none };

    case "PAIRED":
      return goHome(state);

    case "RETRY_BATCH": {
      // The server is compiling, or a fetch failed: ask again for what is ready now.
      if ((v.kind !== "empty" && v.kind !== "preparing") || state.fetching) return { state, effects: none };
      const s: State = { ...state, fetching: true, exhausted: false, view: { kind: "preparing", mode: state.mode } };
      return { state: s, effects: [fetchEffect(s)] };
    }

    case "SUMMARY_LOADED":
      if (v.kind !== "home") return { state, effects: none };
      return { state: { ...state, view: { ...v, summary: action.summary } }, effects: none };

    case "BATCH_FAILED": {
      const s = { ...state, fetching: false };
      if (v.kind === "preparing") return { state: { ...s, view: { kind: "error", message: action.message } }, effects: none };
      return { state: s, effects: none };
    }

    case "CLICK_PREPARING":
      // A tap while nothing is in flight re-asks the server.
      if (v.kind !== "preparing" || state.fetching) return { state, effects: none };
      return reduce(state, { type: "RETRY_BATCH" });

    case "BATCH_LOADED": {
      const fresh = action.questions.filter(q =>
        !state.answered.includes(q.questionId) &&
        !state.queue.some(x => x.questionId === q.questionId) &&
        !state.seenCards.includes(q.cardId));
      const moreComing = action.compiling || action.pendingCompile > 0;
      const s: State = {
        ...state,
        fetching: false,
        // Nothing new and nothing being compiled: stop asking until the next session.
        exhausted: fresh.length === 0 && !moreComing,
        sessionId: action.sessionId,
        queue: [...state.queue, ...fresh],
        seenCards: [...state.seenCards, ...fresh.map(q => q.cardId)],
      };
      if (v.kind !== "preparing") return { state: s, effects: none };
      if (s.queue.length === 0) {
        // The compiler is still working: wait on the compiling screen, which polls, instead of ending the session.
        if (moreComing) return { state: { ...s, view: { kind: "empty", mode: s.mode, pendingCompile: action.pendingCompile, compiling: action.compiling } }, effects: none };
        if (s.reviewed > 0) return { state: { ...s, view: { kind: "done", reviewed: s.reviewed, correct: s.correct } }, effects: none };
        return { state: { ...s, view: { kind: "empty", mode: s.mode, pendingCompile: 0, compiling: false } }, effects: none };
      }
      return nextQuestion(s, Date.now());
    }

    case "SCROLL_UP":
    case "SCROLL_DOWN":
      // Selection lives in the firmware's list widget; nothing to track here.
      return { state, effects: none };

    case "ASK": {
      const q = questionOf(v);
      if (!q || v.kind === "asking") return { state, effects: none };
      const text = action.text.trim();
      if (!text) return { state, effects: none };
      return { state: { ...state, view: { kind: "asking", back: v, text } }, effects: [{ type: "ASK", questionId: q.questionId, text }] };
    }

    case "ANSWER_LOADED":
      if (v.kind !== "asking") return { state, effects: none };
      return { state: { ...state, view: { kind: "answer", back: v.back, answer: action.answer, page: 0 } }, effects: none };

    case "ASK_FAILED":
      if (v.kind !== "asking") return { state, effects: none };
      return { state: { ...state, view: { kind: "answer", back: v.back, answer: `Error: ${action.message}`, page: 0 } }, effects: none };

    case "CONFIRM":
      if (v.kind !== "question" || v.selected.length === 0) return { state, effects: none };
      return submitAnswer(state, v, v.selected);

    case "ANSWER_NEXT":
      // Tap on the overlay: next page, or back to the screen underneath.
      if (v.kind === "asking") return { state: { ...state, view: v.back }, effects: none };
      if (v.kind !== "answer") return { state, effects: none };
      if (v.page + 1 < action.pageCount) return { state: { ...state, view: { ...v, page: v.page + 1 } }, effects: none };
      return { state: { ...state, view: v.back }, effects: none };

    case "CLICK_ROW": {
      // From the native list: the firmware moved the highlight, the tap tells us which row.
      switch (v.kind) {
        case "home": {
          if (action.index === 2) return { state, effects: none }; // Speech: not built yet
          const mode: Mode = action.index === 0 ? "single" : "multi";
          const s: State = { ...state, mode, queue: [], seenCards: [], reviewed: 0, correct: 0, fetching: true, exhausted: false, view: { kind: "preparing", mode } };
          return { state: s, effects: [fetchEffect(s)] };
        }
        case "question": {
          const row = questionRows(v.q, v.mode)[action.index];
          if (!row) return { state, effects: none };
          if (row.kind === "option") {
            // A tap only marks; a double tap (CONFIRM) submits. Multi toggles, single replaces.
            const selected = v.mode === "multi"
              ? (v.selected.includes(row.id) ? v.selected.filter(id => id !== row.id) : [...v.selected, row.id])
              : [row.id];
            return { state: { ...state, view: { ...v, selected } }, effects: none };
          }
          if (row.kind === "confirm") return submitAnswer(state, v, v.selected);
          return submitAnswer(state, v, []); // I don't know
        }
        default:
          return { state, effects: none };
      }
    }

    case "CLICK": {
      switch (v.kind) {
        case "result":
          return nextQuestion(state, action.now);
        case "preparing":
          return reduce(state, { type: "CLICK_PREPARING" });
        case "done":
        case "empty":
        case "error":
          return goHome(state);
        default:
          return { state, effects: none };
      }
    }

    case "MENU": {
      switch (action.item) {
        case "skip":
          if (v.kind !== "question") return { state, effects: none };
          // A skipped card is not reviewed; its ticket simply expires.
          return nextQuestion({ ...state, answered: [...state.answered, v.q.questionId] }, Date.now());
        case "home":
          return goHome(state);
        case "close":
          return { state, effects: [{ type: "SHUTDOWN" }] };
      }
    }
  }
  return { state, effects: none };
}
