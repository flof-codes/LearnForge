import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";
import { markEmailVerified } from "../helpers/email-verification.js";
// Pure functions, tested straight from the source.
import { parseOcclusionShape, occlusionToCloze, renderOcclusionSpan, validateOcclusionField } from "../../../core/src/lib/image-occlusion.js";
import { occlusionsIn, clozeNumbersIn, findClozeSpans, plainClozeText } from "../../../core/src/lib/note-renderer.js";

/**
 * Image occlusion in Anki's own format (docs/image-occlusion-contract.md):
 * the syntax parser, notes pushed by a connected app, validation, and the
 * tutor serving the card itself. Import and migration live in 33 and 39.
 */

const DB_CONFIG = { host: "localhost", port: TEST_CONFIG.dbPort, user: TEST_CONFIG.dbUser, password: TEST_CONFIG.dbPassword, database: TEST_CONFIG.dbName };
const createdEmails: string[] = [];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNl7BcQAAAABJRU5ErkJggg==", "base64");

const OCCLUSION = [
  "{{c1::image-occlusion:rect:left=.3762:top=.52:width=.114:height=.052:oi=1}}",
  "{{c2::image-occlusion:rect:left=.61:top=.2:width=.15:height=.06:oi=1}}",
  "{{c2::image-occlusion:ellipse:left=.1:top=.7:rx=.05:ry=.04:oi=1}}",
  "{{c0::image-occlusion:text:left=.05:top=.9:text=Plexus\\: brachial:fs=.04}}",
].join("<br>");

async function registerUser(tag: string, role: "admin" | "user" = "user"): Promise<AxiosInstance> {
  const email = `io-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@learnforge.dev`;
  const res = await getUnauthApi().post("/auth/register", { email, password: "occlusion-test-pw", name: `IO ${tag}` });
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

async function uploadImage(api: AxiosInstance): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(PNG)], { type: "image/png" }), "slide.png");
  const res = await api.post("/images", form);
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  return res.data.id;
}

/** Pairs a Lecture Scribe style app token for the user behind `api`. */
async function pairApp(api: AxiosInstance): Promise<AxiosInstance> {
  const secret = `lfa_${randomBytes(32).toString("hex")}`;
  const unauth = getUnauthApi();
  const start = await unauth.post("/apps/pair/start", { token_hash: createHash("sha256").update(secret).digest("hex"), app: "Lecture Scribe" });
  expect(start.status).toBe(201);
  expect((await api.post("/apps/claim", { code: start.data.code })).status).toBe(201);
  return axios.create({ baseURL: TEST_CONFIG.apiUrl, headers: { Authorization: `Bearer ${secret}` }, validateStatus: () => true });
}

afterAll(async () => {
  if (createdEmails.length === 0) return;
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  await client.query("DELETE FROM users WHERE email = ANY($1)", [createdEmails]);
  await client.end();
});

