import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG, TOPICS, CARDS, USERS } from "../helpers/fixtures.js";

/**
 * Connected apps (Lecture Scribe): pairing by a one-time code the signed-in user
 * approves, the app's bearer token and the short list of routes it may call,
 * and repeatable uploads through notes.source_ref.
 */

const DB_CONFIG = {
  host: "localhost",
  port: TEST_CONFIG.dbPort,
  user: TEST_CONFIG.dbUser,
  password: TEST_CONFIG.dbPassword,
  database: TEST_CONFIG.dbName,
};

function appClient(secret: string): AxiosInstance {
  return axios.create({
    baseURL: TEST_CONFIG.apiUrl,
    headers: { Authorization: `Bearer ${secret}` },
    validateStatus: () => true,
  });
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newSecret = () => `lfa_${randomBytes(32).toString("hex")}`;

let api: AxiosInstance;
let unauth: AxiosInstance;
let pgClient: pg.Client;
const createdNotes: string[] = [];
const createdTopics: string[] = [];

beforeAll(async () => {
  await login();
  api = getApi();
  unauth = getUnauthApi();
  pgClient = new pg.Client(DB_CONFIG);
  await pgClient.connect();
});

afterAll(async () => {
  for (const id of createdNotes) await api.delete(`/notes/${id}`).catch(() => {});
  for (const id of createdTopics) await api.delete(`/topics/${id}`).catch(() => {});
  await pgClient.query(`DELETE FROM app_pair_codes`);
  await pgClient.query(`DELETE FROM app_tokens WHERE user_id = $1`, [USERS.TEST_USER]);
  await pgClient.end();
});

describe("Connected apps — pairing", () => {
  const secret = newSecret();
  let code: string;
  let tokenId: string;

  it("POST /apps/pair/start returns a code and the page to open", async () => {
    const res = await unauth.post("/apps/pair/start", { token_hash: sha256(secret), app: "Lecture Scribe", device: "Test Mac" });
    expect(res.status).toBe(201);
    expect(res.data.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.data.verifyUrl).toContain(`/connect?code=${res.data.code}`);
    expect(new Date(res.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
    code = res.data.code;
  });

  it("rejects a token_hash that is not a SHA-256 digest, and a missing app name", async () => {
    expect((await unauth.post("/apps/pair/start", { token_hash: "not-a-hash", app: "x" })).status).toBe(400);
    expect((await unauth.post("/apps/pair/start", { token_hash: sha256("x") })).status).toBe(400);
  });

  it("poll reports pending; an unknown code is 404", async () => {
    const res = await unauth.post("/apps/pair/poll", { code });
    expect(res.data).toEqual({ status: "pending" });
    expect((await unauth.post("/apps/pair/poll", { code: "ZZZZZZ" })).status).toBe(404);
  });

  it("the app token does not work before the code is approved", async () => {
    expect((await appClient(secret).get("/apps/me")).status).toBe(401);
  });

  it("info needs a login and shows the app and device", async () => {
    expect((await unauth.get("/apps/pair/info", { params: { code } })).status).toBe(401);
    const res = await api.get("/apps/pair/info", { params: { code } });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ app: "Lecture Scribe", device: "Test Mac", claimed: false });
  });

  it("any signed-in user approves the code and gets a row without the hash", async () => {
    const res = await api.post("/apps/claim", { code: code.toLowerCase() });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ app: "Lecture Scribe", device: "Test Mac" });
    expect(res.data).not.toHaveProperty("tokenHash");
    tokenId = res.data.id;
  });

  it("poll then reports claimed, and the code cannot be used twice", async () => {
    expect((await unauth.post("/apps/pair/poll", { code })).data).toEqual({ status: "claimed" });
    expect((await api.post("/apps/claim", { code })).status).toBe(400);
  });

  it("an expired code is unknown to poll, info and claim", async () => {
    const start = await unauth.post("/apps/pair/start", { token_hash: sha256(newSecret()), app: "Lecture Scribe" });
    await pgClient.query(`UPDATE app_pair_codes SET expires_at = NOW() - INTERVAL '1 minute' WHERE code = $1`, [start.data.code]);
    expect((await unauth.post("/apps/pair/poll", { code: start.data.code })).status).toBe(404);
    expect((await api.get("/apps/pair/info", { params: { code: start.data.code } })).status).toBe(404);
    expect((await api.post("/apps/claim", { code: start.data.code })).status).toBe(404);
  });

  describe("the app token", () => {
    it("GET /apps/me names the account and says it may write", async () => {
      const res = await appClient(secret).get("/apps/me");
      expect(res.status).toBe(200);
      expect(res.data.email).toBeTypeOf("string");
      expect(res.data).toMatchObject({ canWrite: true, blocked: null });
      expect(res.data.appUrl).toMatch(/^https?:\/\//);
    });

    it("reads topics, the tree, a topic's context and the card search", async () => {
      const app = appClient(secret);
      expect((await app.get("/topics")).status).toBe(200);
      expect((await app.get(`/topics/${TOPICS.MATHEMATICS}/tree`)).status).toBe(200);
      expect((await app.get(`/context/topic/${TOPICS.MATHEMATICS}`)).status).toBe(200);
      const search = await app.get("/cards/search", { params: { q: "addition", limit: 3 } });
      expect(search.status).toBe(200);
      expect(Array.isArray(search.data.cards)).toBe(true);
    });

    it("creates a topic and a note; the same source_ref returns the same note", async () => {
      const app = appClient(secret);
      const topic = await app.post("/topics", { name: "Scribe test folder", parentId: TOPICS.MATHEMATICS });
      expect(topic.status).toBe(201);
      createdTopics.push(topic.data.id);

      const body = { topic_id: topic.data.id, note_type: "open", fields: { Question: "What is aliasing?", Answer: "Overlapping spectra." }, tags: ["scribe"], source_ref: "scribe:test:c1" };
      const first = await app.post("/notes", body);
      expect(first.status).toBe(201);
      createdNotes.push(first.data.id);
      const again = await app.post("/notes", { ...body, fields: { Question: "Changed", Answer: "Changed" } });
      expect(again.status).toBe(201);
      expect(again.data.id).toBe(first.data.id);
      expect(again.data.fields).toEqual(first.data.fields);
    });

    it("is refused everything outside its list with APP_TOKEN_SCOPE", async () => {
      const app = appClient(secret);
      for (const res of [
        await app.get(`/cards/${CARDS.NEW_ADDITION}`),
        await app.delete(`/cards/${CARDS.NEW_ADDITION}`),
        await app.put(`/notes/${createdNotes[0]}`, { tags: [] }),
        await app.delete(`/notes/${createdNotes[0]}`),
        await app.delete(`/topics/${createdTopics[0]}`),
        await app.get("/study/summary"),
        await app.get("/auth/me"),
        await app.post("/auth/mcp-key"),
        await app.get("/apps/tokens"),
        await app.post("/apps/claim", { code: "ABCDEF" }),
      ]) {
        expect(res.status).toBe(403);
        expect(res.data.code).toBe("APP_TOKEN_SCOPE");
      }
    });

    it("a use pushes the expiry out; a token past its date is TOKEN_EXPIRED", async () => {
      await pgClient.query(`UPDATE app_tokens SET last_used_at = NOW() - INTERVAL '2 hours', expires_at = NOW() + INTERVAL '1 day' WHERE id = $1`, [tokenId]);
      expect((await appClient(secret).get("/apps/me")).status).toBe(200);
      const moved = await pgClient.query(`SELECT expires_at > NOW() + INTERVAL '80 days' AS ok FROM app_tokens WHERE id = $1`, [tokenId]);
      expect(moved.rows[0].ok).toBe(true);

      await pgClient.query(`UPDATE app_tokens SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [tokenId]);
      const res = await appClient(secret).get("/apps/me");
      expect(res.status).toBe(401);
      expect(res.data.code).toBe("TOKEN_EXPIRED");
      await pgClient.query(`UPDATE app_tokens SET expires_at = NOW() + INTERVAL '90 days' WHERE id = $1`, [tokenId]);
    });

    it("an unverified account is told so and cannot upload", async () => {
      const saved = await pgClient.query(`SELECT email_verified_at FROM users WHERE id = $1`, [USERS.TEST_USER]);
      await pgClient.query(`UPDATE users SET email_verified_at = NULL WHERE id = $1`, [USERS.TEST_USER]);
      try {
        const me = await appClient(secret).get("/apps/me");
        expect(me.data).toMatchObject({ canWrite: false, blocked: "EMAIL_NOT_VERIFIED" });
        const res = await appClient(secret).post("/notes", { topic_id: createdTopics[0], note_type: "open", fields: { Question: "q", Answer: "a" } });
        expect(res.status).toBe(403);
        expect(res.data.code).toBe("EMAIL_NOT_VERIFIED");
      } finally {
        await pgClient.query(`UPDATE users SET email_verified_at = $2 WHERE id = $1`, [USERS.TEST_USER, saved.rows[0].email_verified_at]);
      }
    });

    it("is listed for its owner, and removing it ends the access with TOKEN_REVOKED", async () => {
      const list = await api.get("/apps/tokens");
      expect(list.data.map((t: { id: string }) => t.id)).toContain(tokenId);
      expect((await api.delete(`/apps/tokens/${tokenId}`)).status).toBe(204);
      const res = await appClient(secret).get("/apps/me");
      expect(res.status).toBe(401);
      expect(res.data.code).toBe("TOKEN_REVOKED");
      expect((await api.get("/apps/tokens")).data.map((t: { id: string }) => t.id)).not.toContain(tokenId);
    });

    it("DELETE /apps/me lets an app end its own access, and a user login cannot use it", async () => {
      const own = newSecret();
      const start = await unauth.post("/apps/pair/start", { token_hash: sha256(own), app: "Lecture Scribe" });
      await api.post("/apps/claim", { code: start.data.code });
      expect((await api.delete("/apps/me")).status).toBe(403);
      expect((await appClient(own).delete("/apps/me")).status).toBe(204);
      expect((await appClient(own).get("/apps/me")).data.code).toBe("TOKEN_REVOKED");
    });
  });
});
