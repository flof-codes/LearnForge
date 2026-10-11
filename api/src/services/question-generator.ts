import { storeQuestions, QUESTION_BATCH_SIZE, type Db, type QuestionRequest } from "@learnforge/core";
import { getQuestionModel, QuestionModelError, type ModelFailure } from "./question-model.js";

/**
 * Writes questions in the background, one batch per user at a time.
 *
 * A request returns at once; the study view polls for what has been stored.
 * After a failure the writer pauses, so a used-up credit balance costs one
 * failed call every few minutes instead of one per card. State lives in memory:
 * a restart forgets a pause and an unfinished batch, and the next request
 * starts it again.
 */

const PAUSE_MS: Record<ModelFailure, number> = {
  credits: 10 * 60 * 1000,
  auth: 10 * 60 * 1000,
  refused: 0,
  error: 60 * 1000,
};

interface WriterState {
  writing: Set<string>;
  paused: { reason: ModelFailure; until: number } | null;
}

const states = new Map<string, WriterState>();

function stateOf(userId: string): WriterState {
  let state = states.get(userId);
  if (!state) {
    state = { writing: new Set(), paused: null };
    states.set(userId, state);
  }
  if (state.paused && state.paused.until <= Date.now()) state.paused = null;
  return state;
}

export function writerEnabled(): boolean {
  return getQuestionModel() !== null;
}

export function writerStatus(userId: string): { writing: number; paused: ModelFailure | null } {
  const state = stateOf(userId);
  return { writing: state.writing.size, paused: state.paused?.reason ?? null };
}

/** Starts one batch for the first cards that are not being written yet. Does nothing while a batch runs or the writer is paused. */
export function requestQuestions(db: Db, userId: string, requests: QuestionRequest[], log: (msg: string) => void): void {
  const model = getQuestionModel();
  const state = stateOf(userId);
  if (!model || state.paused || state.writing.size > 0 || requests.length === 0) return;

  const batch = requests.slice(0, QUESTION_BATCH_SIZE);
  for (const r of batch) state.writing.add(r.cardId);

  void (async () => {
    try {
      const written = await model.write(batch);
      const stored = await storeQuestions(db, userId, batch, written, model.name);
      log(`question writer: ${stored.ready} written, ${stored.skipped} skipped`);
    } catch (err) {
      const reason: ModelFailure = err instanceof QuestionModelError ? err.reason : "error";
      // The test writer fails on purpose; its pauses must not outlast a test.
      const pauseMs = model.name === "stub" ? Math.min(PAUSE_MS[reason], 3000) : PAUSE_MS[reason];
      // A declined batch would be declined again: mark its cards as skipped so they are shown as they are.
      // If even that cannot be stored, pause like any other fault, or every poll would pay for the same refusal.
      const skips = batch.map(r => ({ card_id: r.cardId, status: "skipped", skip_reason: "The model declined to write this question" }));
      const settled = reason === "refused" && await storeQuestions(db, userId, batch, skips, model.name).then(() => true, () => false);
      if (!settled) state.paused = { reason: reason === "refused" ? "error" : reason, until: Date.now() + (pauseMs || PAUSE_MS.error) };
      log(`question writer failed (${reason}): ${(err as Error).message}`);
    } finally {
      state.writing.clear();
    }
  })();
}
