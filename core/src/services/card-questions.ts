import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { stripHtml } from "../lib/strip-html.js";
import { loadTopicRates } from "./change-rate.js";
import { getStudyCards, getStudySummary } from "./study-service.js";
import { getSession, validateDifficulty } from "./session-service.js";
import { submitReview, gradeChoice } from "./review-service.js";
import { ratingFromCorrectness } from "./bloom.js";
import type { QuestionRequest, AnswerContext } from "../lib/question-prompt.js";

/**
 * Questions written ahead of time for the study view.
 *
 * A model writes them in batches (the caller owns that call; nothing here
 * talks to a model). This module decides which form a card is asked in,
 * validates and stores what the model returned, serves stored questions with a
 * study ticket each, and turns an answer into a graded review.
 */

/** Bump when the rules in lib/question-prompt.ts change; older rows stop being served. */
export const QUESTION_PROMPT_VERSION = 1;
export const QUESTION_BATCH_SIZE = 5;

export type QuestionForm = "choice" | "gap" | "open";
export type AnswerMode = "tap" | "type" | "dictate";
const ANSWER_MODES: readonly AnswerMode[] = ["tap", "type", "dictate"];
const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GAP_MARK = "{{gap}}";

export interface QuestionTerm { term: string; definition: string }
export interface ChoicePayload {
  stem: string;
  options: Array<{ text: string; correct: boolean; why: string }>;
  explanation: string;
  terms: QuestionTerm[];
}
export interface GapPayload {
  stem: string;
  answer: string;
  accept: string[];
  explanation: string;
  terms: QuestionTerm[];
}
export interface OpenPayload {
  stem: string;
  answer: string;
  keyPoints: string[];
  explanation: string;
  terms: QuestionTerm[];
}
export type QuestionPayload = ChoicePayload | GapPayload | OpenPayload;

/** Follow-up questions the learner may ask about one open answer. */
export const FOLLOW_UP_LIMIT = 5;

// ---------------------------------------------------------------------------
// Which form a card is asked in
// ---------------------------------------------------------------------------

export function validateAnswerModes(raw: unknown): AnswerMode[] {
  if (!Array.isArray(raw)) throw new ValidationError("answer_by must be an array of tap, type, dictate");
  const modes = [...new Set(raw)].filter((m): m is AnswerMode => ANSWER_MODES.includes(m as AnswerMode));
  if (modes.length !== new Set(raw).size) throw new ValidationError("answer_by may only contain tap, type, dictate");
  if (modes.length === 0) throw new ValidationError("answer_by must name at least one way to answer");
  return modes;
}

/**
 * Tap only asks everything as a choice. With typing or dictation, a cloze card
 * becomes a typed gap and any other card an open question once the session and
 * the level are past plain recognition: at Desk from Apply (gap) and Evaluate
 * (open), at Deep always. Without tapping nothing is asked as a choice.
 */
export function pickQuestionForm(input: { difficulty: number; level: number; isCloze: boolean; answerBy: AnswerMode[] }): QuestionForm {
  const tap = input.answerBy.includes("tap");
  const typed = input.answerBy.includes("type") || input.answerBy.includes("dictate");
  if (!typed) return "choice";
  // Recalling a fact or a definition is a gap; from Apply up the learner explains.
  const typedForm: QuestionForm = input.isCloze || input.level <= 1 ? "gap" : "open";
  if (!tap || input.difficulty >= 0.85) return typedForm;
  if (input.difficulty < 0.5) return "choice";
  if (input.isCloze) return input.level >= 2 ? "gap" : "choice";
  return input.level >= 4 ? "open" : "choice";
}

// ---------------------------------------------------------------------------
// Validation of what the model returned
// ---------------------------------------------------------------------------

