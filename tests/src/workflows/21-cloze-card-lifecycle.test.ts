import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS } from "../helpers/fixtures.js";
import {
  createFreshCard,
  createFreshClozeCard,
  deleteFreshCard,
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

describe("Cloze Card Lifecycle", () => {
  describe("Create", () => {
    it("creates a cloze card with correct response shape", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Cloze lifecycle test",
        card_type: "cloze",
        cloze_data: {
          deletions: [
            { index: 1, answer: "mitochondria", hint: "organelle" },
            { index: 2, answer: "powerhouse", hint: null },
          ],
          sourceText:
            "{{c1::mitochondria::organelle}} is the {{c2::powerhouse}} of the cell.",
        },
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);

      expect(res.data.id).toBeDefined();
      expect(res.data.cardType).toBe("cloze");
      expect(res.data.clozeData).toBeDefined();
      expect(res.data.clozeData.deletions).toHaveLength(2);
      expect(res.data.clozeData.sourceText).toContain("{{c1::");
      expect(res.data.topicId).toBe(TOPICS.EMPTY_TOPIC);
      expect(res.data.concept).toBe("Cloze lifecycle test");

      // Bloom state initialized to 0
      expect(res.data.bloomState).toBeDefined();
      expect(res.data.bloomState.currentLevel).toBe(0);
      expect(res.data.bloomState.highestReached).toBe(0);

      // FSRS state initialized
      expect(res.data.fsrsState).toBeDefined();
      expect(res.data.fsrsState.state).toBe(0);
      expect(res.data.fsrsState.reps).toBe(0);
      expect(res.data.fsrsState.lapses).toBe(0);

      // Embedding is excluded from API responses
      expect(res.data.embedding).toBeUndefined();
    });

    it("creates a cloze card with tags", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Cloze with tags",
        card_type: "cloze",
        cloze_data: {
          deletions: [{ index: 1, answer: "ATP", hint: "energy" }],
          sourceText: "The main energy currency of the cell is {{c1::ATP::energy}}.",
        },
        tags: ["biology", "energy"],
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);

      expect(res.data.tags).toEqual(["biology", "energy"]);
      expect(res.data.cardType).toBe("cloze");
    });
  });

  describe("Read", () => {
    it("reads cloze card with full clozeData structure", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "read-test");
      freshCardIds.push(card.id);

      const res = await api.get(`/cards/${card.id}`);
      expect(res.status).toBe(200);

      expect(res.data.cardType).toBe("cloze");
      expect(res.data.clozeData).toBeDefined();
      expect(res.data.clozeData.deletions).toHaveLength(2);
      expect(res.data.clozeData.sourceText).toContain("{{c1::");

      // Verify deletion structure
      const d1 = res.data.clozeData.deletions.find((d: any) => d.index === 1);
      expect(d1).toBeDefined();
      expect(d1.answer).toBe("mitochondria");
      expect(d1.hint).toBe("organelle");

      const d2 = res.data.clozeData.deletions.find((d: any) => d.index === 2);
      expect(d2).toBeDefined();
      expect(d2.answer).toBe("powerhouse");
      expect(d2.hint).toBeNull();

      // Reviews should be present (empty for fresh card)
      expect(res.data.reviews).toBeDefined();
      expect(Array.isArray(res.data.reviews)).toBe(true);
    });
  });

  describe("Backend HTML Rendering", () => {
    it("front_html contains blanks for active cloze deletion", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "front-html");
      freshCardIds.push(card.id);

      // Front should have a blank for c1 (the active deletion, default activeIndex=1)
      expect(card.frontHtml).toContain("[organelle]"); // hint-based blank
      // c2 answer should be revealed on the front (non-active)
      expect(card.frontHtml).toContain("powerhouse");
    });

    it("back_html contains revealed answers with <mark> tags", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "back-html");
      freshCardIds.push(card.id);

      // Back should have the active answer in a <mark> tag
      expect(card.backHtml).toContain("<mark>");
      expect(card.backHtml).toContain("mitochondria");
    });

    it("front_html uses [...] when no hint is provided", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "No hint cloze",
        card_type: "cloze",
        cloze_data: {
          deletions: [{ index: 1, answer: "photosynthesis", hint: null }],
          sourceText: "Plants convert sunlight to energy via {{c1::photosynthesis}}.",
        },
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);

      // No hint → blank should be [...]
      expect(res.data.frontHtml).toContain("[...]");
    });
  });

  describe("Update", () => {
    it("updates cloze_data and re-renders HTML", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "update-cloze");
      freshCardIds.push(card.id);

      const newClozeData = {
        deletions: [
          { index: 1, answer: "ribosome", hint: "protein factory" },
          { index: 2, answer: "proteins", hint: null },
        ],
        sourceText:
          "The {{c1::ribosome::protein factory}} synthesizes {{c2::proteins}} from mRNA.",
      };

      const res = await api.put(`/cards/${card.id}`, {
        cloze_data: newClozeData,
      });
      expect(res.status).toBe(200);

      expect(res.data.clozeData.deletions).toHaveLength(2);
      expect(res.data.clozeData.deletions[0].answer).toBe("ribosome");
      expect(res.data.clozeData.sourceText).toContain("{{c1::ribosome");

      // Verify HTML was re-rendered from new data
      expect(res.data.frontHtml).toContain("[protein factory]");
      expect(res.data.backHtml).toContain("ribosome");
    });

    it("updates concept on cloze card", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "update-concept");
      freshCardIds.push(card.id);

      const res = await api.put(`/cards/${card.id}`, {
        concept: "Updated cloze concept about cell biology",
      });
      expect(res.status).toBe(200);
      expect(res.data.concept).toBe("Updated cloze concept about cell biology");

      // clozeData should remain unchanged
      expect(res.data.clozeData).toBeDefined();
      expect(res.data.clozeData.deletions).toHaveLength(2);
    });

    it("moves cloze card to different topic", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "move-cloze");
      freshCardIds.push(card.id);

      const res = await api.put(`/cards/${card.id}`, {
        topic_id: TOPICS.BIOLOGY,
      });
      expect(res.status).toBe(200);
      expect(res.data.topicId).toBe(TOPICS.BIOLOGY);
    });

    it("rejects cloze_data update on standard card", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "std-no-cloze-update");
      freshCardIds.push(card.id);

      const res = await api.put(`/cards/${card.id}`, {
        cloze_data: {
          deletions: [{ index: 1, answer: "test", hint: null }],
          sourceText: "{{c1::test}}",
        },
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Delete", () => {
    it("deletes cloze card and cascades", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "to-delete");
      // Don't add to freshCardIds since we're deleting manually

      // Delete
      const deleteRes = await api.delete(`/cards/${card.id}`);
      expect(deleteRes.status).toBe(204);

      // Card should be gone
      const getRes = await api.get(`/cards/${card.id}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe("Reset", () => {
    it("resets cloze card state and clears reviews", async () => {
      const card = await createFreshClozeCard(api, TOPICS.EMPTY_TOPIC, "to-reset");
      freshCardIds.push(card.id);

      // Submit reviews to advance state
      await api.post("/reviews", {
        card_id: card.id,
        bloom_level: 0,
        rating: 3,
        question_text: "Cloze reset test",
      });
      await api.post("/reviews", {
        card_id: card.id,
        bloom_level: 1,
        rating: 4,
        question_text: "Cloze reset test 2",
      });

      // Verify card has reviews
      let getRes = await api.get(`/cards/${card.id}`);
      expect(getRes.data.reviews.length).toBe(2);
      expect(getRes.data.bloomState.currentLevel).toBeGreaterThan(0);

      // Reset
      const resetRes = await api.post(`/cards/${card.id}/reset`, {});
      expect(resetRes.status).toBe(200);
      expect(resetRes.data.bloomState.currentLevel).toBe(0);
      expect(resetRes.data.bloomState.highestReached).toBe(0);
      expect(resetRes.data.fsrsState.state).toBe(0);
      expect(resetRes.data.fsrsState.reps).toBe(0);
      expect(resetRes.data.fsrsState.lapses).toBe(0);
      expect(resetRes.data.reviews).toEqual([]);

      // clozeData should still be intact
      expect(resetRes.data.cardType).toBe("cloze");
      expect(resetRes.data.clozeData).toBeDefined();
      expect(resetRes.data.clozeData.deletions).toHaveLength(2);
    });
  });

  describe("Validation Edge Cases", () => {
    it("rejects cloze card with missing cloze_data", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Missing cloze data",
        card_type: "cloze",
      });
      expect(res.status).toBe(400);
    });

    it("rejects cloze card with empty deletions array", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Empty deletions",
        card_type: "cloze",
        cloze_data: {
          deletions: [],
          sourceText: "No deletions here.",
        },
      });
      expect(res.status).toBe(400);
    });

    it("rejects cloze card with 0-indexed deletion", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Zero index",
        card_type: "cloze",
        cloze_data: {
          deletions: [{ index: 0, answer: "invalid", hint: null }],
          sourceText: "{{c0::invalid}}",
        },
      });
      expect(res.status).toBe(400);
    });

    it("rejects standard card with cloze_data provided", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Standard with cloze",
        card_type: "standard",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
        cloze_data: {
          deletions: [{ index: 1, answer: "test", hint: null }],
          sourceText: "{{c1::test}}",
        },
      });
      expect(res.status).toBe(400);
    });

    it("rejects cloze card with empty answer string", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Empty answer",
        card_type: "cloze",
        cloze_data: {
          deletions: [{ index: 1, answer: "", hint: null }],
          sourceText: "{{c1::}}",
        },
      });
      expect(res.status).toBe(400);
    });

    it("rejects cloze card with duplicate indices", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Duplicate indices",
        card_type: "cloze",
        cloze_data: {
          deletions: [
            { index: 1, answer: "first", hint: null },
            { index: 1, answer: "second", hint: null },
          ],
          sourceText: "{{c1::first}} and {{c1::second}}",
        },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("Backward Compatibility", () => {
    it("standard card creation (no card_type) still works", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Standard backward compat",
        front_html: "<p>Question</p>",
        back_html: "<p>Answer</p>",
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);

      expect(res.data.cardType).toBe("standard");
      expect(res.data.clozeData).toBeNull();
    });

    it("existing seed cards have cardType standard and null clozeData", async () => {
      const res = await api.get(`/cards/${CARDS.NEW_ADDITION}`);
      expect(res.status).toBe(200);
      expect(res.data.cardType).toBe("standard");
      expect(res.data.clozeData).toBeNull();
    });

    it("all seed cards report standard type", async () => {
      // Check a sample of seed cards across different states
      const sampleCards = [
        CARDS.NEW_ADDITION,
        CARDS.LRN_SOLVE_X,
        CARDS.REV_SLOPE_INT,
        CARDS.BIO_CELL_STRUCT,
      ];

      for (const cardId of sampleCards) {
        const res = await api.get(`/cards/${cardId}`);
        expect(res.status).toBe(200);
        expect(res.data.cardType).toBe("standard");
        expect(res.data.clozeData).toBeNull();
      }
    });

    it("existing standard card operations are unaffected", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "compat-crud");
      freshCardIds.push(card.id);

      // Update
      const updateRes = await api.put(`/cards/${card.id}`, {
        concept: "Updated standard card",
      });
      expect(updateRes.status).toBe(200);
      expect(updateRes.data.cardType).toBe("standard");
      expect(updateRes.data.clozeData).toBeNull();

      // Read
      const getRes = await api.get(`/cards/${card.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.data.concept).toBe("Updated standard card");
      expect(getRes.data.cardType).toBe("standard");
    });
  });
});
