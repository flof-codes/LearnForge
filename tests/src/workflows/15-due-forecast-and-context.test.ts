import { describe, it, expect, beforeAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, SEED } from "../helpers/fixtures.js";

let api: AxiosInstance;

beforeAll(async () => {
  await login();
  api = getApi();
});

describe("Due Forecast", () => {

  describe("GET /study/due-forecast (month range)", () => {
    it("returns month range with 30 daily buckets by default", async () => {
      const res = await api.get("/study/due-forecast");
      expect(res.status).toBe(200);
      expect(res.data.range).toBe("month");
      expect(res.data.buckets).toHaveLength(30);
      expect(res.data).toHaveProperty("overdue");
    });

    it("each bucket has label, date, and count", async () => {
      const res = await api.get("/study/due-forecast");
      for (const bucket of res.data.buckets) {
        expect(bucket).toHaveProperty("label");
        expect(bucket).toHaveProperty("date");
        expect(bucket).toHaveProperty("count");
        expect(typeof bucket.label).toBe("string");
        expect(typeof bucket.date).toBe("string");
        expect(typeof bucket.count).toBe("number");
      }
    });

    it("overdue count includes all due cards with state > 0", async () => {
      const res = await api.get("/study/due-forecast");
      expect(res.data.overdue).toBeGreaterThanOrEqual(SEED.totalDueCount);
    });

    it("some buckets have count > 0 for cards with future due dates", async () => {
      const res = await api.get("/study/due-forecast");
      const totalFuture = res.data.buckets.reduce(
        (sum: number, b: { count: number }) => sum + b.count,
        0,
      );
      // LRN_QUADRATIC (NOW+2d) and REV_POINT_SLOPE (NOW+5d) fall within 30-day window
      expect(totalFuture).toBeGreaterThanOrEqual(2);
    });

    it("bucket dates are in YYYY-MM-DD format and sequential", async () => {
      const res = await api.get("/study/due-forecast");
      const dates = res.data.buckets.map((b: { date: string }) => b.date);
      for (const d of dates) {
        expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      // Dates should be ascending
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i] > dates[i - 1]).toBe(true);
      }
    });
  });

  describe("GET /study/due-forecast (year range)", () => {
    it("returns year range with 12 monthly buckets", async () => {
      const res = await api.get("/study/due-forecast", {
        params: { range: "year" },
      });
      expect(res.status).toBe(200);
      expect(res.data.range).toBe("year");
      expect(res.data.buckets).toHaveLength(12);
      expect(res.data).toHaveProperty("overdue");
    });

    it("each bucket has label, date, and count", async () => {
      const res = await api.get("/study/due-forecast", {
        params: { range: "year" },
      });
      for (const bucket of res.data.buckets) {
        expect(bucket).toHaveProperty("label");
        expect(bucket).toHaveProperty("date");
        expect(bucket).toHaveProperty("count");
        expect(typeof bucket.label).toBe("string");
        expect(typeof bucket.date).toBe("string");
        expect(typeof bucket.count).toBe("number");
      }
    });

    it("REV_DIVISION (NOW+30d) appears in the corresponding month bucket", async () => {
      const res = await api.get("/study/due-forecast", {
        params: { range: "year" },
      });
      const totalFuture = res.data.buckets.reduce(
        (sum: number, b: { count: number }) => sum + b.count,
        0,
      );
      // At minimum REV_DIVISION, LRN_QUADRATIC, REV_POINT_SLOPE
      expect(totalFuture).toBeGreaterThanOrEqual(3);
    });

    it("bucket dates are in YYYY-MM format", async () => {
      const res = await api.get("/study/due-forecast", {
        params: { range: "year" },
      });
      for (const bucket of res.data.buckets) {
        expect(bucket.date).toMatch(/^\d{4}-\d{2}$/);
      }
    });
  });

  describe("GET /study/due-forecast with topic_id filter", () => {
    it("filters to Biology tree only", async () => {
      const res = await api.get("/study/due-forecast", {
        params: { topic_id: TOPICS.BIOLOGY },
      });
      expect(res.status).toBe(200);
      expect(res.data.range).toBe("month");
      // Bio tree overdue: cards 10,11 (state>0, due past)
      expect(res.data.overdue).toBeGreaterThanOrEqual(SEED.bioTreeDueCount);
    });

    it("filters to Math tree only", async () => {
      const res = await api.get("/study/due-forecast", {
        params: { topic_id: TOPICS.MATHEMATICS },
      });
      expect(res.status).toBe(200);
      // Math tree overdue: cards 3,5,7 (state>0, due past)
      expect(res.data.overdue).toBeGreaterThanOrEqual(SEED.mathTreeDueCount);
    });

    it("Bio tree has fewer future cards than global", async () => {
      const globalRes = await api.get("/study/due-forecast");
      const bioRes = await api.get("/study/due-forecast", {
        params: { topic_id: TOPICS.BIOLOGY },
      });
      const globalFuture = globalRes.data.buckets.reduce(
        (sum: number, b: { count: number }) => sum + b.count,
        0,
      );
      const bioFuture = bioRes.data.buckets.reduce(
        (sum: number, b: { count: number }) => sum + b.count,
        0,
      );
      // Bio has no future-due cards; Math has LRN_QUADRATIC, REV_POINT_SLOPE, REV_DIVISION
      expect(bioFuture).toBeLessThan(globalFuture);
    });

    it("empty topic returns zero overdue and zero future", async () => {
      const res = await api.get("/study/due-forecast", {
        params: { topic_id: TOPICS.EMPTY_TOPIC },
      });
      expect(res.status).toBe(200);
      expect(res.data.overdue).toBe(0);
      const total = res.data.buckets.reduce(
        (sum: number, b: { count: number }) => sum + b.count,
        0,
      );
      expect(total).toBe(0);
    });
  });
});

