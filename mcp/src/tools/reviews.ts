import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "@learnforge/core";
import { submitReview, deleteReview } from "@learnforge/core";

export function registerReviewTools(server: McpServer, db: Db, userId: string) {
  server.tool(
    "submit_review",
    "Record the learner's answer to a served card. Pass the question_id ticket from get_study_cards; sending the same ticket twice returns the first result. Choice questions: pass correct_option_ids and selected_option_ids and the server grades; the options as shown go into question_text. Open questions: pass correctness 0..1. The level step is ±(change rate × correctness) and only counts when bloom_level equals the card's level; the interval is FSRS × (1 + 0.5 × change rate) × (0.7 + 0.3 × difficulty).",
    {
      question_id: z.string().uuid().optional().describe("Ticket from get_study_cards (required in tutor sessions)"),
      card_id: z.string().uuid().optional().describe("Only without a ticket (legacy)"),
      bloom_level: z.number().int().min(0).max(5).describe("The level the question was written for; must equal the card's bloomState.currentLevel to count"),
      style: z.enum(["open", "single", "multiple"]).optional().describe("open = free answer, single = one correct option, multiple = select all that apply"),
      correctness: z.number().min(0).max(1).optional().describe("Open questions: how correct the answer was, 0..1"),
      correct_option_ids: z.array(z.string()).optional(),
      selected_option_ids: z.array(z.string()).optional(),
      rating: z.number().int().min(1).max(4).optional().describe("Legacy FSRS rating; not needed when correctness or option ids are given"),
      session_difficulty: z.number().min(0).max(1).optional().describe("Current session difficulty; send it when the learner asked for harder or easier"),
      question_text: z.string().min(1).describe("The exact, complete question as shown to the user — including all MCQ options with letters"),
      answer_expected: z.string().optional().describe("The correct/ideal answer (e.g. 'A, C' for MCQ or full text for open response)"),
      user_answer: z.string().optional().describe("The user's actual answer (e.g. 'B, D' for MCQ or the text they provided)"),
      modality: z.enum(["chat", "web", "mcq"]).optional().describe("Legacy; ignored when a ticket is given"),
    },
    async (input) => {
      try {
        const result = await submitReview(db, userId, { ...input, modality: input.modality ?? "chat" });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "delete_review",
    "Delete a single review by ID. Only reviews from today or yesterday can be deleted. FSRS scheduling and Bloom state are recalculated from the remaining review history.",
    {
      review_id: z.string().uuid().describe("The UUID of the review to delete"),
    },
    async ({ review_id }) => {
      try {
        const result = await deleteReview(db, userId, review_id, { restrictToRecent: true });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
