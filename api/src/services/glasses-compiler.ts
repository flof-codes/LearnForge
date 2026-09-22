import { spawn } from "node:child_process";
import type { Db } from "@learnforge/core";
import { mintGlassesCompilerToken } from "@learnforge/core";

/**
 * Compiles glasses questions on demand by running Claude Code on this host.
 *
 * Triggered when the glasses app opens and cards are pending. The API never
 * touches a Claude credential: the unmodified `claude` binary uses the login
 * the admin made on the server (CLAUDE_CONFIG_DIR volume or
 * CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`). It reaches LearnForge
 * through the local MCP with a 30-minute token minted for the admin.
 *
 * Off by default (GLASSES_COMPILER=off): tests and dev never spawn anything.
 */

export const compilerConfig = {
  mode: process.env.GLASSES_COMPILER ?? "off",
  bin: process.env.CLAUDE_BIN ?? "claude",
  model: process.env.GLASSES_COMPILER_MODEL ?? "opus",
  mcpUrl: process.env.GLASSES_COMPILER_MCP_URL ?? `http://127.0.0.1:${process.env.MCP_PORT ?? "3001"}/mcp`,
  batch: parseInt(process.env.GLASSES_COMPILER_BATCH ?? "10", 10) || 10,
  timeoutMs: 12 * 60 * 1000,
  /** After a run, wait this long before another one for the same user; stops a failing binary from looping. */
  cooldownMs: 90 * 1000,
} as const;

export function compilerEnabled(): boolean {
  return compilerConfig.mode === "claude-code";
}

interface RunState {
  running: boolean;
  startedAt: number;
  finishedAt: number;
  lastError: string | null;
}

const runs = new Map<string, RunState>();

export function isCompiling(userId: string): boolean {
  return runs.get(userId)?.running ?? false;
}

export function compileStatus(userId: string): { compiling: boolean; lastError: string | null } {
  const s = runs.get(userId);
  return { compiling: s?.running ?? false, lastError: s?.lastError ?? null };
}

const ALLOWED_TOOLS = [
  "mcp__learnforge__get_instructions",
  "mcp__learnforge__get_glasses_compile_queue",
  "mcp__learnforge__store_glasses_question",
].join(",");

function prompt(batch: number): string {
  return [
    "You are compiling LearnForge cards into questions for the Even Realities G2 glasses.",
    "1. Call get_instructions and follow its 'Glasses Compile Flow' section exactly: the caps, the per-level style, Latin text only, changeRate 0 verbatim, single-correct by default.",
    `2. Call get_glasses_compile_queue with limit ${batch}.`,
    "3. For every entry call store_glasses_question once: a compiled question inside the caps, or skip: true with a one-sentence reason when the card cannot be compressed (formulas, diagrams, image-dependent, options over 28 characters).",
    "4. Stop when the queue is empty or every entry of this batch is stored.",
    "Do not ask questions, do not call any other tool, do not start a study session.",
    "Finish with one line: stored N, skipped M.",
  ].join("\n");
}

/**
 * Starts a compile run for the admin unless one is running or just finished.
 * Returns whether a run is in progress afterwards.
 */
export async function requestCompile(db: Db, userId: string, log: { info: (o: object, m: string) => void; warn: (o: object, m: string) => void }): Promise<boolean> {
  if (!compilerEnabled()) return false;
  const state = runs.get(userId) ?? { running: false, startedAt: 0, finishedAt: 0, lastError: null };
  if (state.running) return true;
  if (Date.now() - state.finishedAt < compilerConfig.cooldownMs) return false;

  const token = await mintGlassesCompilerToken(db, userId);
  const mcpConfig = JSON.stringify({
    mcpServers: {
      learnforge: { type: "http", url: compilerConfig.mcpUrl, headers: { Authorization: `Bearer ${token}` } },
    },
  });

  state.running = true;
  state.startedAt = Date.now();
  state.lastError = null;
  runs.set(userId, state);
  log.info({ userId, model: compilerConfig.model, batch: compilerConfig.batch }, "glasses compile: starting claude");

  const child = spawn(
    compilerConfig.bin,
    [
      "-p",
      "--output-format", "json",
      "--max-turns", "80",
      "--model", compilerConfig.model,
      "--mcp-config", mcpConfig,
      "--strict-mcp-config",
      "--allowedTools", ALLOWED_TOOLS,
      "--no-session-persistence",
    ],
    { env: { ...process.env, HOME: process.env.HOME ?? "/root" }, stdio: ["pipe", "pipe", "pipe"] },
  );

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
  child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
  child.stdin.end(prompt(compilerConfig.batch));

  const timer = setTimeout(() => {
    log.warn({ userId }, "glasses compile: timeout, killing claude");
    child.kill("SIGKILL");
  }, compilerConfig.timeoutMs);

  child.on("error", (err) => {
    clearTimeout(timer);
    state.running = false;
    state.finishedAt = Date.now();
    state.lastError = err.message;
    log.warn({ userId, err: err.message }, "glasses compile: could not start claude (is it installed in the image?)");
  });

  child.on("close", (code) => {
    clearTimeout(timer);
    state.running = false;
    state.finishedAt = Date.now();
    let summary = "";
    try {
      const parsed = JSON.parse(stdout) as { result?: string; num_turns?: number; is_error?: boolean };
      summary = String(parsed.result ?? "").slice(0, 300);
      if (parsed.is_error) state.lastError = summary || "claude reported an error";
    } catch {
      summary = stdout.slice(-300);
    }
    if (code !== 0) state.lastError = state.lastError ?? `claude exited with ${code}: ${stderr.slice(-300)}`;
    const durationMs = Date.now() - state.startedAt;
    if (state.lastError) log.warn({ userId, code, durationMs, error: state.lastError }, "glasses compile: failed");
    else log.info({ userId, code, durationMs, summary }, "glasses compile: finished");
  });

  return true;
}
