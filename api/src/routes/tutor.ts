import { FastifyInstance, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import {
  users, startSession, validateDifficulty, validateAnswerModes, serveTutorBatch, submitTutorAnswer,
  getTutorQueue, toQuestionRequest, getStudySummary, ValidationError,
} from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";
import { ForbiddenError } from "../lib/errors.js";
import { writerEnabled, writerStatus, requestQuestions } from "../services/question-generator.js";

/**
 * The tutor inside the web app: a study session that asks stored questions.
 *
 * Questions are written with the operator's own Anthropic key, so the feature
 * is for admins only. Everyone else gets `available: false` from the status
 * route and keeps the plain card view.
 */

interface TutorScope { topic_id?: string; difficulty?: number; answer_by?: unknown }

async function isAdmin(userId: string): Promise<boolean> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role === "admin";
}

async function requireTutor(request: FastifyRequest): Promise<string> {
  const userId = getUserId(request);
  if (!writerEnabled() || !(await isAdmin(userId))) throw new ForbiddenError("The tutor is not available for this account", "TUTOR_UNAVAILABLE");
  return userId;
}

export default async function tutorRoutes(app: FastifyInstance) {
  const log = (msg: string) => app.log.info(msg);

  // GET /tutor/status — may this account use the tutor, and is the writer running
  app.get("/tutor/status", async (req) => {
    const userId = getUserId(req);
    if (!writerEnabled() || !(await isAdmin(userId))) return { available: false, writing: 0, paused: null };
    return { available: true, ...writerStatus(userId) };
  });

  // POST /tutor/prepare — start writing for the settings on the start screen, report what is ready
  app.post<{ Body: TutorScope }>("/tutor/prepare", async (req) => {
    const userId = await requireTutor(req);
    const difficulty = validateDifficulty(req.body?.difficulty);
    const answerBy = validateAnswerModes(req.body?.answer_by);
    const topicId = req.body?.topic_id || undefined;

    const queue = await getTutorQueue(db, userId, { topicId, difficulty, answerBy });
    requestQuestions(db, userId, queue.filter(e => !e.stored).map(e => toQuestionRequest(e, difficulty)), log);
    const summary = await getStudySummary(db, userId, topicId);
    return {
      ready: queue.filter(e => e.stored).length,
      waiting: summary.dueCount + summary.newCount,
      ...writerStatus(userId),
    };
  });

  // POST /tutor/sessions — open a session at the chosen difficulty
  app.post<{ Body: { difficulty?: number } }>("/tutor/sessions", async (req) => {
    const userId = await requireTutor(req);
    const { session } = await startSession(db, userId, { client: "web", difficulty: validateDifficulty(req.body?.difficulty) });
    return { sessionId: session.id, difficulty: session.sessionDifficulty };
  });

  // POST /tutor/next — the next stored questions of a session; cards without one are written in the background
  app.post<{ Body: { session_id?: string; topic_id?: string; answer_by?: unknown; exclude?: string[]; limit?: number } }>("/tutor/next", async (req) => {
    const userId = await requireTutor(req);
    const { session_id, exclude, limit } = req.body ?? {};
    if (!session_id) throw new ValidationError("session_id is required");
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
    requestQuestions(db, userId, batch.unwritten.map(e => toQuestionRequest(e, batch.session.sessionDifficulty)), log);
    return {
      sessionId: batch.session.id,
      items: batch.items,
      pending: batch.unwritten.length,
      remaining: batch.remaining,
      paused,
    };
  });

  // POST /tutor/answer — grade a stored question and write the review
  app.post<{ Body: { question_id?: string; selected?: string[]; text?: string; dont_know?: boolean; rating?: number } }>("/tutor/answer", async (req) => {
    const userId = await requireTutor(req);
    const { question_id, selected, text, dont_know, rating } = req.body ?? {};
    if (!question_id) throw new ValidationError("question_id is required");
    return submitTutorAnswer(db, userId, { question_id, selected, text, dont_know, rating });
  });
}
