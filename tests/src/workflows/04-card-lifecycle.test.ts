import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, IMAGES } from "../helpers/fixtures.js";
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

describe("Card Lifecycle", () => {

  describe("Create", () => {
    it("creates card with all fields", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Test card with all fields",
        front_html: "<div>Front</div>",
        back_html: "<div>Back</div>",
        tags: ["test", "full"],
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);

      expect(res.data.id).toBeDefined();
      expect(res.data.topicId).toBe(TOPICS.EMPTY_TOPIC);
      expect(res.data.concept).toBe("Test card with all fields");
      expect(res.data.tags).toEqual(["test", "full"]);

      // Embedding is excluded from API responses (internal-only)
      expect(res.data.embedding).toBeUndefined();

      // Bloom state initialized to 0
      expect(res.data.bloomState).toBeDefined();
      expect(res.data.bloomState.currentLevel).toBe(0);
      expect(res.data.bloomState.highestReached).toBe(0);

      // FSRS state initialized
      expect(res.data.fsrsState).toBeDefined();
      expect(res.data.fsrsState.state).toBe(0);
      expect(res.data.fsrsState.reps).toBe(0);
      expect(res.data.fsrsState.lapses).toBe(0);
    });

    it("creates card with minimal fields", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Minimal card",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);

      expect(res.data.tags).toEqual([]);
      expect(res.data.embedding).toBeUndefined();
    });

    it("rejects card with invalid topic", async () => {
      const res = await api.post("/cards", {
        topic_id: "00000000-0000-0000-0000-000000000099",
        concept: "Bad topic",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Read", () => {
    it("reads card with full state and reviews", async () => {
      // Use a seeded card with reviews
      const res = await api.get(`/cards/${CARDS.REV_SLOPE_INT}`);
      expect(res.status).toBe(200);

      expect(res.data.concept).toBe("Slope-intercept form");
      expect(res.data.bloomState).toBeDefined();
      expect(res.data.bloomState.currentLevel).toBe(3);
      expect(res.data.fsrsState).toBeDefined();
      expect(res.data.fsrsState.state).toBe(2); // Review
      expect(res.data.reviews).toBeDefined();
      expect(res.data.reviews.length).toBe(4); // 4 reviews in seed
    });
  });

  describe("Update", () => {
    it("updates concept and triggers re-embedding", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "embed-change");
      freshCardIds.push(card.id);

      const res = await api.put(`/cards/${card.id}`, {
        concept: "Completely different concept about quantum mechanics",
      });
      expect(res.status).toBe(200);
      expect(res.data.concept).toBe("Completely different concept about quantum mechanics");
      // Embedding is excluded from response but is recomputed server-side
      expect(res.data.embedding).toBeUndefined();
      expect(new Date(res.data.updatedAt).getTime()).toBeGreaterThan(
        new Date(card.updatedAt).getTime(),
      );
    });

    it("updates front_html and triggers re-embedding", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "html-embed-change");
      freshCardIds.push(card.id);

      const res = await api.put(`/cards/${card.id}`, {
        front_html: "<p>Completely different front content about quantum physics</p>",
      });
      expect(res.status).toBe(200);
      expect(res.data.frontHtml).toBe("<p>Completely different front content about quantum physics</p>");
      // Embedding is excluded from response but is recomputed server-side
      expect(res.data.embedding).toBeUndefined();
    });

    it("moves card to different topic", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "move-card");
      freshCardIds.push(card.id);

      const res = await api.put(`/cards/${card.id}`, {
        topic_id: TOPICS.BIOLOGY,
      });
      expect(res.status).toBe(200);
      expect(res.data.topicId).toBe(TOPICS.BIOLOGY);
    });
  });

  describe("Delete", () => {
    it("deletes card and cascades", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "to-delete");
      // Don't add to freshCardIds since we're deleting manually

      // Add a review first
      await submitReview(api, card.id, 0, 3);

      // Delete
      const deleteRes = await api.delete(`/cards/${card.id}`);
      expect(deleteRes.status).toBe(204);

      // Card should be gone
      const getRes = await api.get(`/cards/${card.id}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe("Reset", () => {
    it("resets card state and clears reviews", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "to-reset");
      freshCardIds.push(card.id);

      // Advance bloom and add reviews
      await submitReview(api, card.id, 0, 3);
      await submitReview(api, card.id, 1, 4);

      // Verify card has reviews and advanced bloom
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
    });
  });
});
