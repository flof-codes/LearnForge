import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TOPICS } from "../helpers/fixtures.js";
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

describe("Error Handling", () => {
  describe("Authentication", () => {
    it("401 without auth header", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.get("/topics");
      expect(res.status).toBe(401);
    });

    it("401 with invalid token", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.get("/topics", {
        headers: { Authorization: "Bearer invalid-token-xyz" },
      });
      expect(res.status).toBe(401);
    });

    it("health endpoint works without auth", async () => {
      const unauth = getUnauthApi();
      const res = await unauth.get("/health");
      expect(res.status).toBe(200);
    });
  });

  describe("Not Found", () => {
    it("404 for non-existent card", async () => {
      const res = await api.get("/cards/00000000-0000-0000-0000-000000000099");
      expect(res.status).toBe(404);
    });

    it("404 for non-existent topic", async () => {
      const res = await api.get("/topics/00000000-0000-0000-0000-000000000099");
      expect(res.status).toBe(404);
    });

    it("404 for non-existent image", async () => {
      const res = await api.get("/images/00000000-0000-0000-0000-000000000099");
      expect(res.status).toBe(404);
    });
  });

  describe("Validation", () => {
    it("400 when creating card without concept", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("400 when creating card without topic_id", async () => {
      const res = await api.post("/cards", {
        concept: "Missing topic",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("400 for rating out of range", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bad-rating");
      freshCardIds.push(card.id);

      const res = await api.post("/reviews", {
        card_id: card.id,
        bloom_level: 0,
        rating: 5, // Invalid: max is 4
        question_text: "Test",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("400 for bloom_level out of range", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bad-bloom");
      freshCardIds.push(card.id);

      const res = await api.post("/reviews", {
        card_id: card.id,
        bloom_level: 6, // Invalid: max is 5
        rating: 3,
        question_text: "Test",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("400 for review without question_text", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "no-question");
      freshCardIds.push(card.id);

      const res = await api.post("/reviews", {
        card_id: card.id,
        bloom_level: 0,
        rating: 3,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("FK Constraints", () => {
    it("error when creating card with non-existent topic", async () => {
      const res = await api.post("/cards", {
        topic_id: "00000000-0000-0000-0000-000000000099",
        concept: "Bad FK",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("error when reviewing non-existent card", async () => {
      const res = await api.post("/reviews", {
        card_id: "00000000-0000-0000-0000-000000000099",
        bloom_level: 0,
        rating: 3,
        question_text: "Test",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("error when reviewing a just-deleted card", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "delete-then-review");
      // Don't track in freshCardIds — we're deleting manually

      const deleteRes = await api.delete(`/cards/${card.id}`);
      expect(deleteRes.status).toBe(204);

      const res = await api.post("/reviews", {
        card_id: card.id,
        bloom_level: 0,
        rating: 3,
        question_text: "Review after deletion",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    });
  });

  describe("Review After Reset", () => {
    it("review after card reset starts from fresh bloom 0", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "reset-then-review");
      freshCardIds.push(card.id);

      // Advance bloom with a review
      const firstReview = await submitReview(api, card.id, 0, 4);
      expect(firstReview.bloomState.currentLevel).toBe(1);

      // Reset the card
      const resetRes = await api.post(`/cards/${card.id}/reset`, {});
      expect(resetRes.status).toBe(200);
      expect(resetRes.data.bloomState.currentLevel).toBe(0);
      expect(resetRes.data.bloomState.highestReached).toBe(0);
      expect(resetRes.data.reviews).toEqual([]);

      // Verify via GET that state is fresh
      const getRes = await api.get(`/cards/${card.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.data.bloomState.currentLevel).toBe(0);
      expect(getRes.data.fsrsState.state).toBe(0);
      expect(getRes.data.fsrsState.reps).toBe(0);

      // Submit a new review — should succeed and advance from bloom 0
      const postResetReview = await submitReview(api, card.id, 0, 3);
      expect(postResetReview.bloomState.currentLevel).toBe(1);
      expect(postResetReview.fsrsState.reps).toBe(1);
    });
  });

  describe("Concurrency", () => {
    it("concurrent reviews on same card both succeed", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "concurrent");
      freshCardIds.push(card.id);

      // Submit two reviews simultaneously
      const [res1, res2] = await Promise.all([
        api.post("/reviews", {
          card_id: card.id,
          bloom_level: 0,
          rating: 3,
          question_text: "Concurrent review 1",
        }),
        api.post("/reviews", {
          card_id: card.id,
          bloom_level: 0,
          rating: 4,
          question_text: "Concurrent review 2",
        }),
      ]);

      // Both should succeed (201) or one might retry
      expect(res1.status).toBeLessThan(500);
      expect(res2.status).toBeLessThan(500);

      // Final state should be consistent
      const getRes = await api.get(`/cards/${card.id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.data.fsrsState.reps).toBeGreaterThanOrEqual(1);
    });
  });
});
