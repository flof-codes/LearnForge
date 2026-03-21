import { describe, it, expect, beforeAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
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

const STRIPE_CONFIGURED = !!process.env.STRIPE_SECRET_KEY;

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

    // TODO: Webhook with valid signature requires the `stripe` npm package
    // for `stripe.webhooks.generateTestHeaderString()`. If added as a test
    // dependency, a valid-signature test can be written as follows:
    //
    // import Stripe from "stripe";
    // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
    // const header = stripe.webhooks.generateTestHeaderString({
    //   payload,
    //   secret: process.env.STRIPE_WEBHOOK_SECRET!,
    // });
    // This may also require @fastify/raw-body to be configured for the
    // test API container so that `request.rawBody` is available.
  });
});
