import { sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";

export const SESSION_EXPIRY_HOURS = 24;

export interface StudySession {
  id: string;
  userId: string;
  client: string;
  sessionDifficulty: number;
  voice: boolean;
  startedAt: string;
  lastActivity: string;
}

interface SessionRow extends Record<string, unknown> {
  id: string; user_id: string; client: string; session_difficulty: number; voice: boolean;
  started_at: string; last_activity: string;
}

function mapSession(r: SessionRow): StudySession {
  return {
    id: r.id, userId: r.user_id, client: r.client, sessionDifficulty: r.session_difficulty,
    voice: r.voice, startedAt: r.started_at, lastActivity: r.last_activity,
  };
}

export function validateDifficulty(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 1) {
    throw new ValidationError("difficulty must be between 0 and 1");
  }
  return value;
}

export interface StartSessionInput {
  client?: string;
  difficulty?: number;
  voice?: boolean;
  /** Resume an existing session instead of starting a new one. */
  session_id?: string;
}

/** Open tickets of a session: served, not yet answered, and not expired. */
export async function getOpenQuestions(db: Db, sessionId: string) {
  const rows = await db.execute<{
    id: string; card_id: string; card_level: number; change_rate: number; rate_source: string; served_at: string;
  }>(sql`
    SELECT sq.id, sq.card_id, sq.card_level, sq.change_rate, sq.rate_source, sq.served_at
    FROM study_questions sq
    LEFT JOIN reviews r ON r.question_id = sq.id
    WHERE sq.session_id = ${sessionId} AND r.id IS NULL
      AND sq.served_at > NOW() - (${SESSION_EXPIRY_HOURS} || ' hours')::interval
    ORDER BY sq.served_at DESC
  `);
  return rows.rows.map(r => ({
    questionId: r.id, cardId: r.card_id, cardLevel: r.card_level,
    changeRate: r.change_rate, rateSource: r.rate_source, servedAt: r.served_at,
  }));
}

export async function startSession(db: Db, userId: string, input: StartSessionInput) {
  if (input.session_id) {
    const rows = await db.execute<SessionRow>(sql`
      UPDATE study_sessions SET last_activity = NOW()
      WHERE id = ${input.session_id} AND user_id = ${userId}
      RETURNING *
    `);
    if (rows.rows.length === 0) throw new NotFoundError("Session not found");
    const session = mapSession(rows.rows[0]);
    return { session, resumed: true, openQuestions: await getOpenQuestions(db, session.id) };
  }

  const difficulty = input.difficulty === undefined ? 1 : validateDifficulty(input.difficulty);
  const client = (input.client ?? "claude").slice(0, 40);
  const rows = await db.execute<SessionRow>(sql`
    INSERT INTO study_sessions (user_id, client, session_difficulty, voice)
    VALUES (${userId}, ${client}, ${difficulty}, ${input.voice ?? false})
    RETURNING *
  `);
  return { session: mapSession(rows.rows[0]), resumed: false, openQuestions: [] };
}

export async function getSession(db: Db, userId: string, sessionId: string): Promise<StudySession> {
  const rows = await db.execute<SessionRow>(sql`
    SELECT * FROM study_sessions WHERE id = ${sessionId} AND user_id = ${userId}
  `);
  if (rows.rows.length === 0) throw new NotFoundError("Session not found");
  return mapSession(rows.rows[0]);
}
