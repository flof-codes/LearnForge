import { createHash, randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { glassesPairCodes, glassesTokens, users } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { stripHtml } from "../lib/strip-html.js";
import { verifyCardOwnership } from "../lib/card-ownership.js";
import { NOT_DISPUTED } from "./study-filters.js";
import { loadTopicRates, resolveCardRate } from "./change-rate.js";
import { getCurrentOriginals, type CardOriginal } from "./originals-service.js";
import { getSimilarCards } from "./context-service.js";
import { startSession, getSession } from "./session-service.js";
import { submitReview } from "./review-service.js";
import { getStudySummary } from "./study-service.js";

/**
 * Study on the Even Realities G2 glasses.
 *
 * The glasses show one compiled question at a time and take answers from the R1
 * ring. Everything that needs judgement happens elsewhere: Claude compiles the
 * questions through the MCP tools ahead of time, and the review service grades
 * the answer. This module owns pairing, tokens, the compile queue and cache, the
 * ticketed batch, and the translation of a ring answer into a review.
 */

import { GLASSES_PROMPT_VERSION, countPendingCompile } from "./glasses-compile.js";
export { GLASSES_PROMPT_VERSION };

/** Display caps shared with glasses/src/text.ts. */
export const GLASSES_CAPS = {
  stem: 96,
  option: 28,
  explanation: 190,
  options: 4,
  stemLines: 2,
  cols: 48,
} as const;

export const GLASSES_PAIR_CODE_TTL_MS = 10 * 60 * 1000;
export const GLASSES_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const GLASSES_SESSION_DIFFICULTY = 0.3;
const GLASSES_SESSION_CLIENT = "glasses";
const DEFAULT_HORIZON_DAYS = 3;
const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
/** No 0/O/1/I: the code is read off a green monochrome display and typed by hand. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const HASH_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Printable ASCII plus Latin-1 supplement: the glyphs the firmware font is known to carry. */
const LATIN1_RE = /^[\u0020-\u007E\u00A0-\u00FF]*$/;

export function hashGlassesToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// ---------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizePairCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Registers the hash of a secret the glasses generated and returns the code to
 * show on the display. The plaintext secret never reaches the server.
 */
export async function startGlassesPairing(db: Db, tokenHash: string): Promise<{ code: string; expiresAt: string }> {
  if (!HASH_RE.test(tokenHash)) throw new ValidationError("token_hash must be a lowercase SHA-256 hex digest");
  await db.execute(sql`DELETE FROM glasses_pair_codes WHERE expires_at < NOW()`);

  const expiresAt = new Date(Date.now() + GLASSES_PAIR_CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const inserted = await db
      .insert(glassesPairCodes)
      .values({ code, tokenHash, expiresAt })
      .onConflictDoNothing({ target: glassesPairCodes.code })
      .returning({ code: glassesPairCodes.code });
    if (inserted.length > 0) return { code, expiresAt: expiresAt.toISOString() };
  }
  throw new ValidationError("Could not allocate a pairing code, try again");
}

/** Unknown and expired codes are indistinguishable on purpose. */
export async function pollGlassesPairing(db: Db, rawCode: string): Promise<{ status: "pending" | "claimed" }> {
  const code = normalizePairCode(rawCode);
  const [row] = await db
    .select({ claimedAt: glassesPairCodes.claimedAt, expiresAt: glassesPairCodes.expiresAt })
    .from(glassesPairCodes)
    .where(eq(glassesPairCodes.code, code));
  if (!row || row.expiresAt.getTime() < Date.now()) throw new NotFoundError("Pairing code not found");
  return { status: row.claimedAt ? "claimed" : "pending" };
}

export interface GlassesTokenRow {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

function mapToken(t: { id: string; label: string; createdAt: Date; lastUsedAt: Date | null; expiresAt: Date }): GlassesTokenRow {
  return {
    id: t.id,
    label: t.label,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    expiresAt: t.expiresAt.toISOString(),
  };
}

/** Turns a pending code into a token for `userId`. The caller has already checked the admin role. */
export async function claimGlassesPairing(db: Db, userId: string, rawCode: string): Promise<GlassesTokenRow> {
  const code = normalizePairCode(rawCode);
  if (code.length !== CODE_LENGTH) throw new ValidationError("Pairing code must have 6 characters");

  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select({ id: glassesPairCodes.id, tokenHash: glassesPairCodes.tokenHash, expiresAt: glassesPairCodes.expiresAt, claimedAt: glassesPairCodes.claimedAt })
      .from(glassesPairCodes)
      .where(eq(glassesPairCodes.code, code))
      .for("update");
    if (!pending || pending.expiresAt.getTime() < Date.now()) throw new NotFoundError("Pairing code not found or expired");
    if (pending.claimedAt) throw new ValidationError("Pairing code was already used");

    const [token] = await tx
      .insert(glassesTokens)
      .values({ userId, tokenHash: pending.tokenHash, expiresAt: new Date(Date.now() + GLASSES_TOKEN_TTL_MS) })
      .onConflictDoNothing({ target: glassesTokens.tokenHash })
      .returning();
    if (!token) throw new ValidationError("This device is already paired");

    await tx.update(glassesPairCodes).set({ claimedAt: new Date(), claimedByUserId: userId }).where(eq(glassesPairCodes.id, pending.id));
    return mapToken(token);
  });
}

