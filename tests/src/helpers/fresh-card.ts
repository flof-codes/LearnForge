import type { AxiosInstance } from "axios";

let counter = 0;

/**
 * Create a fresh card via the API for testing purposes.
 * Returns the full card response (id, bloomState, fsrsState, etc.).
 */
export async function createFreshCard(
  api: AxiosInstance,
  topicId: string,
  conceptSuffix?: string,
): Promise<Record<string, any>> {
  counter++;
  const suffix = conceptSuffix ?? `test-${counter}-${Date.now()}`;

  const res = await api.post("/cards", {
    topic_id: topicId,
    concept: `Fresh card ${suffix}`,
    front_html: `<div class="lf-card"><h2>Test ${suffix}</h2></div>`,
    back_html: `<div class="lf-card"><p>Answer ${suffix}</p></div>`,
    tags: ["test"],
  });

  if (res.status !== 201) {
    throw new Error(`Failed to create fresh card: ${res.status} ${JSON.stringify(res.data)}`);
  }

  return res.data;
}

/**
 * Delete a card by ID. Silently ignores 404 (already deleted).
 */
export async function deleteFreshCard(
  api: AxiosInstance,
  cardId: string,
): Promise<void> {
  const res = await api.delete(`/cards/${cardId}`);
  if (res.status !== 204 && res.status !== 404) {
    throw new Error(`Failed to delete card ${cardId}: ${res.status}`);
  }
}

/**
 * Create a fresh cloze card via the API for testing purposes.
 * Returns the full card response (id, bloomState, fsrsState, clozeData, etc.).
 */
export async function createFreshClozeCard(
  api: AxiosInstance,
  topicId: string,
  conceptSuffix?: string,
): Promise<Record<string, any>> {
  counter++;
  const suffix = conceptSuffix ?? `cloze-${counter}-${Date.now()}`;

  const res = await api.post("/cards", {
    topic_id: topicId,
    concept: `Cloze test ${suffix}`,
    card_type: "cloze",
    cloze_data: {
      deletions: [
        { index: 1, answer: "mitochondria", hint: "organelle" },
        { index: 2, answer: "powerhouse", hint: null },
      ],
      sourceText:
        "{{c1::mitochondria::organelle}} is the {{c2::powerhouse}} of the cell.",
    },
  });

  if (res.status !== 201) {
    throw new Error(
      `Failed to create fresh cloze card: ${res.status} ${JSON.stringify(res.data)}`,
    );
  }

  return res.data;
}

/**
 * Submit a review for a card. Returns the review response.
 */
export async function submitReview(
  api: AxiosInstance,
  cardId: string,
  bloomLevel: number,
  rating: number,
  opts: { modality?: string; skipBloom?: boolean; questionText?: string; answerExpected?: string; userAnswer?: string } = {},
): Promise<Record<string, any>> {
  const res = await api.post("/reviews", {
    card_id: cardId,
    bloom_level: bloomLevel,
    rating,
    question_text: opts.questionText ?? "Test question",
    answer_expected: opts.answerExpected,
    user_answer: opts.userAnswer,
    modality: opts.modality,
    skip_bloom: opts.skipBloom,
  });

  if (res.status !== 201) {
    throw new Error(`Failed to submit review: ${res.status} ${JSON.stringify(res.data)}`);
  }

  return res.data;
}
