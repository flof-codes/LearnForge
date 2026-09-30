import { describe, it, expect, beforeAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { deflateRawSync } from "node:zlib";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { TEST_CONFIG } from "../helpers/fixtures.js";
import { markEmailVerified } from "../helpers/email-verification.js";
import { buildLegacyApkg, BASIC_MODEL, CLOZE_MODEL, CRT } from "../helpers/apkg-builder.js";

/**
 * Release 3a: Anki import. The main packages are exported by real Anki
 * (tests/fixtures/anki/make_fixtures.py, facts in fixture.json); synthetic
 * packages cover the 2.0 format and hostile input. Every scenario imports as
 * its own throwaway user, so guid de-duplication never crosses scenarios.
 */

const testsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fixtureDir = join(testsDir, "fixtures", "anki");
const fixture = JSON.parse(readFileSync(join(fixtureDir, "fixture.json"), "utf8"));
const pkg = (name: string) => readFileSync(join(fixtureDir, name));
const apiUrl = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
const DAY_MS = 86_400_000;

async function newUser(tag: string): Promise<AxiosInstance> {
  const email = `anki-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
  const reg = await axios.post(`${apiUrl}/auth/register`, { email, password: "anki-import-pw-1", name: `Anki ${tag}` }, { validateStatus: () => true });
  expect(reg.status, JSON.stringify(reg.data)).toBe(201);
  await markEmailVerified(email);
  return axios.create({ baseURL: apiUrl, headers: { Authorization: `Bearer ${reg.data.token}` }, validateStatus: () => true });
}

async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ host: "localhost", port: TEST_CONFIG.dbPort, user: TEST_CONFIG.dbUser, password: TEST_CONFIG.dbPassword, database: TEST_CONFIG.dbName });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

async function upload(api: AxiosInstance, data: Buffer, filename: string) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)]), filename);
  return api.post("/import/anki", form);
}

async function waitFor(api: AxiosInstance, id: string, statuses: string[]) {
  for (let i = 0; i < 240; i++) {
    const res = await api.get(`/import/anki/${id}`);
    if (statuses.includes(res.data.status)) return res.data;
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`import ${id} did not reach ${statuses.join("/")}`);
}

async function stage(api: AxiosInstance, data: Buffer, filename = "deck.apkg") {
  const res = await upload(api, data, filename);
  expect(res.status, JSON.stringify(res.data)).toBe(202);
  return waitFor(api, res.data.id, ["staged", "failed"]);
}

async function importAll(api: AxiosInstance, data: Buffer, filename = "deck.apkg", schedule: "keep" | "fresh" = "keep") {
  const staged = await stage(api, data, filename);
  expect(staged.status, staged.error).toBe("staged");
  const commit = await api.post(`/import/anki/${staged.id}/commit`, { schedule });
  expect(commit.status, JSON.stringify(commit.data)).toBe(202);
  const done = await waitFor(api, staged.id, ["done", "failed"]);
  expect(done.status, done.error).toBe("done");
  return done;
}

/** The caller's note with this guid; each scenario's user owns at most one. */
async function noteByGuid(api: AxiosInstance, guid: string) {
  const rows = await query<{ id: string }>("SELECT id FROM notes WHERE anki_guid = $1", [guid]);
  const mine = [];
  for (const r of rows) {
    const res = await api.get(`/notes/${r.id}`);
    if (res.status === 200) mine.push(res.data);
  }
  expect(mine, `notes with guid ${guid}`).toHaveLength(1);
  return mine[0];
}

async function cardsOf(api: AxiosInstance, guid: string) {
  const note = await noteByGuid(api, guid);
  const cards = [];
  for (const c of note.cards) cards.push((await api.get(`/cards/${c.id}`)).data);
  return { note, cards };
}

describe("Anki import: current package format from real Anki", () => {
  let api: AxiosInstance;
  let done: { id: string; stats: Record<string, any>; preview: Record<string, any> };

  beforeAll(async () => {
    api = await newUser("latest");
    done = await importAll(api, pkg("basic-latest.apkg"), "basic-latest.apkg");
  }, 120_000);

  it("previews decks, note types and counts before anything is written", async () => {
    const p = done.preview;
    expect(p.version).toBe("latest");
    expect(p.schema).toBe(18);
    expect(p.counts.notes).toBe(7);
    expect(p.counts.cards).toBe(12);
    expect(p.counts.suspended).toBe(1);
    expect(p.decks.map((d: { path: string }) => d.path)).toEqual(["Geography", "Spanish::Grammar", "Spanish::Vocab"]);
    expect(p.noteTypes.map((t: { name: string }) => t.name)).toContain("LF Custom");
    expect(p.noteTypes.every((t: { supported: boolean }) => t.supported)).toBe(true);
    expect(p.duplicates).toEqual({ total: 0, newer: 0 });
  });

  it("imports every note and card, keeping Anki's FSRS state where it has one", () => {
    const s = done.stats;
    expect(s.notes).toMatchObject({ created: 7, failed: 0 });
    expect(s.cards).toMatchObject({ created: 12, suspended: 1, notRendered: 0 });
    expect(s.schedule["anki-fsrs"]).toBeGreaterThanOrEqual(4);
    expect(s.media.stored).toBe(3);
    expect(s.reviewLogEntries).toBe(8);
  });

  it("turns decks into a topic tree and leaves Anki's empty Default deck out", async () => {
    const topics = (await api.get("/topics")).data as Array<{ id: string; name: string }>;
    const names = topics.map(t => t.name).sort();
    expect(names).toEqual(["Geography", "Spanish"]);
    const spanish = (await api.get(`/topics/${topics.find(t => t.name === "Spanish")!.id}`)).data as { children: Array<{ name: string }> };
    expect(spanish.children.map(c => c.name).sort()).toEqual(["Grammar", "Vocab"]);
  });

  it("keeps the note type: fields by name, both templates, CSS, and template media rewritten", async () => {
    const { note, cards } = await cardsOf(api, fixture.notes.custom.guid);
    expect(note.noteTypeName).toBe("LF Custom");
    expect(Object.values(note.fields)).toEqual(["casa", "house", "mi casa"]);
    expect(cards.map(c => c.note.siblings.length)).toEqual([2, 2]);
    const types = (await api.get("/note-types")).data as Array<{ name: string; css: string; templates: Array<{ frontTemplate: string }> }>;
    const custom = types.find(t => t.name === "LF Custom")!;
    expect(custom.css).toContain("font-family: serif");
    expect(custom.templates[0].frontTemplate).toMatch(/\/media\/[0-9a-f-]{36}\/[\w-]{22}/);
    expect(custom.templates[0].frontTemplate).not.toContain("_logo.png");
  });

  it("rewrites media to signed URLs that load without a login, and turns [sound:] into audio", async () => {
    const { cards } = await cardsOf(api, fixture.notes.reversed.guid);
    const front = cards.find(c => c.note.siblings.length === 2 && c.frontHtml.includes("hola"))!;
    const img = /<img src="([^"]+)"/.exec(front.frontHtml)![1];
    // relative: the web app's card frame resolves it against the API address
    expect(img).toMatch(/^\/media\/[0-9a-f-]{36}\/[\w-]{22}$/);
    const res = await axios.get(apiUrl + img, { responseType: "arraybuffer", validateStatus: () => true });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(front.backHtml).toMatch(/<audio controls src="[^"]*\/media\/[^"]+"><\/audio>/);
    // the database keeps the stored form
    const stored = await query<{ fields: Record<string, string> }>("SELECT fields FROM notes WHERE anki_guid = $1", [fixture.notes.reversed.guid]);
    expect(Object.values(stored[0].fields).join(" ")).toMatch(/src="\/images\/[0-9a-f-]{36}"/);
  });

  it("takes due date and memory state from Anki", async () => {
    const { cards } = await cardsOf(api, fixture.notes.reversed.guid);
    const expected = fixture.notes.reversed.cards[0];
    for (const c of cards) {
      expect(c.fsrsState.state).toBe(2);
      expect(c.fsrsState.stability).toBeCloseTo(expected.stability, 3);
      expect(new Date(c.fsrsState.due).getTime()).toBe((fixture.crt + expected.due * 86_400) * 1000);
    }
  });

  it("places a card borrowed by a filtered deck in its home deck with its real due date", async () => {
    const { note, cards } = await cardsOf(api, fixture.notes.custom.guid);
    const vocab = await query<{ id: string }>("SELECT id FROM topics WHERE name = 'Vocab' AND user_id = (SELECT user_id FROM notes WHERE id = $1)", [note.id]);
    expect(note.topicId).toBe(vocab[0].id);
    const reviewed = cards.find(c => c.fsrsState.state === 2)!;
    expect(reviewed.fsrsState.stability).toBeCloseTo(fixture.notes.custom.cards[0].stability, 3);
    expect(new Date(reviewed.fsrsState.due).getTime()).toBeGreaterThan(Date.now() - DAY_MS);
  });

  it("keeps Anki's suspension, and a later edit does not lift it", async () => {
    const { note, cards } = await cardsOf(api, fixture.notes.typed.guid);
    expect(cards[0].suspended).toBe(true);
    expect(cards[0].suspendedBy).toBe("anki");
    const edit = await api.put(`/notes/${note.id}`, { fields: { Front: "perro (edited)" } });
    expect(edit.status, JSON.stringify(edit.data)).toBe(200);
    const after = (await api.get(`/cards/${cards[0].id}`)).data;
    expect(after.suspended).toBe(true);
    expect(after.suspendedBy).toBe("anki");
  });

  it("renders a multi-number gap on every card it names", async () => {
    const { cards } = await cardsOf(api, fixture.notes.multi.guid);
    expect(cards.map(c => c.clozeNumber).sort()).toEqual([1, 2]);
    for (const c of cards) expect(c.frontHtml).not.toContain("to be");
  });

  it("follows Anki's empty-field rule: an image-only front and a &nbsp; field make cards", async () => {
    expect((await cardsOf(api, fixture.notes.image_only.guid)).cards).toHaveLength(1);
    expect((await cardsOf(api, fixture.notes.optional.guid)).cards).toHaveLength(2);
  });

  it("keeps what LearnForge does not model in anki_records, one row per key", async () => {
    const rows = await query<{ kind: string; n: string }>(`
      SELECT kind, count(*)::text AS n FROM anki_records
      WHERE user_id = (SELECT user_id FROM anki_imports WHERE id = $1) GROUP BY kind ORDER BY kind`, [done.id]);
    const byKind = Object.fromEntries(rows.map(r => [r.kind, Number(r.n)]));
    expect(byKind.note).toBe(7);
    expect(byKind.card).toBe(12);
    expect(byKind.notetype).toBe(6);
    const card = await query<{ raw: { revlog: unknown[]; data: Record<string, unknown> } }>(
      "SELECT raw FROM anki_records WHERE kind = 'card' AND anki_key = $1", [`${fixture.notes.reversed.guid}:0`]);
    expect(card[0].raw.revlog.length).toBe(2);
    expect(card[0].raw.data.s).toBeCloseTo(fixture.notes.reversed.cards[0].stability, 3);
  });

  it("re-importing the same file changes nothing and duplicates nothing", async () => {
    const before = await query<{ n: string }>("SELECT count(*)::text AS n FROM notes WHERE user_id = (SELECT user_id FROM anki_imports WHERE id = $1)", [done.id]);
    const again = await importAll(api, pkg("basic-latest.apkg"), "basic-latest.apkg");
    expect(again.preview.duplicates.total).toBe(7);
    expect(again.stats.notes).toMatchObject({ created: 0, updated: 0, unchanged: 7 });
    expect(again.stats.media).toMatchObject({ stored: 0, reused: 3 });
    expect(again.stats.topics.created).toBe(0);
    const after = await query<{ n: string }>("SELECT count(*)::text AS n FROM notes WHERE user_id = (SELECT user_id FROM anki_imports WHERE id = $1)", [done.id]);
    expect(after[0].n).toBe(before[0].n);
    // the LearnForge edit from above survives: Anki's copy is older
    const typed = await noteByGuid(api, fixture.notes.typed.guid);
    expect(Object.values(typed.fields)).toContain("perro (edited)");
  });

  it("a finished import cannot be started again, and deleting it keeps what it imported", async () => {
    expect((await api.post(`/import/anki/${done.id}/commit`, {})).status).toBe(400);
    expect((await api.delete(`/import/anki/${done.id}`)).status).toBe(204);
    expect((await api.get(`/import/anki/${done.id}`)).status).toBe(404);
    const records = await query<{ n: string; orphaned: string }>(`
      SELECT count(*)::text AS n, count(*) FILTER (WHERE import_id IS NULL)::text AS orphaned FROM anki_records r
      WHERE r.user_id = (SELECT user_id FROM notes WHERE anki_guid = $1 LIMIT 1) AND r.kind = 'note'`, [fixture.notes.typed.guid]);
    expect(Number(records[0].n)).toBeGreaterThan(0);
    expect((await noteByGuid(api, fixture.notes.typed.guid)).id).toBeTruthy();
  });

  it("another user cannot see or start this import", async () => {
    const other = await newUser("intruder");
    expect((await other.get(`/import/anki/${done.id}`)).status).toBe(404);
    expect((await other.post(`/import/anki/${done.id}/commit`, {})).status).toBe(404);
    expect((await other.delete(`/import/anki/${done.id}`)).status).toBe(404);
    expect(((await other.get("/import/anki")).data as unknown[]).length).toBe(0);
  });
});

describe("Anki import: other package formats", () => {
  it("reads the legacy 2.1 format (schema 11) into the same notes", async () => {
    const api = await newUser("legacy");
    const done = await importAll(api, pkg("basic-legacy.apkg"));
    expect(done.preview.version).toBe("legacy2");
    expect(done.preview.schema).toBe(11);
    expect(done.stats.notes.created).toBe(7);
    expect(done.stats.cards.created).toBe(12);
    const { cards } = await cardsOf(api, fixture.notes.reversed.guid);
    expect(cards[0].fsrsState.stability).toBeCloseTo(fixture.notes.reversed.cards[0].stability, 3);
  });

  it("reads a full collection backup (.colpkg)", async () => {
    const api = await newUser("colpkg");
    const done = await importAll(api, pkg("basic.colpkg"), "backup.colpkg");
    expect(done.stats.notes.created).toBe(7);
    // the backup also carries the file Anki's deck export left out
    expect(done.stats.media.stored).toBe(4);
    const { cards } = await cardsOf(api, fixture.notes.image_only.guid);
    expect(cards[0].frontHtml).toMatch(/\/media\/[0-9a-f-]{36}\//);
  });

  it("reads the Anki 2.0 format (collection.anki2 only) with a c0 gap", async () => {
    const api = await newUser("legacy1");
    const data = buildLegacyApkg({
      models: [BASIC_MODEL, CLOZE_MODEL],
      decks: [{ id: 1, name: "Default" }, { id: 2, name: "Old::Deck" }],
      notes: [
        { guid: "legacy-basic-1", mid: BASIC_MODEL.id, fields: ["front one", "back one"], tags: "old" },
        { guid: "legacy-cloze-1", mid: CLOZE_MODEL.id, fields: ["{{c0::zero}} and {{c1::one}}", ""] },
      ],
      cards: [
        { nid: 1, ord: 0, did: 2, type: 2, queue: 2, due: 10, ivl: 5, factor: 2500, reps: 3 },
        { nid: 2, ord: 0, did: 2 },
      ],
    });
    const done = await importAll(api, data, "old.apkg");
    expect(done.preview.version).toBe("legacy1");
    expect(done.stats.notes.created).toBe(2);
    const basic = await cardsOf(api, "legacy-basic-1");
    expect(basic.cards[0].fsrsState.state).toBe(2);
    expect(new Date(basic.cards[0].fsrsState.due).getTime()).toBe((CRT + 10 * 86_400) * 1000);
    expect(done.stats.schedule.sm2).toBe(1);
    const cloze = await cardsOf(api, "legacy-cloze-1");
    expect(cloze.cards.map(c => c.clozeNumber)).toEqual([1]);
  });

  it("imports image occlusion notes but keeps them out of study", async () => {
    const api = await newUser("occlusion");
    const done = await importAll(api, pkg("occlusion.apkg"));
    expect(done.preview.noteTypes.find((t: { name: string }) => t.name === "Image Occlusion").supported).toBe(false);
    expect(done.stats.cards.unsupported).toBe(fixture.occlusion.cards);
    const { cards } = await cardsOf(api, fixture.occlusion.guid);
    expect(cards.every(c => c.suspended && c.suspendedBy === "unsupported")).toBe(true);
    const due = await api.get("/study/due?limit=50");
    expect(due.status).toBe(200);
    const served = Array.isArray(due.data) ? due.data : due.data.cards;
    expect(served).toHaveLength(0);
  });

  it("starts every card fresh on request, keeping suspensions", async () => {
    const api = await newUser("fresh");
    const done = await importAll(api, pkg("basic-latest.apkg"), "deck.apkg", "fresh");
    expect(done.stats.schedule.new).toBe(12);
    const { cards } = await cardsOf(api, fixture.notes.reversed.guid);
    expect(cards.every(c => c.fsrsState.state === 0)).toBe(true);
    expect((await cardsOf(api, fixture.notes.typed.guid)).cards[0].suspendedBy).toBe("anki");
  });
});

describe("Anki import: refusals and limits", () => {
  let api: AxiosInstance;
  beforeAll(async () => { api = await newUser("limits"); });

  it("refuses files that are not Anki packages by name", async () => {
    const res = await upload(api, Buffer.from("hello"), "notes.txt");
    expect(res.status).toBe(400);
  });

  it("fails cleanly on a file that is not a zip", async () => {
    const job = await stage(api, Buffer.from("definitely not a zip file"), "broken.apkg");
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/zip/i);
    expect((await api.delete(`/import/anki/${job.id}`)).status).toBe(204);
  });

  it("fails cleanly when the notes table is a view", async () => {
    const data = buildLegacyApkg({ models: [BASIC_MODEL], decks: [{ id: 1, name: "Default" }], notes: [{ guid: "v1", mid: BASIC_MODEL.id, fields: ["a", "b"] }], cards: [{ nid: 1, ord: 0, did: 1 }], notesAsView: true });
    const job = await stage(api, data, "view.apkg");
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/notes table/);
    await api.delete(`/import/anki/${job.id}`);
  });

  it("names a package from a newer Anki instead of misreading it", async () => {
    const data = buildLegacyApkg({ models: [BASIC_MODEL], decks: [{ id: 1, name: "Default" }], notes: [], cards: [], meta: Buffer.from([0x08, 0x09]) });
    const job = await stage(api, data, "future.apkg");
    expect(job.status).toBe("failed");
    expect(job.error).toMatch(/newer Anki/);
    await api.delete(`/import/anki/${job.id}`);
  });

  it("caps a media file that inflates past its limit and imports the rest", async () => {
    const bomb = Buffer.alloc(60 * 1024 * 1024); // 60 MB of zeros, a few KB compressed
    expect(deflateRawSync(bomb).length).toBeLessThan(200_000);
    const data = buildLegacyApkg({
      models: [BASIC_MODEL], decks: [{ id: 1, name: "Default" }],
      notes: [{ guid: "bomb-note", mid: BASIC_MODEL.id, fields: ['<img src="huge.png">', "b"] }], cards: [{ nid: 1, ord: 0, did: 1 }],
      media: [{ name: "huge.png", data: bomb }, { name: "../../etc/evil.svg", data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') }],
    });
    const done = await importAll(api, data, "bomb.apkg");
    expect(done.stats.media.failed).toBe(1);
    expect(done.stats.media.stored).toBe(1);
    expect(done.stats.notes.created).toBe(1);
    const svg = await query<{ id: string; mime_type: string; filename: string }>(
      "SELECT id, mime_type, filename FROM images WHERE filename = '../../etc/evil.svg' AND user_id = (SELECT user_id FROM anki_imports WHERE id = $1)", [done.id]);
    expect(svg[0].mime_type).toBe("image/svg+xml");
    // stored under its id, never under the package's name
    const ls = execSync(`docker compose -f docker-compose.test.yml exec -T test-api ls /data/images/${svg[0].id}.svg`, { cwd: testsDir }).toString();
    expect(ls).toContain(svg[0].id);
  });

  it("allows only three open imports per user", async () => {
    const other = await newUser("open-limit");
    const small = buildLegacyApkg({ models: [BASIC_MODEL], decks: [{ id: 1, name: "Default" }], notes: [], cards: [] });
    for (let i = 0; i < 3; i++) expect((await stage(other, small, `s${i}.apkg`)).status).toBe("staged");
    const fourth = await upload(other, small, "s4.apkg");
    expect(fourth.status).toBe(400);
  });
});

describe("Media URLs", () => {
  it("refuses a forged signature, a signature for another file and a malformed id", async () => {
    const api = await newUser("forge");
    await importAll(api, pkg("basic-latest.apkg"));
    const { cards } = await cardsOf(api, fixture.notes.reversed.guid);
    const signed = /src="([^"]*\/media\/[^"]+)"/.exec(cards[0].frontHtml)![1];
    const [, id, sig] = /\/media\/([0-9a-f-]{36})\/([\w-]{22})$/.exec(signed)!;
    const other = await query<{ id: string }>("SELECT id FROM images WHERE content_hash IS NOT NULL AND id <> $1 LIMIT 1", [id]);
    const unauth = axios.create({ baseURL: apiUrl, validateStatus: () => true });
    expect((await unauth.get(`/media/${id}/${sig}`)).status).toBe(200);
    expect((await unauth.get(`/media/${id}/AAAAAAAAAAAAAAAAAAAAAA`)).status).toBe(404);
    expect((await unauth.get(`/media/${other[0].id}/${sig}`)).status).toBe(404);
    expect((await unauth.get(`/media/not-a-uuid/${sig}`)).status).toBe(400);
  });

  it("stores the plain form when a client sends a signed URL back", async () => {
    const api = await newUser("unsign");
    await importAll(api, pkg("basic-latest.apkg"));
    const note = await noteByGuid(api, fixture.notes.reversed.guid);
    const front = Object.values(note.fields)[0] as string;
    expect(front).toMatch(/\/media\//);
    const put = await api.put(`/notes/${note.id}`, { fields: { Front: `${front} edited` } });
    expect(put.status).toBe(200);
    const stored = await query<{ fields: Record<string, string> }>("SELECT fields FROM notes WHERE id = $1", [note.id]);
    expect(Object.values(stored[0].fields)[0]).toMatch(/^hola <img src="\/images\/[0-9a-f-]{36}"> edited$/);
  });

  it("a shared imported topic carries its media to the recipient", async () => {
    const owner = await newUser("share-owner");
    await importAll(owner, pkg("basic-latest.apkg"));
    const topics = (await owner.get("/topics")).data as Array<{ id: string; name: string }>;
    const spanish = topics.find(t => t.name === "Spanish")!;
    const link = await owner.post("/shares", { topic_id: spanish.id });
    expect(link.status, JSON.stringify(link.data)).toBe(201);
    const recipient = await newUser("share-recipient");
    const accepted = await recipient.post(`/shares/accept/${link.data.token}`, {});
    expect(accepted.status, JSON.stringify(accepted.data)).toBe(200);
    const note = await noteByGuid(recipient, fixture.notes.reversed.guid);
    const card = (await recipient.get(`/cards/${note.cards[0].id}`)).data;
    const img = /<img src="([^"]+)"/.exec(card.frontHtml)![1];
    const ownerNote = await noteByGuid(owner, fixture.notes.reversed.guid);
    const ownerImg = /\/media\/([0-9a-f-]{36})\//.exec(Object.values(ownerNote.fields)[0] as string)![1];
    expect(img).not.toContain(ownerImg);
    expect((await axios.get(apiUrl + img, { validateStatus: () => true })).status).toBe(200);
  });

  it("sharing into an account that imported the same deck keeps one note per guid there", async () => {
    const owner = await newUser("share-dup-owner");
    await importAll(owner, pkg("basic-latest.apkg"));
    const recipient = await newUser("share-dup-recipient");
    await importAll(recipient, pkg("basic-latest.apkg"));
    const spanish = ((await owner.get("/topics")).data as Array<{ id: string; name: string }>).find(t => t.name === "Spanish")!;
    const link = await owner.post("/shares", { topic_id: spanish.id });
    const accepted = await recipient.post(`/shares/accept/${link.data.token}`, {});
    expect(accepted.status, JSON.stringify(accepted.data)).toBe(200);
    // the recipient's own import keeps the guid; the shared copy has none
    const own = await noteByGuid(recipient, fixture.notes.reversed.guid);
    expect(own.id).toBeTruthy();
    const copies = await query<{ n: string }>(`
      SELECT count(*)::text AS n FROM notes n JOIN topics t ON t.id = n.topic_id
      WHERE n.anki_guid IS NULL AND t.id IN (WITH RECURSIVE tree AS (SELECT id FROM topics WHERE id = $1 UNION ALL SELECT c.id FROM topics c JOIN tree ON c.parent_id = tree.id) SELECT id FROM tree)`,
      [accepted.data.topic_id]);
    expect(Number(copies[0].n)).toBeGreaterThan(0);
  });

  it("does not sign another user's image referenced by id in your own card", async () => {
    const victim = await newUser("victim");
    await importAll(victim, pkg("basic-latest.apkg"));
    const victimNote = await noteByGuid(victim, fixture.notes.reversed.guid);
    const victimImage = /\/media\/([0-9a-f-]{36})\//.exec(Object.values(victimNote.fields)[0] as string)![1];

    const attacker = await newUser("attacker");
    const topic = await attacker.post("/topics", { name: "Borrowed" });
    const card = await attacker.post("/cards", { topic_id: topic.data.id, front_html: `<img src="/images/${victimImage}">`, back_html: "x" });
    expect(card.status, JSON.stringify(card.data)).toBe(201);
    const read = (await attacker.get(`/cards/${card.data.id}`)).data;
    expect(read.frontHtml).toContain(`src="/images/${victimImage}"`);
    expect(read.frontHtml).not.toContain("/media/");
  });
});

describe("Anki import: re-importing a changed deck", () => {
  const fieldsModel = (extra: boolean) => ({ ...BASIC_MODEL, fields: extra ? ["Front", "Back", "Extra"] : ["Front", "Back"] });
  const later = () => Math.floor(Date.now() / 1000) + 60;

  it("moves notes onto the new layout when a field was added in Anki, without duplicating them", async () => {
    const api = await newUser("layout");
    const deck = (extra: boolean, mod: number) => buildLegacyApkg({
      models: [fieldsModel(extra)], decks: [{ id: 2, name: "Layout" }],
      notes: [{ guid: "layout-1", mid: BASIC_MODEL.id, mod, fields: extra ? ["front", "back", "extra"] : ["front", "back"] }],
      cards: [{ nid: 1, ord: 0, did: 2, type: 2, queue: 2, due: 10, ivl: 5, factor: 2500, reps: 3 }],
    });
    await importAll(api, deck(false, CRT), "v1.apkg");
    const before = await cardsOf(api, "layout-1");

    const second = await importAll(api, deck(true, later()), "v2.apkg");
    expect(second.stats.notes).toMatchObject({ created: 0, updated: 1 });
    const third = await importAll(api, deck(true, later()), "v3.apkg");
    expect(third.stats.notes.created).toBe(0);

    const after = await cardsOf(api, "layout-1"); // exactly one note with this guid
    expect(Object.values(after.note.fields)).toEqual(["front", "back", "extra"]);
    expect(after.cards[0].id).toBe(before.cards[0].id);
    expect(after.cards[0].fsrsState.reps).toBe(before.cards[0].fsrsState.reps);
    const types = (await api.get("/note-types")).data as Array<{ name: string; fields: unknown[] }>;
    expect(types.filter(t => t.name === BASIC_MODEL.name).map(t => t.fields.length)).toEqual([3]);
  });

  it("updates a note Anki changed later, keeping card schedules and suspending a gap that vanished", async () => {
    const api = await newUser("newer");
    const deck = (text: string, mod: number) => buildLegacyApkg({
      models: [CLOZE_MODEL], decks: [{ id: 2, name: "Newer" }],
      notes: [{ guid: "newer-1", mid: CLOZE_MODEL.id, mod, fields: [text, ""] }],
      cards: [{ nid: 1, ord: 0, did: 2, type: 2, queue: 2, due: 10, ivl: 5, factor: 2500, reps: 4 }, { nid: 1, ord: 1, did: 2 }],
    });
    await importAll(api, deck("{{c1::a}} and {{c2::b}}", CRT), "v1.apkg");
    const before = await cardsOf(api, "newer-1");
    const first = before.cards.find(c => c.clozeNumber === 1)!;

    const second = await importAll(api, deck("{{c1::A}} only", later()), "v2.apkg");
    expect(second.preview.duplicates).toEqual({ total: 1, newer: 1 });
    expect(second.stats.notes.updated).toBe(1);
    const after = await cardsOf(api, "newer-1");
    const c1 = after.cards.find(c => c.clozeNumber === 1)!;
    const c2 = after.cards.find(c => c.clozeNumber === 2)!;
    expect(c1.id).toBe(first.id);
    expect(c1.fsrsState.reps).toBe(4);
    expect(c1.backHtml).toContain("A");
    expect(c2.suspended).toBe(true);
    expect(c2.suspendedBy).toBe("gap");
  });

  it("counts a cloze gap in any field, like Anki, for notes made in LearnForge too", async () => {
    const api = await newUser("any-field");
    const topic = await api.post("/topics", { name: "Cloze fields" });
    const note = await api.post("/notes", { topic_id: topic.data.id, note_type: "cloze", fields: { Text: "{{c1::a}}", Extra: "{{c2::b}}" } });
    expect(note.status, JSON.stringify(note.data)).toBe(201);
    expect(note.data.cards.map((c: { clozeNumber: number }) => c.clozeNumber)).toEqual([1, 2]);
  });
});

describe("Anki import: restart recovery (restarts the API, keep last)", () => {
  it("fails jobs that were running when the server stopped", async () => {
    const api = await newUser("restart");
    const token = String(api.defaults.headers.Authorization).slice("Bearer ".length);
    const userId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub as string;
    const rows = await query<{ id: string }>(
      "INSERT INTO anki_imports (user_id, filename, status) VALUES ($1, 'interrupted.apkg', 'running') RETURNING id", [userId]);
    execSync("docker compose -f docker-compose.test.yml restart test-api", { cwd: testsDir, stdio: "ignore" });
    for (let i = 0; i < 60; i++) {
      const ok = await axios.get(`${apiUrl}/health`, { validateStatus: () => true }).then(r => r.status === 200, () => false);
      if (ok) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    const job = await api.get(`/import/anki/${rows[0].id}`);
    expect(job.data.status).toBe("failed");
    expect(job.data.error).toMatch(/restarted/);
  }, 180_000);
});
