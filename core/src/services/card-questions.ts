import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError, ValidationError, StaleTicketError } from "../lib/errors.js";
import { stripHtml } from "../lib/strip-html.js";
import { loadTopicRates } from "./change-rate.js";
import { getStudyCards, getStudySummary } from "./study-service.js";
import { getSession } from "./session-service.js";
import { submitReview, gradeChoice } from "./review-service.js";
import { ratingFromCorrectness } from "./bloom.js";
import type { QuestionRequest, AnswerContext } from "../lib/question-prompt.js";
import {
  OPTION_LETTERS, GAP_MARK, pickQuestionForm, difficultyBand, difficultyBandRange, validateQuestionPayload, gradeGap,
  type QuestionForm, type AnswerMode, type QuestionPayload, type ChoicePayload, type GapPayload, type OpenPayload,
} from "./question-forms.js";

export * from "./question-forms.js";

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (opts.topicId !== undefined && !UUID_RE.test(opts.topicId)) throw new ValidationError("topic_id must be a UUID");
  if (opts.limit !== undefined && !Number.isInteger(opts.limit)) throw new ValidationError("limit must be a whole number");
  const limit = Math.max(1, Math.min(20, opts.limit ?? QUESTION_BATCH_SIZE * 2));
  const exclude = new Set((opts.exclude ?? []).filter(id => UUID_RE.test(id)));
  const due = await getStudyCards(db, userId, opts.topicId, Math.min(100, limit + exclude.size));
  const cards = due.filter(c => !exclude.has(c.id)).slice(0, limit);
  if (cards.length === 0) return [];

  // A skip is retried after a week: the reason may have been a passing fault of the writer.
  const idList = sql.join(cards.map(c => sql`${c.id}::uuid`), sql`, `);
  const rows = await db.execute<{ id: string; card_id: string; bloom_level: number; form: string; status: string; difficulty: number; payload: QuestionPayload | null }>(sql`
    SELECT cq.id, cq.card_id, cq.bloom_level, cq.form, cq.status, cq.difficulty, cq.payload
    FROM card_questions cq
    JOIN cards c ON c.id = cq.card_id
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    WHERE cq.card_id IN (${idList})
      AND cq.prompt_version = ${QUESTION_PROMPT_VERSION}
      AND cq.used_at IS NULL
      AND (cq.status = 'ready' OR cq.created_at > NOW() - INTERVAL '7 days')
      AND cq.card_updated_at = c.updated_at
      AND cq.original_id IS NOT DISTINCT FROM c.current_original_id
    ORDER BY cq.created_at DESC
  `);

  const topics = await loadTopicRates(db, userId);
  const band = difficultyBand(opts.difficulty);
  return cards.map(card => {
    const form = pickQuestionForm({
      difficulty: opts.difficulty,
      level: card.bloomState.currentLevel,
      isCloze: card.noteTypeKind === "cloze" || card.cardType === "cloze",
      answerBy: opts.answerBy,
    });
    const row = rows.rows.find(r => r.card_id === card.id && r.bloom_level === card.bloomState.currentLevel && r.form === form && difficultyBand(r.difficulty) === band);
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

    const [from, below] = difficultyBandRange(request.difficulty);
    const inserted = await db.execute<{ id: string }>(sql`
      WITH stale AS (
        DELETE FROM card_questions cq
        USING cards c, topics t
        WHERE cq.card_id = c.id AND t.id = c.topic_id AND t.user_id = ${userId}
          AND cq.card_id = ${request.cardId} AND cq.used_at IS NULL AND cq.bloom_level = ${request.bloomLevel} AND cq.form = ${request.form}
          AND cq.difficulty >= ${from} AND cq.difficulty < ${below}
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
  frontHtml: string;
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
  if (!UUID_RE.test(opts.sessionId ?? "")) throw new ValidationError("session_id must be a UUID");
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
      frontHtml: card.frontHtml,
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
    LEFT JOIN card_questions cq ON cq.id = sq.card_question_id AND cq.status = 'ready'
    JOIN cards c ON c.id = sq.card_id
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    WHERE sq.id = ${questionId}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Question ticket not found");
  const r = rows.rows[0];
  if (!r.payload) throw new StaleTicketError("The question behind this ticket was replaced");
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
    LEFT JOIN card_questions cq ON cq.id = sq.card_question_id AND cq.status = 'ready'
    WHERE sq.id = ${input.question_id}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Question ticket not found");
  const q = rows.rows[0];
  if (!q.cq_id) throw new StaleTicketError("The question behind this ticket was replaced");
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

/**
 * Which of the items a client still holds can be answered: tickets nobody has
 * answered since, whose question is still there, and plain cards that are
 * still due. A second device that studied in the meantime makes the rest stale.
 */
export async function checkTutorItems(db: Db, userId: string, input: { questionIds: string[]; cardIds: string[] }) {
  const questionIds = [...new Set(input.questionIds)].filter(id => UUID_RE.test(id)).slice(0, 50);
  const cardIds = [...new Set(input.cardIds)].filter(id => UUID_RE.test(id)).slice(0, 50);
  const list = (ids: string[]) => sql.join(ids.map(id => sql`${id}::uuid`), sql`, `);

  const questions = questionIds.length === 0 ? [] : (await db.execute<{ id: string }>(sql`
    SELECT sq.id
    FROM study_questions sq
    JOIN study_sessions ss ON ss.id = sq.session_id AND ss.user_id = ${userId}
    JOIN card_questions cq ON cq.id = sq.card_question_id AND cq.status = 'ready' AND cq.used_at IS NULL
    JOIN fsrs_state fs ON fs.card_id = sq.card_id
    WHERE sq.id IN (${list(questionIds)})
      AND fs.last_review IS NOT DISTINCT FROM sq.last_review_at_serve
      AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.question_id = sq.id)
  `)).rows.map(r => r.id);

  const cards = cardIds.length === 0 ? [] : (await db.execute<{ id: string }>(sql`
    SELECT c.id
    FROM cards c
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    JOIN fsrs_state fs ON fs.card_id = c.id
    WHERE c.id IN (${list(cardIds)}) AND fs.due <= NOW()
  `)).rows.map(r => r.id);

  return { questions, cards };
}
