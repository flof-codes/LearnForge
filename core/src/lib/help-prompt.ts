import { ValidationError } from "./errors.js";

/**
 * Help the learner asks for while answering: a short definition of words they
 * marked, and a tutorial with diagrams, either for a term or for everything a
 * question needs. The prompts and the checks on what the model returns live
 * here; services/study-help.ts stores and serves. Bump HELP_PROMPT_VERSION
 * when the rules below change.
 */

export const HELP_PROMPT_VERSION = 1;

/** What the model knows about the question in front of the learner. Option texts come without their correctness. */
export interface HelpContext {
  bloomLevel: number;
  topicName: string;
  concept: string;
  backText: string;
  stem: string;
  options: string[];
}

export const DEFINE_SYSTEM_PROMPT = `You are the LearnForge tutor. A learner studying a card marked some words in a question and wants to know what they mean. You receive the card, the question and the marked words.

Write a definition of one or two sentences, at most 300 characters, in the language of the card, as the words are meant in this card's subject. If the marked words are not a term (a fragment, a whole sentence), explain what they mean here instead.

Never give away the answer to the question: do not say which option is right, and do not define the words in a way that answers the question for the learner. Plain text, no markdown, no LaTeX; Unicode symbols are fine.`;

export function buildDefinePrompt(ctx: HelpContext, term: string): string {
  return JSON.stringify({ topic: ctx.topicName, concept: ctx.concept, cardBack: ctx.backText, question: ctx.stem, markedWords: term }, null, 2);
}

export const TUTORIAL_SYSTEM_PROMPT = `You are the LearnForge tutor. A learner is stuck on a study question and asks for a short tutorial. You receive the card, the question, its options (without saying which is right), and the subject: either one term the learner marked, or the whole question.

## What to write
- For a term: two to four steps that build the term up from what the learner likely knows, as it is used in this card.
- For the whole question: every concept the learner needs to answer it, one step per concept, three to six steps, in the order they build on each other. Cover the concepts the options use as well.
- Never say which option is right, never rule an option out by name, and never answer the question. Explain the concepts; the learner then answers on their own.

## Concept map
- concepts: the concepts the steps explain, each with a short id (a-z, digits) and a label of one to three words. For a term, the map may be empty.
- links: how the concepts connect, from → to. effect "leads" (causes, is part of, comes before), "raises" (more of from gives more of to), "lowers" (more of from gives less of to). Only links the card supports.
- Every step names the concept it explains in concept, by id; an empty string when the map is empty.

## Steps
- title: a few words. text: two or three sentences, plain and concrete.
- visual: pick the one diagram that makes the step clearer, or kind "none".
  - "flow": a chain of two to six items with an arrow between each, for a cause and its effects. change marks an item that rises ("up"), falls ("down") or neither ("none").
  - "bars": two to six labelled quantities in one unit, for comparing amounts. Values must be realistic textbook values.
  - "curve": a relationship between two continuous quantities, as three to twelve points sorted by x. The learner moves a slider along x and reads y. marker_x: the x where the slider starts (a typical resting value). Use realistic textbook values, with units in the axis labels.
  - caption: one short sentence on what the diagram shows, or empty.
  Leave the fields of the other kinds empty.

## Language
The language of the card, with its real characters. Plain text only: no markdown, no HTML, no LaTeX. Unicode symbols and subscripts are fine (CO₂, →, ≥).`;

export function buildTutorialPrompt(ctx: HelpContext, term: string | null): string {
  return JSON.stringify({
    subject: term ? { term } : "the whole question",
    bloomLevel: ctx.bloomLevel,
    topic: ctx.topicName,
    concept: ctx.concept,
    cardBack: ctx.backText,
    question: ctx.stem,
    options: ctx.options,
  }, null, 2);
}

// ---------------------------------------------------------------------------
// Tutorials as the app shows them
// ---------------------------------------------------------------------------

