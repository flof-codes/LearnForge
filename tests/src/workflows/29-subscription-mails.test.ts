import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";
import { markEmailVerified } from "../helpers/email-verification.js";
import { postWebhook, readWebhookSecret } from "../helpers/stripe-webhook.js";

/**
 * Subscription lifecycle mails.
 *
 * The test environment has no SMTP server — the mailer only logs — so these
 * tests cover the *conditions* the mails hang off, not the delivery itself:
 * the stored locale that decides the language, and the subscription state
 * transitions that decide whether a mail goes out at all.
 */
let pgClient: pg.Client;

function authedApi(token: string): AxiosInstance {
  return axios.create({
    baseURL: TEST_CONFIG.apiUrl,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });
}

async function registerUser(email: string, locale?: string) {
  const res = await getUnauthApi().post("/auth/register", {
    email,
    password: "sub-mail-test-pwd",
    name: "Subscription Mail Test",
    ...(locale ? { locale } : {}),
  });
  expect(res.status).toBe(201);
  const { rows } = await pgClient.query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  return { token: res.data.token as string, userId: rows[0].id };
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

describe("Mail locale", () => {
  it("stores the locale the user registered in", async () => {
    const { token } = await registerUser(`locale-en-${Date.now()}@test.dev`, "en");
    const me = await authedApi(token).get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.data.locale).toBe("en");
  });

  it("defaults to de when registration sends no locale", async () => {
    const { token } = await registerUser(`locale-default-${Date.now()}@test.dev`);
    const me = await authedApi(token).get("/auth/me");
    expect(me.data.locale).toBe("de");
  });

  it("normalizes a regional tag like en-GB to en", async () => {
    const { token } = await registerUser(`locale-region-${Date.now()}@test.dev`, "en-GB");
    const me = await authedApi(token).get("/auth/me");
    expect(me.data.locale).toBe("en");
  });

  it("falls back to de for an unsupported locale", async () => {
    const { token } = await registerUser(`locale-unsupported-${Date.now()}@test.dev`, "fr-FR");
    const me = await authedApi(token).get("/auth/me");
    expect(me.data.locale).toBe("de");
  });

  it("updates the locale through a locale-only profile update", async () => {
    const email = `locale-update-${Date.now()}@test.dev`;
    const { token } = await registerUser(email, "de");
    const api = authedApi(token);

    const res = await api.put("/auth/profile", { locale: "en" });
    expect(res.status).toBe(200);
    expect(res.data.locale).toBe("en");

    expect((await api.get("/auth/me")).data.locale).toBe("en");
  });

  it("still rejects a profile update that carries nothing at all", async () => {
    const { token } = await registerUser(`locale-empty-${Date.now()}@test.dev`);
    const res = await authedApi(token).put("/auth/profile", {});
    expect(res.status).toBe(400);
  });
});

/**
 * Signing needs the shared webhook secret. Without tests/.env.test (the case on
 * a CI runner that has no Stripe credentials) these skip, matching 17-billing.
 */
const WEBHOOK_SECRET = readWebhookSecret();

describe.skipIf(!WEBHOOK_SECRET)("Subscription end mail trigger", () => {
  const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const customerId = `cus_mailtest_${runId}`;
  const subId = `sub_mailtest_${runId}`;
  const userEmail = `sub-end-${runId}@test.dev`;
  let userId: string;

  beforeAll(async () => {
    const registered = await registerUser(userEmail);
    userId = registered.userId;
    await markEmailVerified(userEmail);

    // Link the Stripe ids directly; the checkout flow is not what's under test.
    await pgClient.query(
      `UPDATE users
       SET stripe_customer_id = $1,
           stripe_subscription_id = $2,
           subscription_status = 'active',
           subscription_current_period_end = $3,
           subscription_cancel_at_period_end = true
       WHERE id = $4`,
      [customerId, subId, new Date(Date.now() + 30 * 86400 * 1000), userId],
    );
  });

  afterAll(async () => {
    await pgClient.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it("clears the subscription and the cancel flag, and survives the mail send", async () => {
    const res = await postWebhook(WEBHOOK_SECRET, "customer.subscription.deleted", {
      id: subId,
      customer: customerId,
      status: "canceled",
      items: { data: [] },
    });
    // A 200 means the handler ran to the end — including the mail call, which
    // no-ops without SMTP but must never take the webhook down with it.
    expect(res.status).toBe(200);

    const { rows } = await pgClient.query<{
      stripe_subscription_id: string | null;
      subscription_status: string;
      subscription_cancel_at_period_end: boolean;
    }>(
      `SELECT stripe_subscription_id, subscription_status, subscription_cancel_at_period_end
       FROM users WHERE id = $1`,
      [userId],
    );
    expect(rows[0].stripe_subscription_id).toBeNull();
    expect(rows[0].subscription_status).toBe("canceled");
    expect(rows[0].subscription_cancel_at_period_end).toBe(false);
  });

  it("ignores a redelivery of the same event, so no second mail can go out", async () => {
    const res = await postWebhook(WEBHOOK_SECRET, "customer.subscription.deleted", {
      id: subId,
      customer: customerId,
      status: "canceled",
      items: { data: [] },
    });
    expect(res.status).toBe(200);

    // stripe_subscription_id is already NULL, so the handler exits at the id
    // check well before the mail — the state is untouched.
    const { rows } = await pgClient.query<{ subscription_status: string }>(
      `SELECT subscription_status FROM users WHERE id = $1`,
      [userId],
    );
    expect(rows[0].subscription_status).toBe("canceled");
  });
});
