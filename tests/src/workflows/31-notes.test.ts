import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { McpTestClient } from "../helpers/mcp-client.js";
import { TOPICS, TEST_CONFIG } from "../helpers/fixtures.js";
import { createFreshCard, deleteFreshCard, submitReview } from "../helpers/fresh-card.js";

/**
 * Release 2: the Anki note model. Note types (fields, templates, CSS) render
 * notes into cards; cloze notes give one card per gap; Freeform cards are untouched.
 */

let api: AxiosInstance;
let mcp: McpTestClient;
const freshCardIds: string[] = [];
const freshNoteIds: string[] = [];
const freshTopicIds: string[] = [];
const freshTypeIds: string[] = [];

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

async function createNote(body: Record<string, unknown>) {
  const res = await api.post("/notes", body);
  expect(res.status, JSON.stringify(res.data)).toBe(201);
  freshNoteIds.push(res.data.id);
  return res.data;
}

beforeAll(async () => {
  await login();
  api = getApi();
  mcp = new McpTestClient();
  await mcp.initialize();
});

afterAll(async () => {
  for (const id of freshNoteIds) await api.delete(`/notes/${id}`).catch(() => {});
  for (const id of freshCardIds) await deleteFreshCard(api, id);
  for (const id of freshTypeIds) await api.delete(`/note-types/${id}`);
  for (const id of freshTopicIds.reverse()) await api.delete(`/topics/${id}`);
  await mcp.close();
});

