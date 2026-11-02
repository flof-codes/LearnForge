import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import {
  getHelpSubject, findHelp, storeHelp, saveCardTerm, cleanHelpTerm, recordFeedback, storeRewrite, undoFeedback,
  ValidationError, type Tutorial,
} from "@learnforge/core";
import { requireTutor, modelUnavailable } from "../lib/tutor-helpers.js";
import { ServiceUnavailableError } from "../lib/errors.js";

/**
 * Help while answering a stored question, by its study ticket: a definition of
 * marked words, a tutorial of a term or of the whole question, saving a
 * definition to the card, and feedback that rewrites the question.
 *
 * Definitions and tutorials are kept per card until the card changes, so a
 * second look costs nothing.
 */
export default async function tutorHelpRoutes(app: FastifyInstance) {
  // POST /tutor/define — a short definition of words the learner marked
  app.post<{ Body: { question_id?: string; term?: string } }>("/tutor/define", async (req) => {
    const { userId, model } = await requireTutor(req);
    const term = cleanHelpTerm(req.body?.term);
    const subject = await getHelpSubject(db, userId, req.body?.question_id ?? "", "definition", term);
    const kept = await findHelp(db, subject);
    if (typeof kept?.definition === "string") return { term, definition: kept.definition };
    const definition = await model.define(subject.context, term).catch(modelUnavailable);
    await storeHelp(db, subject, { definition }, model.name);
    return { term, definition };
  });

  // POST /tutor/tutorial — a tutorial of a marked term, or of everything the question needs when no term is given
  app.post<{ Body: { question_id?: string; term?: string } }>("/tutor/tutorial", async (req) => {
    const { userId, model } = await requireTutor(req);
    const term = req.body?.term === undefined || req.body.term === null ? null : cleanHelpTerm(req.body.term);
    const subject = await getHelpSubject(db, userId, req.body?.question_id ?? "", "tutorial", term);
    const kept = await findHelp(db, subject);
    if (kept) return { term, tutorial: kept as unknown as Tutorial };
    const tutorial = await model.tutorial(subject.context, term).catch(modelUnavailable);
    await storeHelp(db, subject, tutorial as unknown as Record<string, unknown>, model.name);
    return { term, tutorial };
  });

  // POST /tutor/terms — save a definition to the question's card
  app.post<{ Body: { question_id?: string; term?: string; definition?: string } }>("/tutor/terms", async (req) => {
    const { userId } = await requireTutor(req);
    return saveCardTerm(db, userId, req.body?.question_id ?? "", req.body?.term, req.body?.definition);
  });

  // POST /tutor/feedback — record feedback on a question and rewrite it now.
  // A model failure answers 503, but the feedback is kept and guides the next question written for the card.
  app.post<{ Body: { question_id?: string; labels?: unknown; note?: unknown; scope?: unknown } }>("/tutor/feedback", async (req) => {
    const { userId, model } = await requireTutor(req);
    if (!req.body?.question_id) throw new ValidationError("question_id is required");
    const questionId = req.body.question_id;
    const { feedbackId, request } = await recordFeedback(db, userId, { questionId, labels: req.body.labels, note: req.body.note, scope: req.body.scope });
    const written = await model.write([request]).catch(modelUnavailable);
    const rewritten = await storeRewrite(db, userId, { questionId, feedbackId, request, written, model: model.name });
    if (!rewritten) throw new ServiceUnavailableError("The tutor could not rewrite this question", "TUTOR_ERROR");
    return { feedbackId, ...rewritten };
  });

  // POST /tutor/feedback/:id/undo — take the feedback back and serve the question it was given on again
  app.post<{ Params: { id: string } }>("/tutor/feedback/:id/undo", async (req) => {
    const { userId } = await requireTutor(req);
    await undoFeedback(db, userId, req.params.id);
    return { ok: true };
  });
}
