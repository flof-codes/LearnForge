import { ROWS, clampLines, fitLine, screen } from "./text.js";
import { MODE_ROWS, questionRows, type Question, type State, type View } from "./state.js";

/**
 * Turns a view into what the glasses should show.
 *
 * Screens with something to pick use the firmware's native list: it moves the
 * highlight on swipe without the rubber-band bounce a text box shows, and
 * reports the clicked index. Everything else is one text box.
 *
 * Markers stay ASCII on purpose: the firmware font drops glyphs it does not
 * have without any error.
 */

export type Page =
  | { kind: "text"; content: string }
  | { kind: "list"; header: string; items: string[] };

/** Lines the header box above a list can hold. */
export const HEADER_ROWS = 3;

function stat(label: string, value: string | number): string {
  return `${label} ${value}`;
}

function renderHome(v: Extract<View, { kind: "home" }>): Page {
  const s = v.summary;
  const lines: string[] = [];
  if (s) {
    lines.push(fitLine(`${stat("Due", s.dueCount)}   ${stat("New", s.newCount)}   ${stat("Streak", `${s.reviewStreak} d`)}`));
    lines.push(fitLine(s.accuracy7d === null ? "Accuracy 7 d  -" : `Accuracy 7 d  ${Math.round(s.accuracy7d * 100)}%`));
    const b = s.bloomLevels;
    const lo = (b[0] ?? 0) + (b[1] ?? 0), mid = (b[2] ?? 0) + (b[3] ?? 0), hi = (b[4] ?? 0) + (b[5] ?? 0);
    lines.push(fitLine(`Bloom  0-1: ${lo}  2-3: ${mid}  4-5: ${hi}`));
  } else {
    lines.push("LearnForge", "", "Loading...");
  }
  const items = MODE_ROWS.map((label, i) => (i === 2 ? `${label}   (later)` : label));
  return { kind: "list", header: screen(lines, HEADER_ROWS), items };
}

function optionLabel(q: Question, id: string): string {
  return `${id}   ${q.options.find(o => o.id === id)?.text ?? ""}`;
}

function renderQuestion(v: Extract<View, { kind: "question" }>): Page {
  const rows = questionRows(v.q, v.mode);
  const header = clampLines(v.q.stem, v.mode === "multi" ? HEADER_ROWS - 1 : HEADER_ROWS);
  if (v.mode === "multi") {
    // The list items never change while toggling, so the highlight stays put; the header carries the state.
    while (header.length < HEADER_ROWS - 1) header.push("");
    header.push(v.selected.length ? fitLine(`Selected: ${[...v.selected].sort().join(", ")}   -> Confirm`) : "Select all that apply, then Confirm.");
  }
  const items = rows.map(r => {
    if (r.kind === "option") return optionLabel(v.q, r.id);
    if (r.kind === "confirm") return "Confirm";
    return "I don't know";
  });
  return { kind: "list", header: screen(header, HEADER_ROWS), items };
}

function renderResult(v: Extract<View, { kind: "result" }>): Page {
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
  const room = ROWS - lines.length - 1;
  lines.push(...clampLines(v.q.explanation, Math.max(2, room)));
  lines.push("tap = next   .   hold = menu");
  return { kind: "text", content: screen(lines) };
}

export function render(state: State): Page {
  const v = state.view;
  switch (v.kind) {
    case "boot":
      return { kind: "text", content: screen(["LearnForge", "", "Starting..."]) };
    case "pair":
      return { kind: "text", content: screen([
        "LearnForge",
        "",
        "Connect this device at",
        "learnforge.eu  >  Settings  >  Glasses",
        "",
        `Code   ${v.code}`,
        "",
        "Waiting for confirmation...",
      ]) };
    case "home":
      return renderHome(v);
    case "preparing":
      return { kind: "text", content: screen(["", `Preparing ${v.mode === "multi" ? "multi" : "single"} choice...`, "", "Fetching the next questions.", "", "tap = retry   .   hold = menu"]) };
    case "empty":
      if (v.compiling) {
        return { kind: "text", content: screen([
          "",
          fitLine(`Compiling ${v.pendingCompile} card${v.pendingCompile === 1 ? "" : "s"} on the server...`),
          "",
          "Claude is writing the questions. This takes a",
          "minute or two; the app checks back by itself.",
          "",
          "tap = home   .   hold = menu",
        ]) };
      }
      return { kind: "text", content: screen([
        "",
        "Nothing ready on the glasses.",
        "",
        v.pendingCompile > 0
          ? fitLine(`${v.pendingCompile} due card${v.pendingCompile === 1 ? "" : "s"} still need compiling.`)
          : "Nothing due for this mode right now.",
        v.pendingCompile > 0 ? "The compiler did not start; check the api log." : "",
        "",
        "tap = home   .   hold = menu",
      ]) };
    case "question":
      return renderQuestion(v);
    case "result":
      return renderResult(v);
    case "done":
      return { kind: "text", content: screen([
        "",
        "Done.",
        "",
        fitLine(`${v.reviewed} reviewed, ${v.correct} right.`),
        "",
        "tap = home   .   double tap = exit",
      ]) };
    case "error":
      return { kind: "text", content: screen(["", "Something went wrong.", "", ...clampLines(v.message, 3), "", "tap = home"]) };
  }
}