export type GlassesTokenCheck =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: "unknown" | "revoked" | "expired" | "not_admin" };

/** Resolves a bearer token from the glasses. Only admins may hold one; the role is re-checked on every call. */
export async function resolveGlassesToken(db: Db, rawToken: string): Promise<GlassesTokenCheck> {
  if (!rawToken || rawToken.length < 16) return { ok: false, reason: "unknown" };
  const hash = hashGlassesToken(rawToken);
  const [row] = await db
    .select({ id: glassesTokens.id, userId: glassesTokens.userId, expiresAt: glassesTokens.expiresAt, revokedAt: glassesTokens.revokedAt, role: users.role })
    .from(glassesTokens)
    .innerJoin(users, eq(users.id, glassesTokens.userId))
    .where(eq(glassesTokens.tokenHash, hash));
  if (!row) return { ok: false, reason: "unknown" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.role !== "admin") return { ok: false, reason: "not_admin" };
  await db.update(glassesTokens).set({ lastUsedAt: new Date() }).where(eq(glassesTokens.id, row.id));
  return { ok: true, userId: row.userId, tokenId: row.id };
}

export async function listGlassesTokens(db: Db, userId: string): Promise<GlassesTokenRow[]> {
  const rows = await db
    .select()
    .from(glassesTokens)
    .where(and(eq(glassesTokens.userId, userId), isNull(glassesTokens.revokedAt)))
    .orderBy(glassesTokens.createdAt);
  return rows.map(mapToken);
}

export async function revokeGlassesToken(db: Db, userId: string, tokenId: string): Promise<void> {
  const updated = await db
    .update(glassesTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(glassesTokens.id, tokenId), eq(glassesTokens.userId, userId), isNull(glassesTokens.revokedAt)))
    .returning({ id: glassesTokens.id });
  if (updated.length === 0) throw new NotFoundError("Glasses token not found");
}

// ---------------------------------------------------------------------------
// Compile queue and cache (filled by Claude through the MCP)
// ---------------------------------------------------------------------------

/** A row is fresh while the card content and its current original are the ones it was compiled from. */
const FRESH_ROW = sql`gq.prompt_version = ${GLASSES_PROMPT_VERSION}
  AND gq.card_updated_at = c.updated_at
  AND gq.original_id IS NOT DISTINCT FROM c.current_original_id`;

export interface GlassesCompileQueueOptions {
  limit?: number;
  topic_id?: string;
  horizon_days?: number;
  include_html?: boolean;
}

export interface GlassesCompileQueueEntry {
  cardId: string;
  concept: string;
  cardType: string;
  clozeData: unknown;
  tags: string[];
  topicName: string;
  bloomLevel: number;
  changeRate: number;
  original: CardOriginal | null;
  frontText: string;
  backText: string;
  frontHtml?: string;
  backHtml?: string;
  hasImages: boolean;
  dueAt: string;
  similarCards: Array<{ id: string; concept: string; frontText: string }>;
}

