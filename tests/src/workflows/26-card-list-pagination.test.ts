import { describe, it, expect, beforeAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, SEED } from "../helpers/fixtures.js";

let api: AxiosInstance;

beforeAll(async () => {
  await login();
  api = getApi();
});

describe("Card list pagination (GET /cards)", () => {
  describe("Response shape", () => {
    it("returns { cards, total, has_more } with defaults", async () => {
      const res = await api.get("/cards");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.cards)).toBe(true);
      expect(typeof res.data.total).toBe("number");
      expect(typeof res.data.has_more).toBe("boolean");
      expect(res.data.total).toBe(SEED.totalCards);
    });

    it("each card includes bloomState and fsrsState fields", async () => {
      const res = await api.get("/cards", { params: { limit: 1 } });
      expect(res.status).toBe(200);
      const card = res.data.cards[0];
      expect(card.id).toBeDefined();
      expect(card.concept).toBeDefined();
      expect(card.topicId).toBeDefined();
      expect(card.bloomState).toBeDefined();
      // fsrsState is null for brand-new cards without FSRS yet — field must be present
      expect("fsrsState" in card).toBe(true);
    });
  });

  describe("Pagination bounds", () => {
    it("limits results by limit param", async () => {
      const res = await api.get("/cards", { params: { limit: 3 } });
      expect(res.status).toBe(200);
      expect(res.data.cards.length).toBeLessThanOrEqual(3);
      expect(res.data.total).toBe(SEED.totalCards);
      expect(res.data.has_more).toBe(SEED.totalCards > 3);
    });

    it("applies offset to skip rows", async () => {
      const page1 = await api.get("/cards", { params: { limit: 5, offset: 0 } });
      const page2 = await api.get("/cards", { params: { limit: 5, offset: 5 } });
      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      const ids1 = new Set(page1.data.cards.map((c: any) => c.id));
      const ids2 = new Set(page2.data.cards.map((c: any) => c.id));
      // Pages must not overlap
      for (const id of ids1) {
        expect(ids2.has(id)).toBe(false);
      }
    });

    it("offset past total returns empty page", async () => {
      const res = await api.get("/cards", { params: { offset: 9999, limit: 25 } });
      expect(res.status).toBe(200);
      expect(res.data.cards).toHaveLength(0);
      expect(res.data.has_more).toBe(false);
    });

    it("caps limit at 100", async () => {
      const res = await api.get("/cards", { params: { limit: 500 } });
      expect(res.status).toBe(200);
      expect(res.data.cards.length).toBeLessThanOrEqual(100);
    });
  });

  describe("Topic filter with descendants", () => {
    it("returns full tree rollup when topic_id given (default)", async () => {
      const res = await api.get("/cards", {
        params: { topic_id: TOPICS.MATHEMATICS, limit: 100 },
      });
      expect(res.status).toBe(200);
      expect(res.data.total).toBe(SEED.mathTreeCards);
    });

    it("honors include_descendants=false for direct-only cards", async () => {
      const res = await api.get("/cards", {
        params: {
          topic_id: TOPICS.MATHEMATICS,
          include_descendants: "false",
          limit: 100,
        },
      });
      expect(res.status).toBe(200);
      expect(res.data.total).toBe(SEED.mathDirectCards);
    });

    it("returns 0 cards for empty topic", async () => {
      const res = await api.get("/cards", {
        params: { topic_id: TOPICS.EMPTY_TOPIC },
      });
      expect(res.status).toBe(200);
      expect(res.data.total).toBe(0);
      expect(res.data.cards).toHaveLength(0);
    });
  });

  describe("Status filter", () => {
    it("status=new returns only unstudied cards", async () => {
      const res = await api.get("/cards", { params: { status: "new", limit: 100 } });
      expect(res.status).toBe(200);
      for (const card of res.data.cards) {
        expect(card.fsrsState === null || card.fsrsState.state === 0).toBe(true);
      }
      expect(res.data.total).toBe(SEED.fsrsStates.new);
    });

    it("status=due returns only due scheduled cards", async () => {
      const res = await api.get("/cards", { params: { status: "due", limit: 100 } });
      expect(res.status).toBe(200);
      const now = Date.now();
      for (const card of res.data.cards) {
        expect(card.fsrsState).not.toBeNull();
        expect(card.fsrsState.state).not.toBe(0);
        expect(new Date(card.fsrsState.due).getTime()).toBeLessThanOrEqual(now);
      }
    });

    it("status=learning returns state 1 or 3", async () => {
      const res = await api.get("/cards", {
        params: { status: "learning", limit: 100 },
      });
      expect(res.status).toBe(200);
      for (const card of res.data.cards) {
        expect([1, 3]).toContain(card.fsrsState.state);
      }
    });
  });

  describe("Bloom filter", () => {
    it("filters by exact bloom level", async () => {
      const res = await api.get("/cards", {
        params: { bloom_level: 3, limit: 100 },
      });
      expect(res.status).toBe(200);
      for (const card of res.data.cards) {
        expect(card.bloomState.currentLevel).toBe(3);
      }
    });
  });

  describe("Search filter", () => {
    it("ILIKE matches on concept", async () => {
      const res = await api.get("/cards", {
        params: { search: "slope", limit: 100 },
      });
      expect(res.status).toBe(200);
      const ids = res.data.cards.map((c: any) => c.id);
      expect(ids).toContain(CARDS.REV_SLOPE_INT);
    });
  });

  describe("Sort", () => {
    it("sort=concept returns alphabetical order", async () => {
      const res = await api.get("/cards", {
        params: { sort: "concept", limit: 100 },
      });
      expect(res.status).toBe(200);
      const concepts = res.data.cards.map((c: any) => c.concept.toLowerCase());
      const sorted = [...concepts].sort();
      expect(concepts).toEqual(sorted);
    });

    it("sort=newest and sort=oldest both return all cards (stable tiebreaker)", async () => {
      // Seed cards share a created_at value, so the tiebreaker (c.id ASC) makes
      // the two orderings identical. Just verify both return the full set with
      // the same cards, and that each ordering is internally non-decreasing /
      // non-increasing on created_at.
      const newest = await api.get("/cards", {
        params: { sort: "newest", limit: SEED.totalCards },
      });
      const oldest = await api.get("/cards", {
        params: { sort: "oldest", limit: SEED.totalCards },
      });
      expect(newest.data.cards).toHaveLength(SEED.totalCards);
      expect(oldest.data.cards).toHaveLength(SEED.totalCards);

      const newestTimes = newest.data.cards.map((c: any) => new Date(c.createdAt).getTime());
      for (let i = 1; i < newestTimes.length; i++) {
        expect(newestTimes[i]).toBeLessThanOrEqual(newestTimes[i - 1]);
      }
      const oldestTimes = oldest.data.cards.map((c: any) => new Date(c.createdAt).getTime());
      for (let i = 1; i < oldestTimes.length; i++) {
        expect(oldestTimes[i]).toBeGreaterThanOrEqual(oldestTimes[i - 1]);
      }
    });
  });

  describe("Combined filters", () => {
    it("topic + status + bloom work together", async () => {
      const res = await api.get("/cards", {
        params: {
          topic_id: TOPICS.MATHEMATICS,
          status: "new",
          bloom_level: 0,
          limit: 100,
        },
      });
      expect(res.status).toBe(200);
      for (const card of res.data.cards) {
        expect(card.bloomState.currentLevel).toBe(0);
        expect(card.fsrsState === null || card.fsrsState.state === 0).toBe(true);
      }
    });
  });

  describe("Multi-tenancy", () => {
    it("only returns cards owned by the authenticated user", async () => {
      const res = await api.get("/cards", { params: { limit: 100 } });
      expect(res.status).toBe(200);
      expect(res.data.total).toBe(SEED.totalCards);
    });
  });
});
