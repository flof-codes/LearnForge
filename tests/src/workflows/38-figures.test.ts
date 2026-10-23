import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";
import { markEmailVerified } from "../helpers/email-verification.js";

/**
 * Figures on typed cards: the optional fields "Figure" and "Front figure" of
 * the built-in types, the upgrade of copies made before they existed, the
 * size budget, a connected app uploading pictures and rewriting its own
 * notes, the tutor showing figures around its questions, and list rows.
 */

const DB_CONFIG = {
  host: "localhost",
  port: TEST_CONFIG.dbPort,
  user: TEST_CONFIG.dbUser,
  password: TEST_CONFIG.dbPassword,
  database: TEST_CONFIG.dbName,
};

const TINY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNl7BcQAAAABJRU5ErkJggg==", "base64");

const svg = (label: string, pad = 0) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" fill="none" stroke="currentColor"><rect x="10" y="10" width="120" height="60"/><text x="70" y="45" fill="currentColor">${label}</text>${pad ? `<desc>${"x".repeat(pad)}</desc>` : ""}</svg>`;

const createdEmails: string[] = [];
let pgClient: pg.Client;

async function registerUser(tag: string, role: "admin" | "user" = "user"): Promise<{ api: AxiosInstance; id: string; email: string }> {
  const email = `figures-${tag}-${Date.now()}@learnforge.dev`;
  const res = await getUnauthApi().post("/auth/register", { email, password: "figures-test-password", name: `Figures ${tag}` });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.data)}`);
  createdEmails.push(email);
  await markEmailVerified(email);
  if (role === "admin") await pgClient.query("UPDATE users SET role = 'admin' WHERE email = $1", [email]);
  const id = (await pgClient.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id as string;
  return { api: axios.create({ baseURL: TEST_CONFIG.apiUrl, headers: { Authorization: `Bearer ${res.data.token}` }, validateStatus: () => true }), id, email };
}

async function newTopic(api: AxiosInstance, name: string): Promise<string> {
  const res = await api.post("/topics", { name: `${name} ${Date.now()}` });
  expect(res.status).toBe(201);
  return res.data.id;
}

async function cardOf(api: AxiosInstance, noteId: string): Promise<{ id: string; frontHtml: string; backHtml: string }> {
  const note = await api.get(`/notes/${noteId}`);
  const card = await api.get(`/cards/${note.data.cards[0].id}`);
  return card.data;
}

function upload(client: AxiosInstance, data: Buffer, mime: string, name: string, cardId?: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mime }), name);
  if (cardId) form.append("card_id", cardId);
  return client.post("/images", form);
}

beforeAll(async () => {
  pgClient = new pg.Client(DB_CONFIG);
  await pgClient.connect();
});

afterAll(async () => {
  if (createdEmails.length > 0) await pgClient.query("DELETE FROM users WHERE email = ANY($1)", [createdEmails]);
  await pgClient.end();
});

describe("Figure fields on the built-in types", () => {
  it("every built-in type has Figure and Front figure, and a note fills them by name", async () => {
    const { api } = await registerUser("fields");
    const types = await api.get("/note-types");
    for (const key of ["open", "choice", "cloze"]) {
      const type = types.data.find((t: { builtinKey: string }) => t.builtinKey === key);
      expect(type.builtinVersion).toBe(2);
      expect(type.fields.map((f: { name: string }) => f.name)).toEqual(expect.arrayContaining(["Figure", "Front figure"]));
    }

    const topicId = await newTopic(api, "Figures");
    const res = await api.post("/notes", {
      topic_id: topicId, note_type: "open",
      fields: { Question: "Which chamber pumps into the lungs?", Answer: "The right ventricle", Figure: svg("Lungs"), "Front figure": svg("?") },
    });
    expect(res.status).toBe(201);
    const card = await cardOf(api, res.data.id);
    expect(card.frontHtml).toContain('class="lf-figure lf-figure-front"');
    expect(card.frontHtml).toContain(">?</text>");
    expect(card.frontHtml).not.toContain(">Lungs</text>");
    // The back carries the full figure below the answer; the front's version stays in {{FrontSide}} and CSS hides it.
    expect(card.backHtml.indexOf("The right ventricle")).toBeLessThan(card.backHtml.indexOf('class="lf-figure lf-figure-back"'));
    expect(card.backHtml).toContain(">Lungs</text>");

    // Empty figure fields render nothing.
    const plain = await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Plain?", Answer: "Yes" } });
    const plainCard = await cardOf(api, plain.data.id);
    expect(plainCard.backHtml).not.toContain('class="lf-figure');

    // Cloze: a front figure stands in on the back when there is no full one.
    const cloze = await api.post("/notes", { topic_id: topicId, note_type: "cloze", fields: { Text: "The {{c1::right}} ventricle", "Front figure": svg("cloze-front") } });
    expect(cloze.status).toBe(201);
    const clozeCard = await cardOf(api, cloze.data.id);
    expect(clozeCard.backHtml).toContain("cloze-front");
  });

  it("an SVG of about 20KB fits; a side over 100KB is refused", async () => {
    const { api } = await registerUser("size");
    const topicId = await newTopic(api, "Sizes");
    const fits = await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Big figure?", Answer: "Fits", Explanation: "y".repeat(3000), Figure: svg("big", 20_000), "Front figure": svg("big?", 20_000) } });
    expect(fits.status).toBe(201);

    const tooBig = await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Huge?", Answer: "No", Figure: svg("a", 55_000), "Front figure": svg("b", 55_000) } });
    expect(tooBig.status).toBe(400);
    expect(tooBig.data.error).toMatch(/100KB/);

    const overField = await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Field?", Answer: "No", Figure: svg("c", 61_000) } });
    expect(overField.status).toBe(400);
  });
});

describe("Upgrading copies made before the figure fields", () => {
  it("adds the fields, keeps notes and their cards, and appends the blocks to a customized design", async () => {
    const { api, id: userId } = await registerUser("upgrade");
    const topicId = await newTopic(api, "Upgrade");
    const note = await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Old question", Answer: "Old answer", Explanation: "Why" } });
    expect(note.status).toBe(201);

    // Turn the user's copies back into version 1: no figure fields, the old templates, choice customized.
    const types = (await pgClient.query("SELECT id, builtin_key FROM note_types WHERE user_id = $1 AND builtin_key IS NOT NULL", [userId])).rows;
    const openId = types.find(t => t.builtin_key === "open").id;
    const choiceId = types.find(t => t.builtin_key === "choice").id;
    await pgClient.query("DELETE FROM note_type_fields WHERE note_type_id = ANY($1) AND name IN ('Figure', 'Front figure')", [types.map(t => t.id)]);
    await pgClient.query("UPDATE note_types SET builtin_version = 1 WHERE user_id = $1", [userId]);
    await pgClient.query(`UPDATE card_templates SET front_template = '<div class="q">{{Question}}</div>',
      back_template = '{{FrontSide}}<hr id="answer">{{Answer}}{{#Explanation}}<div class="why">{{Explanation}}</div>{{/Explanation}}' WHERE note_type_id = $1`, [openId]);
    await pgClient.query(`UPDATE card_templates SET front_template = '<h3>{{Question}}</h3>', back_template = '{{FrontSide}}<p>{{Correct}}</p>' WHERE note_type_id = $1`, [choiceId]);
    await pgClient.query("UPDATE note_types SET customized = true, css = '.mine { color: red; }' WHERE id = $1", [choiceId]);
    await pgClient.query("UPDATE notes SET fields = fields - 'f4' - 'f5' WHERE id = $1", [note.data.id]);
    const before = await cardOf(api, note.data.id);

    // An edit through the old copy is the first thing that touches it: the fields exist by then.
    const edited = await api.put(`/notes/${note.data.id}`, { fields: { Figure: svg("Added later") } });
    expect(edited.status).toBe(200);
    const after = await cardOf(api, note.data.id);
    expect(after.backHtml).toContain("Added later");
    expect(after.frontHtml).toBe(before.frontHtml.replace(/<style>[\s\S]*?<\/style>/, after.frontHtml.match(/<style>[\s\S]*?<\/style>/)![0]));

    const list = await api.get("/note-types");
    const open = list.data.find((t: { builtinKey: string }) => t.builtinKey === "open");
    expect(open.builtinVersion).toBe(2);
    expect(open.fields.filter((f: { name: string }) => f.name === "Figure")).toHaveLength(1);
    expect(open.templates[0].backTemplate).toContain("lf-figure-back");

    const choice = list.data.find((t: { builtinKey: string }) => t.builtinKey === "choice");
    expect(choice.customized).toBe(true);
    expect(choice.templates[0].frontTemplate).toMatch(/^<h3>\{\{Question\}\}<\/h3>\{\{#Front figure\}\}/);
    expect(choice.templates[0].backTemplate).toMatch(/^\{\{FrontSide\}\}<p>\{\{Correct\}\}<\/p>\{\{#Figure\}\}/);
    expect(choice.css).toMatch(/^\.mine \{ color: red; \}\n\.lf-figure/);

    // Other notes kept their content, and a second pass adds nothing twice.
    const fieldCount = await pgClient.query("SELECT count(*)::int AS n FROM note_type_fields WHERE note_type_id = $1", [openId]);
    await api.get("/note-types");
    expect((await pgClient.query("SELECT count(*)::int AS n FROM note_type_fields WHERE note_type_id = $1", [openId])).rows[0].n).toBe(fieldCount.rows[0].n);
    expect((await api.get(`/notes/${note.data.id}`)).data.fields.f2).toBe("Old answer");
  });
});

describe("A connected app with figures", () => {
  const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

  it("uploads pictures, sends them in figure fields, and rewrites only its own notes' fields", async () => {
    const { api } = await registerUser("app");
    const secret = `lfa_${randomBytes(32).toString("hex")}`;
    const start = await getUnauthApi().post("/apps/pair/start", { token_hash: sha256(secret), app: "Lecture Scribe" });
    expect(start.status).toBe(201);
    expect((await api.post("/apps/claim", { code: start.data.code })).status).toBe(201);
    const app = axios.create({ baseURL: TEST_CONFIG.apiUrl, headers: { Authorization: `Bearer ${secret}` }, validateStatus: () => true });

    const up = await upload(app, TINY_PNG, "image/png", "slide.png");
    expect(up.status).toBe(201);
    expect(up.data.url).toBe(`/images/${up.data.id}`);
    const svgUp = await upload(app, Buffer.from(svg("drawn")), "image/svg+xml", "drawn.svg");
    expect(svgUp.status).toBe(201);
    // Pictures only: no audio from an app.
    expect((await upload(app, Buffer.alloc(64), "audio/mpeg", "talk.mp3")).status).toBe(400);

    const topicId = await newTopic(api, "Scribe");
    const created = await app.post("/notes", {
      topic_id: topicId, note_type: "open", source_ref: `scribe:test:${Date.now()}`,
      fields: { Question: "What does the slide show?", Answer: "A pixel", Figure: `<img src="${up.data.url}" alt="slide">` },
    });
    expect(created.status).toBe(201);
    const card = await cardOf(api, created.data.id);
    expect(card.backHtml).toMatch(new RegExp(`src="/media/${up.data.id}/[A-Za-z0-9_-]{22}"`));
    // The signed media URL serves the file without a login.
    const media = card.backHtml.match(/src="(\/media\/[^"]+)"/)![1];
    expect((await getUnauthApi().get(media)).status).toBe(200);

    const rewrite = await app.put(`/notes/${created.data.id}`, { fields: { Answer: "One pixel", "Front figure": svg("hidden") } });
    expect(rewrite.status).toBe(200);
    expect(rewrite.data.fields.f2).toBe("One pixel");

    const tags = await app.put(`/notes/${created.data.id}`, { fields: { Answer: "x" }, tags: ["x"] });
    expect(tags.status).toBe(403);
    expect(tags.data.code).toBe("APP_TOKEN_SCOPE");

    const own = await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Mine", Answer: "Mine" } });
    const foreign = await app.put(`/notes/${own.data.id}`, { fields: { Answer: "Changed by the app" } });
    expect(foreign.status).toBe(403);
    expect(foreign.data.code).toBe("APP_TOKEN_SCOPE");
    expect((await api.get(`/notes/${own.data.id}`)).data.fields.f2).toBe("Mine");

    // A file can only be attached to a card of the uploader.
    const other = await registerUser("app-other");
    const otherTopic = await newTopic(other.api, "Other");
    const otherNote = await other.api.post("/notes", { topic_id: otherTopic, note_type: "open", fields: { Question: "Q", Answer: "A" } });
    expect((await upload(app, TINY_PNG, "image/png", "x.png", otherNote.data.cards[0].id)).status).toBe(404);
  });
});

describe("Cards with figures in lists", () => {
  it("marks rows with a picture and gives a signed thumbnail for a stored image", async () => {
    const { api } = await registerUser("list");
    const topicId = await newTopic(api, "List");
    const up = await upload(api, TINY_PNG, "image/png", "thumb.png");
    await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Photo", Answer: "A", Figure: `<img src="/images/${up.data.id}">` } });
    await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Drawing", Answer: "A", Figure: svg("d") } });
    await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Question: "Text only", Answer: "A" } });
    const list = await api.get(`/cards?topic_id=${topicId}`);
    expect(list.status).toBe(200);
    const by = (c: string) => list.data.cards.find((x: { concept: string }) => x.concept === c);
    expect(by("Photo")).toMatchObject({ hasPicture: true });
    expect(by("Photo").thumbnail).toMatch(new RegExp(`^url\\(/media/${up.data.id}/[A-Za-z0-9_-]{22}\\)$`));
    expect(by("Drawing")).toMatchObject({ hasPicture: true, thumbnail: null });
    expect(by("Text only")).toMatchObject({ hasPicture: false, thumbnail: null });
  });
});

describe("The tutor with figures", () => {
  async function nextItems(api: AxiosInstance, body: Record<string, unknown>) {
    for (let i = 0; i < 40; i++) {
      const res = await api.post("/tutor/next", body);
      expect(res.status).toBe(200);
      if (res.data.items.length > 0 || res.data.pending === 0) return res.data;
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error("the question writer did not finish in time");
  }

  it("asks from the text, sends both figures with the question, and writes again when a figure changes", async () => {
    const { api } = await registerUser("tutor", "admin");
    const topicId = await newTopic(api, "Tutor figures");
    const note = await api.post("/notes", {
      topic_id: topicId, note_type: "open",
      fields: { Question: "Which chamber pumps blood into the lungs?", Answer: "The right ventricle", Figure: svg("Lungs"), "Front figure": svg("?") },
    });
    expect(note.status).toBe(201);
    const cardId = note.data.cards[0].id;
    const session = await api.post("/tutor/sessions", { difficulty: 0.5 });
    const body = { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] };

    const first = await nextItems(api, body);
    const item = first.items.find((i: { cardId?: string }) => i.cardId === cardId);
    expect(item.type).toBe("question");
    expect(item.figure).toBe(svg("Lungs"));
    expect(item.frontFigure).toBe(svg("?"));
    // The writer was told about the figure (the stub says so in its explanation).
    expect(item.payload.explanation).toContain("See the figure.");

    // Changing the figure throws the written question away, like a text change.
    await api.put(`/notes/${note.data.id}`, { fields: { Figure: svg("Lungs, redrawn") } });
    const unused = await pgClient.query("SELECT count(*)::int AS n FROM card_questions WHERE card_id = $1 AND used_at IS NULL", [cardId]);
    expect(unused.rows[0].n).toBe(0);
    const again = await nextItems(api, body);
    const rewritten = again.items.find((i: { cardId?: string }) => i.cardId === cardId);
    expect(rewritten.type).toBe("question");
    expect(rewritten.figure).toBe(svg("Lungs, redrawn"));
  });

  it("shows a picture-only card as it is, without asking the writer", async () => {
    const { api } = await registerUser("tutor-picture", "admin");
    const topicId = await newTopic(api, "Picture only");
    const note = await api.post("/notes", { topic_id: topicId, note_type: "open", fields: { Answer: "Left atrium", "Front figure": svg("?") } });
    expect(note.status).toBe(201);
    const cardId = note.data.cards[0].id;
    const session = await api.post("/tutor/sessions", { difficulty: 0.5 });
    const res = await nextItems(api, { session_id: session.data.sessionId, topic_id: topicId, answer_by: ["tap"] });
    expect(res.pending).toBe(0);
    const item = res.items.find((i: { card?: { id: string } }) => i.card?.id === cardId);
    expect(item.type).toBe("card");
    const written = await pgClient.query("SELECT count(*)::int AS n FROM card_questions WHERE card_id = $1", [cardId]);
    expect(written.rows[0].n).toBe(0);
  });
});
