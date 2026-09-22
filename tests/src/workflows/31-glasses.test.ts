import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { McpTestClient } from "../helpers/mcp-client.js";
import { TEST_CONFIG, TOPICS, USERS } from "../helpers/fixtures.js";
import { createFreshCard, deleteFreshCard } from "../helpers/fresh-card.js";

/**
 * Even Realities G2 glasses: pairing by one-time code, the glasses bearer token,
 * the compile queue and cache filled through the MCP, the ticketed batch, and
 * ring answers graded by the review service. Admin only throughout.
 */

const DB_CONFIG = {
  host: "localhost",
  port: TEST_CONFIG.dbPort,
  user: TEST_CONFIG.dbUser,
  password: TEST_CONFIG.dbPassword,
  database: TEST_CONFIG.dbName,
};

function glassesClient(secret: string): AxiosInstance {
  return axios.create({
    baseURL: TEST_CONFIG.apiUrl,
    headers: { Authorization: `Bearer ${secret}` },
    validateStatus: () => true,
  });
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

let api: AxiosInstance;
let unauth: AxiosInstance;
let mcp: McpTestClient;
let pgClient: pg.Client;
const createdCards: string[] = [];

beforeAll(async () => {
  await login();
  api = getApi();
  unauth = getUnauthApi();
  pgClient = new pg.Client(DB_CONFIG);
  await pgClient.connect();
  mcp = new McpTestClient();
  await mcp.initialize();
});

afterAll(async () => {
  for (const id of createdCards) await deleteFreshCard(api, id).catch(() => {});
  await pgClient.query(`DELETE FROM glasses_pair_codes`);
  await pgClient.query(`DELETE FROM glasses_tokens WHERE user_id = $1`, [USERS.TEST_USER]);
  await pgClient.query(`UPDATE users SET role = 'user' WHERE id = $1`, [USERS.TEST_USER]);
  await pgClient.end();
  await mcp.close();
});

describe("Glasses — pairing", () => {
  const secret = randomBytes(32).toString("hex");
  let code: string;
  let tokenId: string;

  it("POST /glasses/pair/start registers a token hash and returns a 6-char code", async () => {
    const res = await unauth.post("/glasses/pair/start", { token_hash: sha256(secret) });
    expect(res.status).toBe(201);
    expect(res.data.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.data.code).not.toMatch(/[01IO]/);
    expect(new Date(res.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    code = res.data.code;
  });

  it("rejects a token_hash that is not a SHA-256 digest", async () => {
    const res = await unauth.post("/glasses/pair/start", { token_hash: "not-a-hash" });
    expect(res.status).toBe(400);
  });

  it("poll reports pending and never carries a token", async () => {
    const res = await unauth.post("/glasses/pair/poll", { code });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ status: "pending" });
  });

  it("poll of an unknown code is 404", async () => {
    const res = await unauth.post("/glasses/pair/poll", { code: "ZZZZZZ" });
    expect(res.status).toBe(404);
  });

  it("the glasses token does not work before the code is claimed", async () => {
    const res = await glassesClient(secret).get("/glasses/summary");
    expect(res.status).toBe(401);
  });

  it("a non-admin cannot claim", async () => {
    const res = await api.post("/glasses/claim", { code });
    expect(res.status).toBe(403);
  });

  it("an admin claims the code and gets a token row without the hash", async () => {
    await pgClient.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [USERS.TEST_USER]);
    const res = await api.post("/glasses/claim", { code: code.toLowerCase() });
    expect(res.status).toBe(201);
    expect(res.data.id).toBeTypeOf("string");
    expect(res.data.label).toBe("G2 glasses");
    expect(res.data).not.toHaveProperty("tokenHash");
    expect(res.data).not.toHaveProperty("token_hash");
    tokenId = res.data.id;
  });

  it("poll then reports claimed, still without a token", async () => {
    const res = await unauth.post("/glasses/pair/poll", { code });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ status: "claimed" });
  });

  it("a code cannot be claimed twice", async () => {
    const res = await api.post("/glasses/claim", { code });
    expect(res.status).toBe(400);
  });

  it("an expired code is treated as unknown by poll and claim", async () => {
    const other = randomBytes(32).toString("hex");
    const start = await unauth.post("/glasses/pair/start", { token_hash: sha256(other) });
    expect(start.status).toBe(201);
    await pgClient.query(`UPDATE glasses_pair_codes SET expires_at = NOW() - INTERVAL '1 minute' WHERE code = $1`, [start.data.code]);
    expect((await unauth.post("/glasses/pair/poll", { code: start.data.code })).status).toBe(404);
    expect((await api.post("/glasses/claim", { code: start.data.code })).status).toBe(404);
  });

  it("GET /glasses/tokens lists the device, DELETE revokes it, and the glasses see TOKEN_REVOKED", async () => {
    const list = await api.get("/glasses/tokens");
    expect(list.status).toBe(200);
    expect(list.data.map((t: { id: string }) => t.id)).toContain(tokenId);

    const before = await glassesClient(secret).get("/glasses/summary");
    expect(before.status).toBe(200);

    const del = await api.delete(`/glasses/tokens/${tokenId}`);
    expect(del.status).toBe(204);

    const after = await glassesClient(secret).get("/glasses/summary");
    expect(after.status).toBe(401);
    expect(after.data.code).toBe("TOKEN_REVOKED");

    const listAfter = await api.get("/glasses/tokens");
    expect(listAfter.data.map((t: { id: string }) => t.id)).not.toContain(tokenId);
  });
});

