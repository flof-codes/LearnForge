import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { createHash } from "node:crypto";
import { getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";

/**
 * The API only logs mails in the test environment (no SMTP_HOST), so these
 * tests read the issued tokens straight out of auth_tokens — the same value the
 * mail would have carried.
 */
let pgClient: pg.Client;

function authedApi(token: string): AxiosInstance {
  return axios.create({
    baseURL: TEST_CONFIG.apiUrl,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });
}

async function latestToken(userId: string, type: string): Promise<string | null> {
  const res = await pgClient.query(
    `SELECT token_hash FROM auth_tokens WHERE user_id = $1 AND type = $2 ORDER BY created_at DESC LIMIT 1`,
    [userId, type],
  );
  return res.rows[0]?.token_hash ?? null;
}

/**
 * Only the hash is stored, so a test cannot read the plaintext back. It plants a
 * known token instead — the hash column is the exact thing the endpoint looks up.
 */
async function plantToken(
  userId: string,
  type: string,
  rawToken: string,
  opts: { expiresAt?: string } = {},
): Promise<string> {
  const hash = createHash("sha256").update(rawToken).digest("hex");
  // expiresAt is a SQL expression, not a value — it has to be inlined rather
  // than bound. It comes from this file only, never from test input.
  const expiresAt = opts.expiresAt ?? "now() + interval '1 hour'";
  await pgClient.query(
    `INSERT INTO auth_tokens (user_id, type, token_hash, expires_at) VALUES ($1, $2, $3, ${expiresAt})`,
    [userId, type, hash],
  );
  return rawToken;
}

async function registerUser(email: string, password = "verify-test-pwd-123") {
  const unauth = getUnauthApi();
  const res = await unauth.post("/auth/register", { email, password, name: "Verify Test" });
  expect(res.status).toBe(201);
  const { rows } = await pgClient.query(`SELECT id FROM users WHERE email = $1`, [email]);
  return { token: res.data.token as string, userId: rows[0].id as string, password };
}

beforeAll(async () => {
  pgClient = new pg.Client({
    host: "localhost",
    port: TEST_CONFIG.dbPort,
    user: TEST_CONFIG.dbUser,
    password: TEST_CONFIG.dbPassword,
    database: TEST_CONFIG.dbName,
  });
  await pgClient.connect();
});

afterAll(async () => {
  await pgClient.end();
});

describe("E-Mail Verification", () => {
  it("registration issues a verification token and leaves the account unverified", async () => {
    const { token, userId } = await registerUser(`verify-reg-${Date.now()}@test.dev`);

    expect(await latestToken(userId, "email_verify")).not.toBeNull();

    const me = await authedApi(token).get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.data.emailVerified).toBe(false);
  });

  it("blocks writes with EMAIL_NOT_VERIFIED but still allows reads", async () => {
    const { token } = await registerUser(`verify-gate-${Date.now()}@test.dev`);
    const api = authedApi(token);

    const write = await api.post("/topics", { name: "Should be blocked" });
    expect(write.status).toBe(403);
    expect(write.data.code).toBe("EMAIL_NOT_VERIFIED");

    const read = await api.get("/topics");
    expect(read.status).toBe(200);
  });

  it("confirming the token unblocks writes", async () => {
    const { token, userId } = await registerUser(`verify-confirm-${Date.now()}@test.dev`);
    const api = authedApi(token);
    const raw = await plantToken(userId, "email_verify", `raw-verify-${Date.now()}`);

    const confirm = await getUnauthApi().post("/auth/verify-email/confirm", { token: raw });
    expect(confirm.status).toBe(200);
    expect(confirm.data.success).toBe(true);

    const me = await api.get("/auth/me");
    expect(me.data.emailVerified).toBe(true);

    const write = await api.post("/topics", { name: `Verified topic ${Date.now()}` });
    expect(write.status).toBe(201);
  });

  it("rejects a token that was already used", async () => {
    const { userId } = await registerUser(`verify-reuse-${Date.now()}@test.dev`);
    const raw = await plantToken(userId, "email_verify", `raw-reuse-${Date.now()}`);
    const unauth = getUnauthApi();

    expect((await unauth.post("/auth/verify-email/confirm", { token: raw })).status).toBe(200);

    const second = await unauth.post("/auth/verify-email/confirm", { token: raw });
    expect(second.status).toBe(400);
    expect(second.data.error).toMatch(/invalid or has expired/i);
  });

  it("rejects an expired token", async () => {
    const { userId } = await registerUser(`verify-expired-${Date.now()}@test.dev`);
    const raw = await plantToken(userId, "email_verify", `raw-expired-${Date.now()}`, {
      expiresAt: "now() - interval '1 minute'",
    });

    const res = await getUnauthApi().post("/auth/verify-email/confirm", { token: raw });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown token", async () => {
    const res = await getUnauthApi().post("/auth/verify-email/confirm", { token: "not-a-real-token" });
    expect(res.status).toBe(400);
  });

  it("resend is rate limited, and reports already-verified without issuing a token", async () => {
    const { token, userId } = await registerUser(`verify-resend-${Date.now()}@test.dev`);
    const api = authedApi(token);

    // Registration just issued one, so an immediate resend hits the cooldown.
    const throttled = await api.post("/auth/verify-email/request", {});
    expect(throttled.status).toBe(400);
    expect(throttled.data.error).toMatch(/wait a moment/i);

    const raw = await plantToken(userId, "email_verify", `raw-resend-${Date.now()}`);
    await getUnauthApi().post("/auth/verify-email/confirm", { token: raw });

    const afterVerify = await api.post("/auth/verify-email/request", {});
    expect(afterVerify.status).toBe(200);
    expect(afterVerify.data.already_verified).toBe(true);
  });

  it("changing the e-mail address revokes verification", async () => {
    const email = `verify-change-${Date.now()}@test.dev`;
    const { token, userId, password } = await registerUser(email);
    const api = authedApi(token);

    const raw = await plantToken(userId, "email_verify", `raw-change-${Date.now()}`);
    await getUnauthApi().post("/auth/verify-email/confirm", { token: raw });
    expect((await api.get("/auth/me")).data.emailVerified).toBe(true);

    const changed = await api.put("/auth/profile", {
      email: `verify-changed-${Date.now()}@test.dev`,
      current_password: password,
    });
    expect(changed.status).toBe(200);
    expect(changed.data.emailVerified).toBe(false);

    const write = await api.post("/topics", { name: "Blocked after e-mail change" });
    expect(write.status).toBe(403);
    expect(write.data.code).toBe("EMAIL_NOT_VERIFIED");
  });
});

