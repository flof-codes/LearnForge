import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db/connection.js";
import { submitReview } from "@learnforge/core";

export function registerReviewTools(server: McpServer, userId: string) {
  server.tool(
    "submit_review",
    "Submit a review for a card, updating FSRS scheduling and Bloom's taxonomy state. The modality parameter affects interval scheduling: 'chat' (AI open question, 1.2x interval), 'web' (self-rating, 0.95x), 'mcq' (AI multiple choice, 1.05x).",
    {
      card_id: z.string().uuid(),
      bloom_level: z.number().int().min(0).max(5),
      rating: z.number().int().min(1).max(4),
      question_text: z.string().min(1).describe("The exact, complete question as shown to the user — including all MCQ options with letters"),
      modality: z.enum(["chat", "web", "mcq"]).default("chat").optional(),
      answer_expected: z.string().optional().describe("The correct/ideal answer (e.g. 'A, C' for MCQ or full text for open response)"),
      user_answer: z.string().optional().describe("The user's actual answer (e.g. 'B, D' for MCQ or the text they provided)"),
    },
    async ({ card_id, bloom_level, rating, question_text, modality, answer_expected, user_answer }) => {
      try {
        const result = await submitReview(db, userId, {
          card_id, bloom_level, rating, question_text,
          modality: modality ?? "chat",
          answer_expected, user_answer,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
