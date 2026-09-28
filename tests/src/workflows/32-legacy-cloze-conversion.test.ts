import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS } from "../helpers/fixtures.js";

/**
 * The release-1 → release-2 cloze conversion runs once at API boot. It is the
 * only code in release 2 that rewrites user data unprompted, so it is exercised
 * here for real: a release-1 style cloze card is written by SQL, the API
 * container restarts, and the converted rows are checked through the API.
 */

const testsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const compose = `docker compose -f docker-compose.test.yml`;
const LEGACY_ID = "20000000-0000-0000-0000-00000000c10e";

function psql(sqlText: string) {
  execSync(`${compose} exec -T test-db psql -q -U learnforge_test -d learnforge_test`, { cwd: testsDir, input: sqlText, stdio: ["pipe", "pipe", "pipe"] });
}

async function waitForApi(api: AxiosInstance) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await api.get("/health");
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error("API did not come back after restart");
}

let api: AxiosInstance;

beforeAll(async () => {
  await login();
  api = getApi();

  // A cloze card exactly as release 1 stored it: one card, all gaps in cloze_data,
  // plain-text sourceText with a character that must survive HTML escaping,
  // one review and a level already reached.
  psql(`
    DELETE FROM cards WHERE id = '${LEGACY_ID}';
    INSERT INTO cards (id, topic_id, concept, front_html, back_html, tags, card_type, cloze_data)
    VALUES ('${LEGACY_ID}', '${TOPICS.EMPTY_TOPIC}', 'legacy conversion', '<p>old front</p>', '<p>old back</p>', '{legacy}', 'cloze',
      '{"sourceText": "A < B because {{c1::A::first}} precedes {{c2::B}}", "deletions": [{"index": 1, "answer": "A", "hint": "first"}, {"index": 2, "answer": "B", "hint": null}]}'::jsonb);
    INSERT INTO bloom_state (card_id, current_level, highest_reached) VALUES ('${LEGACY_ID}', 1, 1);
    INSERT INTO fsrs_state (card_id, stability, difficulty, due, last_review, reps, lapses, state)
    VALUES ('${LEGACY_ID}', 3.2, 5.1, NOW() + INTERVAL '2 days', NOW() - INTERVAL '1 day', 1, 0, 2);
    INSERT INTO reviews (card_id, bloom_level, rating, question_text, modality) VALUES ('${LEGACY_ID}', 0, 3, 'legacy review', 'chat');
  `);

  execSync(`${compose} restart test-api`, { cwd: testsDir, stdio: ["ignore", "pipe", "pipe"] });
  await waitForApi(api);
  await login();
  api = getApi();
}, 180_000);

describe("Legacy cloze conversion at boot", () => {
  it("turns the release-1 card into a Cloze note with one card per gap, keeping the first card's identity", async () => {
    const first = await api.get(`/cards/${LEGACY_ID}`);
    expect(first.status, JSON.stringify(first.data)).toBe(200);
    expect(first.data.noteId).toBeTruthy();
    expect(first.data.clozeNumber).toBe(1);
    expect(first.data.cardType).toBe("standard");
    expect(first.data.clozeData).toBeNull();
    // schedule, level and history survive on the card that kept its id
    expect(first.data.fsrsState.state).toBe(2);
    expect(first.data.fsrsState.reps).toBe(1);
    expect(first.data.bloomState.currentLevel).toBe(1);
    expect(first.data.reviews).toHaveLength(1);
    expect(first.data.tags).toEqual(["legacy"]);
    // plain text was escaped, the gaps kept their hints
    expect(first.data.frontHtml).toContain("A &lt; B");
    expect(first.data.frontHtml).toContain("[first]");
    expect(first.data.original.createdBy).toBe("derived");

    const note = await api.get(`/notes/${first.data.noteId}`);
    expect(note.data.noteTypeKind).toBe("cloze");
    expect(note.data.fields.f1).toContain("{{c1::A::first}}");
    expect(note.data.cards.map((c: any) => c.clozeNumber)).toEqual([1, 2]);
    const second = note.data.cards.find((c: any) => c.clozeNumber === 2);
    const secondCard = await api.get(`/cards/${second.id}`);
    expect(secondCard.data.fsrsState.state).toBe(0); // fresh schedule for the new gap
    expect(secondCard.data.reviews).toHaveLength(0);
    expect(secondCard.data.frontHtml).toContain("[...]");

    // Running the conversion again is a no-op: nothing is left to convert
    const again = await api.get(`/notes/${first.data.noteId}`);
    expect(again.data.cards).toHaveLength(2);

    await api.delete(`/notes/${first.data.noteId}`);
  });
});
