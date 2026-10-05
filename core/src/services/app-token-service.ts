import { createHash, randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { appPairCodes, appTokens, users } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { checkSubscriptionAccess } from "../lib/subscription-gate.js";

/**
 * Connected apps (Lecture Scribe): pairing by a one-time code the user approves
 * in the web UI, and the bearer tokens that pairing issues. What a token may
 * call is decided by the API's auth plugin, not here.
 */

export const APP_PAIR_CODE_TTL_MS = 10 * 60 * 1000;
/** A token lives this long after its last use; every use pushes the date out. */
export const APP_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** App secrets carry this prefix so the auth plugin can tell them from a JWT without a lookup. */
export const APP_TOKEN_PREFIX = "lfa_";
const TOUCH_EVERY_MS = 60 * 60 * 1000;
/** No 0/O/1/I: the code is compared by eye between two windows. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const HASH_RE = /^[0-9a-f]{64}$/;
const MAX_LABEL = 80;

export function hashAppToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeAppPairCode(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

const label = (v: string | undefined) => (v ?? "").replace(/\p{Cc}/gu, " ").trim().slice(0, MAX_LABEL);

export interface StartAppPairingInput {
  token_hash: string;
  app: string;
  device?: string;
}

/** Registers the hash of a secret the app generated and returns the code both sides show. */
export async function startAppPairing(db: Db, input: StartAppPairingInput): Promise<{ code: string; expiresAt: string }> {
  if (!HASH_RE.test(input.token_hash)) throw new ValidationError("token_hash must be a lowercase SHA-256 hex digest");
  const app = label(input.app);
  if (!app) throw new ValidationError("app is required");
  await db.execute(sql`DELETE FROM app_pair_codes WHERE expires_at < NOW()`);

  const expiresAt = new Date(Date.now() + APP_PAIR_CODE_TTL_MS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const inserted = await db
      .insert(appPairCodes)
      .values({ code, tokenHash: input.token_hash, app, device: label(input.device), expiresAt })
      .onConflictDoNothing({ target: appPairCodes.code })
      .returning({ code: appPairCodes.code });
    if (inserted.length > 0) return { code, expiresAt: expiresAt.toISOString() };
  }
  throw new ValidationError("Could not allocate a pairing code, try again");
}

/** Unknown and expired codes are indistinguishable on purpose. */
export async function pollAppPairing(db: Db, rawCode: string): Promise<{ status: "pending" | "claimed" }> {
  const [row] = await db
    .select({ claimedAt: appPairCodes.claimedAt, expiresAt: appPairCodes.expiresAt })
    .from(appPairCodes)
    .where(eq(appPairCodes.code, normalizeAppPairCode(rawCode)));
  if (!row || row.expiresAt.getTime() < Date.now()) throw new NotFoundError("Pairing code not found");
  return { status: row.claimedAt ? "claimed" : "pending" };
}

/** What the approval page shows before the user decides. */
export async function getAppPairing(db: Db, rawCode: string): Promise<{ app: string; device: string; expiresAt: string; claimed: boolean }> {
  const [row] = await db
    .select({ app: appPairCodes.app, device: appPairCodes.device, expiresAt: appPairCodes.expiresAt, claimedAt: appPairCodes.claimedAt })
    .from(appPairCodes)
    .where(eq(appPairCodes.code, normalizeAppPairCode(rawCode)));
  if (!row || row.expiresAt.getTime() < Date.now()) throw new NotFoundError("Pairing code not found or expired");
  return { app: row.app, device: row.device, expiresAt: row.expiresAt.toISOString(), claimed: !!row.claimedAt };
}

export interface AppTokenRow {
  id: string;
  app: string;
  device: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
}

function mapToken(t: { id: string; app: string; device: string; createdAt: Date; lastUsedAt: Date | null; expiresAt: Date }): AppTokenRow {
  return {
    id: t.id,
    app: t.app,
    device: t.device,
    createdAt: t.createdAt.toISOString(),
    lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
    expiresAt: t.expiresAt.toISOString(),
  };
}

/** Turns a pending code into a token for `userId`. */
export async function claimAppPairing(db: Db, userId: string, rawCode: string): Promise<AppTokenRow> {
  const code = normalizeAppPairCode(rawCode);
  if (code.length !== CODE_LENGTH) throw new ValidationError("Pairing code must have 6 characters");

  return db.transaction(async (tx) => {
    const [pending] = await tx
      .select()
      .from(appPairCodes)
      .where(eq(appPairCodes.code, code))
      .for("update");
    if (!pending || pending.expiresAt.getTime() < Date.now()) throw new NotFoundError("Pairing code not found or expired");
    if (pending.claimedAt) throw new ValidationError("Pairing code was already used");

    const [token] = await tx
      .insert(appTokens)
      .values({ userId, tokenHash: pending.tokenHash, app: pending.app, device: pending.device, expiresAt: new Date(Date.now() + APP_TOKEN_TTL_MS) })
      .onConflictDoNothing({ target: appTokens.tokenHash })
      .returning();
    if (!token) throw new ValidationError("This app is already connected");

    await tx.update(appPairCodes).set({ claimedAt: new Date(), claimedByUserId: userId }).where(eq(appPairCodes.id, pending.id));
    return mapToken(token);
  });
}

export type AppTokenCheck =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; reason: "unknown" | "revoked" | "expired" };

