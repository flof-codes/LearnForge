import { describe, it, expect, beforeAll } from "vitest";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, TEST_CONFIG } from "../helpers/fixtures.js";

let api: AxiosInstance;

beforeAll(async () => {
  await login();
  api = getApi();
});

describe("Card Search", () => {
  describe("Text match", () => {
    it("finds seeded card by concept keyword", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "slope" },
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);

      const ids = res.data.map((c: any) => c.id);
      expect(ids).toContain(CARDS.REV_SLOPE_INT);
    });
  });

  describe("Response shape", () => {
    it("returns cards with expected fields", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "slope" },
      });
      expect(res.status).toBe(200);
      expect(res.data.length).toBeGreaterThan(0);

      const card = res.data[0];
      expect(card.id).toBeDefined();
      expect(card.concept).toBeDefined();
      expect(card.tags).toBeDefined();
      expect(card.topicId).toBeDefined();
      expect(card.score).toBeDefined();
      expect(typeof card.score).toBe("number");
      expect(card.bloomState).toBeDefined();
      expect(card.fsrsState).toBeDefined();
    });
  });

  describe("Topic filter", () => {
    it("returns results within the specified topic tree", async () => {
      // Slope-intercept is under Linear Equations, which is under Algebra, which is under Mathematics
      const res = await api.get("/cards/search", {
        params: { q: "slope", topic_id: TOPICS.MATHEMATICS },
      });
      expect(res.status).toBe(200);
      const ids = res.data.map((c: any) => c.id);
      expect(ids).toContain(CARDS.REV_SLOPE_INT);
    });

    it("excludes cards outside the topic tree", async () => {
      // Slope-intercept is NOT under Biology — it should not appear in Biology-filtered results
      const res = await api.get("/cards/search", {
        params: { q: "slope", topic_id: TOPICS.BIOLOGY },
      });
      expect(res.status).toBe(200);
      // Semantic search may return Biology cards (cosine distance ranks all cards in scope),
      // but the Math slope card must NOT be in the results
      const ids = res.data.map((c: any) => c.id);
      expect(ids).not.toContain(CARDS.REV_SLOPE_INT);
    });
  });

  describe("Validation", () => {
    it("returns 400 when q param is missing", async () => {
      const res = await api.get("/cards/search");
      expect(res.status).toBe(400);
    });
  });

  describe("Relevance filtering", () => {
    it("does not return irrelevant cards for a nonsense query", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "xyznonexistent" },
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      // With cosine distance threshold, nonsense queries should not return
      // irrelevant cards — text search finds nothing and semantic search
      // filters out results beyond the similarity threshold
      expect(res.data.length).toBe(0);
    });

    it("does not match on array literal characters in tags", async () => {
      // Searching for '{' or ',' should not match on PostgreSQL array syntax
      const resBrace = await api.get("/cards/search", {
        params: { q: "{" },
      });
      expect(resBrace.status).toBe(200);
      expect(resBrace.data.length).toBe(0);

      const resComma = await api.get("/cards/search", {
        params: { q: "," },
      });
      expect(resComma.status).toBe(200);
      expect(resComma.data.length).toBe(0);
    });
  });

  describe("Multi-tenancy", () => {
    it("other user cannot see test user's cards via search", async () => {
      // Login as the other user
      const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
      const loginRes = await axios.post(`${url}/auth/login`, {
        email: TEST_CONFIG.otherEmail,
        password: TEST_CONFIG.otherPassword,
      });
      const otherApi = axios.create({
        baseURL: url,
        headers: { Authorization: `Bearer ${loginRes.data.token}` },
        validateStatus: () => true,
      });

      // Search for a concept that belongs to the test user
      const res = await otherApi.get("/cards/search", {
        params: { q: "slope" },
      });
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(0);
    });
  });
});