/** Due-soon cards without a fresh compiled (or skipped) row at their current level, oldest due first. */
export async function getGlassesCompileQueue(db: Db, userId: string, opts: GlassesCompileQueueOptions = {}): Promise<GlassesCompileQueueEntry[]> {
  const limit = Math.max(1, Math.min(50, opts.limit ?? 10));
  const horizon = Math.max(0, Math.min(60, opts.horizon_days ?? DEFAULT_HORIZON_DAYS));
  const topicFilter = opts.topic_id
    ? sql`AND c.topic_id IN (
        WITH RECURSIVE topic_tree AS (
          SELECT id FROM topics WHERE id = ${opts.topic_id}::uuid AND user_id = ${userId}
          UNION ALL
          SELECT t2.id FROM topics t2 JOIN topic_tree tt ON t2.parent_id = tt.id
        ) SELECT id FROM topic_tree)`
    : sql``;

  const result = await db.execute<{
    id: string; concept: string; card_type: string; cloze_data: unknown; tags: string[] | null;
    front_html: string; back_html: string; topic_id: string; topic_name: string; change_rate: number | null;
    current_level: number | null; due: Date;
  }>(sql`
    SELECT c.id, c.concept, c.card_type, c.cloze_data, c.tags, c.front_html, c.back_html,
           c.topic_id, t.name AS topic_name, c.change_rate,
           bs.current_level, fs.due
    FROM cards c
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    JOIN fsrs_state fs ON fs.card_id = c.id
    LEFT JOIN bloom_state bs ON bs.card_id = c.id
    WHERE fs.due <= NOW() + (${horizon} || ' days')::interval
      AND ${NOT_DISPUTED}
      ${topicFilter}
      AND NOT EXISTS (
        SELECT 1 FROM glasses_questions gq
        WHERE gq.card_id = c.id AND gq.bloom_level = COALESCE(bs.current_level, 0) AND ${FRESH_ROW}
      )
    ORDER BY fs.due ASC
    LIMIT ${limit}
  `);

  const cardIds = result.rows.map(r => r.id);
  const topicRates = await loadTopicRates(db, userId);
  const originals = await getCurrentOriginals(db, userId, cardIds);

  const entries: GlassesCompileQueueEntry[] = [];
  for (const r of result.rows) {
    const level = r.current_level ?? 0;
    let similarCards: GlassesCompileQueueEntry["similarCards"] = [];
    if (level >= 3) {
      try {
        const similar = await getSimilarCards(db, userId, r.id, 3);
        const ids = similar.map(s => s.id as string);
        if (ids.length > 0) {
          const fronts = await db.execute<{ id: string; front_html: string }>(sql`
            SELECT id, front_html FROM cards WHERE id IN (${sql.join(ids.map(id => sql`${id}::uuid`), sql`, `)})
          `);
          const frontById = new Map(fronts.rows.map(f => [f.id, stripHtml(f.front_html).slice(0, 200)]));
          similarCards = similar.map(s => ({ id: s.id as string, concept: s.concept as string, frontText: frontById.get(s.id as string) ?? "" }));
        }
      } catch {
        similarCards = [];
      }
    }
    entries.push({
      cardId: r.id,
      concept: r.concept,
      cardType: r.card_type,
      clozeData: r.cloze_data,
      tags: r.tags ?? [],
      topicName: r.topic_name,
      bloomLevel: level,
      changeRate: resolveCardRate({ changeRate: r.change_rate, topicId: r.topic_id }, topicRates).changeRate,
      original: originals.get(r.id) ?? null,
      frontText: stripHtml(r.front_html).slice(0, 600),
      backText: stripHtml(r.back_html).slice(0, 1200),
      ...(opts.include_html ? { frontHtml: r.front_html, backHtml: r.back_html } : {}),
      hasImages: /<img[\s>]/i.test(r.front_html + r.back_html),
      dueAt: new Date(r.due).toISOString(),
      similarCards,
    });
  }
  return entries;
}

export interface StoreGlassesQuestionInput {
  card_id: string;
  bloom_level: number;
  stem?: string;
  options?: string[];
  correct?: number[];
  explanation?: string;
  skip?: boolean;
  reason?: string;
}

/** Greedy word wrap, the same rule glasses/src/text.ts renders with. */
function countWrappedLines(text: string, cols: number): number {
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      if (word.length > cols) {
        if (line) { lines += 1; line = ""; }
        lines += Math.ceil(word.length / cols);
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length <= cols) line = candidate;
      else { lines += 1; line = word; }
    }
    if (line || words.length === 0) lines += 1;
  }
  return lines;
}

