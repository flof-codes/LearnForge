import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import axios, { type AxiosInstance } from "axios";
import pg from "pg";
import { getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";
import { markEmailVerified } from "../helpers/email-verification.js";

/**
 * Image occlusion notes imported before the built-in type existed sit on a
 * copied Anki type with every card suspended as `unsupported`. At API boot
 * they move onto the built-in "occlusion" type: schedule kept, cards freed
 * unless Anki had them suspended, the copy deleted. Written by SQL exactly as
 * the old import left them; the API container restarts to run the move.
 */

const testsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DB_CONFIG = { host: "localhost", port: TEST_CONFIG.dbPort, user: TEST_CONFIG.dbUser, password: TEST_CONFIG.dbPassword, database: TEST_CONFIG.dbName };
const OLD_TYPE = "40000000-0000-0000-0000-0000000010e1";
const OLD_TEMPLATE = "40000000-0000-0000-0000-0000000010e2";
const NOTE = "40000000-0000-0000-0000-0000000010e3";
const CARD1 = "40000000-0000-0000-0000-0000000010e4";
const CARD2 = "40000000-0000-0000-0000-0000000010e5";
const GUID = "io-migrate-guid";
const ANKI_TEMPLATE = `{{#Header}}<div>{{Header}}</div>{{/Header}}
<div style="display: none">{{cloze:Occlusion}}</div>
<div id="image-occlusion-container">{{Image}}<canvas id="image-occlusion-canvas"></canvas></div>
<script>try { anki.imageOcclusion.setup(); } catch (exc) {}</script>`;

let email = "";
let api: AxiosInstance;
let userId = "";

async function waitForApi() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await getUnauthApi().get("/health")).status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("API did not come back after restart");
}

