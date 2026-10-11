import { eq } from "drizzle-orm";
import { users, loadTutorCredentials } from "@learnforge/core";
import { db } from "../db/connection.js";
import { config, settingsSecret } from "../config.js";
import { createQuestionModel, type ModelSetup, type QuestionModel } from "./question-model.js";

/**
 * Whose key a tutor call runs on.
 *
 * A user's own saved key, always. The key from the server's environment is a
 * deprecated leftover: it belongs to the operator, so it stands in only for an
 * admin account that has saved none, never for anyone else.
 */

let warned = false;

async function isAdmin(userId: string): Promise<boolean> {
  const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return user?.role === "admin";
}

/** The server's own key, or a placeholder in test mode where no call leaves the process. */
function serverKey(): string {
  return config.tutorModel === "stub" ? "stub" : config.anthropicApiKey;
}

/** True when this account has no key of its own and runs on the server's. */
export async function usesServerKey(userId: string): Promise<boolean> {
  if (!serverKey()) return false;
  const own = await loadTutorCredentials(db, userId, settingsSecret);
  return !own.apiKey && (await isAdmin(userId));
}

/** Key, model and effort for this account, or null when it has no key to run on. */
export async function resolveTutorSetup(userId: string): Promise<ModelSetup | null> {
  const own = await loadTutorCredentials(db, userId, settingsSecret);
  if (own.apiKey) return { apiKey: own.apiKey, model: own.model, effort: own.effort };
  if (!serverKey() || !(await isAdmin(userId))) return null;
  if (!warned && config.tutorModel !== "stub") {
    warned = true;
    console.warn("ANTHROPIC_API_KEY in the environment is deprecated: save the key under Settings → Tutor instead.");
  }
  return { apiKey: serverKey(), model: own.model, effort: own.effort };
}

export async function resolveTutorModel(userId: string): Promise<QuestionModel | null> {
  const setup = await resolveTutorSetup(userId);
  return setup ? createQuestionModel(setup) : null;
}
