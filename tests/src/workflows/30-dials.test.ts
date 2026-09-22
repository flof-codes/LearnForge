import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { McpTestClient } from "../helpers/mcp-client.js";
import { TOPICS, TEST_CONFIG } from "../helpers/fixtures.js";
import { createFreshCard, deleteFreshCard, submitReview } from "../helpers/fresh-card.js";

/**
 * Release 1 of the card-model direction: change rate, session difficulty,
 * graded level progress, the interval factor, question tickets and originals.
 */

let api: AxiosInstance;
let mcp: McpTestClient;
const freshCardIds: string[] = [];
const freshTopicIds: string[] = [];

const DEFAULT_TUTOR_FACTOR = (1 + 0.5 * 0.8) * (0.7 + 0.3 * 1); // 1.4

async function loginOther(): Promise<AxiosInstance> {
  const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
  const res = await axios.post(`${url}/auth/login`, { email: TEST_CONFIG.otherEmail, password: TEST_CONFIG.otherPassword });
  return axios.create({ baseURL: url, headers: { Authorization: `Bearer ${res.data.token}` }, validateStatus: () => true });
}

async function createTopic(name: string, parentId?: string): Promise<string> {
  const res = await api.post("/topics", { name, parentId });
  expect(res.status).toBe(201);
  freshTopicIds.push(res.data.id);
  return res.data.id;
}

async function startSession(difficulty = 1): Promise<string> {
  const result = await mcp.callTool("start_session", { client: "codex", difficulty });
  const parsed = mcp.parseToolResult<{ session: { id: string } }>(result);
  return parsed.session.id;
}

async function ticketFor(sessionId: string, cardId: string, topicId: string) {
  const result = await mcp.callTool("get_study_cards", { session_id: sessionId, topic_id: topicId, limit: 100 });
  const cards = mcp.parseToolResult<any[]>(result);
  const card = cards.find((c) => c.id === cardId);
  expect(card, "card should be due").toBeDefined();
  expect(card.questionId).toBeTruthy();
  return card;
}

const choiceAnswer = (selected: string[]) => ({
  style: "single",
  correct_option_ids: ["A"],
  selected_option_ids: selected,
  question_text: "How many ways are there to choose 2 items from 5? A) 10 B) 20",
});

beforeAll(async () => {
  await login();
  api = getApi();
  mcp = new McpTestClient();
  await mcp.initialize();
});

afterAll(async () => {
  for (const id of freshCardIds) await deleteFreshCard(api, id);
  for (const id of freshTopicIds.reverse()) await api.delete(`/topics/${id}`);
  await mcp.close();
});

describe("Change rate inheritance", () => {
  it("resolves card → topic → parent → default and exposes the source", async () => {
    const parent = await createTopic("dials-parent");
    const child = await createTopic("dials-child", parent);
    const card = await createFreshCard(api, child, "inherit");
    freshCardIds.push(card.id);

    let res = await api.get(`/cards/${card.id}`);
    expect(res.data.changeRate).toBeNull();
    expect(res.data.effectiveChangeRate).toBe(0.8);
    expect(res.data.rateSource).toBe("default");

    expect((await api.put(`/topics/${parent}`, { changeRate: 0.3 })).status).toBe(200);
    res = await api.get(`/cards/${card.id}`);
    expect(res.data.effectiveChangeRate).toBeCloseTo(0.3, 5);
    expect(res.data.rateSource).toBe("topic");
    expect(res.data.inheritedFrom).toBe("dials-parent");

    // An explicit 0 on the child topic wins over the parent's 0.3
    expect((await api.put(`/topics/${child}`, { changeRate: 0 })).status).toBe(200);
    res = await api.get(`/cards/${card.id}`);
    expect(res.data.effectiveChangeRate).toBe(0);
    expect(res.data.rateSource).toBe("topic");
    const topic = await api.get(`/topics/${child}`);
    expect(topic.data.changeRate).toBe(0);
    expect(topic.data.inheritedChangeRate).toBeCloseTo(0.3, 5);

    // A card value wins over every topic; null re-inherits
    expect((await api.put(`/cards/${card.id}`, { change_rate: 1 })).status).toBe(200);
    res = await api.get(`/cards/${card.id}`);
    expect(res.data.effectiveChangeRate).toBe(1);
    expect(res.data.rateSource).toBe("card");
    expect((await api.put(`/cards/${card.id}`, { change_rate: null })).status).toBe(200);
    res = await api.get(`/cards/${card.id}`);
    expect(res.data.rateSource).toBe("topic");
  });

  it("rejects values outside 0..1", async () => {
    const topic = await createTopic("dials-range");
    expect((await api.put(`/topics/${topic}`, { changeRate: 1.5 })).status).toBe(400);
    expect((await api.put(`/topics/${topic}`, { changeRate: -0.1 })).status).toBe(400);
    const mcpRes = await mcp.callTool("set_change_rate", { topic_id: topic, change_rate: 2 });
    expect(mcpRes.isError).toBe(true);
  });

  it("set_change_rate on a card wins over its topic and requires exactly one target", async () => {
    const topic = await createTopic("dials-mcp-card-rate");
    await api.put(`/topics/${topic}`, { changeRate: 0.3 });
    const card = await createFreshCard(api, topic, "mcp-card-rate");
    freshCardIds.push(card.id);
    const set = mcp.parseToolResult<any>(await mcp.callTool("set_change_rate", { card_id: card.id, change_rate: 0.9 }));
    expect(set.effective.changeRate).toBeCloseTo(0.9, 5);
    expect(set.effective.rateSource).toBe("card");
    const both = await mcp.callTool("set_change_rate", { card_id: card.id, topic_id: topic, change_rate: 0.5 });
    expect(both.isError).toBe(true);
  });

  it("set_change_rate via MCP sets and clears the value", async () => {
    const topic = await createTopic("dials-mcp-rate");
    const set = mcp.parseToolResult<any>(await mcp.callTool("set_change_rate", { topic_id: topic, change_rate: 0.5 }));
    expect(set.effective.changeRate).toBe(0.5);
    const cleared = mcp.parseToolResult<any>(await mcp.callTool("set_change_rate", { topic_id: topic, change_rate: null }));
    expect(cleared.effective.rateSource).toBe("default");
  });
});