describe("Image occlusion syntax", () => {
  it("parses Anki's shapes and properties, with escaped values", () => {
    expect(parseOcclusionShape("rect:left=.3762:top=.52:width=.114:height=.052:oi=1")).toEqual({
      shape: "rect", props: { left: ".3762", top: ".52", width: ".114", height: ".052", oi: "1" },
    });
    expect(parseOcclusionShape("polygon:left=.1:top=.2:points=.1,.2 .3,.25 .2,.4")?.props.points).toBe(".1,.2 .3,.25 .2,.4");
    // Anki's own test: text=\:l\\ol\: is ":l\ol:"
    expect(parseOcclusionShape(String.raw`text:left=10:top=20:text=\:l\\ol\::width=30:height=40`)?.props).toEqual({
      left: "10", top: "20", text: ":l\\ol:", width: "30", height: "40",
    });
    expect(parseOcclusionShape("rect")).toBeNull();
  });

  it("writes a shape back so it parses to the same thing", () => {
    const shape = { shape: "text", props: { left: ".05", top: ".9", text: "a:b\\c" } };
    const cloze = occlusionToCloze(0, shape);
    expect(cloze).toBe(String.raw`{{c0::image-occlusion:text:left=.05:top=.9:text=a\:b\\c}}`);
    expect(occlusionsIn(cloze)).toEqual([{ ordinals: [0], shape }]);
  });

  it("finds every shape with its card numbers; labels and gap text are not words or cards", () => {
    const found = occlusionsIn(OCCLUSION);
    expect(found.map(f => [f.ordinals, f.shape.shape])).toEqual([[[1], "rect"], [[2], "rect"], [[2], "ellipse"], [[0], "text"]]);
    expect(clozeNumbersIn(OCCLUSION)).toEqual([1, 2]);
    expect(findClozeSpans(OCCLUSION)[3].hint).toBeNull();
    expect(plainClozeText(OCCLUSION).replace(/<br>/g, "")).toBe("");
    expect(clozeNumbersIn("{{c1,3::image-occlusion:rect:left=.1:top=.1:width=.1:height=.1}}")).toEqual([1, 3]);
  });

  it("renders Anki's classes and data attributes plus percentages that scale with the image", () => {
    const rect = "rect:left=.25:top=.5:width=.1:height=.2:oi=1";
    const front = renderOcclusionSpan(rect, [1], true, false);
    expect(front).toContain('class="cloze"');
    expect(front).toContain('data-ordinal="1" data-shape="rect" data-left=".25"');
    expect(front).toContain('data-occludeinactive="1"');
    expect(front).toContain("left:25%;top:50%;width:10%;height:20%");
    expect(renderOcclusionSpan(rect, [1], true, true)).toContain('class="cloze-highlight"');
    expect(renderOcclusionSpan(rect, [1], false, false)).toContain('class="cloze-inactive"');
    expect(renderOcclusionSpan("ellipse:left=.1:top=.2:rx=.05:ry=.1", [2], true, false)).toContain("width:10%;height:20%");
    expect(renderOcclusionSpan("rect:left=.1:top=.1:width=.1:height=.1:angle=2500", [1], true, false)).toContain("transform:rotate(90deg)");
    // A polygon is moved so its bounding box starts at left/top.
    expect(renderOcclusionSpan("polygon:left=.2:top=.2:points=.1,.1 .3,.1 .2,.3", [1], true, false)).toContain('points="0.2,0.2 0.4,0.2 0.3,0.4"');
    expect(renderOcclusionSpan(String.raw`text:left=.1:top=.1:text=<b>&"`, [0], false, false)).toContain("&lt;b&gt;&amp;&quot;");
    expect(renderOcclusionSpan("rect:left=.1:top=.1:width=.1:height=.1:fill=red;}body{x", [1], false, false)).not.toContain("--io-fill");
    expect(renderOcclusionSpan("star:left=.1", [1], true, false)).toBe("");
  });

  it("validates what a client writes", () => {
    expect(() => validateOcclusionField(occlusionsIn(OCCLUSION))).not.toThrow();
    const bad = (s: string) => () => validateOcclusionField(occlusionsIn(s));
    expect(bad("{{c1::image-occlusion:rect:left=120:top=40:width=30:height=10}}")).toThrow(/fraction/);
    expect(bad("{{c1::image-occlusion:rect:left=.1:top=.1:width=.1}}")).toThrow(/height is required/);
    expect(bad("{{c1::image-occlusion:star:left=.1:top=.1}}")).toThrow(/unknown shape/);
    expect(bad("{{c1::image-occlusion:polygon:points=.1,.1 .2,.2}}")).toThrow(/three points/);
    expect(bad("{{c0::image-occlusion:text:left=.1:top=.1:text=x}}")).toThrow(/at least one shape/);
    expect(bad("no shapes at all")).toThrow(/at least one shape/);
  });
});

