import { createHash, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { oauthClients, oauthTokens } from "../db/schema/index.js";
import { NOT_DISPUTED } from "./study-filters.js";
import { NotFoundError } from "../lib/errors.js";
import { stripHtml } from "../lib/strip-html.js";

/** Bump when the compile rules in mcp/src/tools/skill.ts change; older rows are dropped on the next store. */
export const GLASSES_PROMPT_VERSION = 1;

/**
 * Support for the server-side glasses compiler.
 *
 * The API spawns the unmodified Claude Code binary, signed in by the admin on
 * the server, and points it at the LearnForge MCP on localhost. That process
 * needs a LearnForge credential of its own: a short-lived OAuth access token
 * for the admin, minted here and verified by the MCP's normal OAuth path. No
 * Claude credential is ever handled by LearnForge code.
 */

export const GLASSES_COMPILER_CLIENT_ID = "learnforge-glasses-compiler";
export const GLASSES_COMPILER_TOKEN_TTL_MS = 30 * 60 * 1000;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Mints a 30-minute MCP access token for `userId`, registering the internal client on first use. */
export async function mintGlassesCompilerToken(db: Db, userId: string, ttlMs: number = GLASSES_COMPILER_TOKEN_TTL_MS): Promise<string> {
  await db
    .insert(oauthClients)
    .values({
      clientId: GLASSES_COMPILER_CLIENT_ID,
      clientIdIssuedAt: Math.floor(Date.now() / 1000),
      redirectUris: [],
      tokenEndpointAuthMethod: "none",
      grantTypes: [],
      responseTypes: [],
      clientName: "LearnForge glasses compiler",
    })
    .onConflictDoNothing({ target: oauthClients.clientId });

  const raw = randomBytes(32).toString("base64url");
  await db.insert(oauthTokens).values({
    token: sha256(raw),
    tokenType: "access",
    clientId: GLASSES_COMPILER_CLIENT_ID,
    userId,
    scopes: [],
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return raw;
}

/** Due cards without a fresh compiled or skipped row at their current level. */
export async function countPendingCompile(db: Db, userId: string): Promise<number> {
  const pending = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM cards c
    JOIN topics t ON t.id = c.topic_id AND t.user_id = ${userId}
    JOIN fsrs_state fs ON fs.card_id = c.id
    LEFT JOIN bloom_state bs ON bs.card_id = c.id
    WHERE fs.due <= NOW() AND ${NOT_DISPUTED}
      AND NOT EXISTS (
        SELECT 1 FROM glasses_questions gq
        WHERE gq.card_id = c.id AND gq.bloom_level = COALESCE(bs.current_level, 0)
          AND gq.prompt_version = ${GLASSES_PROMPT_VERSION}
          AND gq.card_updated_at = c.updated_at
          AND gq.original_id IS NOT DISTINCT FROM c.current_original_id
      )
  `);
  return pending.rows[0]?.n ?? 0;
}

export interface GlassesAskContext {
  cardId: string;
  bloomLevel: number;
  concept: string;
  topicName: string;
  frontText: string;
  backText: string;
  stem: string | null;
  options: string[] | null;
  correct: number[] | null;
  explanation: string | null;
}

/** Everything a tutor reply about a served question needs, by its ticket. */
export async function getGlassesAskContext(db: Db, userId: string, questionId: string): Promise<GlassesAskContext> {
  const rows = await db.execute<{
    card_id: string; card_level: number; concept: string; topic_name: string; front_html: string; back_html: string;
    stem: string | null; options: string[] | null; correct: number[] | null; explanation: string | null;
  }>(sql`
    SELECT sq.card_id, sq.card_level, c.concept, t.name AS topic_name, c.front_html, c.back_html,
           gq.stem, gq.options, gq.correct, gq.explanation
    FROM study_questions sq
    JOIN study_sessions ss ON ss.id = sq.session_id AND ss.user_id = ${userId}
    JOIN cards c ON c.id = sq.card_id
    JOIN topics t ON t.id = c.topic_id
    LEFT JOIN glasses_questions gq ON gq.card_id = sq.card_id AND gq.bloom_level = sq.card_level
      AND gq.prompt_version = ${GLASSES_PROMPT_VERSION} AND gq.status = 'ready'
    WHERE sq.id = ${questionId}
  `);
  const r = rows.rows[0];
  if (!r) throw new NotFoundError("Question ticket not found");
  return {
    cardId: r.card_id,
    bloomLevel: r.card_level,
    concept: r.concept,
    topicName: r.topic_name,
    frontText: stripHtml(r.front_html).slice(0, 1500),
    backText: stripHtml(r.back_html).slice(0, 3000),
    stem: r.stem,
    options: r.options,
    correct: r.correct,
    explanation: r.explanation,
  };
}