/** Resolves an app's bearer token. A token in use never expires: each use moves its date. */
export async function resolveAppToken(db: Db, rawToken: string): Promise<AppTokenCheck> {
  if (!rawToken || rawToken.length < 16) return { ok: false, reason: "unknown" };
  const [row] = await db
    .select({ id: appTokens.id, userId: appTokens.userId, expiresAt: appTokens.expiresAt, revokedAt: appTokens.revokedAt, lastUsedAt: appTokens.lastUsedAt })
    .from(appTokens)
    .where(eq(appTokens.tokenHash, hashAppToken(rawToken)));
  if (!row) return { ok: false, reason: "unknown" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_EVERY_MS) {
    await db.update(appTokens).set({ lastUsedAt: new Date(now), expiresAt: new Date(now + APP_TOKEN_TTL_MS) }).where(eq(appTokens.id, row.id));
  }
  return { ok: true, userId: row.userId, tokenId: row.id };
}

export async function listAppTokens(db: Db, userId: string): Promise<AppTokenRow[]> {
  const rows = await db
    .select()
    .from(appTokens)
    .where(and(eq(appTokens.userId, userId), isNull(appTokens.revokedAt)))
    .orderBy(appTokens.createdAt);
  return rows.filter((r) => r.expiresAt.getTime() >= Date.now()).map(mapToken);
}

/** The app signs itself out ("disconnect" in the app). */
export async function revokeAppTokenById(db: Db, tokenId: string): Promise<void> {
  await db.update(appTokens).set({ revokedAt: new Date() }).where(and(eq(appTokens.id, tokenId), isNull(appTokens.revokedAt)));
}

export async function revokeAppToken(db: Db, userId: string, tokenId: string): Promise<void> {
  const updated = await db
    .update(appTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(appTokens.id, tokenId), eq(appTokens.userId, userId), isNull(appTokens.revokedAt)))
    .returning({ id: appTokens.id });
  if (updated.length === 0) throw new NotFoundError("Connected app not found");
}

export interface AppAccount {
  name: string;
  email: string;
  /** Whether the account may create content right now, and if not, why. */
  canWrite: boolean;
  blocked: "EMAIL_NOT_VERIFIED" | "TRIAL_EXPIRED" | null;
}

/** Who the app is connected as, so it can show the account and explain a refused upload up front. */
export async function getAppAccount(db: Db, userId: string): Promise<AppAccount> {
  const [user] = await db
    .select({
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      trialEndsAt: users.trialEndsAt,
      subscriptionStatus: users.subscriptionStatus,
      subscriptionCurrentPeriodEnd: users.subscriptionCurrentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) throw new NotFoundError("User not found");
  const blocked = !user.emailVerifiedAt ? "EMAIL_NOT_VERIFIED" : !checkSubscriptionAccess(user).isActive ? "TRIAL_EXPIRED" : null;
  return { name: user.name, email: user.email, canWrite: !blocked, blocked };
}