describe("Level progress", () => {
  it("adds rate × correctness per answer and climbs at +0.5", async () => {
    const topic = await createTopic("dials-level-03");
    await api.put(`/topics/${topic}`, { changeRate: 0.3 });
    const card = await createFreshCard(api, topic, "level-03");
    freshCardIds.push(card.id);

    // Easy = correctness 1.0 → +0.3
    const first = await submitReview(api, card.id, 0, 4);
    expect(first.bloomState.currentLevel).toBe(0);
    expect(first.bloomState.progress).toBeCloseTo(0.3, 5);
    expect(first.review.levelStep).toBeCloseTo(0.3, 5);
    expect(first.review.rulesVersion).toBe(2);

    const second = await submitReview(api, card.id, 0, 4);
    expect(second.bloomState.currentLevel).toBe(1);
    expect(second.bloomState.progress).toBe(0);
  });

  it("subtracts rate × (1 − correctness) on a wrong answer and drops at −0.5", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "level-drop");
    freshCardIds.push(card.id);
    await submitReview(api, card.id, 0, 3); // 0.8 × 0.8 = 0.64 → level 1
    const again = await submitReview(api, card.id, 1, 1); // −0.8 × 1 = −0.8 → level 0
    expect(again.bloomState.currentLevel).toBe(0);
    expect(again.bloomState.progress).toBe(0);
    expect(again.review.levelStep).toBeCloseTo(-0.8, 5);
  });

  it("never moves at change rate 0", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "level-zero");
    freshCardIds.push(card.id);
    await api.put(`/cards/${card.id}`, { change_rate: 0 });
    for (let i = 0; i < 3; i++) {
      const r = await submitReview(api, card.id, 0, 4);
      expect(r.bloomState.currentLevel).toBe(0);
      expect(r.bloomState.progress).toBe(0);
    }
  });

  it("does not count questions asked above or below the level", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "level-off");
    freshCardIds.push(card.id);
    const r = await submitReview(api, card.id, 3, 4); // card is at level 0
    expect(r.review.onLevel).toBe(false);
    expect(r.review.levelStep).toBe(0);
    expect(r.bloomState.currentLevel).toBe(0);
  });

  it("does not count a question asked below the level either", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "level-below");
    freshCardIds.push(card.id);
    await submitReview(api, card.id, 0, 3); // → level 1
    const r = await submitReview(api, card.id, 0, 4); // asked at level 0, card is at 1
    expect(r.review.onLevel).toBe(false);
    expect(r.review.levelStep).toBe(0);
    expect(r.bloomState.currentLevel).toBe(1);
  });

  it("does not build up outwards at the highest level", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "level-ceiling");
    freshCardIds.push(card.id);
    for (let level = 0; level < 5; level++) await submitReview(api, card.id, level, 3);
    const top = await submitReview(api, card.id, 5, 4);
    expect(top.bloomState.currentLevel).toBe(5);
    expect(top.bloomState.progress).toBe(0);
    expect(top.bloomState.highestReached).toBe(5);
  });

  it("does not build up outwards at the lowest level", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "level-floor");
    freshCardIds.push(card.id);
    const r = await submitReview(api, card.id, 0, 1); // −0.8 at level 0
    expect(r.bloomState.currentLevel).toBe(0);
    expect(r.bloomState.progress).toBe(0);
  });
});