function requireLatin1(field: string, value: string): void {
  if (!LATIN1_RE.test(value)) {
    throw new ValidationError(`${field} contains characters the glasses font cannot show; use plain Latin text`);
  }
}

/** Validates a compiled question against the display, not only against lengths. */
export function validateGlassesQuestion(input: { stem: string; options: string[]; correct: number[]; explanation: string }) {
  const stem = input.stem.trim();
  const explanation = input.explanation.trim();
  const options = input.options.map(o => o.trim());

  if (!stem) throw new ValidationError("stem is required");
  if (stem.length > GLASSES_CAPS.stem) throw new ValidationError(`stem must be at most ${GLASSES_CAPS.stem} characters`);
  requireLatin1("stem", stem);
  if (countWrappedLines(stem, GLASSES_CAPS.cols) > GLASSES_CAPS.stemLines) {
    throw new ValidationError(`stem must fit ${GLASSES_CAPS.stemLines} lines of ${GLASSES_CAPS.cols} characters`);
  }

  if (options.length !== GLASSES_CAPS.options) throw new ValidationError(`exactly ${GLASSES_CAPS.options} options are required`);
  options.forEach((o, i) => {
    if (!o) throw new ValidationError(`option ${OPTION_LETTERS[i]} is empty`);
    if (o.length > GLASSES_CAPS.option) throw new ValidationError(`option ${OPTION_LETTERS[i]} must be at most ${GLASSES_CAPS.option} characters`);
    requireLatin1(`option ${OPTION_LETTERS[i]}`, o);
  });
  if (new Set(options.map(o => o.toLowerCase())).size !== options.length) throw new ValidationError("options must be distinct");

  const correct = [...new Set(input.correct)].sort((a, b) => a - b);
  if (correct.length !== input.correct.length) throw new ValidationError("correct indices must be distinct");
  if (correct.length === 0 || correct.length >= options.length) throw new ValidationError("correct must name 1 to 3 options");
  if (correct.some(i => !Number.isInteger(i) || i < 0 || i >= options.length)) throw new ValidationError("correct indices must be between 0 and 3");

  if (!explanation) throw new ValidationError("explanation is required");
  if (explanation.length > GLASSES_CAPS.explanation) throw new ValidationError(`explanation must be at most ${GLASSES_CAPS.explanation} characters`);
  requireLatin1("explanation", explanation);

  return { stem, options, correct, explanation };
}

/** Stores (or replaces) the compiled question of a card at one level, or marks the card as not compressible. */
export async function storeGlassesQuestion(db: Db, userId: string, input: StoreGlassesQuestionInput) {
  const { card_id, bloom_level } = input;
  if (!Number.isInteger(bloom_level) || bloom_level < 0 || bloom_level > 5) throw new ValidationError("bloom_level must be between 0 and 5");
  await verifyCardOwnership(db, card_id, userId);

  let values: { status: string; stem: string | null; options: string[] | null; correct: number[] | null; explanation: string | null; skipReason: string | null };
  if (input.skip) {
    const reason = (input.reason ?? "").trim();
    if (!reason) throw new ValidationError("reason is required when skipping a card");
    values = { status: "skipped", stem: null, options: null, correct: null, explanation: null, skipReason: reason.slice(0, 200) };
  } else {
    if (!input.stem || !input.options || !input.correct || !input.explanation) {
      throw new ValidationError("stem, options, correct and explanation are required");
    }
    const v = validateGlassesQuestion({ stem: input.stem, options: input.options, correct: input.correct, explanation: input.explanation });
    values = { status: "ready", stem: v.stem, options: v.options, correct: v.correct, explanation: v.explanation, skipReason: null };
  }

  // node-postgres does not turn a JS number[] into a Postgres array here, so the
  // literal is built by hand and cast.
  const correctLiteral = values.correct ? `{${values.correct.join(",")}}` : null;
  const rows = await db.execute<{ id: string; status: string; bloom_level: number }>(sql`
    WITH stale AS (
      DELETE FROM glasses_questions WHERE card_id = ${card_id} AND prompt_version <> ${GLASSES_PROMPT_VERSION}
    )
    INSERT INTO glasses_questions
      (card_id, bloom_level, prompt_version, status, stem, options, correct, explanation, skip_reason, original_id, card_updated_at)
    SELECT c.id, ${bloom_level}, ${GLASSES_PROMPT_VERSION}, ${values.status}, ${values.stem},
           ${values.options ? JSON.stringify(values.options) : null}::jsonb, ${correctLiteral}::integer[],
           ${values.explanation}, ${values.skipReason}, c.current_original_id, c.updated_at
    FROM cards c WHERE c.id = ${card_id}
    ON CONFLICT (card_id, bloom_level, prompt_version) DO UPDATE SET
      status = EXCLUDED.status, stem = EXCLUDED.stem, options = EXCLUDED.options, correct = EXCLUDED.correct,
      explanation = EXCLUDED.explanation, skip_reason = EXCLUDED.skip_reason,
      original_id = EXCLUDED.original_id, card_updated_at = EXCLUDED.card_updated_at, created_at = NOW()
    RETURNING id, status, bloom_level
  `);
  const row = rows.rows[0];
  if (!row) throw new NotFoundError("Card not found");
  return { id: row.id, cardId: card_id, bloomLevel: row.bloom_level, status: row.status as "ready" | "skipped", promptVersion: GLASSES_PROMPT_VERSION };
}

