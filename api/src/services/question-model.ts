import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import {
  QUESTION_SYSTEM_PROMPT, buildQuestionBatchPrompt, GRADING_SYSTEM_PROMPT, buildGradingPrompt,
  FOLLOW_UP_SYSTEM_PROMPT, buildFollowUpContext,
  DEFINE_SYSTEM_PROMPT, buildDefinePrompt, TUTORIAL_SYSTEM_PROMPT, buildTutorialPrompt, validateTutorial, validateDefinition,
  TUTOR_MODELS,
  type QuestionRequest, type WrittenQuestion, type AnswerContext, type HelpContext, type Tutorial, type TutorModelId, type TutorEffort,
} from "@learnforge/core";
import { config } from "../config.js";

/**
 * The one place that calls a model: to write questions ahead, to grade an open
 * answer, to answer a follow-up, and to define or teach what the learner marked.
 * Everything else works
 * with what comes back, so the tests swap this for a stub (TUTOR_MODEL=stub)
 * and never reach Anthropic. Every call runs on the key of the user it is for.
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
    key_points: z.array(z.string()),
    explanation: z.string(),
    terms: z.array(z.object({ term: z.string(), definition: z.string() })),
  })),
});

/** One flat shape for every diagram kind; the kinds a step does not use come back empty. */
const WrittenTutorial = z.object({
  title: z.string(),
  concepts: z.array(z.object({ id: z.string(), label: z.string() })),
  links: z.array(z.object({ from: z.string(), to: z.string(), effect: z.enum(["leads", "raises", "lowers"]) })),
  steps: z.array(z.object({
    concept: z.string(),
    title: z.string(),
    text: z.string(),
    visual: z.object({
      kind: z.enum(["none", "flow", "bars", "curve"]),
      caption: z.string(),
      flow: z.array(z.object({ label: z.string(), change: z.enum(["up", "down", "none"]) })),
      bars: z.array(z.object({ label: z.string(), value: z.number(), unit: z.string() })),
      curve: z.object({
        x_label: z.string(),
        y_label: z.string(),
        points: z.array(z.object({ x: z.number(), y: z.number() })),
        marker_x: z.number(),
      }),
    }),
  })),
});

const Grade = z.object({
  correctness: z.number(),
  met: z.array(z.boolean()),
  feedback: z.string(),
});
export interface AnswerGrade { correctness: number; met: boolean[]; feedback: string }
export interface ThreadMessage { role: "user" | "assistant"; text: string }

export type ModelFailure = "credits" | "auth" | "refused" | "error";
export class QuestionModelError extends Error {
  constructor(public readonly reason: ModelFailure, message: string) {
    super(message);
  }
}

export interface QuestionModel {
  readonly name: string;
  write(requests: QuestionRequest[]): Promise<WrittenQuestion[]>;
  /** Grades what the learner wrote against the question's key points. */
  grade(ctx: AnswerContext, answer: string): Promise<AnswerGrade>;
  /** Answers the last message of a thread that starts with the learner's answer and the feedback on it. */
  reply(ctx: AnswerContext, thread: ThreadMessage[]): Promise<string>;
  /** A short definition of words the learner marked in a question. */
  define(ctx: HelpContext, term: string): Promise<string>;
  /** A tutorial of a marked term, or of everything the question needs when `term` is null. */
  tutorial(ctx: HelpContext, term: string | null): Promise<Tutorial>;
}

