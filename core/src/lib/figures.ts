import { stripHtml } from "./strip-html.js";

/**
 * Figures: pictures that carry part of a card's answer. The built-in note
 * types hold them in two optional fields, as HTML (an inline `<svg>` drawn in
 * `currentColor`, or `<img src="/images/<id>">`). "Figure" shows on the back
 * below the answer; "Front figure" shows on the front below the question,
 * with the parts the question asks for hidden.
 */

export const FIGURE_FIELD = "Figure";
export const FRONT_FIGURE_FIELD = "Front figure";

export interface CardFigures {
  /** The full figure, shown after the answer. */
  figure: string | null;
  /** The figure with parts hidden, shown with the question. */
  frontFigure: string | null;
}

// Anki's empty-field rule, as in lib/note-renderer.ts, so a figure counts exactly when the template shows it.
const BLANK = /^(?:\s|<\/?(?:br|div)\s*\/?>)*$/i;
const PICTURE = /<(?:img|svg)[\s>]/i;
const SVG_BLOCK = /<svg[\s>][\s\S]*?<\/svg\s*>/gi;

/** The figure fields of a note, by field name; empty ones are null. */
export function figuresOf(fieldDefs: Array<{ key: string; name: string }>, fields: Record<string, string>): CardFigures {
  const value = (name: string) => {
    const def = fieldDefs.find(f => f.name === name);
    const v = def ? fields[def.key] ?? "" : "";
    return BLANK.test(v) ? null : v;
  };
  return { figure: value(FIGURE_FIELD), frontFigure: value(FRONT_FIGURE_FIELD) };
}

/** The card's HTML with its figure fields cut out, as the templates inserted them verbatim. */
export function withoutFigures(html: string, figures: CardFigures): string {
  let out = html;
  for (const f of [figures.figure, figures.frontFigure]) if (f) out = out.split(f).join(" ");
  return out;
}

/** Plain text of card HTML for a model: inline SVG is drawing, not text, so its labels stay out. */
export function questionText(html: string): string {
  return stripHtml(html.replace(SVG_BLOCK, " "));
}

/** Text labels of an SVG figure, so the question writer knows what it shows. */
export function figureLabels(figure: string | null): string {
  if (!figure) return "";
  const labels = [...figure.matchAll(/<text[\s>][\s\S]*?<\/text\s*>/gi)].map(m => stripHtml(m[0]));
  const alts = [...figure.matchAll(/\balt\s*=\s*"([^"]*)"/gi)].map(m => m[1]);
  return [...labels, ...alts].filter(Boolean).join(" · ").slice(0, 600);
}

export function hasPictures(html: string): boolean {
  return PICTURE.test(html);
}

/**
 * A card whose front is nothing but a picture (image occlusion, a bare
 * diagram): no text question can be written from it, so the tutor shows the
 * card itself.
 */
export function isPictureOnly(frontHtml: string, figures: CardFigures, builtinKey: string | null): boolean {
  // The image-occlusion type (built on a parallel branch) is a picture by definition.
  if (builtinKey === "occlusion") return true;
  const front = withoutFigures(frontHtml, figures);
  return questionText(front) === "" && (hasPictures(front) || !!figures.frontFigure);
}