export type TutorialVisual =
  | { kind: "flow"; caption: string; items: Array<{ label: string; change: "up" | "down" | "none" }> }
  | { kind: "bars"; caption: string; unit: string; bars: Array<{ label: string; value: number }> }
  | { kind: "curve"; caption: string; xLabel: string; yLabel: string; points: Array<{ x: number; y: number }>; markerX: number };

export interface Tutorial {
  title: string;
  concepts: Array<{ id: string; label: string }>;
  links: Array<{ from: string; to: string; effect: "leads" | "raises" | "lowers" }>;
  steps: Array<{ concept: string; title: string; text: string; visual: TutorialVisual | null }>;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
type Raw = Record<string, unknown>;

function cleanVisual(raw: Raw | undefined): TutorialVisual | null {
  if (!raw) return null;
  const caption = str(raw.caption, 200);
  if (raw.kind === "flow") {
    const items = arr(raw.flow).map(i => i as Raw).map(i => ({
      label: str(i?.label, 60),
      change: (i?.change === "up" || i?.change === "down" ? i.change : "none") as "up" | "down" | "none",
    })).filter(i => i.label).slice(0, 6);
    return items.length >= 2 ? { kind: "flow", caption, items } : null;
  }
  if (raw.kind === "bars") {
    const rows = arr(raw.bars).map(b => b as Raw);
    const bars = rows.map(b => ({ label: str(b?.label, 40), value: num(b?.value) })).filter((b): b is { label: string; value: number } => !!b.label && b.value !== null && b.value >= 0).slice(0, 6);
    return bars.length >= 2 ? { kind: "bars", caption, unit: str(rows[0]?.unit, 16), bars } : null;
  }
  if (raw.kind === "curve") {
    const c = (raw.curve ?? {}) as Raw;
    const seen = new Set<number>();
    const points = arr(c.points).map(p => p as Raw).map(p => ({ x: num(p?.x), y: num(p?.y) }))
      .filter((p): p is { x: number; y: number } => p.x !== null && p.y !== null && !seen.has(p.x) && !!seen.add(p.x))
      .sort((a, b) => a.x - b.x).slice(0, 40);
    if (points.length < 3) return null;
    const lo = points[0].x, hi = points[points.length - 1].x;
    const m = num(c.marker_x);
    return {
      kind: "curve", caption,
      xLabel: str(c.x_label, 40), yLabel: str(c.y_label, 40), points,
      markerX: m !== null && m >= lo && m <= hi ? m : (lo + hi) / 2,
    };
  }
  return null;
}

/** Normalises a tutorial and refuses one with nothing to show. Broken diagrams are dropped, not the step. */
export function validateTutorial(raw: Raw): Tutorial {
  const concepts = arr(raw.concepts).map(c => c as Raw)
    .map(c => ({ id: str(c?.id, 40), label: str(c?.label, 40) }))
    .filter(c => c.id && c.label).slice(0, 8);
  const ids = new Set(concepts.map(c => c.id));
  const links = arr(raw.links).map(l => l as Raw)
    .map(l => ({ from: str(l?.from, 40), to: str(l?.to, 40), effect: (l?.effect === "raises" || l?.effect === "lowers" ? l.effect : "leads") as "leads" | "raises" | "lowers" }))
    .filter(l => ids.has(l.from) && ids.has(l.to) && l.from !== l.to).slice(0, 12);
  const steps = arr(raw.steps).map(s => s as Raw).map(s => ({
    concept: ids.has(str(s?.concept, 40)) ? str(s?.concept, 40) : "",
    title: str(s?.title, 80),
    text: str(s?.text, 700),
    visual: cleanVisual(s?.visual as Raw | undefined),
  })).filter(s => s.title && s.text).slice(0, 6);
  if (steps.length === 0) throw new ValidationError("a tutorial needs at least one step");
  return { title: str(raw.title, 120) || steps[0].title, concepts, links, steps };
}

/** A definition as stored and shown. */
export function validateDefinition(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new ValidationError("the definition is empty");
  return text.slice(0, 500);
}
