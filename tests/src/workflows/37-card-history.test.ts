import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import pg from "pg";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TOPICS, TEST_CONFIG } from "../helpers/fixtures.js";
import { createFreshCard, deleteFreshCard } from "../helpers/fresh-card.js";

const STATES = ["new", "learning", "relearning", "recall", "shortTerm", "midTerm", "longTerm"] as const;
type Point = { at: string; total: number } & Record<(typeof STATES)[number], number>;

let api: AxiosInstance;
const created: string[] = [];

async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({
    host: "localhost", port: TEST_CONFIG.dbPort, user: TEST_CONFIG.dbUser,
    password: TEST_CONFIG.dbPassword, database: TEST_CONFIG.dbName,
  });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

beforeAll(async () => {
  await login();
  api = getApi();
});

afterAll(async () => {
  for (const id of created) await deleteFreshCard(api, id);
});

describe("GET /study/card-history", () => {
  it("returns 31 daily points for 30d, the last matching the dashboard total", async () => {
    const [history, summary] = await Promise.all([
      api.get("/study/card-history", { params: { range: "30d" } }),
      api.get("/study/summary"),
    ]);
    expect(history.status).toBe(200);
    expect(history.data.range).toBe("30d");
    expect(history.data.step).toBe("day");
    expect(history.data.points).toHaveLength(31);
    const last: Point = history.data.points.at(-1);
    expect(last.total).toBe(summary.data.totalCards);
  });

  it("splits every point's total exactly into the card states", async () => {
    const res = await api.get("/study/card-history", { params: { range: "1y" } });
    expect(res.data.points).toHaveLength(366);
    for (const p of res.data.points as Point[]) {
      expect(STATES.reduce((sum, s) => sum + p[s], 0)).toBe(p.total);
    }
  });

  it("defaults to all time and keeps points in ascending order", async () => {
    const res = await api.get("/study/card-history");
    expect(res.data.range).toBe("all");
    const times = (res.data.points as Point[]).map(p => Date.parse(p.at));
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("moves a reviewed card out of new", async () => {
    const before = (await api.get("/study/card-history", { params: { range: "30d" } })).data.points.at(-1) as Point;
    const card = await createFreshCard(api, TOPICS.ALGEBRA);
    created.push(card.id);
    const review = await api.post("/reviews", { card_id: card.id, bloom_level: 0, rating: 3, question_text: "History test" });
    expect(review.status).toBe(201);
    const after = (await api.get("/study/card-history", { params: { range: "30d" } })).data.points.at(-1) as Point;
    expect(after.total).toBe(before.total + 1);
    expect(after.new).toBe(before.new);
  });

  it("replays reviews stored without state_before", async () => {
    const card = await createFreshCard(api, TOPICS.ALGEBRA);
    created.push(card.id);
    for (let i = 0; i < 2; i++) {
      await api.post("/reviews", { card_id: card.id, bloom_level: 0, rating: 3, question_text: `Legacy ${i}` });
    }
    // Make the rows look like pre-release-1 reviews, a day apart.
    await withDb(c => c.query(
      `UPDATE reviews SET state_before = NULL, interval_factor = NULL,
         reviewed_at = now() - (CASE WHEN question_text = 'Legacy 0' THEN interval '2 days' ELSE interval '1 day' END)
       WHERE card_id = $1`,
      [card.id],
    ));
    await withDb(c => c.query(`UPDATE cards SET created_at = now() - interval '3 days' WHERE id = $1`, [card.id]));
    const res = await api.get("/study/card-history", { params: { range: "30d" } });
    expect(res.status).toBe(200);
    for (const p of res.data.points as Point[]) {
      expect(STATES.reduce((sum, s) => sum + p[s], 0)).toBe(p.total);
    }
  });

  it("requires authentication", async () => {
    const res = await getUnauthApi().get("/study/card-history");
    expect(res.status).toBe(401);
  });
});

describe("GET /study/due-history", () => {
  const DUE = ["learning", "relearning", "recall"] as const;
  type DuePoint = { at: string; total: number } & Record<(typeof DUE)[number], number>;

  it("ends at the dashboard's due count and splits every point into its states", async () => {
    const [history, summary] = await Promise.all([
      api.get("/study/due-history", { params: { range: "30d" } }),
      api.get("/study/summary"),
    ]);
    expect(history.status).toBe(200);
    expect(history.data.points).toHaveLength(31);
    expect((history.data.points as DuePoint[]).at(-1)!.total).toBe(summary.data.dueCount);
    for (const p of history.data.points as DuePoint[]) {
      expect(Object.keys(p).sort()).toEqual(["at", "total", ...DUE].sort());
      expect(DUE.reduce((sum, s) => sum + p[s], 0)).toBe(p.total);
    }
  });

  it("counts an overdue review card as recall from its due date on", async () => {
    const card = await createFreshCard(api, TOPICS.ALGEBRA);
    created.push(card.id);
    const before = (await api.get("/study/due-history", { params: { range: "30d" } })).data.points as DuePoint[];
    await withDb(async c => {
      await c.query(`UPDATE cards SET created_at = now() - interval '10 days' WHERE id = $1`, [card.id]);
      await c.query(
        `UPDATE fsrs_state SET state = 2, stability = 5, reps = 1, due = now() - interval '36 hours' WHERE card_id = $1`,
        [card.id],
      );
    });
    const after = (await api.get("/study/due-history", { params: { range: "30d" } })).data.points as DuePoint[];
    expect(after.at(-1)!.recall).toBe(before.at(-1)!.recall + 1);
    expect(after.at(-2)!.recall).toBe(before.at(-2)!.recall + 1);
    expect(after.at(-3)!.recall).toBe(before.at(-3)!.recall);
  });

  it("requires authentication", async () => {
    const res = await getUnauthApi().get("/study/due-history");
    expect(res.status).toBe(401);
  });
});

describe("GET /study/review-history", () => {
  const KINDS = ["new", "learning", "relearning", "shortTerm", "midTerm", "longTerm"] as const;
  type ReviewPoint = { at: string; total: number } & Record<(typeof KINDS)[number], number>;
  const thirtyDays = async () =>
    (await api.get("/study/review-history", { params: { range: "30d" } })).data.points as ReviewPoint[];

  it("has one bar per day ending on the dashboard's reviews today, split into review kinds", async () => {
    const [history, stats] = await Promise.all([
      api.get("/study/review-history", { params: { range: "30d" } }),
      api.get("/study/stats"),
    ]);
    expect(history.status).toBe(200);
    expect(history.data.step).toBe("day");
    const points = history.data.points as ReviewPoint[];
    expect(points).toHaveLength(30);
    expect(points.at(-1)!.total).toBe(stats.data.reviewsToday);
    for (const p of points) {
      expect(KINDS.reduce((sum, k) => sum + p[k], 0)).toBe(p.total);
    }
  });

  it("counts a first review as new and the next as learning", async () => {
    const before = (await thirtyDays()).at(-1)!;
    const card = await createFreshCard(api, TOPICS.ALGEBRA);
    created.push(card.id);
    for (const rating of [1, 1]) {
      await api.post("/reviews", { card_id: card.id, bloom_level: 0, rating, question_text: "Review history" });
    }
    const after = (await thirtyDays()).at(-1)!;
    expect(after.total).toBe(before.total + 2);
    expect(after.new).toBe(before.new + 1);
    expect(after.learning).toBe(before.learning + 1);
  });

  it("puts a review into the bucket of its day", async () => {
    const card = await createFreshCard(api, TOPICS.ALGEBRA);
    created.push(card.id);
    await api.post("/reviews", { card_id: card.id, bloom_level: 0, rating: 3, question_text: "Review history old" });
    const before = await thirtyDays();
    await withDb(c => c.query(
      `UPDATE reviews SET reviewed_at = reviewed_at - interval '3 days' WHERE card_id = $1`, [card.id],
    ));
    const after = await thirtyDays();
    expect(after.at(-1)!.total).toBe(before.at(-1)!.total - 1);
    expect(after.at(-4)!.total).toBe(before.at(-4)!.total + 1);
  });

  it("requires authentication", async () => {
    const res = await getUnauthApi().get("/study/review-history");
    expect(res.status).toBe(401);
  });
});
