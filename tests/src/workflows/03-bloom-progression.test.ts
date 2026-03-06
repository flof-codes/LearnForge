import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
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

/**
 * Helper: advance a fresh card to a target bloom level by submitting
 * sequential Good reviews at each level.
 */
async function advanceToLevel(cardId: string, targetLevel: number): Promise<void> {
  for (let level = 0; level < targetLevel; level++) {
    await submitReview(api, cardId, level, 3); // Good at current level
  }
}

describe("Bloom Progression", () => {

  it("advances on Good review at current level", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-good");
    freshCardIds.push(card.id);

    const result = await submitReview(api, card.id, 0, 3); // bloom_level=0, rating=Good
    expect(result.bloomState.currentLevel).toBe(1);
    expect(result.bloomState.highestReached).toBe(1);
  });

  it("advances on Easy review at current level", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-easy");
    freshCardIds.push(card.id);

    const result = await submitReview(api, card.id, 0, 4); // bloom_level=0, rating=Easy
    expect(result.bloomState.currentLevel).toBe(1);
  });

  it("does not advance when reviewing below current level", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-below");
    freshCardIds.push(card.id);

    // Advance to level 2
    await advanceToLevel(card.id, 2);

    // Review at level 1 (below current) with Good
    const result = await submitReview(api, card.id, 1, 3);
    expect(result.bloomState.currentLevel).toBe(2); // Stays at 2
  });

  it("drops on Again at current level", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-again");
    freshCardIds.push(card.id);

    // Advance to level 3
    await advanceToLevel(card.id, 3);

    // Again at level 3
    const result = await submitReview(api, card.id, 3, 1);
    expect(result.bloomState.currentLevel).toBe(2);
  });

  it("drops on Hard at current level", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-hard");
    freshCardIds.push(card.id);

    // Advance to level 2
    await advanceToLevel(card.id, 2);

    // Hard at level 2
    const result = await submitReview(api, card.id, 2, 2);
    expect(result.bloomState.currentLevel).toBe(1);
  });

  it("cannot drop below level 0", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-floor");
    freshCardIds.push(card.id);

    // Again at level 0 — should stay at 0
    const result = await submitReview(api, card.id, 0, 1);
    expect(result.bloomState.currentLevel).toBe(0);
  });

  it("cannot advance above level 5", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-ceiling");
    freshCardIds.push(card.id);

    // Climb to level 5
    await advanceToLevel(card.id, 5);

    // Good at level 5 — should stay at 5
    const result = await submitReview(api, card.id, 5, 4);
    expect(result.bloomState.currentLevel).toBe(5);
  });

  it("highestReached tracks peak and does not decrease", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-peak");
    freshCardIds.push(card.id);

    // Advance to 3
    await advanceToLevel(card.id, 3);

    // Verify highestReached = 3
    let getRes = await api.get(`/cards/${card.id}`);
    expect(getRes.data.bloomState.highestReached).toBe(3);

    // Drop to 2
    await submitReview(api, card.id, 3, 1);
    getRes = await api.get(`/cards/${card.id}`);
    expect(getRes.data.bloomState.currentLevel).toBe(2);
    expect(getRes.data.bloomState.highestReached).toBe(3); // Still 3

    // Advance back to 3
    await submitReview(api, card.id, 2, 3);
    getRes = await api.get(`/cards/${card.id}`);
    expect(getRes.data.bloomState.currentLevel).toBe(3);
    expect(getRes.data.bloomState.highestReached).toBe(3); // Still 3
  });

  it("highestReached updates on new peak", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-new-peak");
    freshCardIds.push(card.id);

    // Advance to 3
    await advanceToLevel(card.id, 3);

    // Advance to 4 (new peak)
    const result = await submitReview(api, card.id, 3, 3);
    expect(result.bloomState.currentLevel).toBe(4);
    expect(result.bloomState.highestReached).toBe(4);
  });

  it("skip_bloom leaves bloom state unchanged", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-skip");
    freshCardIds.push(card.id);

    // Advance to level 2
    await advanceToLevel(card.id, 2);

    // Submit review with skip_bloom=true
    const result = await submitReview(api, card.id, 2, 3, { skipBloom: true });
    expect(result.bloomState.currentLevel).toBe(2); // Unchanged
    expect(result.bloomState.highestReached).toBe(2); // Unchanged
  });

  it("completes full climb from level 0 to 5", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-full-climb");
    freshCardIds.push(card.id);

    // 6 sequential Good reviews at matching levels: 0→1→2→3→4→5
    for (let level = 0; level <= 4; level++) {
      const result = await submitReview(api, card.id, level, 3);
      expect(result.bloomState.currentLevel).toBe(level + 1);
    }

    // Verify final state
    const getRes = await api.get(`/cards/${card.id}`);
    expect(getRes.data.bloomState.currentLevel).toBe(5);
    expect(getRes.data.bloomState.highestReached).toBe(5);
  });
});