describe("Interval factor", () => {
  it("web self-rating keeps 0.95; a tutor review at the default rate gets 1.4", async () => {
    const web = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "factor-web");
    const chat = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "factor-chat");
    freshCardIds.push(web.id, chat.id);
    const w = await submitReview(api, web.id, 0, 4, { modality: "web", skipBloom: true });
    const c = await submitReview(api, chat.id, 0, 4, { modality: "chat" });
    expect(w.review.intervalFactor).toBeCloseTo(0.95, 5);
    expect(w.review.sessionDifficulty).toBeNull();
    expect(c.review.intervalFactor).toBeCloseTo(DEFAULT_TUTOR_FACTOR, 5);
    // Easy on a new card reaches Review with a multi-day interval, so the factor applies
    expect(c.review.fsrsIntervalDays).toBeGreaterThanOrEqual(1);
    expect(c.review.scheduledDays).toBeCloseTo(c.review.fsrsIntervalDays * DEFAULT_TUTOR_FACTOR, 3);
  });

  it("leaves learning steps shorter than a day untouched", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "factor-short");
    freshCardIds.push(card.id);
    const r = await submitReview(api, card.id, 0, 3, { modality: "chat" });
    expect(r.review.fsrsIntervalDays).toBeLessThan(1);
    expect(r.review.scheduledDays).toBeCloseTo(r.review.fsrsIntervalDays, 6);
  });

  it("session difficulty shortens the interval", async () => {
    const topic = await createTopic("dials-difficulty");
    const card = await createFreshCard(api, topic, "factor-difficulty");
    freshCardIds.push(card.id);
    const sessionId = await startSession(0.3);
    const served = await ticketFor(sessionId, card.id, topic);
    expect(served.sessionDifficulty).toBeCloseTo(0.3, 5);
    const result = mcp.parseToolResult<any>(await mcp.callTool("submit_review", {
      question_id: served.questionId, bloom_level: 0, ...choiceAnswer(["A"]),
    }));
    expect(result.grading.correctness).toBe(1);
    expect(result.grading.gradedBy).toBe("server");
    expect(result.review.intervalFactor).toBeCloseTo((1 + 0.5 * 0.8) * (0.7 + 0.3 * 0.3), 5);
  });
});

describe("Server-graded choice questions", () => {
  const multi = (selected: string[]) => ({
    style: "multiple",
    correct_option_ids: ["A", "C"],
    selected_option_ids: selected,
    question_text: "Select all that apply. A) x B) y C) z D) w",
  });

  it("scores multiple choice as (hits − wrong picks) / correct count, floored at 0", async () => {
    const topic = await createTopic("dials-multi");
    const cases: Array<[string[], number]> = [[["A", "C"], 1], [["A"], 0.5], [["A", "B"], 0], [["B", "D"], 0], [["A", "C", "B"], 0.5]];
    for (const [selected, expected] of cases) {
      const card = await createFreshCard(api, topic, `multi-${selected.join("")}`);
      freshCardIds.push(card.id);
      const sessionId = await startSession(1);
      const served = await ticketFor(sessionId, card.id, topic);
      const r = mcp.parseToolResult<any>(await mcp.callTool("submit_review", { question_id: served.questionId, bloom_level: 0, ...multi(selected) }));
      expect(r.grading.correctness, selected.join(",")).toBeCloseTo(expected, 5);
      expect(r.grading.gradedBy).toBe("server");
    }
  });

  it("rejects a choice answer without any correct option", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "multi-empty");
    freshCardIds.push(card.id);
    const res = await api.post("/reviews", { card_id: card.id, bloom_level: 0, style: "single", correct_option_ids: [], selected_option_ids: ["A"], question_text: "?", modality: "chat" });
    expect(res.status).toBe(400);
  });
});

