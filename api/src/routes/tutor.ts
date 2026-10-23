import { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../db/connection.js";
import {
  getTutorSettings, saveTutorSettings, removeTutorKey, TUTOR_MODELS, TUTOR_EFFORTS,
  startSession, setSessionDifficulty, checkTutorItems, validateDifficulty, validateAnswerModes, serveTutorBatch, submitTutorAnswer,
  getTutorQueue, toQuestionRequest, getStudySummary, getAnswerContext, ValidationError, FOLLOW_UP_LIMIT,
} from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";
import { ForbiddenError, ServiceUnavailableError } from "../lib/errors.js";
import { writerStatus, requestQuestions, clearWriterPause } from "../services/question-generator.js";
import { QuestionModelError, checkApiKey, type AnswerGrade, type ThreadMessage, type QuestionModel } from "../services/question-model.js";
import { resolveTutorSetup, resolveTutorModel, usesServerKey } from "../services/tutor-access.js";
import { settingsSecret } from "../config.js";

/**
 * The tutor inside the web app: a study session that asks stored questions.
 *
 * Every model call runs on the key of the account it is for (Settings → Tutor).
 * An account without a key gets `available: false` from the status route and
 * keeps the plain card view.
 */

interface TutorScope { topic_id?: string; difficulty?: number; answer_by?: unknown }

async function requireTutor(request: FastifyRequest): Promise<{ userId: string; model: QuestionModel }> {
  const userId = getUserId(request);
  const model = await resolveTutorModel(userId);
  if (!model) throw new ForbiddenError("Save an Anthropic API key in the settings to use the tutor", "TUTOR_UNAVAILABLE");
  return { userId, model };
}

/**
 * Grades of open answers, kept until the learner rates. The review takes its
 * correctness from here, never from the request. A restart empties it; the
 * answer is then graded once more when it is saved.
 */
const GRADE_TTL_MS = 24 * 60 * 60 * 1000;
const grades = new Map<string, { text: string; grade: AnswerGrade; at: number }>();

function rememberGrade(questionId: string, text: string, grade: AnswerGrade): void {
  const now = Date.now();
  if (grades.size > 2000) {
    for (const [id, g] of grades) if (now - g.at > GRADE_TTL_MS) grades.delete(id);
  }
  grades.set(questionId, { text, grade, at: now });
}

/** A model failure the learner can do nothing about: answered as 503 with the reason, so the view can say why. */
function modelUnavailable(err: unknown): never {
  if (err instanceof QuestionModelError) throw new ServiceUnavailableError(err.message, `TUTOR_${err.reason.toUpperCase()}`);
  throw err;
}

function cleanAnswerText(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new ValidationError("text is required");
  if (text.length > 4000) throw new ValidationError("text must be at most 4000 characters");
  return text;
}

async function gradeOpenAnswer(userId: string, model: QuestionModel, questionId: string, text: string) {
  const ctx = await getAnswerContext(db, userId, questionId);
  if (ctx.form !== "open") throw new ValidationError("Only an open question is graded this way");
  const grade = await model.grade(ctx, text).catch(modelUnavailable);
  rememberGrade(questionId, text, grade);
  return { ctx, grade };
}

export default async function tutorRoutes(app: FastifyInstance) {
  const log = (msg: string) => app.log.info(msg);

  // GET /tutor/status — may this account use the tutor, and is the writer running
  app.get("/tutor/status", async (req) => {
    const userId = getUserId(req);
    if (!(await resolveTutorSetup(userId))) return { available: false, writing: 0, paused: null };
    return { available: true, ...writerStatus(userId) };
  });

  // POST /tutor/prepare — start writing for the settings on the start screen, report what is ready
  app.post<{ Body: TutorScope }>("/tutor/prepare", async (req) => {
    const { userId, model } = await requireTutor(req);
    const difficulty = validateDifficulty(req.body?.difficulty);
    const answerBy = validateAnswerModes(req.body?.answer_by);
    const topicId = req.body?.topic_id || undefined;

    const queue = await getTutorQueue(db, userId, { topicId, difficulty, answerBy });
    requestQuestions(db, userId, model, queue.filter(e => !e.stored && !e.asCard).map(e => toQuestionRequest(e, difficulty)), log);
    const summary = await getStudySummary(db, userId, topicId);
    return {
      ready: queue.filter(e => e.stored || e.asCard).length,
      waiting: summary.dueCount + summary.newCount,
      ...writerStatus(userId),
    };
  });

  // POST /tutor/sessions — open a session at the chosen difficulty
  app.post<{ Body: { difficulty?: number } }>("/tutor/sessions", async (req) => {
    const { userId } = await requireTutor(req);
    const { session } = await startSession(db, userId, { client: "web", difficulty: validateDifficulty(req.body?.difficulty) });
    return { sessionId: session.id, difficulty: session.sessionDifficulty };
  });

  // PUT /tutor/sessions/:id — change the difficulty of a running session; it holds from the next card served
  app.put<{ Params: { id: string }; Body: { difficulty?: number } }>("/tutor/sessions/:id", async (req) => {
    const { userId } = await requireTutor(req);
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw new ValidationError("session id must be a UUID");
    const session = await setSessionDifficulty(db, userId, req.params.id, validateDifficulty(req.body?.difficulty));
    return { sessionId: session.id, difficulty: session.sessionDifficulty };
  });

  // POST /tutor/next — the next stored questions of a session; cards without one are written in the background
  app.post<{ Body: { session_id?: string; topic_id?: string; answer_by?: unknown; exclude?: string[]; limit?: number } }>("/tutor/next", async (req) => {
    const { userId, model } = await requireTutor(req);
    const { session_id, exclude, limit } = req.body ?? {};
    if (!session_id) throw new ValidationError("session_id is required");
    if (limit !== undefined && typeof limit !== "number") throw new ValidationError("limit must be a number");
    const answerBy = validateAnswerModes(req.body?.answer_by);
    const paused = writerStatus(userId).paused;

    const batch = await serveTutorBatch(db, userId, {
      sessionId: session_id,
      topicId: req.body?.topic_id || undefined,
      answerBy,
      exclude: Array.isArray(exclude) ? exclude : [],
      limit,
      // While the writer is paused the session goes on with the plain cards.
      serveUnwritten: paused !== null,
    });
    requestQuestions(db, userId, model, batch.unwritten.map(e => toQuestionRequest(e, batch.session.sessionDifficulty)), log);
    return {
      sessionId: batch.session.id,
      items: batch.items,
      pending: batch.unwritten.length,
      remaining: batch.remaining,
      paused,
    };
  });

  // POST /tutor/check — which of the items this client still holds can be answered (another device may have studied meanwhile)
  app.post<{ Body: { question_ids?: string[]; card_ids?: string[] } }>("/tutor/check", async (req) => {
    const { userId } = await requireTutor(req);
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
    return checkTutorItems(db, userId, { questionIds: ids(req.body?.question_ids), cardIds: ids(req.body?.card_ids) });
  });

  // POST /tutor/answer — grade a stored question and write the review
  app.post<{ Body: { question_id?: string; selected?: string[]; text?: string; dont_know?: boolean; rating?: number } }>("/tutor/answer", async (req) => {
    const { userId, model } = await requireTutor(req);
    const { question_id, selected, text, dont_know, rating } = req.body ?? {};
    if (!question_id) throw new ValidationError("question_id is required");

    // An open answer is saved with the grade the server gave it. If that grade
    // is gone (a restart) or belongs to another text, it is graded now.
    let openCorrectness: number | undefined;
    if (!dont_know && typeof text === "string" && text.trim()) {
      const ctx = await getAnswerContext(db, userId, question_id);
      if (ctx.form === "open") {
        const known = grades.get(question_id);
        openCorrectness = known && known.text === text.trim()
          ? known.grade.correctness
          : (await gradeOpenAnswer(userId, model, question_id, cleanAnswerText(text))).grade.correctness;
      }
    }
    const result = await submitTutorAnswer(db, userId, { question_id, selected, text, dont_know, rating, openCorrectness });
    grades.delete(question_id);
    return result;
  });

  // POST /tutor/grade — grade an open answer; the review is written later, with the rating
  app.post<{ Body: { question_id?: string; text?: string } }>("/tutor/grade", async (req) => {
    const { userId, model } = await requireTutor(req);
    if (!req.body?.question_id) throw new ValidationError("question_id is required");
    const { ctx, grade } = await gradeOpenAnswer(userId, model, req.body.question_id, cleanAnswerText(req.body.text));
    return {
      correctness: grade.correctness,
      feedback: grade.feedback,
      points: ctx.keyPoints.map((text, i) => ({ text, met: grade.met[i] })),
      modelAnswer: ctx.modelAnswer,
    };
  });

  // POST /tutor/followup — a question about the answer just graded; the thread starts with that answer and its feedback
  app.post<{ Body: { question_id?: string; thread?: Array<{ role?: string; text?: string }> } }>("/tutor/followup", async (req) => {
    const { userId, model } = await requireTutor(req);
    if (!req.body?.question_id) throw new ValidationError("question_id is required");
    const raw = Array.isArray(req.body.thread) ? req.body.thread : [];
    const thread: ThreadMessage[] = raw.map((m, i) => {
      const role = i % 2 === 0 ? "user" : "assistant";
      if (m?.role !== role) throw new ValidationError("thread must alternate between user and assistant, starting with the learner's answer");
      return { role, text: cleanAnswerText(m.text) };
    });
    if (thread.length < 3 || thread.length % 2 === 0) throw new ValidationError("thread must end with the learner's follow-up");
    if ((thread.length - 1) / 2 > FOLLOW_UP_LIMIT) throw new ValidationError(`At most ${FOLLOW_UP_LIMIT} follow-ups per question`);

    const ctx = await getAnswerContext(db, userId, req.body.question_id);
    if (ctx.form !== "open") throw new ValidationError("Follow-ups belong to an open question");
    return { text: await model.reply(ctx, thread).catch(modelUnavailable) };
  });

  // GET /tutor/settings — this account's key (masked), model and effort, and what can be chosen
  app.get("/tutor/settings", async (req) => {
    const userId = getUserId(req);
    return {
      ...(await getTutorSettings(db, userId)),
      // Deprecated fallback: an admin without a key of their own runs on the server's.
      serverKey: await usesServerKey(userId),
      models: TUTOR_MODELS,
      efforts: TUTOR_EFFORTS,
    };
  });

  // PUT /tutor/settings — save a key, a model, an effort; what is left out stays
  app.put<{ Body: { api_key?: string; model?: string; effort?: string; difficulty?: number; answer_by?: unknown } }>("/tutor/settings", async (req) => {
    const userId = getUserId(req);
    const { api_key, model, effort, difficulty, answer_by } = req.body ?? {};
    const saved = await saveTutorSettings(db, userId, { api_key, model, effort, difficulty, answer_by }, settingsSecret);
    // A new key or model deserves a fresh try; remembering a difficulty does not.
    if (api_key !== undefined || model !== undefined || effort !== undefined) clearWriterPause(userId);
    return { ...saved, serverKey: await usesServerKey(userId) };
  });

  // DELETE /tutor/settings/key — forget the saved key
  app.delete("/tutor/settings/key", async (req) => {
    const userId = getUserId(req);
    const saved = await removeTutorKey(db, userId);
    return { ...saved, serverKey: await usesServerKey(userId) };
  });

  // POST /tutor/settings/check — does Anthropic accept the key for the chosen model
  app.post("/tutor/settings/check", async (req) => {
    const userId = getUserId(req);
    const setup = await resolveTutorSetup(userId);
    if (!setup) throw new ValidationError("No API key is saved yet");
    try {
      await checkApiKey(setup);
      clearWriterPause(userId);
      return { ok: true, reason: null };
    } catch (err) {
      // What Anthropic or the network said, so a failure can be told apart; it never contains the key.
      const detail = (err instanceof Error ? err.message : "Unknown error").slice(0, 300);
      app.log.warn(`tutor key check failed for model ${setup.model}: ${detail}`);
      return { ok: false, reason: err instanceof QuestionModelError ? err.reason : "error", detail };
    }
  });
}
