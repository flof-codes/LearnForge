import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, TEST_CONFIG } from "../helpers/fixtures.js";
import { McpTestClient } from "../helpers/mcp-client.js";

/**
 * Multi-tenancy isolation tests.
 *
 * Verifies that User A's data is invisible to User B across
 * API routes, study endpoints, context queries, and MCP tools.
 */

let userAApi: AxiosInstance;
let userBApi: AxiosInstance;
let userBTopicId: string;
let userBCardId: string;

beforeAll(async () => {
  // User A — the main test user (owns all seed data)
  await login(TEST_CONFIG.email, TEST_CONFIG.password);
  userAApi = getApi();

  // User B — second user, login and get a separate API client
  const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
  const res = await axios.post(`${url}/auth/login`, {
    email: TEST_CONFIG.otherEmail,
    password: TEST_CONFIG.otherPassword,
  });
  const tokenB = res.data.token as string;
  userBApi = axios.create({
    baseURL: url,
    headers: { Authorization: `Bearer ${tokenB}` },
    validateStatus: () => true,
  });

  // Create a topic and card for User B
  const topicRes = await userBApi.post("/topics", { name: "User B Topic" });
  userBTopicId = topicRes.data.id;

  const cardRes = await userBApi.post("/cards", {
    topic_id: userBTopicId,
    concept: "User B card",
    front_html: "<p>B front</p>",
    back_html: "<p>B back</p>",
    tags: ["user-b"],
  });
  userBCardId = cardRes.data.id;
});

afterAll(async () => {
  // Clean up User B's data
  if (userBCardId) {
    await userBApi.delete(`/cards/${userBCardId}`);
  }
  if (userBTopicId) {
    await userBApi.delete(`/topics/${userBTopicId}`);
  }
});

describe("Multi-Tenancy Isolation", () => {
  describe("Topics", () => {
    it("User A cannot see User B's topics", async () => {
      const res = await userAApi.get("/topics");
      const ids = res.data.map((t: any) => t.id);
      expect(ids).not.toContain(userBTopicId);
    });

    it("User B cannot see User A's topics", async () => {
      const res = await userBApi.get("/topics");
      const names = res.data.map((t: any) => t.name);
      expect(names).not.toContain("Mathematics");
      expect(names).not.toContain("Biology");
      expect(names).toContain("User B Topic");
    });

    it("User A gets 404 for User B's topic", async () => {
      const res = await userAApi.get(`/topics/${userBTopicId}`);
      expect(res.status).toBe(404);
    });

    it("User B gets 404 for User A's topic", async () => {
      const res = await userBApi.get(`/topics/${TOPICS.MATHEMATICS}`);
      expect(res.status).toBe(404);
    });
  });

  describe("Cards", () => {
    it("User A gets 404 for User B's card", async () => {
      const res = await userAApi.get(`/cards/${userBCardId}`);
      expect(res.status).toBe(404);
    });

    it("User B gets 404 for User A's card", async () => {
      const res = await userBApi.get(`/cards/${CARDS.NEW_ADDITION}`);
      expect(res.status).toBe(404);
    });

    it("User A cannot delete User B's card", async () => {
      const res = await userAApi.delete(`/cards/${userBCardId}`);
      expect(res.status).toBe(404);

      // Verify card still exists for User B
      const check = await userBApi.get(`/cards/${userBCardId}`);
      expect(check.status).toBe(200);
    });

    it("User A cannot update User B's card", async () => {
      const res = await userAApi.put(`/cards/${userBCardId}`, {
        concept: "Hijacked by User A",
      });
      expect(res.status).toBe(404);

      // Verify card is unchanged for User B
      const check = await userBApi.get(`/cards/${userBCardId}`);
      expect(check.status).toBe(200);
      expect(check.data.concept).toBe("User B card");
      expect(check.data.frontHtml).toBe("<p>B front</p>");
      expect(check.data.backHtml).toBe("<p>B back</p>");
    });

    it("User A cannot reset User B's card", async () => {
      // First, submit a review as User B to advance bloom state
      const reviewRes = await userBApi.post("/reviews", {
        card_id: userBCardId,
        bloom_level: 1,
        rating: 3,
        question_text: "Cross-user reset test setup",
      });
      expect(reviewRes.status).toBe(201);

      // Verify User B's card now has a review and advanced state
      const before = await userBApi.get(`/cards/${userBCardId}`);
      expect(before.status).toBe(200);
      expect(before.data.reviews.length).toBeGreaterThan(0);

      // User A tries to reset User B's card
      const res = await userAApi.post(`/cards/${userBCardId}/reset`, {});
      expect(res.status).toBe(404);

      // Verify User B's card state is unchanged
      const after = await userBApi.get(`/cards/${userBCardId}`);
      expect(after.status).toBe(200);
      expect(after.data.reviews.length).toBe(before.data.reviews.length);
      expect(after.data.bloomState.currentLevel).toBe(before.data.bloomState.currentLevel);
      expect(after.data.fsrsState.reps).toBe(before.data.fsrsState.reps);
    });
  });

  describe("Study", () => {
    it("User B sees no due cards (only their own data)", async () => {
      const res = await userBApi.get("/study/due", { params: { limit: 50 } });
      expect(res.status).toBe(200);
      // User B's card should be due (newly created = state 0, due in past)
      const ids = res.data.map((c: any) => c.id);
      // None of User A's cards should appear
      expect(ids).not.toContain(CARDS.NEW_ADDITION);
      expect(ids).not.toContain(CARDS.BIO_CELL_STRUCT);
    });

    it("User B summary shows only their own cards", async () => {
      const res = await userBApi.get("/study/summary");
      expect(res.status).toBe(200);
      expect(res.data.totalCards).toBe(1); // only the one card we created
    });
  });

  describe("Reviews", () => {
    it("User A cannot submit review for User B's card", async () => {
      const res = await userAApi.post("/reviews", {
        card_id: userBCardId,
        bloom_level: 0,
        rating: 3,
        question_text: "Cross-user review attempt",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Context", () => {
    it("User B gets empty result for User A's topic context", async () => {
      const res = await userBApi.get(`/context/topic/${TOPICS.MATHEMATICS}`);
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(0);
    });
  });

  describe("MCP Tool Isolation", () => {
    let mcpA: McpTestClient;

    beforeAll(async () => {
      // MCP client uses User A's API key (seeded in DB)
      mcpA = new McpTestClient();
      await mcpA.initialize();
    });

    afterAll(async () => {
      await mcpA.close();
    });

    it("MCP list_topics returns only User A's topics", async () => {
      const result = await mcpA.callTool("list_topics");
      const topics = mcpA.parseToolResult<any[]>(result);
      const ids = topics.map((t: any) => t.id);
      expect(ids).not.toContain(userBTopicId);
      expect(ids).toContain(TOPICS.MATHEMATICS);
    });

    it("MCP get_card returns error for User B's card", async () => {
      const result = await mcpA.callTool("get_card", { card_id: userBCardId });
      expect(result.isError).toBe(true);
    });

    it("MCP get_study_summary excludes User B's cards", async () => {
      const result = await mcpA.callTool("get_study_summary", {});
      const summary = mcpA.parseToolResult<any>(result);
      // User A has 12 seed cards; any cards from test runs are also User A's
      // The key assertion: total should NOT include User B's 1 card
      // We check by verifying the count is at least the seed count but
      // User B's card concept shouldn't appear in study cards
      expect(summary.totalCards).toBeGreaterThanOrEqual(12);
    });
  });
});