// ---------------------------------------------------------------------------
// Serving the glasses
// ---------------------------------------------------------------------------

export type GlassesMode = "single" | "multi";

export interface GlassesQuestion {
  questionId: string;
  cardId: string;
  bloomLevel: number;
  mode: GlassesMode;
  stem: string;
  options: Array<{ id: string; text: string }>;
  correctIds: string[];
  explanation: string;
}

export interface GlassesBatchOptions {
  mode: GlassesMode;
  limit?: number;
  session_id?: string;
  exclude?: string[];
}

/**
 * Serves compiled questions for due cards at their current level, each with a
 * ticket from a glasses study session. Single mode serves rows with exactly one
 * correct option; multi mode serves every row.
 */
export async function getGlassesBatch(db: Db, userId: string, opts: GlassesBatchOptions) {
  if (opts.mode !== "single" && opts.mode !== "multi") throw new ValidationError("mode must be single or multi");
  const limit = Math.max(1, Math.min(20, opts.limit ?? 5));

  let sessionId = opts.session_id ?? null;
  if (sessionId) {
    try { await getSession(db, userId, sessionId); } catch { sessionId = null; }
  }
  if (!sessionId) {
    const started = await startSession(db, userId, { client: GLASSES_SESSION_CLIENT, difficulty: GLASSES_SESSION_DIFFICULTY });
    sessionId = started.session.id;
  }

  const exclude = (opts.exclude ?? []).filter(id => UUID_RE.test(id));
  const excludeFilter = exclude.length > 0
    ? sql`AND c.id NOT IN (${sql.join(exclude.map(id => sql`${id}::uuid`), sql`, `)})`
    : sql``;
  const modeFilter = opts.mode === "single" ? sql`AND cardinality(gq.correct) = 1` : sql``;

  const rows = await db.execute<{
    id: string; topic_id: string; change_rate: number | null; current_original_id: string | null;
    current_level: number | null; last_review: Date | null;
    stem: string; options: string[]; correct: number[]; explanation: string;
  }>(sql`
    SELECT c.id, c.topic_id, c.change_rate, c.current_original_id,
           bs.current_level, fs.last_review,
           gq.stem, gq.options, gq.correct, gq.explanation
    FROM cards c
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    JOIN fsrs_state fs ON fs.card_id = c.id
    LEFT JOIN bloom_state bs ON bs.card_id = c.id
    JOIN glasses_questions gq ON gq.card_id = c.id
      AND gq.bloom_level = COALESCE(bs.current_level, 0)
      AND gq.status = 'ready'
      AND ${FRESH_ROW}
    WHERE fs.due <= NOW()
      AND ${NOT_DISPUTED}
      ${modeFilter}
      ${excludeFilter}
    ORDER BY fs.due ASC
    LIMIT ${limit}
  `);

  const pendingCompile = await countPendingCompile(db, userId);

  const questions: GlassesQuestion[] = [];
  if (rows.rows.length > 0) {
    const topicRates = await loadTopicRates(db, userId);
    for (const r of rows.rows) {
      const rate = resolveCardRate({ changeRate: r.change_rate, topicId: r.topic_id }, topicRates);
      const ticket = await db.execute<{ id: string }>(sql`
        INSERT INTO study_questions (session_id, card_id, original_id, card_level, change_rate, rate_source, last_review_at_serve)
        VALUES (${sessionId}::uuid, ${r.id}::uuid, ${r.current_original_id}::uuid, ${r.current_level ?? 0}, ${rate.changeRate}, ${rate.rateSource}, ${r.last_review}::timestamptz)
        RETURNING id
      `);
      questions.push({
        questionId: ticket.rows[0].id,
        cardId: r.id,
        bloomLevel: r.current_level ?? 0,
        mode: r.correct.length === 1 ? "single" : "multi",
        stem: r.stem,
        options: r.options.map((text, i) => ({ id: OPTION_LETTERS[i], text })),
        correctIds: r.correct.map(i => OPTION_LETTERS[i]),
        explanation: r.explanation,
      });
    }
    await db.execute(sql`UPDATE study_sessions SET last_activity = NOW() WHERE id = ${sessionId}`);
  }

  return { sessionId, questions, pendingCompile };
}

