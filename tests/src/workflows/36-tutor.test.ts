import { describe, it, expect, afterAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";
import { markEmailVerified } from "../helpers/email-verification.js";
import { createFreshCard } from "../helpers/fresh-card.js";

/**
 * The tutor in the web app: stored questions for due cards, written by the
 * canned writer (TUTOR_MODEL=stub in the test compose file), served with
 * tickets and graded by the server. Admin only.
 */

const DB_CONFIG = {
  host: "localhost",
  port: TEST_CONFIG.dbPort,
  user: TEST_CONFIG.dbUser,
  password: TEST_CONFIG.dbPassword,
  database: TEST_CONFIG.dbName,
};
const createdEmails: string[] = [];

async function registerUser(tag: string, role: "admin" | "user"): Promise<AxiosInstance> {
  const email = `tutor-${tag}-${Date.now()}@learnforge.dev`;
  const res = await getUnauthApi().post("/auth/register", { email, password: "tutor-test-password", name: `Tutor ${tag}` });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.data)}`);
  createdEmails.push(email);
  await markEmailVerified(email);
  if (role === "admin") {
    const client = new pg.Client(DB_CONFIG);
    await client.connect();
    await client.query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
    await client.end();
  }
  return axios.create({ baseURL: TEST_CONFIG.apiUrl, headers: { Authorization: `Bearer ${res.data.token}` }, validateStatus: () => true });
}

async function topicWithCards(api: AxiosInstance, suffixes: string[]): Promise<{ topicId: string; cardIds: string[] }> {
  const topic = await api.post("/topics", { name: `Tutor topic ${Date.now()}` });
  expect(topic.status).toBe(201);
  const cardIds: string[] = [];
  for (const s of suffixes) cardIds.push((await createFreshCard(api, topic.data.id, s)).id);
  return { topicId: topic.data.id, cardIds };
}

/** Polls /tutor/next until it serves something or nothing is left to wait for. */
async function nextItems(api: AxiosInstance, body: Record<string, unknown>) {
  for (let i = 0; i < 40; i++) {
    const res = await api.post("/tutor/next", body);
    expect(res.status).toBe(200);
    if (res.data.items.length > 0 || res.data.pending === 0) return res.data;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("the question writer did not finish in time");
}

/** Options are shuffled when stored, so the tests read the right and a wrong letter off the payload. */
function letterOf(item: { payload: { options: Array<{ correct: boolean }> } }, correct: boolean): string {
  return "ABCD"[item.payload.options.findIndex(o => o.correct === correct)];
}

afterAll(async () => {
  if (createdEmails.length === 0) return;
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  await client.query("DELETE FROM users WHERE email = ANY($1)", [createdEmails]);
  await client.end();
});

describe("Tutor in the web app", () => {
  it("is switched off for an account without a key of its own", async () => {
    const api = await registerUser("plain", "user");
    const status = await api.get("/tutor/status");
    expect(status.status).toBe(200);
    expect(status.data.available).toBe(false);

    const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
    expect(session.status).toBe(403);
    expect(session.data.code).toBe("TUTOR_UNAVAILABLE");
    expect((await api.post("/tutor/next", { session_id: "x", answer_by: ["tap"] })).status).toBe(403);
  });

  it("writes choice questions ahead, serves them with tickets and grades the answer", async () => {
    const api = await registerUser("choice", "admin");
    expect((await api.get("/tutor/status")).data.available).toBe(true);
    const { topicId, cardIds } = await topicWithCards(api, ["alpha", "beta"]);

    const prepared = await api.post("/tutor/prepare", { difficulty: 0.7, answer_by: ["tap"] });
    expect(prepared.status).toBe(200);
    expect(prepared.data.waiting).toBe(2);

    const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
    expect(session.status).toBe(200);
    const scope = { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] };

    const batch = await nextItems(api, scope);
    expect(batch.items).toHaveLength(2);
    const [first, second] = batch.items;
    expect(first.type).toBe("question");
    expect(first.form).toBe("choice");
    expect(cardIds).toContain(first.cardId);
    expect(first.payload.options).toHaveLength(4);
    expect(first.payload.options.filter((o: { correct: boolean }) => o.correct)).toHaveLength(1);
    expect(first.payload.terms[0].term).toContain("Fresh card");
    expect(first.frontHtml).toContain("Test");
    expect(first.backHtml).toContain("Answer");

    // The difficulty of a running session can be changed; another account cannot touch it.
    const harder = await api.put(`/tutor/sessions/${session.data.sessionId}`, { difficulty: 1 });
    expect(harder.status).toBe(200);
    expect(harder.data.difficulty).toBe(1);
    expect((await api.put(`/tutor/sessions/${session.data.sessionId}`, { difficulty: 7 })).status).toBe(400);
    const stranger = await registerUser("stranger", "admin");
    expect((await stranger.put(`/tutor/sessions/${session.data.sessionId}`, { difficulty: 0.3 })).status).toBe(404);
    await api.put(`/tutor/sessions/${session.data.sessionId}`, { difficulty: 0.7 });

    // A right answer: the server grades it, the suggestion follows the correctness.
    const right = await api.post("/tutor/answer", { question_id: first.questionId, selected: [letterOf(first, true)] });
    expect(right.status).toBe(200);
    expect(right.data.correctness).toBe(1);
    expect(right.data.suggestedRating).toBe(4);
    expect(right.data.review.gradedBy).toBe("server");
    expect(right.data.review.style).toBe("single");
    expect(right.data.review.modality).toBe("mcq");

    // The same ticket again returns the stored review, it does not write a second one.
    const again = await api.post("/tutor/answer", { question_id: first.questionId, selected: ["B"] });
    expect(again.status).toBe(200);
    expect(again.data.duplicate).toBe(true);

    // A wrong answer, rated by the learner: correctness stays the server's, the rating is theirs.
    const wrong = await api.post("/tutor/answer", { question_id: second.questionId, selected: [letterOf(second, false)], rating: 2 });
    expect(wrong.status).toBe(200);
    expect(wrong.data.correctness).toBe(0);
    expect(wrong.data.suggestedRating).toBe(1);
    expect(wrong.data.review.rating).toBe(2);

    const reviews = await api.get(`/cards/${first.cardId}`);
    expect(reviews.status).toBe(200);
  });

  it("rejects an answer that names no option or an unknown one", async () => {
    const api = await registerUser("invalid", "admin");
    const { topicId } = await topicWithCards(api, ["gamma"]);
    const session = await api.post("/tutor/sessions", { difficulty: 0.3 });
    const batch = await nextItems(api, { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
    const q = batch.items[0];

    expect((await api.post("/tutor/answer", { question_id: q.questionId, selected: [] })).status).toBe(400);
    expect((await api.post("/tutor/answer", { question_id: q.questionId, selected: ["E"] })).status).toBe(400);
    expect((await api.post("/tutor/answer", { question_id: q.questionId, selected: ["A"], rating: 9 })).status).toBe(400);
    expect((await api.post("/tutor/next", { session_id: session.data.sessionId, answer_by: ["speak"] })).status).toBe(400);
    expect((await api.post("/tutor/sessions", { difficulty: 3 })).status).toBe(400);

    const dontKnow = await api.post("/tutor/answer", { question_id: q.questionId, dont_know: true });
    expect(dontKnow.status).toBe(200);
    expect(dontKnow.data.correctness).toBe(0);
    expect(dontKnow.data.review.userAnswer).toBe("I don't know");
  });

  it("asks a gap when the learner types, and accepts the stored spellings", async () => {
    const api = await registerUser("gap", "admin");
    const { topicId } = await topicWithCards(api, ["delta", "epsilon"]);
    const session = await api.post("/tutor/sessions", { difficulty: 1 });
    const scope = { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["type", "dictate"] };

    const batch = await nextItems(api, scope);
    expect(batch.items).toHaveLength(2);
    const [first, second] = batch.items;
    expect(first.form).toBe("gap");
    expect(first.payload.stem).toContain("{{gap}}");
    expect(first.payload.accept).toContain("correct");

    const right = await api.post("/tutor/answer", { question_id: first.questionId, text: "  Correct. " });
    expect(right.status).toBe(200);
    expect(right.data.correctness).toBe(1);
    expect(right.data.review.gradedBy).toBe("server");
    expect(right.data.review.answerExpected).toBe("Right");

    const wrong = await api.post("/tutor/answer", { question_id: second.questionId, text: "something else" });
    expect(wrong.data.correctness).toBe(0);
    expect(wrong.data.review.rating).toBe(1);
  });

  it("shows a card the writer skipped as it is", async () => {
    const api = await registerUser("skip", "admin");
    const { topicId, cardIds } = await topicWithCards(api, ["[skip] formula"]);
    const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
    const batch = await nextItems(api, { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
    expect(batch.items).toHaveLength(1);
    expect(batch.items[0].type).toBe("card");
    expect(batch.items[0].card.id).toBe(cardIds[0]);
    expect(batch.items[0].card.frontHtml).toContain("Test");
  });

  it("goes on with the plain cards while the writer is out of credits", async () => {
    const api = await registerUser("credits", "admin");
    const { topicId, cardIds } = await topicWithCards(api, ["[credits] zeta"]);
    const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
    const scope = { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] };

    let served;
    for (let i = 0; i < 20 && !served; i++) {
      const res = await api.post("/tutor/next", scope);
      expect(res.status).toBe(200);
      if (res.data.items.length > 0) served = res.data;
      else await new Promise(r => setTimeout(r, 150));
    }
    expect(served).toBeDefined();
    expect(served.paused).toBe("credits");
    expect(served.items[0].type).toBe("card");
    expect(served.items[0].card.id).toBe(cardIds[0]);
    expect((await api.get("/tutor/status")).data.paused).toBe("credits");
  });

  it("drops a stored question when its card is edited", async () => {
    const api = await registerUser("edit", "admin");
    const { topicId, cardIds } = await topicWithCards(api, ["eta"]);
    const scope = { difficulty: 0.7, answer_by: ["tap"], topic_id: topicId };

    let ready = 0;
    for (let i = 0; i < 40 && ready === 0; i++) {
      ready = (await api.post("/tutor/prepare", scope)).data.ready;
      if (ready === 0) await new Promise(r => setTimeout(r, 250));
    }
    expect(ready).toBe(1);

    const edited = await api.put(`/cards/${cardIds[0]}`, { concept: "[skip] rewritten" });
    expect(edited.status).toBe(200);

    // The old question is gone; the writer now skips the rewritten card, which counts as handled.
    const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
    const batch = await nextItems(api, { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
    expect(batch.items[0].type).toBe("card");
  });

  it("asks an open question from Apply up, grades it live and answers follow-ups", async () => {
    const api = await registerUser("open", "admin");
    const { topicId, cardIds } = await topicWithCards(api, ["theta", "iota"]);
    const db = new pg.Client(DB_CONFIG);
    await db.connect();
    await db.query("UPDATE bloom_state SET current_level = 3, highest_reached = 3 WHERE card_id = ANY($1)", [cardIds]);
    await db.end();

    const session = await api.post("/tutor/sessions", { difficulty: 1 });
    const batch = await nextItems(api, { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap", "dictate"] });
    expect(batch.items).toHaveLength(2);
    const [first, second] = batch.items;
    expect(first.form).toBe("open");
    expect(first.payload.keyPoints).toEqual(["Names A", "Names B"]);

    // Half of the key points: graded, not yet saved.
    const graded = await api.post("/tutor/grade", { question_id: first.questionId, text: "It is about A" });
    expect(graded.status).toBe(200);
    expect(graded.data.correctness).toBe(0.5);
    expect(graded.data.points).toEqual([{ text: "Names A", met: true }, { text: "Names B", met: false }]);
    expect(graded.data.feedback).toContain("1 of 2");

    const thread = [
      { role: "user", text: "It is about A" },
      { role: "assistant", text: graded.data.feedback },
      { role: "user", text: "Why does B matter?" },
    ];
    const reply = await api.post("/tutor/followup", { question_id: first.questionId, thread });
    expect(reply.status).toBe(200);
    expect(reply.data.text).toBe("Stub reply to: Why does B matter?");

    // A thread that does not end with the learner, or runs past the limit, is refused.
    expect((await api.post("/tutor/followup", { question_id: first.questionId, thread: thread.slice(0, 2) })).status).toBe(400);
    const long = [...thread];
    for (let i = 0; i < 5; i++) long.push({ role: "assistant", text: "ok" }, { role: "user", text: "and then?" });
    expect((await api.post("/tutor/followup", { question_id: first.questionId, thread: long })).status).toBe(400);

    // Saving uses the server's grade for that text; a correctness sent along is ignored.
    const saved = await api.post("/tutor/answer", { question_id: first.questionId, text: "It is about A", correctness: 1, openCorrectness: 1 });
    expect(saved.status).toBe(200);
    expect(saved.data.correctness).toBe(0.5);
    expect(saved.data.review.style).toBe("open");
    expect(saved.data.review.rating).toBe(2);
    expect(saved.data.review.answerExpected).toBe("It works because of A and B.");

    // Without a grade on record the answer is graded when it is saved.
    const direct = await api.post("/tutor/answer", { question_id: second.questionId, text: "A and also B" });
    expect(direct.status).toBe(200);
    expect(direct.data.correctness).toBe(1);

    expect((await api.post("/tutor/grade", { question_id: first.questionId, text: "" })).status).toBe(400);
  });

  it("refuses to grade a choice question as an open one, and reports a writer that is out of credits", async () => {
    const api = await registerUser("grade", "admin");
    const { topicId, cardIds } = await topicWithCards(api, ["kappa", "lambda"]);
    const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
    const choice = await nextItems(api, { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
    expect((await api.post("/tutor/grade", { question_id: choice.items[0].questionId, text: "anything" })).status).toBe(400);

    const db = new pg.Client(DB_CONFIG);
    await db.connect();
    await db.query("UPDATE bloom_state SET current_level = 2, highest_reached = 2 WHERE card_id = $1", [cardIds[1]]);
    await db.end();
    const open = await nextItems(api, { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["type"], exclude: [cardIds[0]] });
    expect(open.items[0].form).toBe("open");
    const failed = await api.post("/tutor/grade", { question_id: open.items[0].questionId, text: "[credits] A" });
    expect(failed.status).toBe(503);
    expect(failed.data.code).toBe("TUTOR_CREDITS");
  });

  it("lets any user run the tutor on a key they saved, and never shows the key again", async () => {
    const api = await registerUser("ownkey", "user");
    const key = "sk-ant-api03-test-key-0123456789abcdefWXYZ";

    const before = await api.get("/tutor/settings");
    expect(before.status).toBe(200);
    expect(before.data).toMatchObject({ hasKey: false, keyHint: null, serverKey: false, model: "claude-opus-5-5", effort: "medium" });
    expect(before.data.models.map((m: { id: string }) => m.id)).toEqual(["claude-fable-5-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"]);
    expect(before.data.efforts).toEqual(["low", "medium", "high"]);
    expect((await api.post("/tutor/settings/check", {})).status).toBe(400);

    expect((await api.put("/tutor/settings", { api_key: "not a key" })).status).toBe(400);
    expect((await api.put("/tutor/settings", { model: "gpt-9" })).status).toBe(400);
    expect((await api.put("/tutor/settings", { effort: "max" })).status).toBe(400);

    const saved = await api.put("/tutor/settings", { api_key: `  ${key} `, model: "claude-sonnet-5-5", effort: "high" });
    expect(saved.status).toBe(200);
    expect(saved.data).toMatchObject({ hasKey: true, keyHint: "WXYZ", model: "claude-sonnet-5-5", effort: "high" });
    expect(JSON.stringify(saved.data)).not.toContain(key);
    expect(JSON.stringify((await api.get("/tutor/settings")).data)).not.toContain(key);

    // At rest the key is sealed, not readable.
    const db = new pg.Client(DB_CONFIG);
    await db.connect();
    const stored = await db.query("SELECT api_key_enc FROM tutor_settings WHERE key_hint = 'WXYZ'");
    await db.end();
    expect(stored.rows[0].api_key_enc).toMatch(/^v1\./);
    expect(stored.rows[0].api_key_enc).not.toContain(key);

    expect((await api.get("/tutor/status")).data.available).toBe(true);
    expect((await api.post("/tutor/settings/check", {})).data).toEqual({ ok: true, reason: null });

    // A change of model alone leaves the key in place.
    const changed = await api.put("/tutor/settings", { model: "claude-haiku-4-5" });
    expect(changed.data).toMatchObject({ hasKey: true, keyHint: "WXYZ", model: "claude-haiku-4-5", effort: "high" });

    // The tutor now works for this plain user, on their key.
    const { topicId } = await topicWithCards(api, ["mu"]);
    const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
    expect(session.status).toBe(200);
    const batch = await nextItems(api, { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
    expect(batch.items[0].type).toBe("question");

    const removed = await api.delete("/tutor/settings/key");
    expect(removed.data).toMatchObject({ hasKey: false, keyHint: null, model: "claude-haiku-4-5" });
    expect((await api.get("/tutor/status")).data.available).toBe(false);
    expect((await api.post("/tutor/sessions", { difficulty: 0.7 })).status).toBe(403);
  });

  it("reports a key Anthropic rejects, and keeps one user's key away from another", async () => {
    const owner = await registerUser("rejected", "user");
    await owner.put("/tutor/settings", { api_key: "sk-ant-api03-rejected-key-0123456789abcd" });
    expect((await owner.post("/tutor/settings/check", {})).data).toMatchObject({ ok: false, reason: "auth", detail: "The Anthropic API key was rejected" });

    const other = await registerUser("nokey", "user");
    expect((await other.get("/tutor/settings")).data.hasKey).toBe(false);
    expect((await other.get("/tutor/status")).data.available).toBe(false);
  });

  it("lets an admin without a saved key fall back to the server's key, and says so", async () => {
    const api = await registerUser("serverkey", "admin");
    expect((await api.get("/tutor/settings")).data).toMatchObject({ hasKey: false, serverKey: true });
    expect((await api.get("/tutor/status")).data.available).toBe(true);
    const saved = await api.put("/tutor/settings", { api_key: "sk-ant-api03-admin-own-key-0123456789abcd" });
    expect(saved.data).toMatchObject({ hasKey: true, serverKey: false });
  });

  it("hands a session over to a second device: what was answered there is stale here, not an error", async () => {
    const api = await registerUser("handover", "admin");
    const { topicId } = await topicWithCards(api, ["nu", "xi"]);
    const scope = { topic_id: topicId, answer_by: ["tap"] };

    const browser = await api.post("/tutor/sessions", { difficulty: 0.7 });
    const onBrowser = await nextItems(api, { session_id: browser.data.sessionId, ...scope });
    expect(onBrowser.items).toHaveLength(2);

    // The phone starts its own session and gets the same cards, with the questions already written.
    const phone = await api.post("/tutor/sessions", { difficulty: 0.7 });
    const onPhone = await nextItems(api, { session_id: phone.data.sessionId, ...scope });
    expect(onPhone.items).toHaveLength(2);
    expect(onPhone.pending).toBe(0);
    const phoneFirst = onPhone.items.find((i: { cardId: string }) => i.cardId === onBrowser.items[0].cardId);
    expect(phoneFirst.questionId).not.toBe(onBrowser.items[0].questionId);
    expect(phoneFirst.payload.stem).toBe(onBrowser.items[0].payload.stem);

    expect((await api.post("/tutor/answer", { question_id: phoneFirst.questionId, selected: ["A"] })).status).toBe(200);

    // Back in the browser: the check names what is still good, and the stale ticket is refused with a code.
    const check = await api.post("/tutor/check", { question_ids: onBrowser.items.map((i: { questionId: string }) => i.questionId), card_ids: [] });
    expect(check.status).toBe(200);
    expect(check.data.questions).toEqual([onBrowser.items[1].questionId]);

    const stale = await api.post("/tutor/answer", { question_id: onBrowser.items[0].questionId, selected: ["A"] });
    expect(stale.status).toBe(400);
    expect(stale.data.code).toBe("QUESTION_STALE");

    // The card nobody answered is still answerable from the browser.
    expect((await api.post("/tutor/answer", { question_id: onBrowser.items[1].questionId, selected: ["B"] })).status).toBe(200);
  });

  it("keeps a question in use when another difficulty writes its own for the same card", async () => {
    const api = await registerUser("bands", "admin");
    const { topicId } = await topicWithCards(api, ["omicron"]);

    const easy = await api.post("/tutor/sessions", { difficulty: 0.3 });
    const first = await nextItems(api, { session_id: easy.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
    expect(first.items[0].type).toBe("question");

    // Another device at Deep: no question for that band yet, so one is written beside the first.
    const deep = await api.post("/tutor/sessions", { difficulty: 1 });
    const second = await nextItems(api, { session_id: deep.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
    expect(second.items[0].type).toBe("question");
    expect(second.items[0].questionId).not.toBe(first.items[0].questionId);

    const answered = await api.post("/tutor/answer", { question_id: first.items[0].questionId, selected: [letterOf(first.items[0], true)] });
    expect(answered.status).toBe(200);
    expect(answered.data.correctness).toBe(1);
  });

  it("remembers the start screen's choices on the account", async () => {
    const api = await registerUser("prefs", "user");
    expect((await api.get("/tutor/settings")).data).toMatchObject({ difficulty: null, answerBy: null });
    const saved = await api.put("/tutor/settings", { difficulty: 0.55, answer_by: ["tap", "dictate"] });
    expect(saved.status).toBe(200);
    expect(saved.data).toMatchObject({ difficulty: 0.55, answerBy: ["tap", "dictate"], hasKey: false });
    expect((await api.put("/tutor/settings", { difficulty: 4 })).status).toBe(400);
    expect((await api.put("/tutor/settings", { answer_by: ["sing"] })).status).toBe(400);
    expect((await api.get("/tutor/settings")).data).toMatchObject({ difficulty: 0.55, answerBy: ["tap", "dictate"] });
  });
});
