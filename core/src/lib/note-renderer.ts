import { stripHtml } from "./strip-html.js";
import { ValidationError } from "./errors.js";

/**
 * Renders Anki-style card templates.
 *
 * Supported: `{{Field}}`, `{{#Field}}…{{/Field}}`, `{{^Field}}…{{/Field}}`,
 * `{{#cN}}…{{/cN}}` (true for the card's cloze number), `{{FrontSide}}` (back
 * only), `{{cloze:Field}}`, `{{hint:Field}}`, `{{type:Field}}` (an input, never
 * the answer), `{{type:cloze:Field}}`, `{{Tags}}`, `{{Deck}}`. Unknown filters
 * (`text:`, `furigana:`, `tts …`) fall back to the plain field. Field values are
 * HTML and are not escaped; the sandboxed iframe is the trust boundary.
 */

export const RENDERER_VERSION = 1;

/** Budgets: a field longer than this, deeper cloze nesting or more gaps is refused, not rendered. */
export const MAX_FIELD_LENGTH = 20_000;
export const MAX_CLOZE_DEPTH = 4;
export const MAX_CLOZE_SPANS = 200;

export interface RenderContext {
  /** Field values keyed by field NAME (the template addresses names). */
  fields: Record<string, string>;
  /** Cloze cards: the gap number this card hides; 0 on standard cards. */
  clozeNumber: number;
  tags: string[];
  deck: string;
  /** 1-based template ordinal, for Anki's `.card1` CSS class. */
  templateOrd: number;
}

export interface RenderResult {
  frontHtml: string;
  backHtml: string;
  /** True when no field contributed content to the front, so the card should not exist (Anki's empty-card rule). */
  frontIsEmpty: boolean;
}

export interface ClozeSpan {
  number: number;
  answer: string;
  hint: string | null;
  start: number;
  end: number;
}

/**
 * Finds `{{cN::answer::hint}}` spans with nesting support: the answer may itself
 * contain further cloze markers.
 */
