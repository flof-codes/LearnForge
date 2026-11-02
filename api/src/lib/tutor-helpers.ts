import type { FastifyRequest } from "fastify";
import { getUserId } from "./auth-helpers.js";
import { ForbiddenError, ServiceUnavailableError } from "./errors.js";
import { resolveTutorModel } from "../services/tutor-access.js";
import { QuestionModelError, type QuestionModel } from "../services/question-model.js";

/** The caller and the model their key runs; 403 TUTOR_UNAVAILABLE without a key. */
export async function requireTutor(request: FastifyRequest): Promise<{ userId: string; model: QuestionModel }> {
  const userId = getUserId(request);
  const model = await resolveTutorModel(userId);
  if (!model) throw new ForbiddenError("Save an Anthropic API key in the settings to use the tutor", "TUTOR_UNAVAILABLE");
  return { userId, model };
}

/** A model failure the learner can do nothing about: answered as 503 with the reason, so the view can say why. */
export function modelUnavailable(err: unknown): never {
  if (err instanceof QuestionModelError) throw new ServiceUnavailableError(err.message, `TUTOR_${err.reason.toUpperCase()}`);
  throw err;
}
