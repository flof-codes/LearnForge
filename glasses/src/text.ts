/**
 * Text layout for the G2 display.
 *
 * The glasses render one fixed firmware font into a 576×288 canvas. There is no
 * font-size control, so the only layout tool is the line break. The numbers here
 * are the conservative end of the community measurements (~50–60 characters per
 * line, ~400–500 per screen) and match the server-side caps in
 * core/src/services/glasses-service.ts, so a compiled question always fits.
 */

/**
 * Measured on the device 2026-09-22: 48 broke lines well before the edge. The
 * firmware wraps overflow itself, so a value slightly too high costs one extra
 * wrapped line rather than lost text. Must stay >= GLASSES_CAPS.cols in core,
 * which validates stems against 48 columns.
 */
export const COLS = 58;
/**
 * 8, not 10: the event-capture container scrolls natively on swipe as soon as
 * its content is taller than the box, and with border and padding ten lines
 * overflow. Content that never overflows cannot scroll, so the cursor moves
 * without the whole text jumping.
 */
export const ROWS = 8;

/** Greedy word wrap. Words longer than the width are cut, never dropped. */
export function wrap(text: string, width: number = COLS): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      if (word.length > width) {
        if (line) { lines.push(line); line = ""; }
        for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= width) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line || words.length === 0) lines.push(line);
  }
  return lines;
}

/** Wraps and truncates to `maxLines`, marking the cut with an ellipsis in ASCII. */
export function clampLines(text: string, maxLines: number, width: number = COLS): string[] {
  const lines = wrap(text, width);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = last.length > width - 3 ? `${last.slice(0, width - 3)}...` : `${last}...`;
  return kept;
}

/** Cuts a single-line string to `width`, ASCII ellipsis when it overflows. */
export function fitLine(text: string, width: number = COLS): string {
  if (text.length <= width) return text;
  return `${text.slice(0, Math.max(0, width - 3))}...`;
}

/** Pads the right side so a highlighted cursor row spans the same width every time. */
export function padRight(text: string, width: number = COLS): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

/** Joins lines and keeps the whole screen inside the row budget. */
export function screen(lines: string[], rows: number = ROWS): string {
  return lines.slice(0, rows).join("\n");
}

/** Splits text into pages of `rows` wrapped lines each; never returns an empty list. */
export function paginate(text: string, width: number, rows: number): string[][] {
  const lines = wrap(text, width);
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += rows) pages.push(lines.slice(i, i + rows));
  return pages.length ? pages : [[""]];
}
