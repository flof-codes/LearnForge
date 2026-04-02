import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, SEED } from "../helpers/fixtures.js";
import {
  createFreshClozeCard,
  deleteFreshCard,
  submitReview,
} from "../helpers/fresh-card.js";

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

describe("Cloze Study Flow", () => {
  describe("Due Queue", () => {
    it("cloze card appears in due queue with cardType and clozeData", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "due-queue");
      freshCardIds.push(card.id);

      const res = await api.get("/study/due", { params: { limit: 100 } });
      expect(res.status).toBe(200);

      const clozeCard = res.data.find((c: any) => c.id === card.id);
      expect(clozeCard).toBeDefined();
      expect(clozeCard.cardType).toBe("cloze");
      expect(clozeCard.clozeData).toBeDefined();
      expect(clozeCard.clozeData.deletions).toHaveLength(2);
      expect(clozeCard.clozeData.sourceText).toContain("{{c1::");
    });

    it("topic-filtered due includes cloze cards under topic (recursive)", async () => {
      const card = await createFreshClozeCard(api, TOPICS.ALGEBRA, "due-topic-filter");
      freshCardIds.push(card.id);

      // Query under Mathematics (parent of Algebra) should include this card
      const res = await api.get("/study/due", {
        params: { topic_id: TOPICS.MATHEMATICS, limit: 100 },
      });
      expect(res.status).toBe(200);

      const ids = res.data.map((c: any) => c.id);
      expect(ids).toContain(card.id);
    });

    it("mixed queue contains both standard and cloze cards sorted by due", async () => {
      const clozeCard = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "mixed-queue");
      freshCardIds.push(clozeCard.id);

      const res = await api.get("/study/due", { params: { limit: 100 } });
      expect(res.status).toBe(200);

      const types = new Set(res.data.map((c: any) => c.cardType));
      expect(types.has("standard")).toBe(true);
      expect(types.has("cloze")).toBe(true);

      // Should still be sorted by due date ASC
      const dues = res.data.map((c: any) => new Date(c.fsrsState.due).getTime());
      for (let i = 1; i < dues.length; i++) {
        expect(dues[i]).toBeGreaterThanOrEqual(dues[i - 1]);
      }
    });

    it("due queue card shape includes cloze fields", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "due-shape");
      freshCardIds.push(card.id);

      const res = await api.get("/study/due", { params: { limit: 100 } });
      const clozeCard = res.data.find((c: any) => c.id === card.id);

      expect(clozeCard).toHaveProperty("id");
      expect(clozeCard).toHaveProperty("concept");
      expect(clozeCard).toHaveProperty("frontHtml");
      expect(clozeCard).toHaveProperty("backHtml");
      expect(clozeCard).toHaveProperty("topicId");
      expect(clozeCard).toHaveProperty("tags");
      expect(clozeCard).toHaveProperty("cardType");
      expect(clozeCard).toHaveProperty("clozeData");
      expect(clozeCard).toHaveProperty("bloomState");
      expect(clozeCard).toHaveProperty("fsrsState");
      expect(clozeCard).toHaveProperty("reviews");
    });
  });

  describe("Review Submission", () => {
    it("submits Good review and advances cloze card scheduling", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "review-good");
      freshCardIds.push(card.id);

      const beforeDue = new Date(card.fsrsState.due);
      const result = await submitReview(api, card.id, 0, 3);

      expect(result.review.rating).toBe(3);
      expect(result.fsrsState.reps).toBeGreaterThan(card.fsrsState.reps);
      expect(new Date(result.fsrsState.due).getTime()).toBeGreaterThan(
        beforeDue.getTime(),
      );
      expect(result.bloomState.currentLevel).toBe(1);
    });

    it("cloze card no longer immediately due after Good review", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "no-longer-due");
      freshCardIds.push(card.id);

      await submitReview(api, card.id, 0, 3);

      const dueRes = await api.get("/study/due", { params: { limit: 200 } });
      const dueIds = dueRes.data.map((c: any) => c.id);
      expect(dueIds).not.toContain(card.id);
    });

    it("Again review on cloze card in Review state increments lapses", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "again-cloze");
      freshCardIds.push(card.id);

      // Advance through New → Learning → Review
      await submitReview(api, card.id, 0, 3);
      await submitReview(api, card.id, 0, 3);
      await submitReview(api, card.id, 0, 3);

      // Verify in Review state
      const getRes = await api.get(`/cards/${card.id}`);
      expect(getRes.data.fsrsState.state).toBe(2); // Review

      // Again should increment lapses
      const result = await submitReview(api, card.id, 0, 1);
      expect(result.fsrsState.lapses).toBeGreaterThanOrEqual(1);
    });

    it("modality multipliers work for cloze cards (chat > web)", async () => {
      const cardWeb = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "mod-web");
      const cardChat = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "mod-chat");
      freshCardIds.push(cardWeb.id, cardChat.id);

      const now = Date.now();
      const webResult = await submitReview(api, cardWeb.id, 0, 3, {
        modality: "web",
      });
      const chatResult = await submitReview(api, cardChat.id, 0, 3, {
        modality: "chat",
      });

      const webInterval =
        new Date(webResult.fsrsState.due).getTime() - now;
      const chatInterval =
        new Date(chatResult.fsrsState.due).getTime() - now;

      // Chat modality (1.2x) should push due further than web (0.95x)
      expect(chatInterval).toBeGreaterThan(webInterval);
    });
  });

  describe("Study Summary & Stats", () => {
    it("study summary counts cloze cards in totalCards, newCount, dueCount", async () => {
      // Get baseline summary
      const baseRes = await api.get("/study/summary");
      const baseTotalCards = baseRes.data.totalCards;
      const baseNewCount = baseRes.data.newCount;

      // Create a cloze card
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "summary-count");
      freshCardIds.push(card.id);

      // Summary should now include the new cloze card
      const res = await api.get("/study/summary");
      expect(res.status).toBe(200);
      expect(res.data.totalCards).toBe(baseTotalCards + 1);
      expect(res.data.newCount).toBe(baseNewCount + 1);
    });

    it("study stats includes cloze cards in cardStates distribution", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "stats-dist");
      freshCardIds.push(card.id);

      const res = await api.get("/study/stats");
      expect(res.status).toBe(200);

      // The new cloze card should be counted as a 'new' card
      expect(res.data.cardStates.new).toBeGreaterThanOrEqual(SEED.fsrsStates.new + 1);
    });

    it("bloomStateMatrix includes cloze cards", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "bloom-matrix");
      freshCardIds.push(card.id);

      const res = await api.get("/study/summary");
      expect(res.status).toBe(200);

      const { bloomStateMatrix } = res.data;
      expect(bloomStateMatrix).toBeDefined();

      // Count total cards in matrix — should include the cloze card
      const stateKeys = [
        "new",
        "learning",
        "relearning",
        "recall",
        "shortTerm",
        "midTerm",
        "longTerm",
      ];
      let totalFromMatrix = 0;
      for (const level of Object.keys(bloomStateMatrix)) {
        const row = bloomStateMatrix[level];
        for (const key of stateKeys) {
          totalFromMatrix += row[key];
        }
      }
      expect(totalFromMatrix).toBeGreaterThanOrEqual(SEED.totalCards + 1);
    });

    it("topic-filtered summary includes cloze cards under that topic", async () => {
      const card = await createFreshClozeCard(api, TOPICS.BIOLOGY, "summary-topic");
      freshCardIds.push(card.id);

      const res = await api.get("/study/summary", {
        params: { topic_id: TOPICS.BIOLOGY },
      });
      expect(res.status).toBe(200);
      expect(res.data.totalCards).toBe(SEED.bioTreeCards + 1);
    });
  });

  describe("Context Endpoints", () => {
    it("topic context includes cloze cards", async () => {
      const card = await createFreshClozeCard(api, TOPICS.BIOLOGY, "context-topic");
      freshCardIds.push(card.id);

      const res = await api.get(`/context/topic/${TOPICS.BIOLOGY}`);
      expect(res.status).toBe(200);

      const clozeCard = res.data.find((c: any) => c.id === card.id);
      expect(clozeCard).toBeDefined();
      expect(clozeCard.concept).toContain("Cloze test");
      expect(clozeCard.bloomState).toBeDefined();
    });

    it("similar cards finds cloze cards via embedding", async () => {
      // Create two similar cloze cards
      const card1 = await createFreshClozeCard(api, TOPICS.BIOLOGY, "similar-a");
      freshCardIds.push(card1.id);

      const res = await api.post("/cards", {
        topic_id: TOPICS.BIOLOGY,
        concept: "Cloze similar cell biology mitochondria",
        card_type: "cloze",
        cloze_data: {
          deletions: [{ index: 1, answer: "mitochondria", hint: "organelle" }],
          sourceText:
            "The {{c1::mitochondria::organelle}} produces ATP for the cell.",
        },
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);

      // Wait a moment for embedding computation, then check similarity
      const similarRes = await api.get(`/context/similar/${card1.id}`, {
        params: { limit: 20 },
      });
      expect(similarRes.status).toBe(200);

      // The second cloze card should appear in similar results
      const ids = similarRes.data.map((c: any) => c.id);
      expect(ids).toContain(res.data.id);
    });
  });
});
