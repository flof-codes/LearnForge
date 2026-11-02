import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError, ValidationError, StaleTicketError } from "../lib/errors.js";
import { textArray } from "../lib/sql-array.js";
import { withoutFigures, questionText, figureLabels, hasPictures } from "../lib/figures.js";
import { HELP_PROMPT_VERSION, type HelpContext } from "../lib/help-prompt.js";
import type { QuestionRequest } from "../lib/question-prompt.js";
import { loadCardFigures, figuresFor } from "./card-figures.js";
import { getCurrentOriginals } from "./originals-service.js";
import { prepareWrittenQuestion, QUESTION_PROMPT_VERSION, type WrittenQuestion } from "./card-questions.js";
import { FEEDBACK_LABELS, feedbackForWriter, loadCardFeedback, loadCardTerms, withCardTerms } from "./card-feedback.js";
import type { QuestionForm, QuestionPayload, QuestionTerm } from "./question-forms.js";

/**
 * Help while answering a stored question: definitions and tutorials (written
 * by the caller's model, kept here for the next look), terms saved to a card,
 * and feedback that has a question rewritten. Everything starts from the study
 * ticket the question was served with, which also proves the card is the
 * caller's.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TicketRow = {
  ticket_id: string;
  card_id: string;
  card_level: number;
  change_rate: number;
  cq_id: string | null;
  form: QuestionForm;
  payload: QuestionPayload | null;
  difficulty: number;
  concept: string;
  front_html: string;
  back_html: string;
  topic_name: string;
  card_updated_at: string;
  is_cloze: boolean;
  /** The question was already retired by feedback, or the card was answered since this ticket was served. */
  replaced: boolean;
  answered: boolean;
};

async function loadTicket(db: Db, userId: string, questionId: string): Promise<TicketRow & { cq_id: string; payload: QuestionPayload }> {
  if (!UUID_RE.test(questionId ?? "")) throw new ValidationError("question_id must be a UUID");
  const rows = await db.execute<TicketRow>(sql`
    SELECT sq.id AS ticket_id, sq.card_id, sq.card_level, sq.change_rate, cq.id AS cq_id, cq.form, cq.payload, cq.difficulty,
           c.concept, c.front_html, c.back_html, t.name AS topic_name, c.updated_at AS card_updated_at,
           (c.card_type = 'cloze' OR nt.kind = 'cloze') AS is_cloze,
           cq.replaced_at IS NOT NULL AS replaced,
           (fs.last_review IS DISTINCT FROM sq.last_review_at_serve
             OR EXISTS (SELECT 1 FROM reviews r WHERE r.question_id = sq.id)) AS answered
    FROM study_questions sq
    JOIN study_sessions ss ON ss.id = sq.session_id AND ss.user_id = ${userId}
    LEFT JOIN card_questions cq ON cq.id = sq.card_question_id AND cq.status = 'ready'
    JOIN cards c ON c.id = sq.card_id
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    JOIN fsrs_state fs ON fs.card_id = c.id
    LEFT JOIN card_templates ct ON ct.id = c.template_id
    LEFT JOIN note_types nt ON nt.id = ct.note_type_id
    WHERE sq.id = ${questionId}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Question ticket not found");
  const row = rows.rows[0];
  if (!row.cq_id || !row.payload) throw new StaleTicketError("The question behind this ticket was replaced");
  return row as TicketRow & { cq_id: string; payload: QuestionPayload };
}

function contextOf(row: TicketRow & { payload: QuestionPayload }): HelpContext {
  return {
    bloomLevel: row.card_level,
    topicName: row.topic_name,
    concept: row.concept,
    backText: questionText(row.back_html).slice(0, 2400),
    stem: row.payload.stem,
    options: "options" in row.payload ? row.payload.options.map(o => o.text) : [],
  };
}

/** The words a learner marked, as typed: one line, at most 80 characters. */
export function cleanHelpTerm(raw: unknown): string {
  const term = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (!term) throw new ValidationError("term is required");
  if (term.length > 80) throw new ValidationError("term must be at most 80 characters");
  return term;
}

// ---------------------------------------------------------------------------
// Definitions and tutorials
// ---------------------------------------------------------------------------

export type HelpKind = "definition" | "tutorial";

export interface HelpSubject {
  context: HelpContext;
  cardId: string;
  kind: HelpKind;
  /** The marked term, lower case; empty for a tutorial of the whole question. */
  subject: string;
  /** Set for a tutorial of the whole question: it belongs to that question. */
  cardQuestionId: string | null;
  cardUpdatedAt: string;
}

/** What a definition or a tutorial is about, checked against the caller's ticket. */
export async function getHelpSubject(db: Db, userId: string, questionId: string, kind: HelpKind, term: string | null): Promise<HelpSubject> {
  const row = await loadTicket(db, userId, questionId);
  return {
    context: contextOf(row),
    cardId: row.card_id,
    kind,
    subject: term ? term.toLowerCase() : "",
    cardQuestionId: term ? null : row.cq_id,
    cardUpdatedAt: row.card_updated_at,
  };
}

/** The stored help for this subject while the card is unchanged, or null. */
export async function findHelp(db: Db, s: HelpSubject): Promise<Record<string, unknown> | null> {
  const rows = await db.execute<{ payload: Record<string, unknown> }>(sql`
    SELECT h.payload FROM card_help h JOIN cards c ON c.id = h.card_id
    WHERE h.card_id = ${s.cardId} AND h.kind = ${s.kind} AND h.subject = ${s.subject}
      AND h.card_question_id IS NOT DISTINCT FROM ${s.cardQuestionId}::uuid
      AND h.prompt_version = ${HELP_PROMPT_VERSION}
      AND h.card_updated_at = c.updated_at
    ORDER BY h.created_at DESC LIMIT 1
  `);
  return rows.rows[0]?.payload ?? null;
}

export async function storeHelp(db: Db, s: HelpSubject, payload: Record<string, unknown>, model: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM card_help WHERE card_id = ${s.cardId} AND kind = ${s.kind} AND subject = ${s.subject}
      AND card_question_id IS NOT DISTINCT FROM ${s.cardQuestionId}::uuid
  `);
  await db.execute(sql`
    INSERT INTO card_help (card_id, kind, subject, card_question_id, payload, prompt_version, model, card_updated_at)
    VALUES (${s.cardId}, ${s.kind}, ${s.subject}, ${s.cardQuestionId}::uuid, ${JSON.stringify(payload)}::jsonb, ${HELP_PROMPT_VERSION}, ${model}, ${s.cardUpdatedAt}::timestamptz)
  `);
}

