import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import pg from "pg";
import { createHmac } from "node:crypto";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.test so the skip check can see STRIPE_SECRET_KEY
const __dirname = dirname(fileURLToPath(import.meta.url));
const envTestPath = resolve(__dirname, "../../.env.test");
if (existsSync(envTestPath)) {
  for (const line of readFileSync(envTestPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
  }
}

const STRIPE_CONFIGURED =
  !!process.env.STRIPE_SECRET_KEY &&
  !process.env.STRIPE_SECRET_KEY.endsWith("...") &&
  !!process.env.STRIPE_PRICE_ID_MONTHLY &&
  !process.env.STRIPE_PRICE_ID_MONTHLY.endsWith("...");

let api: AxiosInstance;

beforeAll(async () => {
  await login();
  api = getApi();
});

describe("Billing", () => {
  // ── Auth guards (always run) ────────────────────────────────────────────

  describe("Auth Required", () => {
    it("POST /billing/checkout without auth → 401", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.post("/billing/checkout", { plan: "monthly" });
      expect(res.status).toBe(401);
    });

    it("POST /billing/portal without auth → 401", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.post("/billing/portal");
      expect(res.status).toBe(401);
    });
  });

  // ── Validation (always run) ─────────────────────────────────────────────

  describe("Validation", () => {
    it("POST /billing/webhook without stripe-signature header → 400", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.post("/billing/webhook", { fake: "payload" });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/stripe-signature/i);
    });

    it("POST /billing/checkout with invalid plan → 400", async () => {
      const res = await api.post("/billing/checkout", { plan: "invalid" });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/invalid plan/i);
    });
  });

  // ── Stripe-dependent tests ──────────────────────────────────────────────

  describe.skipIf(!STRIPE_CONFIGURED)("Stripe Integration", () => {
    it("POST /billing/checkout with plan 'monthly' → returns { url }", async () => {
      const res = await api.post("/billing/checkout", { plan: "monthly" });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty("url");
      expect(typeof res.data.url).toBe("string");
      expect(res.data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    });

    it("POST /billing/portal with no Stripe customer → 400", async () => {
      // Use a freshly registered user who has never checked out
      const unauth = getUnauthApi();
      const email = `billing-portal-${Date.now()}@test.dev`;
      const regRes = await unauth.post("/auth/register", {
        email,
        password: "billing-portal-pwd",
        name: "Portal Test",
      });
      expect(regRes.status).toBe(201);

      const freshApi = getUnauthApi();
      freshApi.defaults.headers.common["Authorization"] = `Bearer ${regRes.data.token}`;

      const res = await freshApi.post("/billing/portal", {});
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/no billing account/i);
    });

    it("POST /billing/webhook with invalid signature → 400", async () => {
      const payload = JSON.stringify({
        id: "evt_test_invalid",
        type: "customer.subscription.created",
        data: {
          object: {
            customer: "cus_test",
            status: "active",
            items: {
              data: [
                {
                  current_period_end:
                    Math.floor(Date.now() / 1000) + 86400 * 30,
                },
              ],
            },
          },
        },
      });

      const unauth = getUnauthApi();
      const res = await unauth.post("/billing/webhook", payload, {
        headers: {
          "stripe-signature": "t=1234567890,v1=invalid_signature",
          "Content-Type": "application/json",
        },
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/signature verification failed/i);
    });

  });

  // ── Subscription-aware webhook routing ──────────────────────────────────
  // These tests verify that stale events from old subscriptions cannot
  // overwrite the row of a user linked to a different (active) subscription.
  // They use signed synthetic payloads — no live Stripe calls needed for the
  // "ignore" branches, which is what we care about most.

  describe("Webhook routing (subscription-aware)", () => {
    // Read secret directly from .env.test (the file Docker Compose loads into
    // the test-api container) so the test always signs with the same value the
    // API verifies with — no dependency on env-var loading order or CI quirks.
    const WEBHOOK_SECRET = (() => {
      const path = resolve(__dirname, "../../.env.test");
      if (!existsSync(path)) return "";
      for (const line of readFileSync(path, "utf-8").split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("STRIPE_WEBHOOK_SECRET=")) {
          return trimmed.slice("STRIPE_WEBHOOK_SECRET=".length);
        }
      }
      return "";
    })();
    const runId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const customerId = `cus_test_${runId}`;
    const activeSubId = `sub_test_active_${runId}`;
    const staleSubId = `sub_test_stale_${runId}`;
    const userEmail = `webhook-routing-${runId}@test.dev`;
    let userId: string;
    let pgClient: pg.Client;

    beforeAll(async () => {
      // Fail loudly if the secret didn't load — saves chasing mysterious 400s.
      expect(
        WEBHOOK_SECRET.length,
        "STRIPE_WEBHOOK_SECRET could not be read from tests/.env.test — webhook tests cannot sign payloads",
      ).toBeGreaterThan(0);

      pgClient = new pg.Client({
        host: "localhost",
        port: TEST_CONFIG.dbPort,
        user: TEST_CONFIG.dbUser,
        password: TEST_CONFIG.dbPassword,
        database: TEST_CONFIG.dbName,
      });
      await pgClient.connect();

      // Register a fresh user, then directly set their Stripe linkage in DB
      // (skipping checkout flow — we're isolating webhook routing behavior).
      const unauth = getUnauthApi();
      const reg = await unauth.post("/auth/register", {
        email: userEmail,
        password: "webhook-routing-pwd",
        name: "Webhook Routing Test",
      });
      expect(reg.status).toBe(201);
      userId = (
        await pgClient.query<{ id: string }>(
          `SELECT id FROM users WHERE email = $1`,
          [userEmail],
        )
      ).rows[0].id;

      const futurePeriodEnd = new Date(Date.now() + 30 * 86400 * 1000);
      await pgClient.query(
        `UPDATE users
         SET stripe_customer_id = $1,
             stripe_subscription_id = $2,
             subscription_status = 'active',
             subscription_current_period_end = $3
         WHERE id = $4`,
        [customerId, activeSubId, futurePeriodEnd, userId],
      );
    });

    afterAll(async () => {
      await pgClient.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await pgClient.end();
    });

    function signWebhook(payload: string): string {
      const timestamp = Math.floor(Date.now() / 1000);
      const signedPayload = `${timestamp}.${payload}`;
      const signature = createHmac("sha256", WEBHOOK_SECRET)
        .update(signedPayload)
        .digest("hex");
      return `t=${timestamp},v1=${signature}`;
    }

    async function postWebhook(eventType: string, eventObject: Record<string, unknown>) {
      const payload = JSON.stringify({
        id: `evt_test_${runId}_${Math.random().toString(36).slice(2, 8)}`,
        type: eventType,
        data: { object: eventObject },
      });
      const unauth = getUnauthApi();
      return unauth.post("/billing/webhook", payload, {
        headers: {
          "stripe-signature": signWebhook(payload),
          "Content-Type": "application/json",
        },
      });
    }

    it("ignores customer.subscription.deleted for a stale (non-matching) sub id", async () => {
      const res = await postWebhook("customer.subscription.deleted", {
        id: staleSubId,
        customer: customerId,
        status: "canceled",
        items: { data: [] },
      });
      expect(res.status).toBe(200);

      const { rows } = await pgClient.query<{
        stripe_subscription_id: string;
        subscription_status: string;
      }>(
        `SELECT stripe_subscription_id, subscription_status FROM users WHERE id = $1`,
        [userId],
      );
      expect(rows[0].stripe_subscription_id).toBe(activeSubId);
      expect(rows[0].subscription_status).toBe("active");
    });

    it("ignores invoice.payment_failed for a stale (non-matching) sub id", async () => {
      const res = await postWebhook("invoice.payment_failed", {
        id: `in_test_${runId}`,
        customer: customerId,
        subscription: staleSubId,
      });
      expect(res.status).toBe(200);

      const { rows } = await pgClient.query<{ subscription_status: string }>(
        `SELECT subscription_status FROM users WHERE id = $1`,
        [userId],
      );
      expect(rows[0].subscription_status).toBe("active");
    });

    it("ignores customer.subscription.updated for a stale sub when user has a different sub linked", async () => {
      const res = await postWebhook("customer.subscription.updated", {
        id: staleSubId,
        customer: customerId,
        status: "incomplete_expired",
        items: { data: [] },
      });
      expect(res.status).toBe(200);

      const { rows } = await pgClient.query<{
        stripe_subscription_id: string;
        subscription_status: string;
      }>(
        `SELECT stripe_subscription_id, subscription_status FROM users WHERE id = $1`,
        [userId],
      );
      expect(rows[0].stripe_subscription_id).toBe(activeSubId);
      expect(rows[0].subscription_status).toBe("active");
    });

    it("processes invoice.payment_failed for the matching active sub → past_due", async () => {
      const res = await postWebhook("invoice.payment_failed", {
        id: `in_test_${runId}_match`,
        customer: customerId,
        subscription: activeSubId,
      });
      expect(res.status).toBe(200);

      const { rows } = await pgClient.query<{
        subscription_status: string;
        stripe_subscription_id: string;
      }>(
        `SELECT subscription_status, stripe_subscription_id FROM users WHERE id = $1`,
        [userId],
      );
      expect(rows[0].subscription_status).toBe("past_due");
      expect(rows[0].stripe_subscription_id).toBe(activeSubId);

      // restore for subsequent tests
      await pgClient.query(
        `UPDATE users SET subscription_status = 'active' WHERE id = $1`,
        [userId],
      );
    });

    it("ignores subscription events for users with admin 'free' override", async () => {
      // Restore link first (previous test cleared period_end and changed status)
      const futurePeriodEnd = new Date(Date.now() + 30 * 86400 * 1000);
      await pgClient.query(
        `UPDATE users
         SET stripe_subscription_id = $1,
             subscription_status = 'free',
             subscription_current_period_end = NULL
         WHERE id = $2`,
        [activeSubId, userId],
      );

      const res = await postWebhook("customer.subscription.updated", {
        id: activeSubId,
        customer: customerId,
        status: "active",
        items: { data: [{ current_period_end: Math.floor(futurePeriodEnd.getTime() / 1000) }] },
      });
      expect(res.status).toBe(200);

      const { rows } = await pgClient.query<{ subscription_status: string }>(
        `SELECT subscription_status FROM users WHERE id = $1`,
        [userId],
      );
      expect(rows[0].subscription_status).toBe("free");

      // Restore for the next test
      await pgClient.query(
        `UPDATE users
         SET subscription_status = 'active',
             subscription_current_period_end = $1
         WHERE id = $2`,
        [futurePeriodEnd, userId],
      );
    });

    it("processes customer.subscription.deleted for the matching active sub → canceled and unlinked", async () => {
      const res = await postWebhook("customer.subscription.deleted", {
        id: activeSubId,
        customer: customerId,
        status: "canceled",
        items: { data: [] },
      });
      expect(res.status).toBe(200);

      const { rows } = await pgClient.query<{
        stripe_subscription_id: string | null;
        subscription_status: string;
        subscription_current_period_end: Date | null;
      }>(
        `SELECT stripe_subscription_id, subscription_status, subscription_current_period_end
         FROM users WHERE id = $1`,
        [userId],
      );
      expect(rows[0].stripe_subscription_id).toBeNull();
      expect(rows[0].subscription_status).toBe("canceled");
      expect(rows[0].subscription_current_period_end).toBeNull();
    });
  });
});