describe("Question tickets", () => {
  it("grades a ticket exactly once and returns the first result on a retry", async () => {
    const topic = await createTopic("dials-ticket-once");
    const card = await createFreshCard(api, topic, "ticket-once");
    freshCardIds.push(card.id);
    const sessionId = await startSession(1);
    const served = await ticketFor(sessionId, card.id, topic);

    const first = mcp.parseToolResult<any>(await mcp.callTool("submit_review", {
      question_id: served.questionId, bloom_level: 0, ...choiceAnswer(["B"]),
    }));
    expect(first.duplicate).toBe(false);
    expect(first.grading.correctness).toBe(0);
    expect(first.review.rating).toBe(1);

    const second = mcp.parseToolResult<any>(await mcp.callTool("submit_review", {
      question_id: served.questionId, bloom_level: 0, ...choiceAnswer(["A"]),
    }));
    expect(second.duplicate).toBe(true);
    expect(second.review.id).toBe(first.review.id);

    const detail = await api.get(`/cards/${card.id}`);
    expect(detail.data.reviews).toHaveLength(1);
  });

  it("refuses a ticket when the card was reviewed elsewhere since it was served", async () => {
    const topic = await createTopic("dials-ticket-stale");
    const card = await createFreshCard(api, topic, "ticket-stale");
    freshCardIds.push(card.id);
    const sessionA = await startSession(1);
    const sessionB = await startSession(1);
    const servedA = await ticketFor(sessionA, card.id, topic);
    const servedB = await ticketFor(sessionB, card.id, topic);

    const ok = await mcp.callTool("submit_review", { question_id: servedA.questionId, bloom_level: 0, ...choiceAnswer(["A"]) });
    expect(ok.isError).toBeFalsy();
    const stale = await mcp.callTool("submit_review", { question_id: servedB.questionId, bloom_level: 0, ...choiceAnswer(["A"]) });
    expect(stale.isError).toBe(true);
    expect(stale.content[0].text).toMatch(/stale/i);
  });

  it("handles two concurrent submits for one ticket with a single review row", async () => {
    const topic = await createTopic("dials-ticket-race");
    const card = await createFreshCard(api, topic, "ticket-race");
    freshCardIds.push(card.id);
    const sessionId = await startSession(1);
    const served = await ticketFor(sessionId, card.id, topic);

    const body = { question_id: served.questionId, bloom_level: 0, ...choiceAnswer(["A"]) };
    const [a, b] = await Promise.all([api.post("/reviews", body), api.post("/reviews", body)]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.data.review.id).toBe(b.data.review.id);
    const detail = await api.get(`/cards/${card.id}`);
    expect(detail.data.reviews).toHaveLength(1);
  });

  it("rejects another user's ticket", async () => {
    const topic = await createTopic("dials-ticket-owner");
    const card = await createFreshCard(api, topic, "ticket-owner");
    freshCardIds.push(card.id);
    const sessionId = await startSession(1);
    const served = await ticketFor(sessionId, card.id, topic);

    const otherApi = await loginOther();
    const res = await otherApi.post("/reviews", { question_id: served.questionId, bloom_level: 0, ...choiceAnswer(["A"]) });
    expect(res.status).toBe(404);
  });

  it("takes a changed difficulty from submit_review and writes it back to the session", async () => {
    const topic = await createTopic("dials-difficulty-change");
    const card = await createFreshCard(api, topic, "difficulty-change");
    freshCardIds.push(card.id);
    const sessionId = await startSession(1);
    const served = await ticketFor(sessionId, card.id, topic);
    const r = mcp.parseToolResult<any>(await mcp.callTool("submit_review", {
      question_id: served.questionId, bloom_level: 0, session_difficulty: 0.3, ...choiceAnswer(["A"]),
    }));
    expect(r.review.sessionDifficulty).toBeCloseTo(0.3, 5);
    expect(r.review.intervalFactor).toBeCloseTo((1 + 0.5 * 0.8) * (0.7 + 0.3 * 0.3), 5);
    const resumed = mcp.parseToolResult<any>(await mcp.callTool("start_session", { session_id: sessionId }));
    expect(resumed.session.sessionDifficulty).toBeCloseTo(0.3, 5);
  });

  it("refuses to resume another user's session", async () => {
    const sessionId = await startSession(1);
    const otherApi = await loginOther();
    // The API has no session route; cross-user access is checked through the MCP tool's userId, so use a foreign card ticket instead.
    const topic = await createTopic("dials-foreign-session");
    const card = await createFreshCard(api, topic, "foreign-session");
    freshCardIds.push(card.id);
    const served = await ticketFor(sessionId, card.id, topic);
    const res = await otherApi.post("/reviews", { question_id: served.questionId, bloom_level: 0, ...choiceAnswer(["A"]) });
    expect(res.status).toBe(404);
  });

  it("start_session resumes and lists open tickets", async () => {
    const topic = await createTopic("dials-session-resume");
    const card = await createFreshCard(api, topic, "session-resume");
    freshCardIds.push(card.id);
    const sessionId = await startSession(0.7);
    await ticketFor(sessionId, card.id, topic);
    const resumed = mcp.parseToolResult<any>(await mcp.callTool("start_session", { session_id: sessionId }));
    expect(resumed.resumed).toBe(true);
    expect(resumed.session.sessionDifficulty).toBeCloseTo(0.7, 5);
    expect(resumed.openQuestions.some((q: any) => q.cardId === card.id)).toBe(true);
  });
});

