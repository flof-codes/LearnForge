import { COLS, ROWS, clampLines, fitLine, padRight, screen } from "./text.js";
import { MODE_ROWS, questionRows, type Question, type State, type View } from "./state.js";

/**
 * Turns a view into the text of the single full-screen container.
 *
 * Markers stay ASCII on purpose: the firmware font drops glyphs it does not
 * have without any error, and ✓ / ✗ have not been measured on the device yet.
 */

const CURSOR = "> ";
const NO_CURSOR = "  ";

function row(active: boolean, text: string): string {
  const line = fitLine((active ? CURSOR : NO_CURSOR) + text, COLS);
  return active ? padRight(line, COLS) : line;
}

function stat(label: string, value: string | number): string {
  return `${label} ${value}`;
}

function renderHome(v: Extract<View, { kind: "home" }>): string {
  const s = v.summary;
  const lines: string[] = [];
  if (s) {
    const streak = `${s.reviewStreak} d`;
    lines.push(fitLine(`${stat("Due", s.dueCount)}   ${stat("New", s.newCount)}   ${stat("Streak", streak)}`));
    lines.push(fitLine(s.accuracy7d === null ? "Accuracy 7 d  -" : `Accuracy 7 d  ${Math.round(s.accuracy7d * 100)}%`));
    const b = s.bloomLevels;
    const lo = (b[0] ?? 0) + (b[1] ?? 0), mid = (b[2] ?? 0) + (b[3] ?? 0), hi = (b[4] ?? 0) + (b[5] ?? 0);
    lines.push(fitLine(`Bloom  0-1: ${lo}  2-3: ${mid}  4-5: ${hi}`));
  } else {
    lines.push("LearnForge", "", "Loading...");
  }
  lines.push("");
  MODE_ROWS.forEach((label, i) => {
    const suffix = i === 2 ? "          (later)" : "";
    lines.push(row(v.cursor === i, label + suffix));
  });
  lines.push("tap = start   .   hold = menu");
  return screen(lines);
}

function optionLabel(q: Question, id: string, selected: string[]): string {
  const text = q.options.find(o => o.id === id)?.text ?? "";
  if (q.mode === "multi") return `[${selected.includes(id) ? "x" : " "}] ${id}  ${text}`;
  return `${id}  ${text}`;
}

function renderQuestion(v: Extract<View, { kind: "question" }>): string {
  const rows = questionRows(v.q);
  const rowCount = rows.length;
  const hint = v.mode === "multi" ? ["Select all that apply."] : [];
  // Everything below the stem is fixed height; the stem takes what is left, at least two lines.
  const stemLines = Math.max(2, ROWS - rowCount - hint.length - 1);
  const lines: string[] = [...clampLines(v.q.stem, stemLines), ...hint];
  if (lines.length < stemLines + hint.length) lines.push("");
  rows.forEach((r, i) => {
    const active = v.cursor === i;
    if (r.kind === "option") lines.push(row(active, optionLabel(v.q, r.id, v.selected)));
    else if (r.kind === "confirm") lines.push(row(active, `->  Confirm${v.selected.length ? ` (${v.selected.length})` : ""}`));
    else lines.push(row(active, v.mode === "multi" ? "?   I don't know" : "?  I don't know"));
  });
  if (lines.length < ROWS) lines.push(v.mode === "multi" ? "tap = toggle" : "tap = answer");
  return screen(lines);
}

function renderResult(v: Extract<View, { kind: "result" }>): string {
  const byId = new Map(v.q.options.map(o => [o.id, o.text]));
  const right = v.q.correctIds.map(id => `${id}  ${byId.get(id) ?? ""}`).join(", ");
  const lines: string[] = [];
  switch (v.outcome) {
    case "correct":
      lines.push(fitLine(`OK   ${right}`));
      break;
    case "partial":
      lines.push(fitLine(`~    You chose ${v.selected.join(", ")}`));
      lines.push(fitLine(`Right: ${right}`));
      break;
    case "wrong":
      lines.push(fitLine(`X    You chose ${v.selected.join(", ")}`));
      lines.push(fitLine(`Right: ${right}`));
      break;
    case "dontknow":
      lines.push(fitLine(`Answer: ${right}`));
      break;
  }
  lines.push("");
  const room = ROWS - lines.length - 2;
  lines.push(...clampLines(v.q.explanation, Math.max(2, room)));
  while (lines.length < ROWS - 1) lines.push("");
  lines.push("tap = next   .   hold = menu");
  return screen(lines);
}

export function render(state: State): string {
  const v = state.view;
  switch (v.kind) {
    case "boot":
      return screen(["LearnForge", "", "Starting..."]);
    case "pair":
      return screen([
        "LearnForge",
        "",
        "Connect this device at",
        "learnforge.eu  >  Settings  >  Glasses",
        "",
        padRight(`Code   ${v.code}`, 20),
        "",
        "Waiting for confirmation...",
      ]);
    case "home":
      return renderHome(v);
    case "preparing":
      return screen(["", `Preparing ${v.mode === "multi" ? "multi" : "single"} choice...`, "", "", "", "", "", "", "hold = menu"]);
    case "empty":
      if (v.compiling) {
        return screen([
          "",
          fitLine(`Compiling ${v.pendingCompile} card${v.pendingCompile === 1 ? "" : "s"} on the server...`),
          "",
          "Claude is writing the questions.",
          "This takes a minute or two; the app",
          "checks back by itself.",
          "",
          "",
          "tap = home   .   hold = menu",
        ]);
      }
      return screen([
        "",
        "Nothing ready on the glasses.",
        "",
        v.pendingCompile > 0
          ? fitLine(`${v.pendingCompile} due card${v.pendingCompile === 1 ? "" : "s"} still need compiling.`)
          : "Nothing due for this mode right now.",
        v.pendingCompile > 0 ? "The compiler did not start; check the api log." : "",
        "",
        "",
        "",
        "tap = home   .   hold = menu",
      ]);
    case "question":
      return renderQuestion(v);
    case "result":
      return renderResult(v);
    case "done":
      return screen([
        "",
        "Done.",
        "",
        fitLine(`${v.reviewed} reviewed, ${v.correct} right.`),
        "",
        "",
        "",
        "",
        "tap = home   .   double tap = exit",
      ]);
    case "error":
      return screen(["", "Something went wrong.", "", ...clampLines(v.message, 4), "", "tap = home"]);
  }
}
