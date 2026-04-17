import { describe, it, expect, beforeAll } from "vitest";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG, SEED } from "../helpers/fixtures.js";

/**
 * Account deletion tests (DELETE /auth/account).
 *
 * Each destructive test registers its own fresh temporary user.
 * The seeded test users (UUID ...0099 / ...0098) are NEVER deleted.
 */

let mainApi: AxiosInstance;

beforeAll(async () => {
  await login(TEST_CONFIG.email, TEST_CONFIG.password);
  mainApi = getApi();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

const API_URL = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;

interface FreshUser {
  email: string;
  password: string;
  token: string;
  api: AxiosInstance;
}

/**
 * Register a fresh user with a unique email and return an authenticated client.
 */
async function registerFreshUser(suffix: string): Promise<FreshUser> {
  const email = `del-test-${suffix}-${Date.now()}@test.dev`;
  const password = "delete-me-password";

  const unauth = axios.create({
    baseURL: API_URL,
    validateStatus: () => true,
  });

  const res = await unauth.post("/auth/register", {
    email,
    password,
    name: `Delete Test ${suffix}`,
  });

  if (res.status !== 201) {
    throw new Error(`Failed to register fresh user: ${res.status} ${JSON.stringify(res.data)}`);
  }

  const token = res.data.token as string;
  const api = axios.create({
    baseURL: API_URL,
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: () => true,
  });

  return { email, password, token, api };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Account Deletion", () => {
  describe("Auth Guard", () => {
    it("DELETE /auth/account without token returns 401", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.delete("/auth/account", {
        data: { password: "anything" },
      });
      expect(res.status).toBe(401);
    });

    it("DELETE /auth/account with invalid token returns 401", async () => {
      const badApi = axios.create({
        baseURL: API_URL,
        headers: { Authorization: "Bearer not-a-valid-jwt-token" },
        validateStatus: () => true,
      });
      const res = await badApi.delete("/auth/account", {
        data: { password: "anything" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("Validation", () => {
    it("missing password field returns 400", async () => {
      const user = await registerFreshUser("val-nopwd");

      const res = await user.api.delete("/auth/account", {
        data: {},
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/password/i);

      // Account should still be accessible
      const me = await user.api.get("/auth/me");
      expect(me.status).toBe(200);

      // Cleanup: delete the user we just registered
      await user.api.delete("/auth/account", {
        data: { password: user.password },
      });
    });

    it("wrong password returns 401 and account survives", async () => {
      const user = await registerFreshUser("val-wrongpwd");

      const res = await user.api.delete("/auth/account", {
        data: { password: "completely-wrong-password" },
      });
      expect(res.status).toBe(401);

      // Account should still be accessible
      const me = await user.api.get("/auth/me");
      expect(me.status).toBe(200);
      expect(me.data.email).toBe(user.email);

      // Login should still work
      const loginRes = await axios.post(`${API_URL}/auth/login`, {
        email: user.email,
        password: user.password,
      });
      expect(loginRes.status).toBe(200);
      expect(loginRes.data.token).toBeTruthy();

      // Cleanup
      await user.api.delete("/auth/account", {
        data: { password: user.password },
      });
    });
  });

  describe("Happy Path with Cascading Cleanup", () => {
    it("deletes account and all associated data", async () => {
      const user = await registerFreshUser("cascade");

      // 1. Create a topic
      const topicRes = await user.api.post("/topics", {
        name: "Topic to be cascade-deleted",
      });
      expect(topicRes.status).toBe(201);
      const topicId = topicRes.data.id;

      // 2. Create a card in that topic
      const cardRes = await user.api.post("/cards", {
        topic_id: topicId,
        concept: "Card to be cascade-deleted",
        front_html: "<p>Front</p>",
        back_html: "<p>Back</p>",
        tags: ["delete-test"],
      });
      expect(cardRes.status).toBe(201);
      const cardId = cardRes.data.id;

      // 3. Submit a review for that card
      const reviewRes = await user.api.post("/reviews", {
        card_id: cardId,
        bloom_level: 0,
        rating: 3,
        question_text: "Test question for cascade delete",
      });
      expect(reviewRes.status).toBe(201);

      // 4. Verify data exists before deletion
      const getCard = await user.api.get(`/cards/${cardId}`);
      expect(getCard.status).toBe(200);
      expect(getCard.data.reviews).toHaveLength(1);

      const getTopics = await user.api.get("/topics");
      expect(getTopics.status).toBe(200);
      expect(getTopics.data.some((t: { id: string }) => t.id === topicId)).toBe(true);

      // 5. Delete the account
      const deleteRes = await user.api.delete("/auth/account", {
        data: { password: user.password },
      });
      expect(deleteRes.status).toBe(204);

      // 6. Verify: login no longer works
      const loginAttempt = await axios.create({ validateStatus: () => true })
        .post(`${API_URL}/auth/login`, {
          email: user.email,
          password: user.password,
        });
      expect(loginAttempt.status).toBe(401);

      // 7. Verify: pre-deletion token can no longer access API
      const meAfter = await user.api.get("/auth/me");
      expect(meAfter.status).toBe(401);

      // 8. Verify: card/topic data is gone (cascade-deleted with user)
      const cardAfter = await user.api.get(`/cards/${cardId}`);
      expect(cardAfter.status).toBe(404);

      const topicAfter = await user.api.get(`/topics/${topicId}`);
      expect(topicAfter.status).toBe(404);
    });
  });

  describe("Stale JWT After Deletion", () => {
    it("billing endpoints return 401 (not 500) for a stale token after account deletion", async () => {
      const user = await registerFreshUser("stale-billing");

      const deleteRes = await user.api.delete("/auth/account", {
        data: { password: user.password },
      });
      expect(deleteRes.status).toBe(204);

      // Stale JWT is still cryptographically valid but user row is gone.
      // /billing/* is exempt from the subscription DB check, so handlers must
      // guard against the missing user row themselves.
      const portalRes = await user.api.post("/billing/portal", {});
      expect(portalRes.status).toBe(401);

      const checkoutRes = await user.api.post("/billing/checkout", {
        plan: "monthly",
      });
      expect(checkoutRes.status).toBe(401);
    });
  });

  describe("Profile Update Without Stripe Customer", () => {
    it("name+email update succeeds for a user that never entered the billing flow", async () => {
      const user = await registerFreshUser("profile-nostripe");

      const newName = `Updated Name ${Date.now()}`;
      const res = await user.api.put("/auth/profile", {
        name: newName,
        email: `updated-${Date.now()}@test.dev`,
        current_password: user.password,
      });
      expect(res.status).toBe(200);
      expect(res.data.name).toBe(newName);
      expect(res.data.hasStripeCustomer).toBe(false);

      // Cleanup
      const me = await user.api.get("/auth/me");
      await user.api.delete("/auth/account", {
        data: { password: user.password },
      });
      expect(me.status).toBe(200);
    });
  });

  describe("Multi-Tenancy Isolation", () => {
    it("deleting User X does not affect seeded test user data", async () => {
      // Snapshot seeded test user's data before deletion
      const summaryBefore = await mainApi.get("/study/summary");
      expect(summaryBefore.status).toBe(200);
      const totalCardsBefore = summaryBefore.data.totalCards;

      const topicsBefore = await mainApi.get("/topics");
      expect(topicsBefore.status).toBe(200);
      const topicCountBefore = topicsBefore.data.length;

      // Register and populate User X
      const userX = await registerFreshUser("tenancy");

      const topicRes = await userX.api.post("/topics", {
        name: "User X topic for isolation test",
      });
      expect(topicRes.status).toBe(201);

      const cardRes = await userX.api.post("/cards", {
        topic_id: topicRes.data.id,
        concept: "User X card for isolation test",
        front_html: "<p>X front</p>",
        back_html: "<p>X back</p>",
      });
      expect(cardRes.status).toBe(201);

      // Delete User X
      const deleteRes = await userX.api.delete("/auth/account", {
        data: { password: userX.password },
      });
      expect(deleteRes.status).toBe(204);

      // Verify seeded test user's data is unchanged
      const summaryAfter = await mainApi.get("/study/summary");
      expect(summaryAfter.status).toBe(200);
      expect(summaryAfter.data.totalCards).toBe(totalCardsBefore);

      const topicsAfter = await mainApi.get("/topics");
      expect(topicsAfter.status).toBe(200);
      expect(topicsAfter.data.length).toBe(topicCountBefore);
    });
  });
});
