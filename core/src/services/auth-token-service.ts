import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { authTokens } from "../db/schema/index.js";
import { ValidationError } from "../lib/errors.js";

export type AuthTokenType = "email_verify" | "password_reset";

/**
 * Verification links are long-lived because a user may open the mail the next
 * day; reset links are short-lived because they are a live credential.
 */
export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  email_verify: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

/** Minimum gap between two mails of the same type for one user. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Issues a single-use token and returns the plaintext — the only place it ever
 * exists. Callers must put it in a mail and then drop it.
 *
 * Throws ValidationError when the same user asked for the same token type less
 * than RESEND_COOLDOWN_MS ago, which keeps the endpoints from being used to
 * flood a third party's inbox.
 */
export async function createAuthToken(
  db: Db,
  userId: string,
  type: AuthTokenType,
): Promise<string> {
  const [recent] = await db
    .select({ createdAt: authTokens.createdAt })
    .from(authTokens)
    .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type)))
    .orderBy(desc(authTokens.createdAt))
    .limit(1);

  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new ValidationError("Please wait a moment before requesting another e-mail");
  }

  const rawToken = randomBytes(32).toString("base64url");

  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash: hashAuthToken(rawToken),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
  });

  return rawToken;
}

/**
 * Redeems a token and returns the owning user id.
 *
 * The UPDATE ... WHERE used_at IS NULL is what makes the token single-use: two
 * concurrent requests race on the same row and only one of them gets a result
 * back, so a leaked link cannot be replayed.
 */
export async function consumeAuthToken(
  db: Db,
  rawToken: string,
  type: AuthTokenType,
): Promise<string> {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, hashAuthToken(rawToken)),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, sql`now()`),
      ),
    )
    .returning({ userId: authTokens.userId });

  if (!row) throw new ValidationError("This link is invalid or has expired");

  return row.userId;
}

/** Burns all outstanding tokens of a type, e.g. after a successful reset. */
export async function invalidateAuthTokens(
  db: Db,
  userId: string,
  type: AuthTokenType,
): Promise<void> {
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.userId, userId),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
      ),
    );
}