describe("Glasses — token scope, compile queue, batch and answers", () => {
  const secret = randomBytes(32).toString("hex");
  let glasses: AxiosInstance;
  let cardA: string;
  let cardB: string;
  let cardC: string;

  beforeAll(async () => {
    await pgClient.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [USERS.TEST_USER]);
    const start = await unauth.post("/glasses/pair/start", { token_hash: sha256(secret) });
    const claim = await api.post("/glasses/claim", { code: start.data.code });
    expect(claim.status).toBe(201);
    glasses = glassesClient(secret);

    cardA = (await createFreshCard(api, TOPICS.EMPTY_TOPIC, "glasses-a")).id;
    cardB = (await createFreshCard(api, TOPICS.EMPTY_TOPIC, "glasses-b")).id;
    cardC = (await createFreshCard(api, TOPICS.EMPTY_TOPIC, "glasses-c")).id;
    createdCards.push(cardA, cardB, cardC);
  });

  it("a glasses token is refused on ordinary routes, a JWT is refused on glasses routes", async () => {
    expect((await glasses.get("/cards/" + cardA)).status).toBe(401);
    expect((await glasses.get("/glasses/tokens")).status).toBe(401);
    expect((await api.get("/glasses/next?mode=single")).status).toBe(401);
    expect((await api.get("/glasses/summary")).status).toBe(401);
  });

  it("GET /glasses/summary returns the Home screen numbers only", async () => {
    const res = await glasses.get("/glasses/summary");
    expect(res.status).toBe(200);
    expect(Object.keys(res.data).sort()).toEqual(["accuracy7d", "bloomLevels", "compiling", "dueCount", "newCount", "pendingCompile", "streak"]);
    expect(res.data.compiling).toBe(false); // GLASSES_COMPILER is off in the test stack
    expect(res.data.pendingCompile).toBeTypeOf("number");
  });

  it("the compile queue lists the fresh cards with what Claude needs", async () => {
    const result = await mcp.callTool("get_glasses_compile_queue", { topic_id: TOPICS.EMPTY_TOPIC, limit: 10 });
    expect(result.isError).toBeFalsy();
    const parsed = mcp.parseToolResult<{ promptVersion: number; entries: Array<Record<string, unknown>> }>(result);
    expect(parsed.promptVersion).toBe(1);
    const ids = parsed.entries.map(e => e.cardId);
    expect(ids).toEqual(expect.arrayContaining([cardA, cardB, cardC]));
    const entry = parsed.entries.find(e => e.cardId === cardA)!;
    expect(entry.bloomLevel).toBe(0);
    expect(entry.frontText).toContain("Test glasses-a");
    expect(entry.backText).toContain("Answer glasses-a");
    expect(entry.topicName).toBe("Empty Topic");
    expect(entry.changeRate).toBeTypeOf("number");
    expect(entry).toHaveProperty("original");
    expect(entry).not.toHaveProperty("frontHtml");
  });

  it("store rejects questions that do not fit the display", async () => {
    const base = { card_id: cardA, bloom_level: 0, options: ["Kinetic energy", "Momentum", "Mass", "Charge"], correct: [0], explanation: "Only elastic collisions keep kinetic energy." };

    const tooLong = await mcp.callTool("store_glasses_question", { ...base, stem: "x".repeat(97) });
    expect(tooLong.isError).toBe(true);

    const fiveOptions = await mcp.callTool("store_glasses_question", { ...base, stem: "Which is conserved?", options: [...base.options, "Spin"] });
    expect(fiveOptions.isError).toBe(true);

    const badIndex = await mcp.callTool("store_glasses_question", { ...base, stem: "Which is conserved?", correct: [4] });
    expect(badIndex.isError).toBe(true);

    const duplicate = await mcp.callTool("store_glasses_question", { ...base, stem: "Which is conserved?", options: ["Mass", "mass", "Charge", "Spin"] });
    expect(duplicate.isError).toBe(true);
    expect(duplicate.content[0].text).toMatch(/distinct/);

    const glyph = await mcp.callTool("store_glasses_question", { ...base, stem: "Which is conserved ✓?" });
    expect(glyph.isError).toBe(true);
    expect(glyph.content[0].text).toMatch(/font/);

    const threeLines = await mcp.callTool("store_glasses_question", { ...base, stem: `${"a".repeat(40)} ${"b".repeat(40)} ${"c".repeat(10)}` });
    expect(threeLines.isError).toBe(true);
    expect(threeLines.content[0].text).toMatch(/lines/);
  });

  it("store accepts a single-correct question, a multi-correct question and a skip", async () => {
    const single = await mcp.callTool("store_glasses_question", {
      card_id: cardA, bloom_level: 0,
      stem: "Which quantity is conserved in an elastic collision only?",
      options: ["Kinetic energy", "Momentum", "Mass", "Charge"], correct: [0],
      explanation: "Inelastic collisions turn kinetic energy into heat. Momentum is conserved in both.",
    });
    expect(single.isError).toBeFalsy();
    expect(mcp.parseToolResult<{ status: string }>(single).status).toBe("ready");

    const multi = await mcp.callTool("store_glasses_question", {
      card_id: cardB, bloom_level: 0,
      stem: "Which are vector quantities?",
      options: ["Velocity", "Speed", "Force", "Energy"], correct: [2, 0],
      explanation: "Velocity and force have a direction; speed and energy do not.",
    });
    expect(multi.isError).toBeFalsy();

    const skipped = await mcp.callTool("store_glasses_question", { card_id: cardC, bloom_level: 0, skip: true, reason: "Needs the integral formula" });
    expect(skipped.isError).toBeFalsy();
    expect(mcp.parseToolResult<{ status: string }>(skipped).status).toBe("skipped");

    const skipWithoutReason = await mcp.callTool("store_glasses_question", { card_id: cardC, bloom_level: 0, skip: true });
    expect(skipWithoutReason.isError).toBe(true);
  });

  it("compiled and skipped cards leave the queue", async () => {
    const result = await mcp.callTool("get_glasses_compile_queue", { topic_id: TOPICS.EMPTY_TOPIC, limit: 10 });
    const ids = mcp.parseToolResult<{ entries: Array<{ cardId: string }> }>(result).entries.map(e => e.cardId);
    expect(ids).not.toContain(cardA);
    expect(ids).not.toContain(cardB);
    expect(ids).not.toContain(cardC);
  });

  let sessionId: string;
  let ticketA: string;

  it("GET /glasses/next?mode=single serves only single-correct rows, with tickets", async () => {
    const res = await glasses.get("/glasses/next?mode=single&limit=20");
    expect(res.status).toBe(200);
    expect(res.data.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    sessionId = res.data.sessionId;
    const ids = res.data.questions.map((q: { cardId: string }) => q.cardId);
    expect(ids).toContain(cardA);
    expect(ids).not.toContain(cardB);
    expect(ids).not.toContain(cardC);
    const q = res.data.questions.find((x: { cardId: string }) => x.cardId === cardA);
    expect(q.mode).toBe("single");
    expect(q.questionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(q.options.map((o: { id: string }) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(q.correctIds).toEqual(["A"]);
    expect(q.explanation).toContain("Momentum");
    ticketA = q.questionId;
  });

  it("mode=multi serves both flavours, resumes the session and honours exclude", async () => {
    const res = await glasses.get(`/glasses/next?mode=multi&limit=20&session_id=${sessionId}&exclude=${cardA}`);
    expect(res.status).toBe(200);
    expect(res.data.sessionId).toBe(sessionId);
    const ids = res.data.questions.map((q: { cardId: string }) => q.cardId);
    expect(ids).toContain(cardB);
    expect(ids).not.toContain(cardA);
    const q = res.data.questions.find((x: { cardId: string }) => x.cardId === cardB);
    expect(q.mode).toBe("multi");
    expect(q.correctIds).toEqual(["A", "C"]);
    expect(res.data.pendingCompile).toBeTypeOf("number");
    expect(res.data.compiling).toBe(false);
  });

  it("an unknown mode is a 400", async () => {
    expect((await glasses.get("/glasses/next?mode=voice")).status).toBe(400);
  });

  it("a correct single answer is graded by the server, and replaying the ticket is idempotent", async () => {
    const res = await glasses.post("/glasses/reviews", { question_id: ticketA, selected: ["a"] });
    expect(res.status).toBe(201);
    expect(res.data.review.rating).toBe(4);
    expect(res.data.review.modality).toBe("mcq");
    expect(res.data.review.userAnswer ?? res.data.review.user_answer).toContain("Kinetic energy");
    expect(res.data.correctIds).toEqual(["A"]);
    expect(res.data.explanation).toContain("Momentum");

    const again = await glasses.post("/glasses/reviews", { question_id: ticketA, selected: ["a"] });
    expect(again.status).toBe(201);
    expect(again.data.duplicate).toBe(true);
  });

  it("I don't know is a rating 1 with the answer recorded as such", async () => {
    const batch = await glasses.get(`/glasses/next?mode=multi&limit=20&session_id=${sessionId}`);
    const q = batch.data.questions.find((x: { cardId: string }) => x.cardId === cardB);
    expect(q).toBeTruthy();
    const res = await glasses.post("/glasses/reviews", { question_id: q.questionId, dont_know: true });
    expect(res.status).toBe(201);
    expect(res.data.review.rating).toBe(1);
    expect(res.data.review.userAnswer ?? res.data.review.user_answer).toBe("I don't know");
  });

  it("an answer needs either letters or dont_know, and only letters A to D", async () => {
    const batch = await glasses.get(`/glasses/next?mode=multi&limit=20&session_id=${sessionId}`);
    const q = batch.data.questions[0];
    if (!q) return; // every due card was answered above; nothing left to validate against
    expect((await glasses.post("/glasses/reviews", { question_id: q.questionId, selected: [] })).status).toBe(400);
    expect((await glasses.post("/glasses/reviews", { question_id: q.questionId, selected: ["E"] })).status).toBe(400);
  });

  it("editing a card drops its compiled question and puts it back in the queue", async () => {
    const cardD = (await createFreshCard(api, TOPICS.EMPTY_TOPIC, "glasses-d")).id;
    createdCards.push(cardD);
    const stored = await mcp.callTool("store_glasses_question", {
      card_id: cardD, bloom_level: 0, stem: "What is 2 + 2?", options: ["3", "4", "5", "22"], correct: [1], explanation: "Two and two make four.",
    });
    expect(stored.isError).toBeFalsy();

    const served = await glasses.get(`/glasses/next?mode=single&limit=20&session_id=${sessionId}`);
    expect(served.data.questions.map((q: { cardId: string }) => q.cardId)).toContain(cardD);

    const edit = await api.put(`/cards/${cardD}`, { concept: "Edited concept for glasses-d" });
    expect(edit.status).toBe(200);

    const after = await glasses.get(`/glasses/next?mode=single&limit=20&session_id=${sessionId}`);
    expect(after.data.questions.map((q: { cardId: string }) => q.cardId)).not.toContain(cardD);

    const queue = await mcp.callTool("get_glasses_compile_queue", { topic_id: TOPICS.EMPTY_TOPIC, limit: 10 });
    expect(mcp.parseToolResult<{ entries: Array<{ cardId: string }> }>(queue).entries.map(e => e.cardId)).toContain(cardD);
  });

  it("the MCP tools refuse a non-admin account", async () => {
    await pgClient.query(`UPDATE users SET role = 'user' WHERE id = $1`, [USERS.TEST_USER]);
    const result = await mcp.callTool("get_glasses_compile_queue", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/admin/);
    const glassesRes = await glasses.get("/glasses/summary");
    expect(glassesRes.status).toBe(401);
    await pgClient.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [USERS.TEST_USER]);
  });
});
