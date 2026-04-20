import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, TEST_CONFIG } from "../helpers/fixtures.js";
import { deleteFreshCard } from "../helpers/fresh-card.js";

let api: AxiosInstance;
const freshCardIds: string[] = [];

beforeAll(async () => {
  await login();
  api = getApi();
});

afterAll(async () => {
  for (const id of freshCardIds) {
    await deleteFreshCard(api, id);
  }
});

describe("Card Search", () => {
  describe("Text match", () => {
    it("finds seeded card by concept keyword", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "slope" },
      });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.cards)).toBe(true);
      expect(typeof res.data.total).toBe("number");
      expect(typeof res.data.has_more).toBe("boolean");

      const ids = res.data.cards.map((c: any) => c.id);
      expect(ids).toContain(CARDS.REV_SLOPE_INT);
    });
  });

  describe("Response shape", () => {
    it("returns cards with expected fields and pagination metadata", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "slope" },
      });
      expect(res.status).toBe(200);
      expect(res.data.cards.length).toBeGreaterThan(0);

      const card = res.data.cards[0];
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

  describe("Pagination", () => {
    it("respects limit and offset", async () => {
      const page1 = await api.get("/cards/search", {
        params: { q: "slope", limit: 1, offset: 0 },
      });
      expect(page1.status).toBe(200);
      expect(page1.data.cards.length).toBeLessThanOrEqual(1);

      if (page1.data.total > 1) {
        const page2 = await api.get("/cards/search", {
          params: { q: "slope", limit: 1, offset: 1 },
        });
        expect(page2.status).toBe(200);
        expect(page2.data.cards.length).toBeLessThanOrEqual(1);
        if (page1.data.cards.length > 0 && page2.data.cards.length > 0) {
          expect(page1.data.cards[0].id).not.toBe(page2.data.cards[0].id);
        }
      }
    });

    it("has_more is false when offset past total", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "slope", limit: 5, offset: 9999 },
      });
      expect(res.status).toBe(200);
      expect(res.data.cards).toHaveLength(0);
      expect(res.data.has_more).toBe(false);
    });
  });

  describe("Topic filter", () => {
    it("returns results within the specified topic tree", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "slope", topic_id: TOPICS.MATHEMATICS },
      });
      expect(res.status).toBe(200);
      const ids = res.data.cards.map((c: any) => c.id);
      expect(ids).toContain(CARDS.REV_SLOPE_INT);
    });

    it("excludes cards outside the topic tree", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "slope", topic_id: TOPICS.BIOLOGY },
      });
      expect(res.status).toBe(200);
      const ids = res.data.cards.map((c: any) => c.id);
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
      expect(Array.isArray(res.data.cards)).toBe(true);
      expect(res.data.cards.length).toBe(0);
      expect(res.data.total).toBe(0);
    });

    it("does not match on array literal characters in tags", async () => {
      const resBrace = await api.get("/cards/search", {
        params: { q: "{" },
      });
      expect(resBrace.status).toBe(200);
      for (const card of resBrace.data.cards) {
        expect(card.concept).not.toContain("{");
        expect((card.tags ?? []).join(" ")).not.toContain("{");
      }

      const resComma = await api.get("/cards/search", {
        params: { q: "," },
      });
      expect(resComma.status).toBe(200);
      for (const card of resComma.data.cards) {
        expect(card.concept).not.toContain(",");
        expect((card.tags ?? []).join(" ")).not.toContain(",");
      }
    });
  });

  describe("Cloze card search", () => {
    let clozeCardId: string;

    beforeAll(async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.BIOLOGY,
        concept: "Cloze searchable mitochondria energy",
        card_type: "cloze",
        cloze_data: {
          deletions: [
            { index: 1, answer: "mitochondria", hint: "organelle" },
          ],
          sourceText: "The {{c1::mitochondria::organelle}} produces ATP.",
        },
        tags: ["cloze-search-test", "biology"],
      });
      clozeCardId = res.data.id;
      freshCardIds.push(clozeCardId);
    });

    it("finds cloze card by concept keyword", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "mitochondria energy" },
      });
      expect(res.status).toBe(200);
      const ids = res.data.cards.map((c: any) => c.id);
      expect(ids).toContain(clozeCardId);
    });

    it("finds cloze card by tag", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "cloze-search-test" },
      });
      expect(res.status).toBe(200);
      const ids = res.data.cards.map((c: any) => c.id);
      expect(ids).toContain(clozeCardId);
    });

    it("cloze search result has standard search fields", async () => {
      const res = await api.get("/cards/search", {
        params: { q: "cloze searchable mitochondria" },
      });
      expect(res.status).toBe(200);
      const clozeResult = res.data.cards.find((c: any) => c.id === clozeCardId);
      expect(clozeResult).toBeDefined();
      expect(clozeResult.concept).toContain("Cloze searchable");
      expect(clozeResult.score).toBeDefined();
      expect(typeof clozeResult.score).toBe("number");
    });
  });

  describe("Multi-tenancy", () => {
    it("other user cannot see test user's cards via search", async () => {
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

      const res = await otherApi.get("/cards/search", {
        params: { q: "slope" },
      });
      expect(res.status).toBe(200);
      expect(res.data.cards).toHaveLength(0);
      expect(res.data.total).toBe(0);
    });
  });
});