describe("Password Reset", () => {
  it("answers 200 for an unknown address without issuing a token", async () => {
    const before = await pgClient.query(
      `SELECT count(*)::int AS n FROM auth_tokens WHERE type = 'password_reset'`,
    );

    const res = await getUnauthApi().post("/auth/password-reset/request", {
      email: `no-such-user-${Date.now()}@test.dev`,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    const after = await pgClient.query(
      `SELECT count(*)::int AS n FROM auth_tokens WHERE type = 'password_reset'`,
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("issues a token for a known address", async () => {
    const email = `reset-known-${Date.now()}@test.dev`;
    const { userId } = await registerUser(email);

    const res = await getUnauthApi().post("/auth/password-reset/request", { email });
    expect(res.status).toBe(200);
    expect(await latestToken(userId, "password_reset")).not.toBeNull();
  });

  it("sets the new password, logs in with it, and rejects the old one", async () => {
    const email = `reset-flow-${Date.now()}@test.dev`;
    const { userId, password } = await registerUser(email);
    const raw = await plantToken(userId, "password_reset", `raw-reset-${Date.now()}`);
    const unauth = getUnauthApi();
    const newPassword = "brand-new-password-9";

    const confirm = await unauth.post("/auth/password-reset/confirm", {
      token: raw,
      new_password: newPassword,
    });
    expect(confirm.status).toBe(200);

    expect((await unauth.post("/auth/login", { email, password: newPassword })).status).toBe(200);
    expect((await unauth.post("/auth/login", { email, password })).status).toBe(401);
  });

  it("also settles verification, since the mail proved control of the address", async () => {
    const email = `reset-verifies-${Date.now()}@test.dev`;
    const { userId } = await registerUser(email);
    const raw = await plantToken(userId, "password_reset", `raw-resetver-${Date.now()}`);
    const unauth = getUnauthApi();

    await unauth.post("/auth/password-reset/confirm", { token: raw, new_password: "verified-by-reset-1" });

    const login = await unauth.post("/auth/login", { email, password: "verified-by-reset-1" });
    const me = await authedApi(login.data.token).get("/auth/me");
    expect(me.data.emailVerified).toBe(true);
  });

  it("burns every outstanding reset link once one is used", async () => {
    const email = `reset-burn-${Date.now()}@test.dev`;
    const { userId } = await registerUser(email);
    const older = await plantToken(userId, "password_reset", `raw-older-${Date.now()}`);
    const newer = await plantToken(userId, "password_reset", `raw-newer-${Date.now()}`);
    const unauth = getUnauthApi();

    expect(
      (await unauth.post("/auth/password-reset/confirm", { token: newer, new_password: "first-reset-pw-1" }))
        .status,
    ).toBe(200);

    const replay = await unauth.post("/auth/password-reset/confirm", {
      token: older,
      new_password: "second-reset-pw-2",
    });
    expect(replay.status).toBe(400);

    // The first reset must still be the password that works.
    expect((await unauth.post("/auth/login", { email, password: "first-reset-pw-1" })).status).toBe(200);
  });

  it("rejects an expired reset token", async () => {
    const { userId } = await registerUser(`reset-expired-${Date.now()}@test.dev`);
    const raw = await plantToken(userId, "password_reset", `raw-resetexp-${Date.now()}`, {
      expiresAt: "now() - interval '1 minute'",
    });

    const res = await getUnauthApi().post("/auth/password-reset/confirm", {
      token: raw,
      new_password: "should-not-apply-1",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a new password shorter than 8 characters", async () => {
    const { userId } = await registerUser(`reset-short-${Date.now()}@test.dev`);
    const raw = await plantToken(userId, "password_reset", `raw-resetshort-${Date.now()}`);

    const res = await getUnauthApi().post("/auth/password-reset/confirm", {
      token: raw,
      new_password: "short",
    });
    expect(res.status).toBe(400);

    // The token must survive a rejected attempt, or a typo would cost the link.
    const retry = await getUnauthApi().post("/auth/password-reset/confirm", {
      token: raw,
      new_password: "long-enough-password-1",
    });
    expect(retry.status).toBe(200);
  });
});
