import { ValidationError } from "./errors.js";

export interface ClozeDeletion {
  index: number;
  answer: string;
  hint: string | null;
}

export interface ClozeData {
  deletions: ClozeDeletion[];
  sourceText: string;
}

const CLOZE_REGEX = /\{\{c(\d+)::([^}]*?)(?:::([^}]*?))?\}\}/g;

export function parseClozeText(sourceText: string): ClozeData {
  const deletions: ClozeDeletion[] = [];
  let match: RegExpExecArray | null;

  while ((match = CLOZE_REGEX.exec(sourceText)) !== null) {
    const index = parseInt(match[1], 10);
    const answer = match[2];
    const hint = match[3] ?? null;

    if (index < 1) {
      throw new ValidationError(`Cloze index must be >= 1, got ${index}`);
    }
    if (!answer.trim()) {
      throw new ValidationError(`Cloze c${index} has an empty answer`);
    }

    deletions.push({ index, answer, hint });
  }

  if (deletions.length === 0) {
    throw new ValidationError("No cloze deletions found in source text");
  }

  const seenIndices = new Set<number>();
  for (const d of deletions) {
    if (seenIndices.has(d.index)) {
      throw new ValidationError(`Duplicate cloze index c${d.index}`);
    }
    seenIndices.add(d.index);
  }

  return { deletions, sourceText };
}

export function validateClozeData(data: unknown): data is ClozeData {
  if (typeof data !== "object" || data === null) return false;

  const obj = data as Record<string, unknown>;
  if (typeof obj.sourceText !== "string") return false;
  if (!Array.isArray(obj.deletions) || obj.deletions.length === 0) return false;

  const seenIndices = new Set<number>();
  for (const d of obj.deletions) {
    if (typeof d !== "object" || d === null) return false;
    const del = d as Record<string, unknown>;
    if (typeof del.index !== "number" || del.index < 1) return false;
    if (typeof del.answer !== "string" || !del.answer.trim()) return false;
    if (del.hint !== null && typeof del.hint !== "string") return false;
    if (seenIndices.has(del.index)) return false;
    seenIndices.add(del.index);
  }

  return true;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderClozeHtml(
  clozeData: ClozeData,
  activeIndex?: number,
): { frontHtml: string; backHtml: string } {
  const active = activeIndex ?? 1;
  const deletionsByPosition: { start: number; end: number; deletion: ClozeDeletion }[] = [];

  let match: RegExpExecArray | null;
  CLOZE_REGEX.lastIndex = 0;
  while ((match = CLOZE_REGEX.exec(clozeData.sourceText)) !== null) {
    const index = parseInt(match[1], 10);
    const deletion = clozeData.deletions.find((d) => d.index === index);
    if (deletion) {
      deletionsByPosition.push({
        start: match.index,
        end: match.index + match[0].length,
        deletion,
      });
    }
  }

  let frontText = "";
  let backText = "";
  let cursor = 0;

  for (const { start, end, deletion } of deletionsByPosition) {
    const before = escapeHtml(clozeData.sourceText.slice(cursor, start));
    frontText += before;
    backText += before;

    if (deletion.index === active) {
      const blankLabel = deletion.hint ? escapeHtml(deletion.hint) : "...";
      frontText += `<span class="cloze-blank">[${blankLabel}]</span>`;
      backText += `<mark>${escapeHtml(deletion.answer)}</mark>`;
    } else {
      const revealed = escapeHtml(deletion.answer);
      frontText += revealed;
      backText += revealed;
    }

    cursor = end;
  }

  const trailing = escapeHtml(clozeData.sourceText.slice(cursor));
  frontText += trailing;
  backText += trailing;

  const frontHtml = `<article><p>${frontText}</p></article>`;
  const backHtml = `<article><p>${backText}</p></article>`;

  return { frontHtml, backHtml };
}
