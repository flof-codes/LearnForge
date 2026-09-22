import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "@learnforge/core";
import { startSession, setChangeRate, setOriginal, disputeOriginal, resolveDispute, getCardOriginal } from "@learnforge/core";

function ok(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  correct: z.boolean().optional(),
});

export function registerDialTools(server: McpServer, db: Db, userId: string) {
  server.tool(
    "start_session",
    "Start a tutor study session (or resume one by session_id). Ask the learner how much headspace they have first: Commute 0.3 (quick picks, no discussion), Desk 0.7 (options worth arguing about), Deep 1.0 (open questions, explain why). The difficulty is shown on every question and scales the review interval. Pass the returned session_id to get_study_cards.",
    {
      client: z.enum(["codex", "claude", "other"]).optional().describe("Which tutor client is running the session"),
      difficulty: z.number().min(0).max(1).optional().describe("Session difficulty 0..1; presets Commute 0.3, Desk 0.7, Deep 1.0"),
      voice: z.boolean().optional().describe("True when the learner is talking rather than typing"),
      session_id: z.string().uuid().optional().describe("Resume an earlier session instead of starting a new one"),
    },
    async ({ client, difficulty, voice, session_id }) => {
      try {
        return ok(await startSession(db, userId, { client, difficulty, voice, session_id }));
      } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "set_change_rate",
    "Set how much the tutor may vary a card's question: 0 = word for word (pure memorising, never changes level), 0.3 = reworded, 0.8 = new context (default), 1 = free. Set it on a topic (inherited by everything below) or on one card (wins over the topic). null clears the value so it inherits again.",
    {
      topic_id: z.string().uuid().optional(),
      card_id: z.string().uuid().optional(),
      change_rate: z.number().min(0).max(1).nullable().describe("0..1, or null to inherit"),
    },
    async ({ topic_id, card_id, change_rate }) => {
      try {
        return ok(await setChangeRate(db, userId, { topic_id, card_id, change_rate }));
      } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "get_original",
    "Get a card's original question: the anchor every variant must derive from.",
    { card_id: z.string().uuid() },
    async ({ card_id }) => {
      try { return ok(await getCardOriginal(db, userId, card_id)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "set_original",
    "Store the original question of a card. Call it the first time you ask a card that has no original (get_study_cards returns original: null), with exactly the question you asked. Later calls create a new version, e.g. after the learner agreed the card was wrong. Options with ids and correct flags let the server grade choice questions.",
    {
      card_id: z.string().uuid(),
      question_text: z.string().min(1).describe("The full question as asked, including every lettered option for choice questions"),
      expected_answer: z.string().optional().describe("The correct answer, e.g. 'A, C' or the model answer for open questions"),
      options: z.array(optionSchema).optional().describe("Choice questions: [{ id: 'A', text: '...', correct: true }]"),
      context: z.string().optional().describe("What the question is about, for future variants"),
    },
    async ({ card_id, question_text, expected_answer, options, context }) => {
      try {
        return ok(await setOriginal(db, userId, { card_id, question_text, expected_answer, options, context, created_by: "tutor" }));
      } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "dispute_original",
    "Flag a card whose content you still believe is wrong AFTER a web research pass and AFTER the learner agreed it should be checked. The card is taken out of study until the learner resolves it. Do not use it for a mere disagreement in wording.",
    {
      card_id: z.string().uuid(),
      note: z.string().min(1).describe("What is wrong, what the research found, and the sources"),
    },
    async ({ card_id, note }) => {
      try { return ok(await disputeOriginal(db, userId, card_id, note)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "resolve_dispute",
    "Clear a dispute and put the card back into study with its current original unchanged. To fix the card instead, update_card and then set_original.",
    { card_id: z.string().uuid() },
    async ({ card_id }) => {
      try { return ok(await resolveDispute(db, userId, card_id)); } catch (err) { return fail(err); }
    },
  );
}
