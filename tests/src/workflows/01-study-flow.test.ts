import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, SEED } from "../helpers/fixtures.js";
import { createFreshCard, deleteFreshCard, submitReview } from "../helpers/fresh-card.js";

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

describe("Study Flow", () => {

  describe("Due Cards", () => {
    it("fetches all due cards without filter", async () => {
      const res = await api.get("/study/due", { params: { limit: 50 } });
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(SEED.totalStudyable);

      // All returned cards should have due <= now
      const now = new Date();
      for (const card of res.data) {
        expect(new Date(card.fsrsState.due).getTime()).toBeLessThanOrEqual(now.getTime() + 60_000);
      }
    });

    it("returns due cards sorted by due ASC", async () => {
      const res = await api.get("/study/due", { params: { limit: 50 } });
      const dues = res.data.map((c: any) => new Date(c.fsrsState.due).getTime());
      for (let i = 1; i < dues.length; i++) {
        expect(dues[i]).toBeGreaterThanOrEqual(dues[i - 1]);
      }
    });

    it("filters due cards by topic (recursive)", async () => {
      const res = await api.get("/study/due", {
        params: { topic_id: TOPICS.MATHEMATICS, limit: 50 },
      });
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(SEED.mathTreeStudyable);

      // Should not contain any bio cards
      const ids = res.data.map((c: any) => c.id);
      expect(ids).not.toContain(CARDS.BIO_CELL_STRUCT);
      expect(ids).not.toContain(CARDS.BIO_MITOSIS);
      expect(ids).not.toContain(CARDS.BIO_DNA_REP);
      expect(ids).not.toContain(CARDS.BIO_PHOTO_NOEMB);
    });

    it("respects limit parameter", async () => {
      const res = await api.get("/study/due", { params: { limit: 2 } });
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(2);
    });

    it("returns card with expected shape", async () => {
      const res = await api.get("/study/due", { params: { limit: 1 } });
      const card = res.data[0];

      expect(card).toHaveProperty("id");
      expect(card).toHaveProperty("concept");
      expect(card).toHaveProperty("frontHtml");
      expect(card).toHaveProperty("backHtml");
      expect(card).toHaveProperty("topicId");
      expect(card).toHaveProperty("tags");
      expect(card).toHaveProperty("bloomState");
      expect(card.bloomState).toHaveProperty("currentLevel");
      expect(card.bloomState).toHaveProperty("highestReached");
      expect(card).toHaveProperty("fsrsState");
      expect(card.fsrsState).toHaveProperty("due");
      expect(card.fsrsState).toHaveProperty("state");
      expect(card).toHaveProperty("reviews");
      expect(Array.isArray(card.reviews)).toBe(true);
    });
  });

  describe("Study Summary", () => {
    it("returns correct global summary", async () => {
      const res = await api.get("/study/summary");
      expect(res.status).toBe(200);
      expect(res.data.totalCards).toBe(SEED.totalCards);
      expect(res.data.dueCount).toBe(SEED.totalDueCount);
      expect(res.data.newCount).toBe(SEED.totalNewCount);
      expect(res.data.bloomLevels).toEqual(SEED.bloomLevels);
    });

    it("filters summary by topic", async () => {
      const res = await api.get("/study/summary", {
        params: { topic_id: TOPICS.BIOLOGY },
      });
      expect(res.status).toBe(200);
      expect(res.data.totalCards).toBe(SEED.bioTreeCards);
      expect(res.data.dueCount).toBe(SEED.bioTreeDueCount);
      expect(res.data.newCount).toBe(SEED.bioTreeNewCount);
    });

    it("returns accuracy7d as number or null", async () => {
      const res = await api.get("/study/summary");
      expect(
        res.data.accuracy7d === null || typeof res.data.accuracy7d === "number",
      ).toBe(true);
    });
  });

  describe("Study Stats", () => {
    it("returns correct card state counts", async () => {
      const res = await api.get("/study/stats");
      expect(res.status).toBe(200);

      const { cardStates } = res.data;
      expect(cardStates.new).toBe(SEED.fsrsStates.new);
      expect(cardStates.learning).toBe(SEED.fsrsStates.learning);
      expect(cardStates.relearning).toBe(SEED.fsrsStates.relearning);
      expect(res.data.dueCount).toBe(SEED.totalDueCount);  // excludes new cards
    });

    it("returns creation streak and cards created today", async () => {
      const res = await api.get("/study/stats");
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty("creationStreak");
      expect(res.data).toHaveProperty("cardsCreatedToday");
      expect(typeof res.data.creationStreak).toBe("number");
      expect(typeof res.data.cardsCreatedToday).toBe("number");
    });

    it("classifies short-term, mid-term and long-term review cards", async () => {
      const res = await api.get("/study/stats");
      // Card 5 (stability=15.2) → short-term (< 21)
      // Card 6 (stability=22.5) → mid-term (21–89)
      // Card 8 (stability=95.0) → long-term (>= 90)
      expect(res.data.cardStates.shortTerm).toBeGreaterThanOrEqual(1);
      expect(res.data.cardStates.midTerm).toBeGreaterThanOrEqual(1);
      expect(res.data.cardStates.longTerm).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Review Submission", () => {
    it("submits a Good review and advances scheduling", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "review-good");
      freshCardIds.push(card.id);

      const beforeDue = new Date(card.fsrsState.due);
      const result = await submitReview(api, card.id, 0, 3); // bloom_level=0, rating=Good

      expect(result.review.rating).toBe(3);
      expect(result.fsrsState.reps).toBeGreaterThan(card.fsrsState.reps);
      expect(new Date(result.fsrsState.due).getTime()).toBeGreaterThan(beforeDue.getTime());
    });

    it("persists user_answer and answer_expected", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "user-answer");
      freshCardIds.push(card.id);

      const result = await submitReview(api, card.id, 0, 3, {
        answerExpected: "A, C",
        userAnswer: "B, D",
      });

      expect(result.review.answerExpected).toBe("A, C");
      expect(result.review.userAnswer).toBe("B, D");

      // Verify it comes back on GET /cards/:id
      const getRes = await api.get(`/cards/${card.id}`);
      const review = getRes.data.reviews[0];
      expect(review.answerExpected).toBe("A, C");
      expect(review.userAnswer).toBe("B, D");
    });

    it("card no longer due after Good review", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "no-longer-due");
      freshCardIds.push(card.id);

      await submitReview(api, card.id, 0, 3);

      const dueRes = await api.get("/study/due", { params: { limit: 100 } });
      const dueIds = dueRes.data.map((c: any) => c.id);
      expect(dueIds).not.toContain(card.id);
    });

    it("Again review increments lapses", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "again-review");
      freshCardIds.push(card.id);

      // Move card through New→Learning→Review by doing multiple Good reviews
      await submitReview(api, card.id, 0, 3); // New→Learning
      await submitReview(api, card.id, 0, 3); // Learning→Review
      await submitReview(api, card.id, 0, 3); // Stay in Review (builds stability)

      // Verify card is in Review state
      const getRes = await api.get(`/cards/${card.id}`);
      expect(getRes.data.fsrsState.state).toBe(2); // Review

      // Now an Again review should increment lapses
      const result = await submitReview(api, card.id, 0, 1);
      expect(result.fsrsState.lapses).toBeGreaterThanOrEqual(1);
    });

    it("chat modality pushes due further than web", async () => {
      const cardWeb = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "modality-web");
      const cardChat = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "modality-chat");
      freshCardIds.push(cardWeb.id, cardChat.id);

      const now = Date.now();
      const webResult = await submitReview(api, cardWeb.id, 0, 3, { modality: "web" });
      const chatResult = await submitReview(api, cardChat.id, 0, 3, { modality: "chat" });

      const webInterval = new Date(webResult.fsrsState.due).getTime() - now;
      const chatInterval = new Date(chatResult.fsrsState.due).getTime() - now;

      // Chat modality (1.2x) should push due further than web (0.95x)
      expect(chatInterval).toBeGreaterThan(webInterval);
    });

    it("mcq modality pushes due further than web", async () => {
      const cardWeb = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "modality-web2");
      const cardMcq = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "modality-mcq");
      freshCardIds.push(cardWeb.id, cardMcq.id);

      const now = Date.now();
      const webResult = await submitReview(api, cardWeb.id, 0, 3, { modality: "web" });
      const mcqResult = await submitReview(api, cardMcq.id, 0, 3, { modality: "mcq" });

      const webInterval = new Date(webResult.fsrsState.due).getTime() - now;
      const mcqInterval = new Date(mcqResult.fsrsState.due).getTime() - now;

      // MCQ modality (1.05x) should push due further than web (0.95x)
      expect(mcqInterval).toBeGreaterThan(webInterval);
    });
  });
});
