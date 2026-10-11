import { ValidationError } from "../lib/errors.js";

/**
 * The forms a stored question can take, which one a card is asked in, and the
 * checks on what the model wrote. No database here: services/card-questions.ts
 * stores, serves and grades.
 */

export type QuestionForm = "choice" | "gap" | "open";
export type AnswerMode = "tap" | "type" | "dictate";
const ANSWER_MODES: readonly AnswerMode[] = ["tap", "type", "dictate"];
export const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
export const GAP_MARK = "{{gap}}";

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

/** Wrong options are written for a band of the session difficulty; a question is served only inside its band. */
export function difficultyBand(difficulty: number): "commute" | "desk" | "deep" {
  return difficulty < 0.5 ? "commute" : difficulty < 0.85 ? "desk" : "deep";
}

/** The band a difficulty falls in, as [from, below). */
export function difficultyBandRange(difficulty: number): [number, number] {
  return difficulty < 0.5 ? [0, 0.5] : difficulty < 0.85 ? [0.5, 0.85] : [0.85, 1.01];
}

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