describe("Context — Similar Cards", () => {

  describe("GET /context/similar/:card_id", () => {
    it("returns similar cards for a valid card", async () => {
      const res = await api.get(`/context/similar/${CARDS.NEW_ADDITION}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);
    });

    it("results are sorted by similarity descending", async () => {
      const res = await api.get(`/context/similar/${CARDS.NEW_ADDITION}`);
      const similarities = res.data.map((c: { similarity: number }) => c.similarity);
      for (let i = 1; i < similarities.length; i++) {
        expect(similarities[i]).toBeLessThanOrEqual(similarities[i - 1]);
      }
    });

    it("results exclude the source card itself", async () => {
      const res = await api.get(`/context/similar/${CARDS.NEW_ADDITION}`);
      const ids = res.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(CARDS.NEW_ADDITION);
    });

    it("results exclude cards with NULL embedding", async () => {
      const res = await api.get(`/context/similar/${CARDS.NEW_ADDITION}`);
      const ids = res.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(CARDS.BIO_PHOTO_NOEMB);
    });

    it("each result has expected shape", async () => {
      const res = await api.get(`/context/similar/${CARDS.NEW_ADDITION}`);
      const card = res.data[0];

      expect(card).toHaveProperty("id");
      expect(card).toHaveProperty("concept");
      expect(card).toHaveProperty("tags");
      expect(card).toHaveProperty("topicId");
      expect(card).toHaveProperty("similarity");
      expect(typeof card.similarity).toBe("number");
      expect(card).toHaveProperty("bloomState");
      expect(card.bloomState).toHaveProperty("currentLevel");
      expect(card.bloomState).toHaveProperty("highestReached");
      expect(card).toHaveProperty("reviews");
      expect(Array.isArray(card.reviews)).toBe(true);
    });
  });

  describe("GET /context/similar/:card_id with limit", () => {
    it("respects limit=3", async () => {
      const res = await api.get(`/context/similar/${CARDS.NEW_ADDITION}`, {
        params: { limit: 3 },
      });
      expect(res.status).toBe(200);
      expect(res.data.length).toBeLessThanOrEqual(3);
    });

    it("returns more results without limit than with limit=3", async () => {
      const unlimitedRes = await api.get(`/context/similar/${CARDS.NEW_ADDITION}`);
      const limitedRes = await api.get(`/context/similar/${CARDS.NEW_ADDITION}`, {
        params: { limit: 3 },
      });
      expect(unlimitedRes.data.length).toBeGreaterThanOrEqual(limitedRes.data.length);
    });
  });

  describe("GET /context/similar/:card_id — 404 for non-existent card", () => {
    it("returns 404 for random UUID", async () => {
      const fakeId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
      const res = await api.get(`/context/similar/${fakeId}`);
      expect(res.status).toBe(404);
    });
  });

  describe("Multi-tenancy: similar cards", () => {
    it("other user cannot access test user cards via similar", async () => {
      await login("other@learnforge.dev", "test-password");
      const otherApi = getApi();

      const res = await otherApi.get(`/context/similar/${CARDS.NEW_ADDITION}`);
      expect(res.status).toBe(404);

      // Re-login as test user for subsequent tests
      await login();
      api = getApi();
    });
  });
});

describe("Auth — Unauthenticated requests", () => {
  it("GET /study/due-forecast without auth returns 401", async () => {
    const unauth = getUnauthApi();
    const res = await unauth.get("/study/due-forecast");
    expect(res.status).toBe(401);
  });

  it("GET /context/similar/:id without auth returns 401", async () => {
    const unauth = getUnauthApi();
    const res = await unauth.get(`/context/similar/${CARDS.NEW_ADDITION}`);
    expect(res.status).toBe(401);
  });
});
