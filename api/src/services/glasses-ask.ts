import { spawn } from "node:child_process";
import type { Db } from "@learnforge/core";
import { getGlassesAskContext, ValidationError } from "@learnforge/core";
import { compilerConfig, compilerEnabled } from "./glasses-compiler.js";

/**
 * A learner's question about the card on the glasses, answered by Claude Code
 * on this host. Same binary and login as the compiler; no tools, one turn, so
 * the reply comes back in the time of a single model call.
 */

const ANSWER_MAX = 400;
const ASK_TIMEOUT_MS = 90 * 1000;
const BUILTIN_TOOLS = "Bash,Read,Edit,Write,MultiEdit,Glob,Grep,WebFetch,WebSearch,Task,NotebookEdit,TodoWrite";

const busy = new Set<string>();

export type AskResult =
  | { ok: true; answer: string }
  | { ok: false; status: 503 | 409 | 502; message: string };

function buildPrompt(ctx: Awaited<ReturnType<typeof getGlassesAskContext>>, text: string): string {
  const lines = [
    "You are the LearnForge tutor. The learner wears Even Realities G2 glasses that show one small green text box, so answer in at most 380 characters of plain text: no markdown, no lists, no formulas, no line breaks except between two short paragraphs. Use the learner's language.",
    "",
    `Topic: ${ctx.topicName}`,
    `Card concept: ${ctx.concept}`,
    `Card front: ${ctx.frontText}`,
    `Card back: ${ctx.backText}`,
    `Bloom level of this question: ${ctx.bloomLevel}`,
  ];
  if (ctx.stem && ctx.options) {
    lines.push("", `Question on the glasses right now: ${ctx.stem}`);
    ctx.options.forEach((o, i) => lines.push(`${String.fromCharCode(65 + i)}) ${o}`));
    if (ctx.correct) lines.push(`Correct: ${ctx.correct.map(i => String.fromCharCode(65 + i)).join(", ")}`);
    if (ctx.explanation) lines.push(`Stored explanation: ${ctx.explanation}`);
  }
  lines.push(
    "",
    "The learner has not necessarily answered yet. Do not name the correct option unless the learner asks for the answer outright; help them reason instead.",
    "",
    `Learner: ${text.trim()}`,
  );
  return lines.join("\n");
}

export async function askAboutQuestion(
  db: Db,
  userId: string,
  input: { question_id: string; text: string },
  log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void },
): Promise<AskResult> {
  const text = (input.text ?? "").trim();
  if (!text) throw new ValidationError("text is required");
  if (text.length > 500) throw new ValidationError("text must be at most 500 characters");
  if (!compilerEnabled()) return { ok: false, status: 503, message: "The tutor is not enabled on this server" };
  if (busy.has(userId)) return { ok: false, status: 409, message: "Still answering the previous question" };

  const ctx = await getGlassesAskContext(db, userId, input.question_id);
  busy.add(userId);
  const startedAt = Date.now();
  log.info({ userId, cardId: ctx.cardId, chars: text.length }, "glasses ask: starting claude");

  try {
    const answer = await new Promise<string>((resolve, reject) => {
      const child = spawn(
        compilerConfig.bin,
        [
          "-p",
          "--output-format", "json",
          "--max-turns", "1",
          "--model", compilerConfig.model,
          "--strict-mcp-config",
          "--mcp-config", JSON.stringify({ mcpServers: {} }),
          "--disallowedTools", BUILTIN_TOOLS,
          "--no-session-persistence",
        ],
        { env: { ...process.env, HOME: process.env.HOME ?? "/root" }, stdio: ["pipe", "pipe", "pipe"] },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      child.stdin.end(buildPrompt(ctx, text));
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("timeout")); }, ASK_TIMEOUT_MS);
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
      child.on("close", (code) => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(stdout) as { result?: string; is_error?: boolean };
          if (parsed.is_error || code !== 0) reject(new Error(String(parsed.result ?? stderr.slice(-300) ?? `exit ${code}`)));
          else resolve(String(parsed.result ?? "").trim());
        } catch {
          reject(new Error(code === 0 ? "unreadable reply" : `exit ${code}: ${stderr.slice(-300)}`));
        }
      });
    });
    const trimmed = answer.length > ANSWER_MAX ? `${answer.slice(0, ANSWER_MAX - 3)}...` : answer;
    log.info({ userId, durationMs: Date.now() - startedAt, chars: trimmed.length }, "glasses ask: answered");
    return { ok: true, answer: trimmed || "No answer came back." };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ userId, durationMs: Date.now() - startedAt, error: message }, "glasses ask: failed");
    return { ok: false, status: 502, message: `The tutor did not answer: ${message.slice(0, 200)}` };
  } finally {
    busy.delete(userId);
  }
}
