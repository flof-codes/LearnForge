import { eq } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { tutorSettings } from "../db/schema/index.js";
import { ValidationError } from "../lib/errors.js";
import { sealSecret, openSecret } from "../lib/secret-box.js";

/**
 * Each user's own tutor setup: their Anthropic API key, the model and the
 * effort. A key is only ever used for the account that saved it.
 */

/** Models a user may pick. `effort` says whether the model takes an effort setting at all. */
export const TUTOR_MODELS = [
  { id: "claude-fable-5-1", name: "Fable 5.1", effort: true },
  { id: "claude-opus-5-5", name: "Opus 5.5", effort: true },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5", effort: true },
  { id: "claude-haiku-4-5", name: "Haiku 4.5", effort: false },
] as const;
export const TUTOR_EFFORTS = ["low", "medium", "high"] as const;
export type TutorModelId = typeof TUTOR_MODELS[number]["id"];
export type TutorEffort = typeof TUTOR_EFFORTS[number];
export const DEFAULT_TUTOR_MODEL: TutorModelId = "claude-opus-5-5";
export const DEFAULT_TUTOR_EFFORT: TutorEffort = "medium";

export interface TutorSettingsView {
  hasKey: boolean;
  /** Last four characters of the saved key. */
  keyHint: string | null;
  model: TutorModelId;
  effort: TutorEffort;
  updatedAt: string | null;
}

const isModel = (v: unknown): v is TutorModelId => TUTOR_MODELS.some(m => m.id === v);
const isEffort = (v: unknown): v is TutorEffort => TUTOR_EFFORTS.includes(v as TutorEffort);

function view(row: typeof tutorSettings.$inferSelect | undefined): TutorSettingsView {
  return {
    hasKey: !!row?.apiKeyEnc,
    keyHint: row?.apiKeyEnc ? row.keyHint : null,
    model: isModel(row?.model) ? row.model : DEFAULT_TUTOR_MODEL,
    effort: isEffort(row?.effort) ? row.effort : DEFAULT_TUTOR_EFFORT,
    updatedAt: row ? row.updatedAt.toISOString() : null,
  };
}

/** What the settings page may see. The key itself never leaves through here. */
export async function getTutorSettings(db: Db, userId: string): Promise<TutorSettingsView> {
  const [row] = await db.select().from(tutorSettings).where(eq(tutorSettings.userId, userId));
  return view(row);
}

export interface SaveTutorSettingsInput {
  api_key?: string;
  model?: string;
  effort?: string;
}

export function validateApiKey(raw: unknown): string {
  const key = typeof raw === "string" ? raw.trim() : "";
  if (!/^sk-ant-[A-Za-z0-9_-]{20,300}$/.test(key)) throw new ValidationError("That does not look like an Anthropic API key (it starts with sk-ant-)");
  return key;
}

/** Saves what was given and leaves the rest as it is. `secret` seals the key. */
export async function saveTutorSettings(db: Db, userId: string, input: SaveTutorSettingsInput, secret: string): Promise<TutorSettingsView> {
  const changes: Partial<typeof tutorSettings.$inferInsert> = { updatedAt: new Date() };
  if (input.model !== undefined) {
    if (!isModel(input.model)) throw new ValidationError(`model must be one of ${TUTOR_MODELS.map(m => m.id).join(", ")}`);
    changes.model = input.model;
  }
  if (input.effort !== undefined) {
    if (!isEffort(input.effort)) throw new ValidationError(`effort must be one of ${TUTOR_EFFORTS.join(", ")}`);
    changes.effort = input.effort;
  }
  if (input.api_key !== undefined) {
    const key = validateApiKey(input.api_key);
    changes.apiKeyEnc = sealSecret(key, secret);
    changes.keyHint = key.slice(-4);
  }
  const [row] = await db
    .insert(tutorSettings)
    .values({ userId, ...changes })
    .onConflictDoUpdate({ target: tutorSettings.userId, set: changes })
    .returning();
  return view(row);
}

export async function removeTutorKey(db: Db, userId: string): Promise<TutorSettingsView> {
  const [row] = await db
    .update(tutorSettings)
    .set({ apiKeyEnc: null, keyHint: null, updatedAt: new Date() })
    .where(eq(tutorSettings.userId, userId))
    .returning();
  return view(row);
}

export interface TutorCredentials {
  /** Null when the user has no key of their own on file (or it can no longer be opened). */
  apiKey: string | null;
  model: TutorModelId;
  effort: TutorEffort;
}

/** The key in the clear, for the one call to Anthropic. Never log or return the result. */
export async function loadTutorCredentials(db: Db, userId: string, secret: string): Promise<TutorCredentials> {
  const [row] = await db.select().from(tutorSettings).where(eq(tutorSettings.userId, userId));
  const settings = view(row);
  return {
    apiKey: row?.apiKeyEnc ? openSecret(row.apiKeyEnc, secret) : null,
    model: settings.model,
    effort: settings.effort,
  };
}