function cleanTerms(raw: unknown, texts: string[]): QuestionTerm[] {
  if (!Array.isArray(raw)) return [];
  const haystack = texts.join("\n").toLowerCase();
  const seen = new Set<string>();
  const terms: QuestionTerm[] = [];
  for (const t of raw) {
    const term = typeof t?.term === "string" ? t.term.trim() : "";
    const definition = typeof t?.definition === "string" ? t.definition.trim() : "";
    // A term the text does not contain could never be tapped.
    if (!term || !definition || seen.has(term.toLowerCase()) || !haystack.includes(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    terms.push({ term: term.slice(0, 80), definition: definition.slice(0, 400) });
    if (terms.length === 4) break;
  }
  return terms;
}

function requireText(field: string, value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ValidationError(`${field} is required`);
  if (text.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return text;
}

/** Normalises a question and refuses one the study view could not ask or grade. */
export function validateQuestionPayload(form: QuestionForm, raw: Record<string, unknown>): QuestionPayload {
  const explanation = requireText("explanation", raw.explanation, 600);

  if (form === "choice") {
    const stem = requireText("stem", raw.stem, 500);
    if (!Array.isArray(raw.options) || raw.options.length !== OPTION_LETTERS.length) {
      throw new ValidationError(`exactly ${OPTION_LETTERS.length} options are required`);
    }
    const options = raw.options.map((o, i) => ({
      text: requireText(`option ${OPTION_LETTERS[i]}`, o?.text, 240),
      correct: o?.correct === true,
      why: requireText(`reason for option ${OPTION_LETTERS[i]}`, o?.why, 400),
    }));
    if (new Set(options.map(o => o.text.toLowerCase())).size !== options.length) throw new ValidationError("options must be distinct");
    const correct = options.filter(o => o.correct).length;
    if (correct < 1 || correct > 2) throw new ValidationError("one or two options must be correct");
    return { stem, options, explanation, terms: cleanTerms(raw.terms, [stem, explanation, ...options.map(o => o.text)]) };
  }

  if (form === "open") {
    const stem = requireText("stem", raw.stem, 600);
    const answer = requireText("answer", raw.answer, 1200);
    const keyPoints = (Array.isArray(raw.key_points) ? raw.key_points : [])
      .filter((k): k is string => typeof k === "string" && k.trim() !== "")
      .map(k => k.trim().slice(0, 240))
      .slice(0, 4);
    if (keyPoints.length < 2) throw new ValidationError("an open question needs at least two key points");
    return { stem, answer, keyPoints, explanation, terms: cleanTerms(raw.terms, [stem]) };
  }

  const stem = requireText("stem", raw.stem, 500);
  if (stem.split(GAP_MARK).length !== 2) throw new ValidationError(`a gap question needs ${GAP_MARK} exactly once in the stem`);
  const answer = requireText("answer", raw.answer, 120);
  const accept = [...new Set([answer, ...(Array.isArray(raw.accept) ? raw.accept : [])]
    .filter((a): a is string => typeof a === "string")
    .map(normalizeGapAnswer)
    .filter(Boolean))].slice(0, 20);
  return { stem, answer, accept, explanation, terms: cleanTerms(raw.terms, [stem, explanation]) };
}

/** Case, surrounding punctuation and runs of spaces do not make a typed answer wrong. */
export function normalizeGapAnswer(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").replace(/^[\s"'„“”‚‘’.,;:!?()]+|[\s"'„“”‚‘’.,;:!?()]+$/g, "");
}

export function gradeGap(payload: GapPayload, text: string): number {
  const given = normalizeGapAnswer(text);
  return given !== "" && payload.accept.includes(given) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// The queue: due cards, the form each is asked in, and what is already written
// ---------------------------------------------------------------------------

export interface TutorQueueOptions {
  topicId?: string;
  difficulty: number;
  answerBy: AnswerMode[];
  /** Cards the client already holds. */
  exclude?: string[];
  limit?: number;
}

type StudyCard = Awaited<ReturnType<typeof getStudyCards>>[number];
interface StoredQuestion { id: string; status: "ready" | "skipped"; payload: QuestionPayload | null }
export interface TutorQueueEntry { card: StudyCard; form: QuestionForm; topicName: string; stored: StoredQuestion | null }

/** Due cards in study order, each with its form and its fresh stored question, if one exists. */
export async function getTutorQueue(db: Db, userId: string, opts: TutorQueueOptions): Promise<TutorQueueEntry[]> {
  const limit = Math.max(1, Math.min(20, opts.limit ?? QUESTION_BATCH_SIZE * 2));
  const exclude = new Set((opts.exclude ?? []).filter(id => UUID_RE.test(id)));
  const due = await getStudyCards(db, userId, opts.topicId, Math.min(100, limit + exclude.size));
  const cards = due.filter(c => !exclude.has(c.id)).slice(0, limit);
  if (cards.length === 0) return [];

  // A skip is retried after a week: the reason may have been a passing fault of the writer.
  const idList = sql.join(cards.map(c => sql`${c.id}::uuid`), sql`, `);
  const rows = await db.execute<{ id: string; card_id: string; bloom_level: number; form: string; status: string; payload: QuestionPayload | null }>(sql`
    SELECT cq.id, cq.card_id, cq.bloom_level, cq.form, cq.status, cq.payload
    FROM card_questions cq
    JOIN cards c ON c.id = cq.card_id
    WHERE cq.card_id IN (${idList})
      AND cq.prompt_version = ${QUESTION_PROMPT_VERSION}
      AND cq.used_at IS NULL
      AND (cq.status = 'ready' OR cq.created_at > NOW() - INTERVAL '7 days')
      AND cq.card_updated_at = c.updated_at
      AND cq.original_id IS NOT DISTINCT FROM c.current_original_id
    ORDER BY cq.created_at DESC
  `);

  const topics = await loadTopicRates(db, userId);
  return cards.map(card => {
    const form = pickQuestionForm({
      difficulty: opts.difficulty,
      level: card.bloomState.currentLevel,
      isCloze: card.noteTypeKind === "cloze" || card.cardType === "cloze",
      answerBy: opts.answerBy,
    });
    const row = rows.rows.find(r => r.card_id === card.id && r.bloom_level === card.bloomState.currentLevel && r.form === form);
    return {
      card,
      form,
      topicName: topics.get(card.topicId)?.name ?? "",
      stored: row ? { id: row.id, status: row.status === "skipped" ? "skipped" : "ready", payload: row.payload } : null,
    };
  });
}

/** What the question writer needs to know about one card. */
export function toQuestionRequest(entry: TutorQueueEntry, difficulty: number): QuestionRequest {
  const { card } = entry;
  return {
    cardId: card.id,
    form: entry.form,
    bloomLevel: card.bloomState.currentLevel,
    difficulty,
    changeRate: card.changeRate,
    topicName: entry.topicName,
    concept: card.concept,
    frontText: stripHtml(card.frontHtml).slice(0, 1200),
    backText: stripHtml(card.backHtml).slice(0, 2400),
    isCloze: card.noteTypeKind === "cloze" || card.cardType === "cloze",
    hasImages: /<img[\s>]/i.test(card.frontHtml + card.backHtml),
    original: card.original
      ? {
          question: card.original.questionText,
          expectedAnswer: card.original.expectedAnswer,
          options: card.original.options?.map(o => `${o.text}${o.correct ? " (correct)" : ""}`) ?? null,
        }
      : null,
    recentQuestions: card.reviews.slice(0, 3).map(r => r.questionText.slice(0, 300)),
  };
}

// ---------------------------------------------------------------------------
// Storing what the model wrote
// ---------------------------------------------------------------------------

export interface WrittenQuestion {
  card_id: string;
  status: string;
  skip_reason?: string;
  [field: string]: unknown;
}

/**
 * Stores one batch. An entry that fails validation is stored as skipped, so the
 * card is shown as it is instead of being sent to the model again and again.
 */
export async function storeQuestions(db: Db, userId: string, requests: QuestionRequest[], written: WrittenQuestion[], model: string) {
  let ready = 0, skipped = 0;
  for (const request of requests) {
    const item = written.find(w => w.card_id === request.cardId);
    let payload: QuestionPayload | null = null;
    let skipReason: string | null = null;
    if (!item) {
      skipReason = "The model returned no question for this card";
    } else if (item.status === "skipped") {
      skipReason = (typeof item.skip_reason === "string" && item.skip_reason.trim()) || "Skipped by the model";
    } else {
      try {
        payload = validateQuestionPayload(request.form, item);
      } catch (err) {
        skipReason = `Invalid question: ${(err as Error).message}`;
      }
    }

    const inserted = await db.execute<{ id: string }>(sql`
      WITH stale AS (
        DELETE FROM card_questions
        WHERE card_id = ${request.cardId} AND used_at IS NULL AND bloom_level = ${request.bloomLevel} AND form = ${request.form}
      )
      INSERT INTO card_questions
        (card_id, bloom_level, form, prompt_version, status, payload, skip_reason, difficulty, model, original_id, card_updated_at)
      SELECT c.id, ${request.bloomLevel}, ${request.form}, ${QUESTION_PROMPT_VERSION}, ${payload ? "ready" : "skipped"},
             ${payload ? JSON.stringify(payload) : null}::jsonb, ${skipReason ? skipReason.slice(0, 300) : null},
             ${request.difficulty}, ${model}, c.current_original_id, c.updated_at
      FROM cards c
      JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
      WHERE c.id = ${request.cardId}
      RETURNING id
    `);
    if (inserted.rows.length === 0) continue;
    if (payload) ready++; else skipped++;
  }
  return { ready, skipped };
}

// ---------------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------------

export interface TutorQuestion {
  type: "question";
  questionId: string;
  cardId: string;
  topicId: string;
  concept: string;
  bloomLevel: number;
  form: QuestionForm;
  payload: QuestionPayload;
  backHtml: string;
}
export interface TutorPlainCard { type: "card"; card: StudyCard }
export type TutorItem = TutorQuestion | TutorPlainCard;

export interface ServeTutorOptions extends Omit<TutorQueueOptions, "difficulty"> {
  sessionId: string;
  /** Serve cards without a question as they are, instead of leaving them for the writer. */
  serveUnwritten?: boolean;
}

/**
 * The next items of a session: stored questions with a ticket each, cards the
 * writer skipped as plain cards, and the cards still waiting for a question.
 */
export async function serveTutorBatch(db: Db, userId: string, opts: ServeTutorOptions) {
  const session = await getSession(db, userId, opts.sessionId);
  const queue = await getTutorQueue(db, userId, { ...opts, difficulty: session.sessionDifficulty });

  const items: TutorItem[] = [];
  const unwritten: TutorQueueEntry[] = [];
  for (const entry of queue) {
    const { card, stored } = entry;
    if (!stored) {
      if (opts.serveUnwritten) items.push({ type: "card", card });
      else unwritten.push(entry);
      continue;
    }
    if (stored.status === "skipped" || !stored.payload) {
      items.push({ type: "card", card });
      continue;
    }
    const ticket = await db.execute<{ id: string }>(sql`
      INSERT INTO study_questions (session_id, card_id, original_id, card_level, change_rate, rate_source, last_review_at_serve, card_question_id)
      SELECT ${session.id}::uuid, c.id, c.current_original_id, ${card.bloomState.currentLevel}, ${card.changeRate}, ${card.rateSource}, fs.last_review, ${stored.id}::uuid
      FROM cards c JOIN fsrs_state fs ON fs.card_id = c.id
      WHERE c.id = ${card.id}
      RETURNING id
    `);
    items.push({
      type: "question",
      questionId: ticket.rows[0].id,
      cardId: card.id,
      topicId: card.topicId,
      concept: card.concept,
      bloomLevel: card.bloomState.currentLevel,
      form: entry.form,
      payload: stored.payload,
      backHtml: card.backHtml,
    });
  }
  if (items.length > 0) await db.execute(sql`UPDATE study_sessions SET last_activity = NOW() WHERE id = ${session.id}`);

  const summary = await getStudySummary(db, userId, opts.topicId);
  return { session, items, unwritten, remaining: summary.dueCount + summary.newCount };
}

// ---------------------------------------------------------------------------
// Answering
// ---------------------------------------------------------------------------

export interface TutorAnswerInput {
  question_id: string;
  /** Choice: the option letters picked. */
  selected?: string[];
  /** Gap: what the learner typed or dictated. */
  text?: string;
  dont_know?: boolean;
  /** The rating the learner tapped, when it differs from the suggested one. */
  rating?: number;
  /** Open: the caller's grading of `text`. Never taken from the client. */
  openCorrectness?: number;
}

/** The question behind a ticket, for grading an open answer and for the follow-up thread. */
export async function getAnswerContext(db: Db, userId: string, questionId: string): Promise<AnswerContext & { form: QuestionForm; cardId: string }> {
  if (!UUID_RE.test(questionId ?? "")) throw new ValidationError("question_id must be a UUID");
  const rows = await db.execute<{ card_id: string; card_level: number; form: QuestionForm; payload: QuestionPayload; concept: string; back_html: string; topic_name: string }>(sql`
    SELECT sq.card_id, sq.card_level, cq.form, cq.payload, c.concept, c.back_html, t.name AS topic_name
    FROM study_questions sq
    JOIN study_sessions ss ON ss.id = sq.session_id AND ss.user_id = ${userId}
    JOIN card_questions cq ON cq.id = sq.card_question_id AND cq.status = 'ready'
    JOIN cards c ON c.id = sq.card_id
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    WHERE sq.id = ${questionId}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Question ticket not found");
  const r = rows.rows[0];
  const open = r.form === "open" ? (r.payload as OpenPayload) : null;
  return {
    form: r.form,
    cardId: r.card_id,
    bloomLevel: r.card_level,
    topicName: r.topic_name,
    concept: r.concept,
    backText: stripHtml(r.back_html).slice(0, 2400),
    stem: r.payload.stem,
    modelAnswer: open?.answer ?? "",
    keyPoints: open?.keyPoints ?? [],
  };
}

/** Grades a stored question from its ticket and writes the review. The server decides correctness. */
export async function submitTutorAnswer(db: Db, userId: string, input: TutorAnswerInput) {
  if (!UUID_RE.test(input.question_id ?? "")) throw new ValidationError("question_id must be a UUID");
  if (input.rating !== undefined && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 4)) {
    throw new ValidationError("rating must be between 1 and 4");
  }

  const rows = await db.execute<{ card_id: string; card_level: number; cq_id: string; form: QuestionForm; payload: QuestionPayload }>(sql`
    SELECT sq.card_id, sq.card_level, cq.id AS cq_id, cq.form, cq.payload
    FROM study_questions sq
    JOIN study_sessions ss ON ss.id = sq.session_id AND ss.user_id = ${userId}
    JOIN card_questions cq ON cq.id = sq.card_question_id AND cq.status = 'ready'
    WHERE sq.id = ${input.question_id}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Question ticket not found");
  const q = rows.rows[0];
  const dontKnow = !!input.dont_know;

  const common = {
    question_id: input.question_id,
    card_id: q.card_id,
    bloom_level: q.card_level,
    rating_override: input.rating,
  };
  let result: Awaited<ReturnType<typeof submitReview>>;
  let correctness: number;

  if (q.form === "choice") {
    const payload = q.payload as ChoicePayload;
    const letters = OPTION_LETTERS.slice(0, payload.options.length) as readonly string[];
    const correctIds = letters.filter((_, i) => payload.options[i].correct);
    const selected = dontKnow ? [] : [...new Set((input.selected ?? []).map(s => String(s).toUpperCase()))];
    if (selected.some(s => !letters.includes(s))) throw new ValidationError("selected must contain option letters A to D");
    if (!dontKnow && selected.length === 0) throw new ValidationError("selected must not be empty unless dont_know is set");
    const style = correctIds.length > 1 ? "multiple" : "single";
    const label = (id: string) => `${id}) ${payload.options[letters.indexOf(id)].text}`;
    correctness = gradeChoice(style, correctIds, selected);
    result = await submitReview(db, userId, {
      ...common,
      style,
      correct_option_ids: correctIds,
      selected_option_ids: selected,
      question_text: `${payload.stem} ${letters.map(label).join(" ")}`,
      answer_expected: correctIds.map(label).join(", "),
      user_answer: dontKnow ? "I don't know" : selected.map(label).join(", "),
    });
  } else if (q.form === "open") {
    const payload = q.payload as OpenPayload;
    const text = dontKnow ? "" : (input.text ?? "").trim().slice(0, 4000);
    if (!dontKnow && !text) throw new ValidationError("text must not be empty unless dont_know is set");
    if (!dontKnow && input.openCorrectness === undefined) throw new ValidationError("An open answer has to be graded before it is saved");
    correctness = dontKnow ? 0 : input.openCorrectness!;
    result = await submitReview(db, userId, {
      ...common,
      style: "open",
      correctness,
      question_text: payload.stem,
      answer_expected: payload.answer,
      user_answer: dontKnow ? "I don't know" : text,
    });
  } else {
    const payload = q.payload as GapPayload;
    const text = dontKnow ? "" : (input.text ?? "").trim().slice(0, 300);
    if (!dontKnow && !text) throw new ValidationError("text must not be empty unless dont_know is set");
    correctness = gradeGap(payload, text);
    result = await submitReview(db, userId, {
      ...common,
      style: "open",
      correctness,
      server_graded: true,
      question_text: payload.stem.replace(GAP_MARK, "[...]"),
      answer_expected: payload.answer,
      user_answer: dontKnow ? "I don't know" : text,
    });
  }

  await db.execute(sql`UPDATE card_questions SET used_at = NOW() WHERE id = ${q.cq_id} AND used_at IS NULL`);
  return { ...result, correctness, suggestedRating: ratingFromCorrectness(correctness) };
}

/** How many of the next due cards already have a question; the start screen shows it. */
export async function countReadyQuestions(db: Db, userId: string, opts: TutorQueueOptions): Promise<{ ready: number; unwritten: number }> {
  validateDifficulty(opts.difficulty);
  const queue = await getTutorQueue(db, userId, opts);
  const ready = queue.filter(e => e.stored).length;
  return { ready, unwritten: queue.length - ready };
}