export interface GlassesAnswerInput {
  question_id: string;
  /** Option letters the learner picked; empty together with dont_know. */
  selected: string[];
  dont_know?: boolean;
  /** Asked as multiple choice (session mode), so partial credit applies even with one correct option. */
  multi?: boolean;
}

/** Turns a ring answer into a graded review. The server decides style, ids and rating. */
export async function submitGlassesAnswer(db: Db, userId: string, input: GlassesAnswerInput) {
  const { question_id } = input;
  if (!UUID_RE.test(question_id ?? "")) throw new ValidationError("question_id must be a UUID");

  const rows = await db.execute<{
    card_id: string; card_level: number; stem: string; options: string[]; correct: number[]; explanation: string;
  }>(sql`
    SELECT sq.card_id, sq.card_level, gq.stem, gq.options, gq.correct, gq.explanation
    FROM study_questions sq
    JOIN study_sessions ss ON ss.id = sq.session_id AND ss.user_id = ${userId}
    JOIN glasses_questions gq ON gq.card_id = sq.card_id
      AND gq.bloom_level = sq.card_level
      AND gq.prompt_version = ${GLASSES_PROMPT_VERSION}
      AND gq.status = 'ready'
    WHERE sq.id = ${question_id}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Question ticket not found");
  const q = rows.rows[0];

  const correctIds = q.correct.map(i => OPTION_LETTERS[i]);
  const valid = new Set(OPTION_LETTERS.slice(0, q.options.length));
  const selected = input.dont_know ? [] : [...new Set((input.selected ?? []).map(s => String(s).toUpperCase()))];
  if (selected.some(s => !valid.has(s as typeof OPTION_LETTERS[number]))) throw new ValidationError("selected must contain option letters A to D");
  if (!input.dont_know && selected.length === 0) throw new ValidationError("selected must not be empty unless dont_know is set");

  const label = (id: string) => `${id}) ${q.options[OPTION_LETTERS.indexOf(id as typeof OPTION_LETTERS[number])] ?? ""}`;
  const result = await submitReview(db, userId, {
    question_id,
    card_id: q.card_id,
    bloom_level: q.card_level,
    style: input.multi || correctIds.length > 1 ? "multiple" : "single",
    correct_option_ids: correctIds,
    selected_option_ids: selected,
    question_text: `${q.stem} ${q.options.map((o, i) => `${OPTION_LETTERS[i]}) ${o}`).join(" ")}`,
    answer_expected: correctIds.map(label).join(", "),
    user_answer: input.dont_know ? "I don't know" : selected.map(label).join(", "),
    modality: "mcq",
  });

  return {
    ...result,
    correctIds,
    explanation: q.explanation,
  };
}

/** The handful of numbers the Home screen shows; the full summary is wasted bytes on the phone. */
export async function getGlassesSummary(db: Db, userId: string) {
  const s = await getStudySummary(db, userId);
  return {
    dueCount: s.dueCount,
    newCount: s.newCount,
    streak: s.streak,
    accuracy7d: s.accuracy7d,
    bloomLevels: s.bloomLevels,
  };
}
