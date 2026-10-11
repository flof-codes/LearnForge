import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { QUESTION_SYSTEM_PROMPT, buildQuestionBatchPrompt, type QuestionRequest, type WrittenQuestion } from "@learnforge/core";
import { config } from "../config.js";

/**
 * The one place that calls a model to write questions. Everything else works
 * with what comes back, so the tests swap this for a stub (TUTOR_MODEL=stub)
 * and never reach Anthropic.
 */

/** One flat shape for every form; fields a form does not use come back empty. */
const WrittenBatch = z.object({
  questions: z.array(z.object({
    card_id: z.string(),
    status: z.enum(["ready", "skipped"]),
    skip_reason: z.string(),
    stem: z.string(),
    options: z.array(z.object({ text: z.string(), correct: z.boolean(), why: z.string() })),
    answer: z.string(),
    accept: z.array(z.string()),
    explanation: z.string(),
    terms: z.array(z.object({ term: z.string(), definition: z.string() })),
  })),
});

export type ModelFailure = "credits" | "auth" | "refused" | "error";
export class QuestionModelError extends Error {
  constructor(public readonly reason: ModelFailure, message: string) {
    super(message);
  }
}

export interface QuestionModel {
  readonly name: string;
  write(requests: QuestionRequest[]): Promise<WrittenQuestion[]>;
}

function classify(err: unknown): QuestionModelError {
  if (err instanceof QuestionModelError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new QuestionModelError("auth", "The Anthropic API key was rejected");
  }
  if (err instanceof Anthropic.APIError) {
    // An empty balance arrives as a billing_error, or as a 400 whose only marker is its message.
    if (err.status === 402 || err.type === "billing_error" || (err.status === 400 && /credit balance/i.test(err.message))) {
      return new QuestionModelError("credits", "The Anthropic credit balance is used up");
    }
    return new QuestionModelError("error", `Anthropic API error ${err.status ?? ""}: ${err.message}`.trim());
  }
  return new QuestionModelError("error", err instanceof Error ? err.message : "Unknown error");
}

function anthropicModel(): QuestionModel {
  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const model = config.tutorModel;
  return {
    name: model,
    async write(requests) {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 16000,
          // The rules never change between calls, so every batch after the first reads them from the cache.
          system: [{ type: "text", text: QUESTION_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildQuestionBatchPrompt(requests) }],
          output_config: { effort: "medium", format: zodOutputFormat(WrittenBatch) },
        });
        if (response.stop_reason === "refusal") throw new QuestionModelError("refused", "The model declined this batch");
        if (!response.parsed_output) throw new QuestionModelError("error", `The model returned no usable output (${response.stop_reason})`);
        return response.parsed_output.questions;
      } catch (err) {
        throw classify(err);
      }
    },
  };
}

/** Deterministic questions for the integration tests. A concept containing "[skip]" is skipped, "[fail]" fails the batch. */
function stubModel(): QuestionModel {
  return {
    name: "stub",
    async write(requests) {
      if (requests.some(r => r.concept.includes("[credits]"))) throw new QuestionModelError("credits", "The Anthropic credit balance is used up");
      if (requests.some(r => r.concept.includes("[fail]"))) throw new QuestionModelError("error", "Stub failure");
      return requests.map(r => {
        const base = { card_id: r.cardId, status: "ready", skip_reason: "", options: [], answer: "", accept: [], terms: [], explanation: `About ${r.concept}.` };
        if (r.concept.includes("[skip]")) return { ...base, status: "skipped", skip_reason: "Needs a formula", stem: "", explanation: "" };
        if (r.form === "gap") return { ...base, stem: `${r.concept} is {{gap}}.`, answer: "Right", accept: ["right", "correct"] };
        return {
          ...base,
          stem: `Which statement about ${r.concept} is right?`,
          options: [
            { text: "The right one", correct: true, why: "It matches the card." },
            { text: "A wrong one", correct: false, why: "The card says otherwise." },
            { text: "Another wrong one", correct: false, why: "It mixes up two ideas." },
            { text: "A third wrong one", correct: false, why: "It is about something else." },
          ],
          terms: [{ term: r.concept, definition: "The idea this card is about." }],
        };
      });
    },
  };
}

let cached: QuestionModel | null | undefined;

/** The configured model, or null when question writing is switched off (no key). */
export function getQuestionModel(): QuestionModel | null {
  if (cached === undefined) {
    cached = config.tutorModel === "stub" ? stubModel() : config.anthropicApiKey ? anthropicModel() : null;
  }
  return cached;
}