describe("Originals", () => {
  it("stores the original, serves it with the card, and versions on change", async () => {
    const topic = await createTopic("dials-original");
    const card = await createFreshCard(api, topic, "original");
    freshCardIds.push(card.id);

    const v1 = mcp.parseToolResult<any>(await mcp.callTool("set_original", {
      card_id: card.id, question_text: "How many ways to choose 2 of 5?", expected_answer: "10",
      options: [{ id: "A", text: "10", correct: true }, { id: "B", text: "20" }],
    }));
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("current");

    const sessionId = await startSession(1);
    const served = await ticketFor(sessionId, card.id, topic);
    expect(served.original.id).toBe(v1.id);
    expect(served.original.options).toHaveLength(2);

    const v2 = mcp.parseToolResult<any>(await mcp.callTool("set_original", { card_id: card.id, question_text: "Choose 2 of 5: how many ways?" }));
    expect(v2.version).toBe(2);
    const detail = await api.get(`/cards/${card.id}`);
    expect(detail.data.original.id).toBe(v2.id);
  });

  it("marks a tutor-written original stale when the card content changes", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "original-stale");
    freshCardIds.push(card.id);
    await mcp.callTool("set_original", { card_id: card.id, question_text: "Q?" });
    await api.put(`/cards/${card.id}`, { back_html: "<p>Changed answer</p>" });
    const detail = await api.get(`/cards/${card.id}`);
    expect(detail.data.original.isStale).toBe(true);
  });

  it("keeps a disputed card out of study and out of the due count until resolved", async () => {
    const topic = await createTopic("dials-dispute");
    const card = await createFreshCard(api, topic, "dispute");
    freshCardIds.push(card.id);
    await mcp.callTool("set_original", { card_id: card.id, question_text: "Q?" });

    const disputed = await mcp.callTool("dispute_original", { card_id: card.id, note: "Research says the answer is 20, see source X" });
    expect(disputed.isError).toBeFalsy();

    const due = await api.get(`/study/due?topic_id=${topic}&limit=100`);
    expect(due.data.some((c: any) => c.id === card.id)).toBe(false);
    const summary = await api.get(`/study/summary?topic_id=${topic}`);
    expect(summary.data.newCount).toBe(0);

    // A disputed card scheduled in the future must not show in the forecast either.
    const future = await createFreshCard(api, topic, "dispute-forecast");
    freshCardIds.push(future.id);
    await submitReview(api, future.id, 0, 4); // Easy → Review state, due in days
    await mcp.callTool("set_original", { card_id: future.id, question_text: "Q2?" });
    const before = await api.get(`/study/due-forecast?topic_id=${topic}&range=month`);
    const total = (f: any) => f.buckets.reduce((n: number, b: any) => n + b.count, 0) + f.overdue;
    expect(total(before.data)).toBe(1);
    await mcp.callTool("dispute_original", { card_id: future.id, note: "also wrong" });
    const after = await api.get(`/study/due-forecast?topic_id=${topic}&range=month`);
    expect(total(after.data)).toBe(0);
    await mcp.callTool("resolve_dispute", { card_id: future.id });

    await mcp.callTool("resolve_dispute", { card_id: card.id });
    const dueAfter = await api.get(`/study/due?topic_id=${topic}&limit=100`);
    expect(dueAfter.data.some((c: any) => c.id === card.id)).toBe(true);
  });
});