describe("Image occlusion notes over the API", () => {
  let api: AxiosInstance;
  let app: AxiosInstance;
  let topicId: string;
  let imageId: string;

  beforeAll(async () => {
    api = await registerUser("notes");
    app = await pairApp(api);
    const topic = await app.post("/topics", { name: "Anatomy slides" });
    expect(topic.status).toBe(201);
    topicId = topic.data.id;
    imageId = await uploadImage(api);
  });

  it("the built-in type is listed with Anki's fields", async () => {
    const types = await api.get("/note-types");
    const io = types.data.find((t: { builtinKey: string }) => t.builtinKey === "occlusion");
    expect(io).toMatchObject({ name: "Image Occlusion", kind: "cloze" });
    expect(io.fields.map((f: { name: string }) => f.name)).toEqual(["Occlusion", "Image", "Header", "Back Extra", "Comments"]);
  });

  it("a connected app creates one card per occlusion number; the same source_ref returns the same note", async () => {
    const body = {
      topic_id: topicId,
      note_type: "occlusion",
      fields: { Occlusion: OCCLUSION, Image: `<img src="/images/${imageId}">`, Header: "Brachial plexus", "Back Extra": "Lecture 3" },
      tags: ["anatomy"],
      source_ref: "scribe:lecture-3:slide-14:io",
    };
    const res = await app.post("/notes", body);
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    expect(res.data.noteTypeName).toBe("Image Occlusion");
    expect(res.data.cards.map((c: { clozeNumber: number }) => c.clozeNumber)).toEqual([1, 2]);
    expect(res.data.cards[0].concept).toBe("Brachial plexus");
    expect(res.data.cards.every((c: { suspended: boolean }) => !c.suspended)).toBe(true);

    const again = await app.post("/notes", { ...body, fields: { ...body.fields, Header: "changed" } });
    expect(again.status).toBe(201);
    expect(again.data.id).toBe(res.data.id);

    const card2 = await api.get(`/cards/${res.data.cards[1].id}`);
    expect(card2.status).toBe(200);
    const front: string = card2.data.frontHtml;
    expect(front).toContain('<div class="io-header">Brachial plexus</div>');
    // Card 2 asks both of its shapes and keeps card 1's shape covered (oi=1).
    expect(front.match(/class="cloze" data-ordinal="2"/g)).toHaveLength(2);
    expect(front).toContain('class="cloze-inactive" data-ordinal="1"');
    expect(front).toContain('class="cloze" data-ordinal="0" data-shape="text"');
    // The picture comes back as a signed media link.
    expect(front).toMatch(new RegExp(`/media/${imageId}/`));
    const back: string = card2.data.backHtml;
    expect(back.match(/class="cloze-highlight" data-ordinal="2"/g)).toHaveLength(2);
    expect(back).toContain("Lecture 3");
    expect(back).toContain("io-toggle");
  });

  it("an edit that adds a number adds a card; removing one suspends it", async () => {
    const created = await api.post("/notes", {
      topic_id: topicId, note_type: "occlusion",
      fields: { Occlusion: "{{c1::image-occlusion:rect:left=.1:top=.1:width=.2:height=.1}}", Image: `<img src="/images/${imageId}">` },
    });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    expect(created.data.cards).toHaveLength(1);
    const grown = await api.put(`/notes/${created.data.id}`, { fields: { Occlusion: "{{c2::image-occlusion:rect:left=.5:top=.5:width=.2:height=.1}}" } });
    expect(grown.status, JSON.stringify(grown.data)).toBe(200);
    expect(grown.data.cards.map((c: { clozeNumber: number; suspended: boolean }) => [c.clozeNumber, c.suspended])).toEqual([[1, true], [2, false]]);
    // Hide one, guess one: without oi the other shapes are not drawn on the front.
    const card = await api.get(`/cards/${grown.data.cards[1].id}`);
    expect(card.data.frontHtml).not.toContain('class="cloze-inactive"');
  });

  it("refuses an occlusion note without a picture or with bad shapes", async () => {
    const post = (fields: Record<string, string>) => app.post("/notes", { topic_id: topicId, note_type: "occlusion", fields });
    const image = `<img src="/images/${imageId}">`;
    const noImage = await post({ Occlusion: OCCLUSION, Image: "" });
    expect(noImage.status).toBe(400);
    expect(noImage.data.error ?? noImage.data.message).toMatch(/Image/);
    expect((await post({ Occlusion: "{{c1::image-occlusion:rect:left=120:top=40:width=30:height=10}}", Image: image })).status).toBe(400);
    expect((await post({ Occlusion: "", Image: image })).status).toBe(400);
    expect((await post({ Occlusion: OCCLUSION, Image: image, Bogus: "x" })).status).toBe(400);
  });
});

describe("Image occlusion in the tutor", () => {
  it("is served as the card itself and never sent to the question writer", async () => {
    const api = await registerUser("tutor", "admin");
    expect((await api.get("/tutor/status")).data.available).toBe(true);
    const topic = await api.post("/topics", { name: `IO tutor ${Date.now()}` });
    const imageId = await uploadImage(api);
    const note = await api.post("/notes", {
      topic_id: topic.data.id, note_type: "occlusion",
      fields: { Occlusion: "{{c1::image-occlusion:rect:left=.1:top=.1:width=.2:height=.1}}", Image: `<img src="/images/${imageId}">` },
    });
    expect(note.status, JSON.stringify(note.data)).toBe(201);

    const prepared = await api.post("/tutor/prepare", { difficulty: 0.7, answer_by: ["tap", "type"] });
    expect(prepared.status).toBe(200);
    expect(prepared.data.ready).toBe(1);

    const session = await api.post("/tutor/sessions", { difficulty: 0.7 });
    const next = await api.post("/tutor/next", { session_id: session.data.sessionId, topic_id: topic.data.id, answer_by: ["tap", "type"] });
    expect(next.status).toBe(200);
    expect(next.data.pending).toBe(0);
    expect(next.data.items).toHaveLength(1);
    expect(next.data.items[0].type).toBe("card");
    expect(next.data.items[0].card.noteTypeKey).toBe("occlusion");

    const client = new pg.Client(DB_CONFIG);
    await client.connect();
    const written = await client.query("SELECT count(*)::int AS n FROM card_questions WHERE card_id = $1", [note.data.cards[0].id]);
    await client.end();
    expect(written.rows[0].n).toBe(0);
  });
});