/** The model's numbers are advisory until they are in range and as long as the rubric. */
function cleanGrade(ctx: AnswerContext, raw: AnswerGrade): AnswerGrade {
  const correctness = Number.isFinite(raw.correctness) ? Math.min(1, Math.max(0, raw.correctness)) : 0;
  return { correctness, met: ctx.keyPoints.map((_, i) => raw.met[i] === true), feedback: raw.feedback.trim().slice(0, 1200) };
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

/** Whose key, which model, how much effort. One per request: nothing here outlives the call it was made for. */
export interface ModelSetup {
  apiKey: string;
  model: TutorModelId;
  effort: TutorEffort;
}

function anthropicModel(setup: ModelSetup): QuestionModel {
  const client = new Anthropic({ apiKey: setup.apiKey });
  const { model } = setup;
  // Haiku takes no effort setting; sending one is an error there.
  const effort = TUTOR_MODELS.find(m => m.id === model)?.effort ? { effort: setup.effort } : {};
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
          output_config: { ...effort, format: zodOutputFormat(WrittenBatch) },
        });
        if (response.stop_reason === "refusal") throw new QuestionModelError("refused", "The model declined this batch");
        if (!response.parsed_output) throw new QuestionModelError("error", `The model returned no usable output (${response.stop_reason})`);
        return response.parsed_output.questions;
      } catch (err) {
        throw classify(err);
      }
    },
    async grade(ctx, answer) {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 4000,
          system: [{ type: "text", text: GRADING_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildGradingPrompt(ctx, answer) }],
          output_config: { ...effort, format: zodOutputFormat(Grade) },
        });
        if (response.stop_reason === "refusal") throw new QuestionModelError("refused", "The model declined to grade this answer");
        if (!response.parsed_output) throw new QuestionModelError("error", `The model returned no usable grade (${response.stop_reason})`);
        return cleanGrade(ctx, response.parsed_output);
      } catch (err) {
        throw classify(err);
      }
    },
    async reply(ctx, thread) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 2000,
          system: `${FOLLOW_UP_SYSTEM_PROMPT}\n\n${buildFollowUpContext(ctx)}`,
          messages: thread.map(m => ({ role: m.role, content: m.text })),
          output_config: effort,
        });
        if (response.stop_reason === "refusal") throw new QuestionModelError("refused", "The model declined to answer");
        const text = response.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
        if (!text) throw new QuestionModelError("error", "The model returned no answer");
        return text;
      } catch (err) {
        throw classify(err);
      }
    },
    async define(ctx, term) {
      try {
        const response = await client.messages.create({
          model,
          max_tokens: 1000,
          system: [{ type: "text", text: DEFINE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildDefinePrompt(ctx, term) }],
          output_config: effort,
        });
        if (response.stop_reason === "refusal") throw new QuestionModelError("refused", "The model declined to define this");
        return validateDefinition(response.content.filter(b => b.type === "text").map(b => b.text).join(""));
      } catch (err) {
        throw classify(err);
      }
    },
    async tutorial(ctx, term) {
      try {
        const response = await client.messages.parse({
          model,
          max_tokens: 8000,
          system: [{ type: "text", text: TUTORIAL_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: buildTutorialPrompt(ctx, term) }],
          output_config: { ...effort, format: zodOutputFormat(WrittenTutorial) },
        });
        if (response.stop_reason === "refusal") throw new QuestionModelError("refused", "The model declined to write this tutorial");
        if (!response.parsed_output) throw new QuestionModelError("error", `The model returned no usable tutorial (${response.stop_reason})`);
        return validateTutorial(response.parsed_output);
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
        const base = { card_id: r.cardId, status: "ready", skip_reason: "", options: [], answer: "", accept: [], key_points: [], terms: [], explanation: `About ${r.concept}.${r.figure ? " See the figure." : ""}` };
        if (r.form === "open") return { ...base, stem: `Explain ${r.concept}.`, answer: "It works because of A and B.", key_points: ["Names A", "Names B"] };
        if (r.concept.includes("[skip]")) return { ...base, status: "skipped", skip_reason: "Needs a formula", stem: "", explanation: "" };
        if (r.form === "gap") return { ...base, stem: `${r.concept} is {{gap}}.`, answer: "Right", accept: ["right", "correct"] };
        return {
          ...base,
          stem: r.rewriteOf ? `Rewritten (${r.feedback.flatMap(f => f.labels).length} labels): which statement about ${r.concept} is right?` : `Which statement about ${r.concept} is right?`,
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
    // Each key point counts when the answer contains its last word ("A", "B").
    async grade(ctx, answer) {
      if (answer.includes("[credits]")) throw new QuestionModelError("credits", "The Anthropic credit balance is used up");
      const met = ctx.keyPoints.map(k => answer.includes(k.split(" ").pop()!));
      return { correctness: met.filter(Boolean).length / Math.max(1, met.length), met, feedback: `You covered ${met.filter(Boolean).length} of ${met.length} points.` };
    },
    async reply(_ctx, thread) {
      return `Stub reply to: ${thread[thread.length - 1].text}`;
    },
    // A term containing "[credits]" stands for a used-up balance.
    async define(_ctx, term) {
      if (term.includes("[credits]")) throw new QuestionModelError("credits", "The Anthropic credit balance is used up");
      return `Stub definition of ${term}.`;
    },
    async tutorial(ctx, term) {
      if (term?.includes("[credits]")) throw new QuestionModelError("credits", "The Anthropic credit balance is used up");
      const subject = term ?? ctx.concept;
      return validateTutorial({
        title: `About ${subject}`,
        concepts: [{ id: "a", label: "Cause" }, { id: "b", label: subject.slice(0, 40) }],
        links: [{ from: "a", to: "b", effect: "raises" }],
        steps: [
          { concept: "a", title: "The cause", text: "More of the cause.", visual: { kind: "flow", caption: "", flow: [{ label: "Cause", change: "up" }, { label: "Effect", change: "up" }] } },
          { concept: "b", title: subject, text: `What ${subject} means.`, visual: { kind: "curve", caption: "", curve: { x_label: "x", y_label: "y", points: [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 3 }], marker_x: 1 } } },
        ],
      });
    },
  };
}

/** The model for one user's setup; the canned writer when the server runs in test mode. */
export function createQuestionModel(setup: ModelSetup): QuestionModel {
  return config.tutorModel === "stub" ? stubModel() : anthropicModel(setup);
}

/** Asks Anthropic whether the key is accepted and may use the model. Costs nothing. */
export async function checkApiKey(setup: ModelSetup): Promise<void> {
  if (config.tutorModel === "stub") {
    if (setup.apiKey.includes("rejected")) throw new QuestionModelError("auth", "The Anthropic API key was rejected");
    return;
  }
  try {
    await new Anthropic({ apiKey: setup.apiKey }).models.retrieve(setup.model);
  } catch (err) {
    throw classify(err);
  }
}