export function findClozeSpans(text: string, depth = 0): ClozeSpan[] {
  if (depth > MAX_CLOZE_DEPTH) throw new ValidationError(`Cloze gaps nest deeper than ${MAX_CLOZE_DEPTH} levels`);
  if (text.length > MAX_FIELD_LENGTH) throw new ValidationError(`A field must be at most ${MAX_FIELD_LENGTH} characters`);
  const spans: ClozeSpan[] = [];
  const open = /\{\{c(\d+)::/g;
  let m: RegExpExecArray | null;
  while ((m = open.exec(text)) !== null) {
    const number = parseInt(m[1], 10);
    let depth = 1;
    let i = m.index + m[0].length;
    let end = -1;
    while (i < text.length) {
      if (text.startsWith("{{", i)) { depth++; i += 2; continue; }
      if (text.startsWith("}}", i)) { depth--; if (depth === 0) { end = i; break; } i += 2; continue; }
      i++;
    }
    if (end < 0) break; // unterminated: leave the rest literal
    const inner = text.slice(m.index + m[0].length, end);
    // The hint is the last top-level "::" of the inner text.
    let hint: string | null = null;
    let answer = inner;
    let d = 0;
    for (let k = inner.length - 2; k >= 0; k--) {
      if (inner.startsWith("}}", k)) d++;
      else if (inner.startsWith("{{", k)) d--;
      else if (d === 0 && inner.startsWith("::", k)) { answer = inner.slice(0, k); hint = inner.slice(k + 2); break; }
    }
    spans.push({ number, answer, hint, start: m.index, end: end + 2 });
    if (spans.length > MAX_CLOZE_SPANS) throw new ValidationError(`A field must have at most ${MAX_CLOZE_SPANS} cloze gaps`);
    open.lastIndex = end + 2;
  }
  return spans;
}

/** The field with every cloze marker replaced by its answer, for concepts and search text. */
export function plainClozeText(text: string, depth = 0): string {
  const spans = findClozeSpans(text, depth);
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const s of spans) {
    out += text.slice(cursor, s.start) + plainClozeText(s.answer, depth + 1);
    cursor = s.end;
  }
  return out + text.slice(cursor);
}

/** Distinct cloze numbers in a field, ascending. */
export function clozeNumbersIn(text: string): number[] {
  const numbers = new Set<number>();
  const walk = (t: string, depth: number) => {
    for (const s of findClozeSpans(t, depth)) { numbers.add(s.number); walk(s.answer, depth + 1); }
  };
  walk(text, 0);
  return [...numbers].filter(n => n >= 1).sort((a, b) => a - b);
}

/** Renders a cloze field for one gap number; `back` reveals the active gap. */
export function renderClozeField(text: string, active: number, back: boolean): { html: string; hasActive: boolean } {
  let hasActive = false;
  const render = (t: string, depth = 0): string => {
    const spans = findClozeSpans(t, depth);
    if (spans.length === 0) return t;
    let out = "";
    let cursor = 0;
    for (const s of spans) {
      out += t.slice(cursor, s.start);
      const answer = render(s.answer, depth + 1);
      if (s.number === active) {
        hasActive = true;
        out += back
          ? `<span class="cloze">${answer}</span>`
          : `<span class="cloze">[${s.hint ? render(s.hint, depth + 1) : "..."}]</span>`;
      } else {
        out += `<span class="cloze-inactive">${answer}</span>`;
      }
      cursor = s.end;
    }
    return out + t.slice(cursor);
  };
  const html = render(text);
  return { html, hasActive };
}

const isBlank = (html: string) => stripHtml(html).trim().length === 0;

interface Pass {
  ctx: RenderContext;
  back: boolean;
  frontSide: string;
  /** Set when a field with content (or the active cloze) was rendered. */
  contributed: boolean;
}

function conditionTrue(name: string, p: Pass): boolean {
  const cm = /^c(\d+)$/.exec(name);
  if (cm) return parseInt(cm[1], 10) === p.ctx.clozeNumber;
  if (name === "Tags") return p.ctx.tags.length > 0;
  if (name === "Deck") return p.ctx.deck.length > 0;
  const v = p.ctx.fields[name];
  return v !== undefined && !isBlank(v);
}

/** Resolves `{{#X}}…{{/X}}` and `{{^X}}…{{/X}}`, innermost first, until none are left. */
function resolveConditionals(tpl: string, p: Pass): string {
  const re = /\{\{([#^])([^}]+?)\}\}((?:(?!\{\{[#^][^}]+?\}\})[\s\S])*?)\{\{\/\2\}\}/;
  let out = tpl;
  for (let guard = 0; guard < 200; guard++) {
    const m = re.exec(out);
    if (!m) break;
    const [whole, kind, name, body] = m;
    const show = kind === "#" ? conditionTrue(name.trim(), p) : !conditionTrue(name.trim(), p);
    out = out.slice(0, m.index) + (show ? body : "") + out.slice(m.index + whole.length);
  }
  return out;
}

function renderReplacement(spec: string, p: Pass): string {
  const parts = spec.split(":").map(s => s.trim());
  const name = parts[parts.length - 1];
  const filters = parts.slice(0, -1).map(f => f.toLowerCase());

  if (name === "FrontSide") return p.back ? p.frontSide : "";
  if (name === "Tags") return p.ctx.tags.join(" ");
  if (name === "Deck" || name === "Subdeck") return p.ctx.deck;
  if (name === "Card") return `Card ${p.ctx.templateOrd}`;

  const raw = p.ctx.fields[name];
  if (raw === undefined) return "";
  let value = raw;

  if (filters.includes("cloze")) {
    const r = renderClozeField(raw, p.ctx.clozeNumber, p.back);
    value = r.html;
    if (r.hasActive) p.contributed = true;
    if (filters.includes("type")) {
      return p.back ? value : `${value}<br><input class="typeans" type="text" placeholder="…">`;
    }
    return value;
  }
  if (filters.includes("type")) {
    // Never the answer on the front; the back shows it plainly.
    if (!isBlank(raw)) p.contributed = true;
    return p.back ? value : `<input class="typeans" type="text" placeholder="…">`;
  }
  if (!isBlank(raw)) p.contributed = true;
  if (filters.includes("hint")) {
    if (isBlank(raw)) return "";
    return `<details class="hint"><summary>${name}</summary>${value}</details>`;
  }
  // text:, furigana:, kana:, tts … fall back to the plain field.
  return value;
}

function renderSide(tpl: string, p: Pass): string {
  const withConditionals = resolveConditionals(tpl, p);
  return withConditionals.replace(/\{\{([^{}#^/][^{}]*)\}\}/g, (_, spec: string) => renderReplacement(spec, p));
}

export function renderCardTemplate(front: string, back: string, css: string, ctx: RenderContext): RenderResult {
  const wrap = (body: string) =>
    `${css.trim() ? `<style>\n${css}\n</style>\n` : ""}<div class="card card${ctx.templateOrd}">\n${body}\n</div>`;

  const frontPass: Pass = { ctx, back: false, frontSide: "", contributed: false };
  const frontBody = renderSide(front, frontPass);
  const backPass: Pass = { ctx, back: true, frontSide: frontBody, contributed: false };
  const backBody = renderSide(back, backPass);

  return {
    frontHtml: wrap(frontBody),
    backHtml: wrap(backBody),
    frontIsEmpty: !frontPass.contributed,
  };
}