/** Saves a definition to the question's card; every later question that uses the term underlines it. */
export async function saveCardTerm(db: Db, userId: string, questionId: string, rawTerm: unknown, rawDefinition: unknown): Promise<QuestionTerm> {
  const term = cleanHelpTerm(rawTerm);
  const definition = typeof rawDefinition === "string" ? rawDefinition.trim() : "";
  if (!definition) throw new ValidationError("definition is required");
  if (definition.length > 500) throw new ValidationError("definition must be at most 500 characters");
  const row = await loadTicket(db, userId, questionId);
  await db.execute(sql`
    INSERT INTO card_terms (card_id, term, definition) VALUES (${row.card_id}, ${term}, ${definition})
    ON CONFLICT (card_id, lower(term)) DO UPDATE SET definition = EXCLUDED.definition
  `);
  return { term, definition };
}

// ---------------------------------------------------------------------------
// Feedback and rewrites
// ---------------------------------------------------------------------------

export interface FeedbackInput { questionId: string; labels: unknown; note: unknown; scope: unknown }

/**
 * Records feedback on the question behind a ticket and takes that question out
 * of service, so the next visit gets one written with the feedback. With scope
 * "card" every other unused question of the card goes too. Returns the request
 * that rewrites the question now.
 */
export async function recordFeedback(db: Db, userId: string, input: FeedbackInput): Promise<{ feedbackId: string; request: QuestionRequest }> {
  const labels = [...new Set(Array.isArray(input.labels) ? input.labels : [])];
  if (labels.some(l => typeof l !== "string" || !Object.hasOwn(FEEDBACK_LABELS, l))) {
    throw new ValidationError(`labels may only contain ${Object.keys(FEEDBACK_LABELS).join(", ")}`);
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > 500) throw new ValidationError("note must be at most 500 characters");
  if (labels.length === 0 && !note) throw new ValidationError("Pick a label or write a note");
  if (input.scope !== "question" && input.scope !== "card") throw new ValidationError("scope must be question or card");
  const row = await loadTicket(db, userId, input.questionId);
  // Feedback twice on one question, or on a card answered since (another device), would rewrite a question nobody can answer.
  if (row.replaced || row.answered) throw new StaleTicketError("This question was already rewritten or answered");

  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO card_feedback (card_id, labels, note, scope, question_stem, card_question_id)
    VALUES (${row.card_id}, ${textArray(labels as string[])}, ${note}, ${input.scope}, ${row.payload.stem}, ${row.cq_id})
    RETURNING id
  `);
  await db.execute(sql`
    UPDATE card_questions SET replaced_at = NOW()
    WHERE replaced_at IS NULL AND used_at IS NULL
      AND (id = ${row.cq_id} OR (${input.scope} = 'card' AND card_id = ${row.card_id}))
  `);

  // Card-wide feedback already includes this one; feedback for this question alone goes first.
  const cardWide = (await loadCardFeedback(db, [row.card_id])).get(row.card_id) ?? [];
  const feedback = input.scope === "card" ? cardWide : [feedbackForWriter(labels as string[], note), ...cardWide];
  return { feedbackId: inserted.rows[0].id, request: await rewriteRequest(db, userId, row, feedback) };
}

async function rewriteRequest(db: Db, userId: string, row: TicketRow & { payload: QuestionPayload }, feedback: QuestionRequest["feedback"]): Promise<QuestionRequest> {
  const figures = figuresFor(await loadCardFigures(db, userId, [row.card_id]), row.card_id);
  const original = (await getCurrentOriginals(db, userId, [row.card_id])).get(row.card_id) ?? null;
  const recent = await db.execute<{ question_text: string }>(sql`
    SELECT question_text FROM reviews WHERE card_id = ${row.card_id} ORDER BY reviewed_at DESC LIMIT 3
  `);
  const front = withoutFigures(row.front_html, figures);
  const back = withoutFigures(row.back_html, figures);
  return {
    cardId: row.card_id,
    form: row.form,
    bloomLevel: row.card_level,
    difficulty: row.difficulty,
    changeRate: row.change_rate,
    topicName: row.topic_name,
    concept: row.concept,
    frontText: questionText(front).slice(0, 1200),
    backText: questionText(back).slice(0, 2400),
    isCloze: row.is_cloze === true,
    hasImages: hasPictures(front + back),
    figure: figures.figure || figures.frontFigure
      ? { withStem: !!figures.frontFigure, afterAnswer: !!figures.figure, labels: figureLabels(figures.figure ?? figures.frontFigure) }
      : null,
    original: original
      ? { question: original.questionText, expectedAnswer: original.expectedAnswer, options: original.options?.map(o => `${o.text}${o.correct ? " (correct)" : ""}`) ?? null }
      : null,
    recentQuestions: recent.rows.map(r => r.question_text.slice(0, 300)),
    feedback,
    rewriteOf: row.payload.stem,
  };
}

/**
 * Stores the rewritten question and hands out a ticket for it in the same
 * session. Returns null when the model wrote nothing usable; the feedback stays.
 */
export async function storeRewrite(
  db: Db, userId: string,
  input: { questionId: string; feedbackId: string; request: QuestionRequest; written: WrittenQuestion[]; model: string },
): Promise<{ questionId: string; form: QuestionForm; payload: QuestionPayload } | null> {
  const item = input.written.find(w => w.card_id === input.request.cardId);
  if (!item || item.status !== "ready") return null;
  let payload: QuestionPayload;
  try {
    payload = prepareWrittenQuestion(input.request, item);
  } catch {
    return null;
  }
  const { request } = input;
  // Question, ticket and the link from the feedback go in together, or undo could not find the rewrite.
  const ticketId = await db.transaction(async (tx) => {
    const inserted = await tx.execute<{ id: string }>(sql`
      INSERT INTO card_questions (card_id, bloom_level, form, prompt_version, status, payload, difficulty, model, original_id, card_updated_at)
      SELECT c.id, ${request.bloomLevel}, ${request.form}, ${QUESTION_PROMPT_VERSION}, 'ready', ${JSON.stringify(payload)}::jsonb,
             ${request.difficulty}, ${input.model}, c.current_original_id, c.updated_at
      FROM cards c JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
      WHERE c.id = ${request.cardId}
      RETURNING id
    `);
    if (inserted.rows.length === 0) throw new NotFoundError("Card not found");
    const id = inserted.rows[0].id;
    const ticket = await tx.execute<{ id: string }>(sql`
      INSERT INTO study_questions (session_id, card_id, original_id, card_level, change_rate, rate_source, last_review_at_serve, card_question_id)
      SELECT session_id, card_id, original_id, card_level, change_rate, rate_source, last_review_at_serve, ${id}::uuid
      FROM study_questions WHERE id = ${input.questionId}
      RETURNING id
    `);
    await tx.execute(sql`UPDATE card_feedback SET replacement_id = ${id} WHERE id = ${input.feedbackId}`);
    return ticket.rows[0].id;
  });
  const saved = (await loadCardTerms(db, [request.cardId])).get(request.cardId) ?? [];
  return { questionId: ticketId, form: request.form, payload: withCardTerms(payload, saved) };
}

/**
 * Takes feedback back: its rewrite is dropped and the question it was given on
 * is served again. Refused once the rewrite has been answered.
 */
export async function undoFeedback(db: Db, userId: string, feedbackId: string): Promise<void> {
  if (!UUID_RE.test(feedbackId ?? "")) throw new ValidationError("feedback id must be a UUID");
  // Only an unanswered rewrite is deleted, in one statement, so an answer arriving meanwhile is never lost.
  await db.transaction(async (tx) => {
    const rows = await tx.execute<{ card_question_id: string | null; replacement_id: string | null }>(sql`
      SELECT f.card_question_id, f.replacement_id
      FROM card_feedback f
      JOIN cards c ON c.id = f.card_id
      JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
      WHERE f.id = ${feedbackId}
      FOR UPDATE OF f
    `);
    if (rows.rows.length === 0) throw new NotFoundError("Feedback not found");
    const f = rows.rows[0];
    if (f.replacement_id) {
      const dropped = await tx.execute(sql`DELETE FROM card_questions WHERE id = ${f.replacement_id} AND used_at IS NULL RETURNING id`);
      if (dropped.rows.length === 0) throw new ValidationError("The rewritten question has already been answered");
    }
    if (f.card_question_id) await tx.execute(sql`UPDATE card_questions SET replaced_at = NULL WHERE id = ${f.card_question_id}`);
    await tx.execute(sql`DELETE FROM card_feedback WHERE id = ${feedbackId}`);
  });
}