beforeAll(async () => {
  email = `io-migrate-${Date.now()}@learnforge.dev`;
  const reg = await getUnauthApi().post("/auth/register", { email, password: "occlusion-migrate-pw", name: "IO migrate" });
  expect(reg.status).toBe(201);
  await markEmailVerified(email);
  api = axios.create({ baseURL: TEST_CONFIG.apiUrl, headers: { Authorization: `Bearer ${reg.data.token}` }, validateStatus: () => true });
  const topic = await api.post("/topics", { name: "Imported anatomy" });
  expect(topic.status).toBe(201);

  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  try {
    userId = (await client.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id;
    const image = (await client.query(
      "INSERT INTO images (user_id, filename, mime_type) VALUES ($1, 'skeleton.png', 'image/png') RETURNING id", [userId],
    )).rows[0].id;
    await client.query(`
      INSERT INTO note_types (id, user_id, name, kind, css, sort_field_key, anki_key, anki_schema)
      VALUES ($1, $2, 'Image Occlusion', 'cloze', '#image-occlusion-canvas { --active-shape-color: #ff8e8e; }', 'f1', '1700000000001', 'oldschema')`,
    [OLD_TYPE, userId]);
    for (const [i, name] of ["Occlusion", "Image", "Header", "Back Extra", "Comments"].entries()) {
      await client.query("INSERT INTO note_type_fields (note_type_id, key, name, ord) VALUES ($1, $2, $3, $4)", [OLD_TYPE, `f${i + 1}`, name, i]);
    }
    await client.query("INSERT INTO card_templates (id, note_type_id, ord, name, front_template, back_template) VALUES ($1, $2, 0, 'Image Occlusion', $3, $3)",
      [OLD_TEMPLATE, OLD_TYPE, ANKI_TEMPLATE]);
    const fields = {
      f1: "{{c1::image-occlusion:rect:left=.1:top=.1:width=.3:height=.2:oi=1}}<br>{{c2::image-occlusion:rect:left=.5:top=.5:width=.2:height=.2:oi=1}}<br>",
      f2: `<img src="/images/${image}">`, f3: "Bones", f4: "", f5: "",
    };
    await client.query(`INSERT INTO notes (id, user_id, note_type_id, topic_id, fields, tags, anki_guid) VALUES ($1, $2, $3, $4, $5, '{anatomy}', $6)`,
      [NOTE, userId, OLD_TYPE, topic.data.id, JSON.stringify(fields), GUID]);
    for (const [id, n] of [[CARD1, 1], [CARD2, 2]] as const) {
      await client.query(`
        INSERT INTO cards (id, topic_id, concept, front_html, back_html, tags, note_id, template_id, cloze_number, renderer_version, suspended, suspended_by)
        VALUES ($1, $2, 'Bones', '<div>old</div>', '<div>old</div>', '{anatomy}', $3, $4, $5, 2, true, 'unsupported')`,
      [id, topic.data.id, NOTE, OLD_TEMPLATE, n]);
      await client.query("INSERT INTO bloom_state (card_id) VALUES ($1)", [id]);
      await client.query(`
        INSERT INTO fsrs_state (card_id, stability, difficulty, due, last_review, reps, lapses, state)
        VALUES ($1, 12.5, 4.2, NOW() + INTERVAL '9 days', NOW() - INTERVAL '3 days', 4, 1, 2)`, [id]);
    }
    // The old import kept Anki's raw cards: the second one was suspended in Anki.
    await client.query(`INSERT INTO anki_records (user_id, kind, anki_key, local_id, raw) VALUES
      ($1, 'notetype', '1700000000001', $2, '{}'::jsonb),
      ($1, 'card', $3, NULL, '{"queue": 2}'::jsonb),
      ($1, 'card', $4, NULL, '{"queue": -1}'::jsonb)`, [userId, OLD_TYPE, `${GUID}:0`, `${GUID}:1`]);
  } finally {
    await client.end();
  }

  execSync("docker compose -f docker-compose.test.yml restart test-api", { cwd: testsDir, stdio: ["ignore", "pipe", "pipe"] });
  await waitForApi();
}, 180_000);

afterAll(async () => {
  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  await client.query("DELETE FROM users WHERE email = $1", [email]);
  await client.end();
});

describe("Migration of imported image occlusion notes", () => {
  it("moves the note onto the built-in type with Anki's field contents", async () => {
    const note = await api.get(`/notes/${NOTE}`);
    expect(note.status).toBe(200);
    const types = (await api.get("/note-types")).data as Array<{ id: string; builtinKey: string | null; fields: Array<{ key: string; name: string }> }>;
    const io = types.find(t => t.builtinKey === "occlusion")!;
    expect(note.data.noteTypeId).toBe(io.id);
    const key = (name: string) => io.fields.find(f => f.name === name)!.key;
    expect(note.data.fields[key("Header")]).toBe("Bones");
    expect(note.data.fields[key("Occlusion")]).toContain("{{c2::image-occlusion:rect");
    expect(note.data.fields[key("Image")]).toMatch(/^<img src="/);
    // The copied Anki type is gone.
    expect(types.some(t => t.id === OLD_TYPE)).toBe(false);
  });

  it("keeps the cards and their schedule, frees them unless Anki suspended them, and renders them", async () => {
    const card1 = (await api.get(`/cards/${CARD1}`)).data;
    const card2 = (await api.get(`/cards/${CARD2}`)).data;
    expect([card1.suspended, card1.suspendedBy]).toEqual([false, null]);
    expect([card2.suspended, card2.suspendedBy]).toEqual([true, "anki"]);
    expect(card1.fsrsState).toMatchObject({ stability: 12.5, reps: 4, lapses: 1, state: 2 });
    expect(card1.frontHtml).toContain('class="cloze" data-ordinal="1" data-shape="rect"');
    expect(card1.frontHtml).toContain('class="io-stage"');
    expect(card1.frontHtml).not.toContain("anki.imageOcclusion");
  });

  it("points the import's note type record at the built-in type and is idempotent", async () => {
    const client = new pg.Client(DB_CONFIG);
    await client.connect();
    try {
      const rec = await client.query("SELECT local_id FROM anki_records WHERE user_id = $1 AND kind = 'notetype'", [userId]);
      const io = await client.query("SELECT id FROM note_types WHERE user_id = $1 AND builtin_key = 'occlusion'", [userId]);
      expect(rec.rows[0].local_id).toBe(io.rows[0].id);
      const left = await client.query("SELECT count(*)::int AS n FROM cards WHERE note_id = $1 AND suspended_by = 'unsupported'", [NOTE]);
      expect(left.rows[0].n).toBe(0);
    } finally {
      await client.end();
    }
  });
});
