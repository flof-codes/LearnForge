import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, SEED } from "../helpers/fixtures.js";

let api: AxiosInstance;

beforeAll(async () => {
  await login();
  api = getApi();
});

afterAll(async () => {
  // Always wipe focus after the suite to leave clean state for downstream tests
  await api.delete("/focus");
});

beforeEach(async () => {
  // Each test starts with no focus set
  await api.delete("/focus");
});

describe("Focus Topics — CRUD", () => {
  it("returns empty list when no focus is set", async () => {
    const res = await api.get("/focus");
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it("PUT replaces the entire focus list with priority derived from order", async () => {
    const res = await api.put("/focus", {
      topics: [
        { topic_id: TOPICS.MATHEMATICS },
        { topic_id: TOPICS.BIOLOGY },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.data).toHaveLength(2);
    expect(res.data[0].topic_id).toBe(TOPICS.MATHEMATICS);
    expect(res.data[0].priority).toBe(1);
    expect(res.data[1].topic_id).toBe(TOPICS.BIOLOGY);
    expect(res.data[1].priority).toBe(2);
    expect(res.data[0].topic_name).toBeTypeOf("string");
  });

  it("PUT with same topic_id twice fails validation", async () => {
    const res = await api.put("/focus", {
      topics: [
        { topic_id: TOPICS.MATHEMATICS },
        { topic_id: TOPICS.MATHEMATICS },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("PUT with unknown topic_id returns 404", async () => {
    const res = await api.put("/focus", {
      topics: [{ topic_id: "00000000-0000-0000-0000-deadbeefdead" }],
    });
    expect(res.status).toBe(404);
  });

  it("PUT with expires_at persists the timestamp", async () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await api.put("/focus", {
      topics: [{ topic_id: TOPICS.MATHEMATICS, expires_at: expires }],
    });
    expect(res.status).toBe(200);
    expect(res.data[0].expires_at).toBeTruthy();
    expect(new Date(res.data[0].expires_at).getTime()).toBeCloseTo(new Date(expires).getTime(), -3);
  });

  it("DELETE clears all focus entries", async () => {
    await api.put("/focus", { topics: [{ topic_id: TOPICS.MATHEMATICS }] });
    const delRes = await api.delete("/focus");
    expect(delRes.status).toBe(204);
    const listRes = await api.get("/focus");
    expect(listRes.data).toEqual([]);
  });

  it("PUT with empty list clears all focus entries", async () => {
    await api.put("/focus", { topics: [{ topic_id: TOPICS.MATHEMATICS }] });
    const res = await api.put("/focus", { topics: [] });
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it("rejects more than 20 focus topics", async () => {
    const topics = Array.from({ length: 21 }, () => ({ topic_id: TOPICS.MATHEMATICS }));
    const res = await api.put("/focus", { topics });
    expect(res.status).toBe(400);
  });
});

describe("Focus Topics — Expanded query", () => {
  it("returns empty when no focus is set", async () => {
    const res = await api.get("/focus/expanded");
    expect(res.status).toBe(200);
    expect(res.data).toEqual([]);
  });

  it("expands a parent focus to include all descendants", async () => {
    await api.put("/focus", { topics: [{ topic_id: TOPICS.MATHEMATICS }] });
    const res = await api.get("/focus/expanded");
    expect(res.status).toBe(200);
    const ids = new Set(res.data.map((e: { topic_id: string }) => e.topic_id));
    expect(ids.has(TOPICS.MATHEMATICS)).toBe(true);
    expect(ids.has(TOPICS.ALGEBRA)).toBe(true);
    expect(ids.has(TOPICS.LINEAR_EQUATIONS)).toBe(true);
    // Biology should NOT inherit
    expect(ids.has(TOPICS.BIOLOGY)).toBe(false);
  });

  it("marks descendants as inherited and root as direct", async () => {
    await api.put("/focus", { topics: [{ topic_id: TOPICS.MATHEMATICS }] });
    const res = await api.get("/focus/expanded");
    const root = res.data.find((e: { topic_id: string }) => e.topic_id === TOPICS.MATHEMATICS);
    const child = res.data.find((e: { topic_id: string }) => e.topic_id === TOPICS.ALGEBRA);
    expect(root.inherited).toBe(false);
    expect(child.inherited).toBe(true);
    expect(child.priority).toBe(root.priority);
    expect(child.root_topic_id).toBe(TOPICS.MATHEMATICS);
  });

  it("filters out entries with expires_at in the past", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await api.put("/focus", { topics: [{ topic_id: TOPICS.MATHEMATICS, expires_at: past }] });
    const res = await api.get("/focus/expanded");
    expect(res.data).toEqual([]);
  });
});

describe("Focus Topics — Study card ordering", () => {
  it("orders focused-topic cards before non-focused cards when no topic filter", async () => {
    await api.put("/focus", { topics: [{ topic_id: TOPICS.BIOLOGY }] });
    const res = await api.get("/study/due", { params: { limit: 50 } });
    expect(res.status).toBe(200);
    // The first cards must all belong to the Biology tree
    const biologyIds = new Set([
      CARDS.BIO_CELL_STRUCT,
      CARDS.BIO_MITOSIS,
      CARDS.BIO_DNA_REP,
      CARDS.BIO_PHOTO_NOEMB,
    ]);
    let seenNonBio = false;
    for (const card of res.data) {
      if (biologyIds.has(card.id)) {
        expect(seenNonBio).toBe(false); // bio cards must come before non-bio
      } else {
        seenNonBio = true;
      }
    }
  });

  it("respects priority order between multiple focus topics", async () => {
    await api.put("/focus", {
      topics: [
        { topic_id: TOPICS.BIOLOGY },     // priority 1
        { topic_id: TOPICS.MATHEMATICS }, // priority 2
      ],
    });
    const res = await api.get("/study/due", { params: { limit: 50 } });
    const biologyIds = new Set([
      CARDS.BIO_CELL_STRUCT, CARDS.BIO_MITOSIS, CARDS.BIO_DNA_REP, CARDS.BIO_PHOTO_NOEMB,
    ]);
    let firstMathIdx = -1;
    let lastBioIdx = -1;
    res.data.forEach((card: { id: string; topicId: string }, idx: number) => {
      if (biologyIds.has(card.id)) lastBioIdx = idx;
      if (card.topicId === TOPICS.MATHEMATICS || card.topicId === TOPICS.ALGEBRA || card.topicId === TOPICS.LINEAR_EQUATIONS) {
        if (firstMathIdx === -1) firstMathIdx = idx;
      }
    });
    expect(firstMathIdx).toBeGreaterThan(lastBioIdx);
  });

  it("within a focused topic, cards are still sorted by due ASC", async () => {
    await api.put("/focus", { topics: [{ topic_id: TOPICS.BIOLOGY }] });
    const res = await api.get("/study/due", { params: { limit: 50 } });
    const biologyIds = new Set([
      CARDS.BIO_CELL_STRUCT, CARDS.BIO_MITOSIS, CARDS.BIO_DNA_REP, CARDS.BIO_PHOTO_NOEMB,
    ]);
    const bioDues: number[] = [];
    for (const card of res.data) {
      if (biologyIds.has(card.id)) {
        bioDues.push(new Date(card.fsrsState.due).getTime());
      }
    }
    for (let i = 1; i < bioDues.length; i++) {
      expect(bioDues[i]).toBeGreaterThanOrEqual(bioDues[i - 1]);
    }
  });

  it("ignores focus when an explicit topic_id is passed", async () => {
    await api.put("/focus", { topics: [{ topic_id: TOPICS.BIOLOGY }] });
    const res = await api.get("/study/due", {
      params: { topic_id: TOPICS.MATHEMATICS, limit: 50 },
    });
    expect(res.status).toBe(200);
    // No biology card should appear when math is requested explicitly
    expect(res.data).toHaveLength(SEED.mathTreeStudyable);
  });

  it("falls back to plain due ASC when no focus is set", async () => {
    const res = await api.get("/study/due", { params: { limit: 50 } });
    const dues = res.data.map((c: { fsrsState: { due: string } }) => new Date(c.fsrsState.due).getTime());
    for (let i = 1; i < dues.length; i++) {
      expect(dues[i]).toBeGreaterThanOrEqual(dues[i - 1]);
    }
  });

  it("expired focus entries do NOT influence ordering", async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await api.put("/focus", { topics: [{ topic_id: TOPICS.BIOLOGY, expires_at: past }] });
    const res = await api.get("/study/due", { params: { limit: 50 } });
    const dues = res.data.map((c: { fsrsState: { due: string } }) => new Date(c.fsrsState.due).getTime());
    for (let i = 1; i < dues.length; i++) {
      expect(dues[i]).toBeGreaterThanOrEqual(dues[i - 1]);
    }
  });
});

describe("Focus Topics — Multi-tenancy", () => {
  it("each user has an isolated focus list", async () => {
    // Set focus on test user
    await api.put("/focus", { topics: [{ topic_id: TOPICS.MATHEMATICS }] });

    // Log in as other user
    await login("other@learnforge.dev", "test-password");
    const otherApi = getApi();
    const otherFocusRes = await otherApi.get("/focus");
    expect(otherFocusRes.status).toBe(200);
    expect(otherFocusRes.data).toEqual([]);

    // Log back in as primary test user for subsequent tests
    await login();
    api = getApi();
  });

  it("rejects PUT with a topic owned by another user", async () => {
    // Get a topic ID owned by the other user
    await login("other@learnforge.dev", "test-password");
    const otherApi = getApi();
    const otherTopics = await otherApi.get("/topics");
    if (otherTopics.data.length === 0) {
      // Other user has no topics — skip
      await login();
      api = getApi();
      return;
    }
    const otherTopicId = otherTopics.data[0].id;

    // Switch back to test user and try to set focus on the other user's topic
    await login();
    api = getApi();
    const res = await api.put("/focus", { topics: [{ topic_id: otherTopicId }] });
    expect(res.status).toBe(404);
  });
});