describe("Note types", () => {
  it("provides the three built-in types with fields and templates", async () => {
    const res = await api.get("/note-types");
    expect(res.status).toBe(200);
    const keys = res.data.map((t: any) => t.builtinKey).sort();
    expect(keys).toEqual(expect.arrayContaining(["choice", "cloze", "open"]));
    const cloze = res.data.find((t: any) => t.builtinKey === "cloze");
    expect(cloze.kind).toBe("cloze");
    expect(cloze.fields.map((f: any) => f.name)).toEqual(["Text", "Extra"]);
    expect(cloze.templates).toHaveLength(1);
    expect(cloze.customized).toBe(false);
  });

  it("restyling a built-in marks it customized; changing its fields is refused", async () => {
    const types = (await api.get("/note-types")).data;
    const open = types.find((t: any) => t.builtinKey === "open");
    const styled = await api.put(`/note-types/${open.id}`, { css: open.css + "\n.q { color: teal; }" });
    expect(styled.status).toBe(200);
    expect(styled.data.customized).toBe(true);
    const refused = await api.put(`/note-types/${open.id}`, { fields: [{ name: "Only" }] });
    expect(refused.status).toBe(400);
    const deleted = await api.delete(`/note-types/${open.id}`);
    expect(deleted.status).toBe(400);
    expect(deleted.data.error).toMatch(/built-in/i);
    // leave the shared test user's design as it was
    await api.put(`/note-types/${open.id}`, { css: open.css });
  });

  it("renders negation, hints, typed answers, cloze conditionals and unknown filters", async () => {
    const created = await api.post("/note-types", {
      name: "Renderer",
      fields: [{ name: "Word" }, { name: "Hint" }, { name: "Note" }],
      templates: [{
        name: "Card 1",
        frontTemplate: "{{text:Word}} {{type:Word}} {{hint:Hint}} {{^Note}}no note{{/Note}}{{#Note}}has note{{/Note}} {{#c1}}never on standard{{/c1}} {{furigana:Word}}",
        backTemplate: "{{FrontSide}}<hr>{{type:Word}} {{Note}} {{Tags}} {{Deck}}",
      }],
    });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    freshTypeIds.push(created.data.id);
    const topic = await createTopic("notes-renderer");
    const note = await createNote({ topic_id: topic, note_type: created.data.id, fields: { Word: "SECRET", Hint: "a clue" }, tags: ["t1"] });
    const card = (await api.get(`/cards/${note.cards[0].id}`)).data;
    const front = card.frontHtml.split("<div class=\"card card1\">")[1];
    expect(front).toContain('<input class="typeans"');
    expect(front.split("SECRET").length - 1).toBe(2); // text: and furigana: fall back to the field; type: never shows it
    expect(front).toContain("<details class=\"hint\"><summary>Hint</summary>a clue</details>");
    expect(front).toContain("no note");
    expect(front).not.toContain("has note");
    expect(front).not.toContain("never on standard");
    expect(card.backHtml).toContain("t1");
    expect(card.backHtml).toContain("notes-renderer");
    await api.delete(`/notes/${note.id}`);
    freshNoteIds.splice(freshNoteIds.indexOf(note.id), 1);
  });

  it("editing a type's CSS or templates re-renders its existing cards", async () => {
    const created = await api.post("/note-types", {
      name: "Restyle", fields: [{ name: "Front" }, { name: "Back" }],
      templates: [{ frontTemplate: "<p>{{Front}}</p>", backTemplate: "{{Back}}" }],
    });
    freshTypeIds.push(created.data.id);
    const topic = await createTopic("notes-restyle");
    const note = await createNote({ topic_id: topic, note_type: created.data.id, fields: { Front: "before", Back: "b" } });
    const cardId = note.cards[0].id;
    expect((await api.get(`/cards/${cardId}`)).data.frontHtml).toContain("<p>before</p>");

    const res = await api.put(`/note-types/${created.data.id}`, {
      css: ".card { color: teal; }",
      templates: [{ id: created.data.templates[0].id, frontTemplate: "<h2>{{Front}}</h2>", backTemplate: "{{Back}}" }],
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const after = (await api.get(`/cards/${cardId}`)).data;
    expect(after.frontHtml).toContain("<h2>before</h2>");
    expect(after.frontHtml).toContain("color: teal");
    expect(after.id).toBe(cardId); // same card, same schedule
  });

  it("refuses a field that nests cloze gaps too deep or is too long", async () => {
    const topic = await createTopic("notes-budget");
    let deep = "x";
    for (let i = 6; i >= 1; i--) deep = `{{c${i}::${deep}}}`;
    const tooDeep = await api.post("/notes", { topic_id: topic, note_type: "cloze", fields: { Text: deep } });
    expect(tooDeep.status).toBe(400);
    expect(tooDeep.data.error).toMatch(/deep/i);
    const tooLong = await api.post("/notes", { topic_id: topic, note_type: "cloze", fields: { Text: "{{c1::a}} " + "y".repeat(25_000) } });
    expect(tooLong.status).toBe(400);
  });

  it("renaming a field by position keeps the note content", async () => {
    const created = await api.post("/note-types", {
      name: "Rename", fields: [{ name: "Term" }, { name: "Meaning" }],
      templates: [{ frontTemplate: "{{Term}}", backTemplate: "{{Meaning}}" }],
    });
    freshTypeIds.push(created.data.id);
    const topic = await createTopic("notes-rename");
    const note = await createNote({ topic_id: topic, note_type: created.data.id, fields: { Term: "casa", Meaning: "house" } });
    const renamed = await api.put(`/note-types/${created.data.id}`, {
      fields: [{ name: "Word" }, { name: "Translation" }],
      templates: [{ frontTemplate: "{{Word}}", backTemplate: "{{Translation}}" }],
    });
    expect(renamed.status).toBe(200);
    expect(renamed.data.fields.map((f: any) => f.key)).toEqual(["f1", "f2"]);
    const after = await api.get(`/notes/${note.id}`);
    expect(after.data.fields).toEqual({ f1: "casa", f2: "house" });
  });

  it("creates an own type with two templates, renders two cards per note, and refuses deletion while used", async () => {
    const created = await api.post("/note-types", {
      name: "Vocab",
      fields: [{ name: "Spanish" }, { name: "English" }],
      templates: [
        { name: "Forward", frontTemplate: "{{Spanish}}", backTemplate: "{{FrontSide}}<hr>{{English}}" },
        { name: "Reverse", frontTemplate: "{{English}}", backTemplate: "{{FrontSide}}<hr>{{Spanish}}" },
      ],
    });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    freshTypeIds.push(created.data.id);
    expect(created.data.fields.map((f: any) => f.key)).toEqual(["f1", "f2"]);

    const topic = await createTopic("notes-vocab");
    const note = await createNote({ topic_id: topic, note_type: created.data.id, fields: { Spanish: "hablar", English: "to speak" } });
    expect(note.cards).toHaveLength(2);
    expect(note.cards.map((c: any) => c.templateName)).toEqual(["Forward", "Reverse"]);
    expect(note.cards[0].concept).toBe("hablar");

    const back = await api.get(`/cards/${note.cards[1].id}`);
    expect(back.data.frontHtml).toContain("to speak");
    expect(back.data.backHtml).toContain("hablar");
    expect(back.data.note.noteTypeName).toBe("Vocab");
    expect(back.data.note.siblings).toHaveLength(2);

    const refused = await api.delete(`/note-types/${created.data.id}`);
    expect(refused.status).toBe(400);
  });
});

describe("Notes", () => {
  it("cloze: one card per gap number, repeated numbers hide together, nested gaps render", async () => {
    const topic = await createTopic("notes-cloze");
    const note = await createNote({
      topic_id: topic, note_type: "cloze",
      fields: { Text: "{{c1::Paris}} is the capital of {{c2::France::country}}; {{c1::Paris}} lies on the {{c3::Seine {{c2::(a river in France)}}}}." },
    });
    expect(note.cards.map((c: any) => c.clozeNumber)).toEqual([1, 2, 3]);
    expect(note.cards[0].concept).toBe("Paris is the capital of France; Paris lies on the Seine (a river in France).");
    const c1 = await api.get(`/cards/${note.cards[0].id}`);
    expect(c1.data.frontHtml).not.toContain("Paris");
    expect((c1.data.frontHtml.match(/\[\.\.\.\]/g) ?? []).length).toBe(2);
    expect(c1.data.frontHtml).toContain("France");
    expect(c1.data.backHtml).toContain("Paris");
    const c2 = await api.get(`/cards/${note.cards[1].id}`);
    expect(c2.data.frontHtml).toContain("[country]");
    expect(c2.data.frontHtml).toContain("Paris");
    expect(c2.data.original.questionText).toContain("[country]");
    expect(c2.data.original.createdBy).toBe("derived");
    // the nested gap: c3 hides "Seine (a river in France)", c2 inside it is shown
    const c3 = await api.get(`/cards/${note.cards[2].id}`);
    expect(c3.data.frontHtml).toContain("[...]");
    expect(c3.data.frontHtml).not.toContain("Seine");
    expect(c3.data.backHtml).toContain("Seine");
    expect(c3.data.backHtml).toContain("(a river in France)");
  });

  it("choice: only filled options render; the original is derived from the front", async () => {
    const topic = await createTopic("notes-choice");
    const note = await createNote({
      topic_id: topic, note_type: "choice",
      fields: { Question: "2 + 2?", "Option A": "3", "Option B": "4", Correct: "B", Explanation: "Arithmetic." },
    });
    expect(note.cards).toHaveLength(1);
    const card = await api.get(`/cards/${note.cards[0].id}`);
    expect(card.data.frontHtml).toContain("A · 3");
    expect(card.data.frontHtml).toContain("B · 4");
    expect(card.data.frontHtml).not.toContain("<div class=\"opt\">C");
    expect(card.data.backHtml).toContain("Correct: <b>B</b>");
    expect(card.data.original.questionText).toContain("2 + 2?");
  });

  it("refuses unknown fields, a cloze note without gaps, and a note whose front renders empty", async () => {
    const topic = await createTopic("notes-invalid");
    expect((await api.post("/notes", { topic_id: topic, note_type: "open", fields: { Nope: "x" } })).status).toBe(400);
    expect((await api.post("/notes", { topic_id: topic, note_type: "cloze", fields: { Text: "no gaps here" } })).status).toBe(400);
    expect((await api.post("/notes", { topic_id: topic, note_type: "open", fields: { Answer: "only the back" } })).status).toBe(400);
  });

  it("update re-renders, adds cards for new gaps and suspends vanished ones; suspended cards are not served", async () => {
    const topic = await createTopic("notes-update");
    const note = await createNote({ topic_id: topic, note_type: "cloze", fields: { Text: "{{c1::one}} and {{c2::two}}" } });
    const [c1, c2] = note.cards.map((c: any) => c.id);

    const updated = await api.put(`/notes/${note.id}`, { fields: { Text: "{{c1::uno}} and {{c3::three}}" } });
    expect(updated.status, JSON.stringify(updated.data)).toBe(200);
    const byNumber = new Map(updated.data.cards.map((c: any) => [c.clozeNumber, c]));
    expect((byNumber.get(1) as any).id).toBe(c1);
    expect((byNumber.get(2) as any).suspended).toBe(true);
    expect((byNumber.get(3) as any).suspended).toBe(false);
    expect((await api.get(`/cards/${c1}`)).data.backHtml).toContain("uno");

    const due = await api.get(`/study/due?topic_id=${topic}&limit=100`);
    const served = due.data.map((c: any) => c.id);
    expect(served).not.toContain(c2);
    const summary = await api.get(`/study/summary?topic_id=${topic}`);
    expect(summary.data.newCount).toBe(2);
    const listed = await api.get(`/cards?topic_id=${topic}&status=due&limit=50`);
    expect((listed.data.cards ?? []).map((c: any) => c.id)).not.toContain(c2);

    // The gap comes back: its card is un-suspended with its id kept
    const back = await api.put(`/notes/${note.id}`, { fields: { Text: "{{c1::uno}} {{c2::dos}} {{c3::three}}" } });
    const revived = back.data.cards.find((c: any) => c.clozeNumber === 2);
    expect(revived.id).toBe(c2);
    expect(revived.suspended).toBe(false);
  });

  it("serves one card per note per batch and buries siblings for 12 hours after a review", async () => {
    const topic = await createTopic("notes-siblings");
    const note = await createNote({ topic_id: topic, note_type: "cloze", fields: { Text: "{{c1::a}} {{c2::b}} {{c3::c}}" } });
    const due = await api.get(`/study/due?topic_id=${topic}&limit=100`);
    expect(due.data.filter((c: any) => c.noteId === note.id)).toHaveLength(1);
    expect(due.data[0].noteTypeKind).toBe("cloze");

    await submitReview(api, due.data[0].id, 0, 1); // Again: due again in minutes, but siblings are buried
    const after = await api.get(`/study/due?topic_id=${topic}&limit=100`);
    expect(after.data.filter((c: any) => c.noteId === note.id)).toHaveLength(0);
  });

  it("typed cards refuse content edits and move with their note; deleting one deletes the note", async () => {
    const topic = await createTopic("notes-typed-card");
    const other = await createTopic("notes-typed-card-2");
    const note = await createNote({ topic_id: topic, note_type: "cloze", fields: { Text: "{{c1::x}} {{c2::y}}" } });
    const [c1, c2] = note.cards.map((c: any) => c.id);
    expect((await api.put(`/cards/${c1}`, { front_html: "<p>nope</p>" })).status).toBe(400);
    expect((await api.put(`/cards/${c1}`, { topic_id: other })).status).toBe(200);
    expect((await api.get(`/cards/${c2}`)).data.topicId).toBe(other);
    expect((await api.get(`/notes/${note.id}`)).data.topicId).toBe(other);

    expect((await api.delete(`/cards/${c2}`)).status).toBe(204);
    expect((await api.get(`/cards/${c1}`)).status).toBe(404);
    expect((await api.get(`/notes/${note.id}`)).status).toBe(404);
    freshNoteIds.splice(freshNoteIds.indexOf(note.id), 1);
  });

  it("deleting a note removes its cards; another user cannot see it", async () => {
    const topic = await createTopic("notes-delete");
    const note = await createNote({ topic_id: topic, note_type: "open", fields: { Question: "Q?", Answer: "A" } });
    const otherApi = await loginOther();
    expect((await otherApi.get(`/notes/${note.id}`)).status).toBe(404);
    expect((await api.delete(`/notes/${note.id}`)).status).toBe(204);
    freshNoteIds.splice(freshNoteIds.indexOf(note.id), 1);
    expect((await api.get(`/cards/${note.cards[0].id}`)).status).toBe(404);
  });

  it("Freeform cards work without a concept and are untouched by the note model", async () => {
    const res = await api.post("/cards", { topic_id: TOPICS.EMPTY_TOPIC, front_html: "<h2>Ohm's law</h2><p>V = ?</p>", back_html: "<p>V = I · R</p>" });
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    freshCardIds.push(res.data.id);
    expect(res.data.concept).toBe("Ohm's law V = ?");
    expect(res.data.noteId).toBeNull();
    expect((await api.put(`/cards/${res.data.id}`, { front_html: "<p>edited</p>" })).status).toBe(200);
  });

  it("the legacy cloze path creates a Cloze note with one card per gap", async () => {
    const legacy = await api.post("/cards", {
      topic_id: TOPICS.EMPTY_TOPIC, concept: "legacy cloze", card_type: "cloze",
      cloze_data: { sourceText: "{{c1::a}} < {{c2::b}}", deletions: [{ index: 1, answer: "a", hint: null }, { index: 2, answer: "b", hint: null }] },
    });
    expect(legacy.status, JSON.stringify(legacy.data)).toBe(201);
    expect(legacy.data.siblingIds).toHaveLength(2);
    freshNoteIds.push(legacy.data.noteId);
    expect(legacy.data.frontHtml).toContain("&lt;");
    expect(legacy.data.clozeNumber).toBe(1);
  });
});

describe("MCP note tools", () => {
  it("create_note, update_note and list_note_types work through the tutor", async () => {
    const topic = await createTopic("notes-mcp");
    const types = mcp.parseToolResult<any[]>(await mcp.callTool("list_note_types", {}));
    expect(types.map(t => t.builtinKey)).toEqual(expect.arrayContaining(["open", "choice", "cloze"]));
    const note = mcp.parseToolResult<any>(await mcp.callTool("create_note", {
      topic_id: topic, note_type: "open", fields: { Question: "Why is the sky blue?", Answer: "Rayleigh scattering" },
    }));
    freshNoteIds.push(note.id);
    expect(note.cards).toHaveLength(1);
    const served = mcp.parseToolResult<any[]>(await mcp.callTool("get_study_cards", { topic_id: topic, limit: 10 }));
    expect(served[0].noteTypeKind).toBe("standard");
    expect(served[0].original.questionText).toContain("Why is the sky blue?");
    const updated = mcp.parseToolResult<any>(await mcp.callTool("update_note", { note_id: note.id, fields: { Answer: "Rayleigh scattering of sunlight" } }));
    expect(updated.fields.f2).toContain("sunlight");
    expect(updated.fields.f1).toContain("Why is the sky blue?"); // partial update keeps the other fields
    const rerendered = mcp.parseToolResult<any>(await mcp.callTool("get_card", { card_id: note.cards[0].id }));
    expect(rerendered.backHtml).toContain("sunlight");
  });
});

describe("Sharing and export", () => {
  it("copies notes with their cards and reuses the recipient's untouched built-in type", async () => {
    const topic = await createTopic("notes-share");
    const note = await createNote({ topic_id: topic, note_type: "cloze", fields: { Text: "{{c1::share}} {{c2::me}}" } });
    const link = await api.post("/shares", { topic_id: topic });
    expect(link.status).toBe(201);
    const otherApi = await loginOther();
    const accepted = await otherApi.post(`/shares/accept/${link.data.token}`, {});
    expect(accepted.status, JSON.stringify(accepted.data)).toBe(200);
    const copiedTopic = accepted.data.topic_id;
    const copiedNotes = await otherApi.get(`/notes?topic_id=${copiedTopic}`);
    expect(copiedNotes.data).toHaveLength(1);
    expect(copiedNotes.data[0].cardCount).toBe(2);
    expect(copiedNotes.data[0].id).not.toBe(note.id);
    const copiedNote = await otherApi.get(`/notes/${copiedNotes.data[0].id}`);
    const otherTypes = await otherApi.get("/note-types");
    const clozeType = otherTypes.data.find((t: any) => t.builtinKey === "cloze");
    expect(copiedNote.data.noteTypeId).toBe(clozeType.id);
    await otherApi.delete(`/notes/${copiedNote.data.id}`);
    await otherApi.delete(`/topics/${copiedTopic}`);
  });

});
