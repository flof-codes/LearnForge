import { describe, it, expect, afterAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";
import { markEmailVerified } from "../helpers/email-verification.js";
import { createFreshCard } from "../helpers/fresh-card.js";

/**
 * Help while answering a stored question (TUTOR_MODEL=stub): definitions and
 * tutorials, kept per card; terms saved to a card; feedback that rewrites the
 * question, and undoing it.
 */

const DB_CONFIG = {
  host: "localhost",
  port: TEST_CONFIG.dbPort,
  user: TEST_CONFIG.dbUser,
  password: TEST_CONFIG.dbPassword,
  database: TEST_CONFIG.dbName,
};
const createdEmails: string[] = [];

async function query<T extends pg.QueryResultRow>(text: string, params: unknown[]): Promise<T[]> {
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  try {
    return (await client.query<T>(text, params)).rows;
  } finally {
    await client.end();
  }
}

/** An admin runs on the server's key in test mode, so the tutor is on. */
async function registerAdmin(tag: string): Promise<AxiosInstance> {
  const email = `help-${tag}-${Date.now()}@learnforge.dev`;
  const res = await getUnauthApi().post("/auth/register", { email, password: "help-test-password", name: `Help ${tag}` });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.data)}`);
  createdEmails.push(email);
  await markEmailVerified(email);
  await query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
  return axios.create({ baseURL: TEST_CONFIG.apiUrl, headers: { Authorization: `Bearer ${res.data.token}` }, validateStatus: () => true });
}

/** A topic with one fresh card, and its first stored question served in a new session. */
async function servedQuestion(api: AxiosInstance, suffix: string) {
  const topic = await api.post("/topics", { name: `Help topic ${suffix} ${Date.now()}` });
  expect(topic.status).toBe(201);
  const card = await createFreshCard(api, topic.data.id, suffix);
  const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
  expect(session.status).toBe(200);
  const scope = { session_id: session.data.sessionId, topic_id: topic.data.id, answer_by: ["tap"] };
  for (let i = 0; i < 40; i++) {
    const res = await api.post("/tutor/next", scope);
    expect(res.status).toBe(200);
    if (res.data.items.length > 0) return { item: res.data.items[0], cardId: card.id as string, topicId: topic.data.id as string };
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("the question writer did not finish in time");
}

const letterOf = (payload: { options: Array<{ correct: boolean }> }) => "ABCD"[payload.options.findIndex(o => o.correct)];

afterAll(async () => {
  if (createdEmails.length > 0) await query("DELETE FROM users WHERE email = ANY($1)", [createdEmails]);
});

describe("Help while studying", () => {
  it("defines marked words once per card and names a used-up balance", async () => {
    const api = await registerAdmin("define");
    const { item, cardId } = await servedQuestion(api, "define");

    const first = await api.post("/tutor/define", { question_id: item.questionId, term: "  statement  " });
    expect(first.status).toBe(200);
    expect(first.data).toEqual({ term: "statement", definition: "Stub definition of statement." });

    // The second look reads the stored definition: the row is the same one, not written again.
    const before = await query<{ id: string }>("SELECT id FROM card_help WHERE card_id = $1 AND kind = 'definition'", [cardId]);
    expect((await api.post("/tutor/define", { question_id: item.questionId, term: "Statement" })).status).toBe(200);
    const after = await query<{ id: string }>("SELECT id FROM card_help WHERE card_id = $1 AND kind = 'definition'", [cardId]);
    expect(before).toHaveLength(1);
    expect(after).toEqual(before);

    const broke = await api.post("/tutor/define", { question_id: item.questionId, term: "[credits]" });
    expect(broke.status).toBe(503);
    expect(broke.data.code).toBe("TUTOR_CREDITS");

    expect((await api.post("/tutor/define", { question_id: item.questionId, term: "" })).status).toBe(400);
    expect((await api.post("/tutor/define", { question_id: item.questionId, term: "x".repeat(81) })).status).toBe(400);
  });

  it("writes a tutorial for a term and one for the whole question", async () => {
    const api = await registerAdmin("tutorial");
    const { item } = await servedQuestion(api, "tutorial");

    const whole = await api.post("/tutor/tutorial", { question_id: item.questionId });
    expect(whole.status).toBe(200);
    expect(whole.data.term).toBeNull();
    const t = whole.data.tutorial;
    expect(t.steps.length).toBeGreaterThan(0);
    expect(t.concepts.map((c: { id: string }) => c.id)).toEqual(["a", "b"]);
    expect(t.links).toEqual([{ from: "a", to: "b", effect: "raises" }]);
    expect(t.steps[0].visual).toMatchObject({ kind: "flow", items: [{ label: "Cause", change: "up" }, { label: "Effect", change: "up" }] });
    expect(t.steps[1].visual).toMatchObject({ kind: "curve", markerX: 1 });

    const term = await api.post("/tutor/tutorial", { question_id: item.questionId, term: "statement" });
    expect(term.status).toBe(200);
    expect(term.data.tutorial.title).toBe("About statement");
  });

  it("saves a term to the card, and a rewritten question underlines it", async () => {
    const api = await registerAdmin("terms");
    const { item, cardId } = await servedQuestion(api, "terms");

    const saved = await api.post("/tutor/terms", { question_id: item.questionId, term: "statement", definition: "A claim." });
    expect(saved.status).toBe(200);
    // Saving the same term again updates it instead of adding a second.
    await api.post("/tutor/terms", { question_id: item.questionId, term: "Statement", definition: "A claim that can be true or false." });
    const terms = await query<{ term: string; definition: string }>("SELECT term, definition FROM card_terms WHERE card_id = $1", [cardId]);
    expect(terms).toEqual([{ term: "statement", definition: "A claim that can be true or false." }]);
    expect((await api.post("/tutor/terms", { question_id: item.questionId, term: "statement", definition: "" })).status).toBe(400);

    const rewritten = await api.post("/tutor/feedback", { question_id: item.questionId, labels: ["unclear"], note: "", scope: "question" });
    expect(rewritten.status).toBe(200);
    expect(rewritten.data.payload.terms).toContainEqual({ term: "statement", definition: "A claim that can be true or false." });
  });

  it("rewrites a question from feedback, serves the new one and can take it back", async () => {
    const api = await registerAdmin("feedback");
    const { item, cardId, topicId } = await servedQuestion(api, "feedback");

    expect((await api.post("/tutor/feedback", { question_id: item.questionId, labels: [], note: "", scope: "card" })).status).toBe(400);
    expect((await api.post("/tutor/feedback", { question_id: item.questionId, labels: ["nonsense"], scope: "card" })).status).toBe(400);
    expect((await api.post("/tutor/feedback", { question_id: item.questionId, labels: ["unclear"], scope: "everything" })).status).toBe(400);
    expect((await api.post("/tutor/feedback", { question_id: item.questionId, labels: ["constructor"], scope: "card" })).status).toBe(400);

    const res = await api.post("/tutor/feedback", { question_id: item.questionId, labels: ["unclear", "not_my_way"], note: "Ask it as a case.", scope: "card" });
    expect(res.status).toBe(200);
    expect(res.data.form).toBe("choice");
    expect(res.data.questionId).not.toBe(item.questionId);
    // The stub names how many labels reached the writer: this feedback's two.
    expect(res.data.payload.stem).toMatch(/^Rewritten \(2 labels\)/);

    const stored = await query<{ labels: string[]; note: string; scope: string; replacement_id: string | null }>(
      "SELECT labels, note, scope, replacement_id FROM card_feedback WHERE card_id = $1", [cardId],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ labels: ["unclear", "not_my_way"], note: "Ask it as a case.", scope: "card" });
    expect(stored[0].replacement_id).not.toBeNull();

    // A new session gets the rewritten question, not the one the feedback was given on.
    const again = await servedAgain(api, topicId);
    expect(again.payload.stem).toBe(res.data.payload.stem);

    // The question the feedback was given on cannot be rewritten a second time.
    const twice = await api.post("/tutor/feedback", { question_id: item.questionId, labels: ["unclear"], scope: "question" });
    expect(twice.status).toBe(400);
    expect(twice.data.code).toBe("QUESTION_STALE");

    // Undo: the rewrite is gone and the original ticket still answers.
    expect((await api.post(`/tutor/feedback/${res.data.feedbackId}/undo`, {})).status).toBe(200);
    expect(await query("SELECT 1 FROM card_feedback WHERE card_id = $1", [cardId])).toHaveLength(0);
    const answer = await api.post("/tutor/answer", { question_id: item.questionId, selected: [letterOf(item.payload)] });
    expect(answer.status).toBe(200);
    expect(answer.data.correctness).toBe(1);
    expect((await api.post(`/tutor/feedback/${res.data.feedbackId}/undo`, {})).status).toBe(404);
  });

  it("keeps feedback when the rewrite fails, and refuses to undo an answered rewrite", async () => {
    const api = await registerAdmin("kept");
    const { item } = await servedQuestion(api, "kept");

    const res = await api.post("/tutor/feedback", { question_id: item.questionId, labels: ["too_easy"], scope: "question" });
    expect(res.status).toBe(200);
    const answered = await api.post("/tutor/answer", { question_id: res.data.questionId, selected: [letterOf(res.data.payload)] });
    expect(answered.status).toBe(200);
    expect((await api.post(`/tutor/feedback/${res.data.feedbackId}/undo`, {})).status).toBe(400);

    // The writer is out of credits: 503, but the feedback is stored.
    const broke = await servedQuestion(api, "kept-broke");
    await query("UPDATE cards SET concept = concept || ' [credits]' WHERE id = $1", [broke.cardId]);
    const failing = await api.post("/tutor/feedback", { question_id: broke.item.questionId, labels: ["unclear"], scope: "card" });
    expect(failing.status).toBe(503);
    expect(failing.data.code).toBe("TUTOR_CREDITS");
    expect(await query("SELECT 1 FROM card_feedback WHERE card_id = $1 AND scope = 'card'", [broke.cardId])).toHaveLength(1);
  });

  it("keeps one account's tickets away from another", async () => {
    const api = await registerAdmin("owner");
    const { item } = await servedQuestion(api, "owner");
    const stranger = await registerAdmin("stranger");
    expect((await stranger.post("/tutor/define", { question_id: item.questionId, term: "statement" })).status).toBe(404);
    expect((await stranger.post("/tutor/tutorial", { question_id: item.questionId })).status).toBe(404);
    expect((await stranger.post("/tutor/terms", { question_id: item.questionId, term: "x", definition: "y" })).status).toBe(404);
    expect((await stranger.post("/tutor/feedback", { question_id: item.questionId, labels: ["unclear"], scope: "card" })).status).toBe(404);

    const res = await api.post("/tutor/feedback", { question_id: item.questionId, labels: ["unclear"], scope: "question" });
    expect((await stranger.post(`/tutor/feedback/${res.data.feedbackId}/undo`, {})).status).toBe(404);
  });
});

/** The topic's first question in a fresh session. */
async function servedAgain(api: AxiosInstance, topicId: string) {
  const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
  const res = await api.post("/tutor/next", { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
  expect(res.status).toBe(200);
  expect(res.data.items).toHaveLength(1);
  return res.data.items[0];
}