describe("Undo and web study", () => {
  it("deleting a v2 review replays the stored level steps and factors", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "undo");
    freshCardIds.push(card.id);
    const first = await submitReview(api, card.id, 0, 3); // → level 1
    const second = await submitReview(api, card.id, 1, 3); // → level 2
    expect(second.bloomState.currentLevel).toBe(2);

    const del = await api.delete(`/reviews/${second.review.id}`);
    expect(del.status).toBe(200);
    expect(del.data.bloomState.currentLevel).toBe(1);
    expect(del.data.remainingReviews).toBe(1);
    expect(first.review.id).toBeTruthy();
  });

  it("web self-study never moves the level and logs the self rating", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "web-path");
    freshCardIds.push(card.id);
    const r = await submitReview(api, card.id, 0, 4, { modality: "web", skipBloom: true });
    expect(r.bloomState.currentLevel).toBe(0);
    expect(r.bloomState.progress).toBe(0);
    expect(r.review.gradedBy).toBe("self");
    expect(r.review.style).toBe("self");
    expect(r.review.correctness).toBe(1);
    expect(r.review.skipBloom).toBe(true);
  });

  it("derives the FSRS rating from correctness at the agreed boundaries", async () => {
    const cases: Array<[number, number]> = [[0.49, 1], [0.5, 2], [0.79, 2], [0.8, 3], [0.94, 3], [0.95, 4]];
    for (const [correctness, rating] of cases) {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, `rating-${correctness}`);
      freshCardIds.push(card.id);
      const res = await api.post("/reviews", { card_id: card.id, bloom_level: 0, correctness, style: "open", question_text: "Open?", modality: "chat" });
      expect(res.status).toBe(201);
      expect(res.data.review.rating).toBe(rating);
      expect(res.data.review.gradedBy).toBe("tutor");
    }
  });

  it("reset clears progress and open tickets", async () => {
    const topic = await createTopic("dials-reset");
    const card = await createFreshCard(api, topic, "reset");
    freshCardIds.push(card.id);
    const sessionId = await startSession(1);
    const served = await ticketFor(sessionId, card.id, topic);
    const reviewed = await submitReview(api, card.id, 0, 3); // 0.64 → level 1
    expect(reviewed.bloomState.currentLevel).toBe(1);
    const reset = await api.post(`/cards/${card.id}/reset`, {});
    expect(reset.status, JSON.stringify(reset.data)).toBe(200);
    expect(reset.data.bloomState.currentLevel).toBe(0);
    expect(reset.data.bloomState.progress).toBe(0);
    // Reset deleted the ticket, so it cannot be graded against the fresh state.
    const gone = await mcp.callTool("submit_review", { question_id: served.questionId, bloom_level: 0, ...choiceAnswer(["A"]) });
    expect(gone.isError).toBe(true);
  });
});

describe("Sharing", () => {
  it("carries the effective rate onto the copied root and overrides below it", async () => {
    const parent = await createTopic("dials-share-parent");
    const root = await createTopic("dials-share-root", parent);
    const child = await createTopic("dials-share-child", root);
    await api.put(`/topics/${parent}`, { changeRate: 0.3 });
    await api.put(`/topics/${child}`, { changeRate: 0 });
    const card = await createFreshCard(api, child, "share");
    freshCardIds.push(card.id);
    await api.put(`/cards/${card.id}`, { change_rate: 1 });

    const link = await api.post("/shares", { topic_id: root });
    expect(link.status).toBe(201);

    const otherApi = await loginOther();
    const accepted = await otherApi.post(`/shares/accept/${link.data.token}`, {});
    expect(accepted.status).toBe(200);
    const copiedRootId = accepted.data.topic_id;

    const copiedRoot = await otherApi.get(`/topics/${copiedRootId}`);
    expect(copiedRoot.data.changeRate).toBeCloseTo(0.3, 5);
    const copiedChildId = copiedRoot.data.children.find((t: any) => t.name === "dials-share-child").id;
    const copiedChild = await otherApi.get(`/topics/${copiedChildId}`);
    expect(copiedChild.data.changeRate).toBe(0);
    const cards = await otherApi.get(`/study/due?topic_id=${copiedChildId}&limit=100`);
    expect(cards.data[0].changeRate).toBe(1);
    expect(cards.data[0].rateSource).toBe("card");

    await otherApi.delete(`/cards/${cards.data[0].id}`);
    for (const t of [copiedChildId, copiedRootId]) await otherApi.delete(`/topics/${t}`);
  });
});
