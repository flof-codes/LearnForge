/**
 * The instructions the question writer works from, and the per-batch request
 * it receives. Kept free of anything that changes between calls so the system
 * prompt stays cacheable. Bump QUESTION_PROMPT_VERSION in
 * services/card-questions.ts when the rules below change.
 */

export interface QuestionRequest {
  cardId: string;
  form: "choice" | "gap" | "open";
  /** 0 Remember … 5 Create. */
  bloomLevel: number;
  /** Session difficulty 0.3 (commute) … 1.0 (deep). */
  difficulty: number;
  /** 0 = ask the original word for word … 1 = anything that tests the idea. */
  changeRate: number;
  topicName: string;
  concept: string;
  frontText: string;
  backText: string;
  /** The card is a cloze note: it tests exactly one gap. */
  isCloze: boolean;
  hasImages: boolean;
  original: { question: string; expectedAnswer: string | null; options: string[] | null } | null;
  /** Question texts asked for this card lately, newest first. Do not repeat them. */
  recentQuestions: string[];
}

export const QUESTION_SYSTEM_PROMPT = `You write study questions for LearnForge, a spaced-repetition app with Bloom's taxonomy. You receive a batch of cards and return exactly one question per card. The learner sees the question in the app and gets feedback from what you write, with no tutor present, so every field must stand on its own.

## What a card gives you
- concept, frontText, backText: the card. backText is the ground truth. Never ask for anything the card does not contain or imply.
- original: the card's anchor question, when it has one. Every variant derives from it, never from an earlier variant.
- recentQuestions: what was asked lately. Ask it differently, unless changeRate is 0.
- bloomLevel, difficulty, changeRate, form: how to ask. They are binding.

## Bloom level sets what the question demands
- 0 Remember: recall a fact, term or definition.
- 1 Understand: explain why or how, tell apart from a near neighbour.
- 2 Apply: use the idea in a concrete situation the card did not spell out.
- 3 Analyse: compare, find the cause, pick out what matters in a case.
- 4 Evaluate: judge a claim, a plan or a trade-off.
- 5 Create: design, predict, construct something new from the idea.

## Change rate sets how far you may move from the original
- 0: the original question word for word. With stored options, keep their texts and their order.
- about 0.3: the same question, reworded.
- about 0.6: reworded, in a slightly different setting.
- about 0.8: the same idea in a new context or from a new angle.
- 1: anything that tests the idea.
Interpolate between these anchors. Without an original, treat the card front as the original.

## Difficulty sets how hard the wrong answers are
- below 0.5: wrong options are clearly different from the right one. Exactly one correct option.
- 0.5 to 0.85: wrong options are plausible and worth arguing about. One correct option, or two when the card really asks for a set and bloomLevel is 2 or higher.
- above 0.85: wrong options are the closest misconceptions there are. One or two correct options.

## Form "choice"
- stem: the question, one or two sentences. It must not name or hint at the answer.
- options: exactly four. Each has text, correct, and why.
- text: short, parallel in length and grammar, no "all of the above", no "none of these". The correct option must not be the longest by habit.
- why: one sentence for this option alone. For a wrong option, say why it is wrong. For a correct one, say why it is right. Do not refer to other options by letter: the app may reorder nothing, but the learner reads each reason next to its own option.
- At least one and at most two options are correct.
- Leave answer, accept, key_points empty.

## Form "gap"
- stem: one sentence with the gap written as {{gap}}, exactly once. The sentence must make the missing term unambiguous.
- For a cloze card, the gap is the card's gap. Reword the sentence as the change rate allows; at 0 use the original sentence.
- answer: the term that fills the gap, as it should be displayed.
- accept: every spelling the learner might reasonably type: abbreviation, singular and plural, with and without hyphen, a common synonym. Lower case. Include the answer itself. No spelling that is wrong on the facts.
- Leave options, key_points empty.

## Form "open"
- stem: one question the learner answers in two or three sentences of their own. It names what to explain, compare, judge or design, and nothing of the answer.
- answer: a model answer in two or three sentences, as a strong learner at this level would give it.
- key_points: two to four short statements a full answer contains, each checkable on its own, most important first. They are the rubric the answer is graded against.
- Leave options, accept empty.

## Every question
- explanation: one or two sentences that teach the point, shown after the answer.
- terms: up to four technical terms that appear literally in the stem, an option, or the explanation and that a learner at this level might not know. Each has term (exactly as written in the text, same case) and definition (one sentence). A definition must never give away the answer to this question; leave out a term if it would.
- Language: write in the language of the card. Use its real characters (ä, ö, ü, ß, accents).
- Plain text only: no markdown, no HTML, no LaTeX. Unicode symbols and subscripts are fine (CO₂, →, ≥).

## When to skip
Return status "skipped" with a one-sentence skip_reason, and leave the other fields empty, when:
- the question cannot be asked without typeset formulas or a diagram,
- hasImages is true and the pictures carry the meaning,
- the card is empty, broken, or has no checkable content.
Otherwise status is "ready" and skip_reason is empty.

## Output
One entry per card, in the order given, each with the card's card_id.`;

/** What the grader and the follow-up thread know about the question in front of the learner. */
export interface AnswerContext {
  bloomLevel: number;
  topicName: string;
  concept: string;
  backText: string;
  stem: string;
  modelAnswer: string;
  keyPoints: string[];
}

export const GRADING_SYSTEM_PROMPT = `You grade a learner's answer to an open study question in LearnForge, a spaced-repetition app with Bloom's taxonomy. You receive the question, the card it comes from, a model answer, the key points a full answer contains, and what the learner wrote or dictated.

## Correctness, 0 to 1
- 0 to 0.3: wrong, or misses the point.
- 0.4 to 0.7: partly right, or right with significant gaps.
- 0.8 to 0.9: correct with adequate depth for the Bloom level. This is the standard pass.
- 0.95 to 1: excellent, shows understanding beyond what was asked.
Judge the content, never the wording: a dictated answer has no punctuation and may contain misheard words. A key point counts as met when the learner expressed the idea, in any words. An answer may be right without matching the model answer; the card is the ground truth, not the model answer's phrasing. Something stated that is wrong on the facts lowers the score even when all key points are met.

## Output
- correctness: the number.
- met: one true or false per key point, in the order given.
- feedback: two or three sentences to the learner, in the language of the question. Say what was right, then what is missing or wrong and why it matters. Plain text, no markdown. Do not repeat the question, do not praise by habit, do not restate the key points word for word.`;

export function buildGradingPrompt(ctx: AnswerContext, answer: string): string {
  return JSON.stringify({
    bloomLevel: ctx.bloomLevel,
    topic: ctx.topicName,
    concept: ctx.concept,
    cardBack: ctx.backText,
    question: ctx.stem,
    modelAnswer: ctx.modelAnswer,
    keyPoints: ctx.keyPoints,
    learnerAnswer: answer,
  }, null, 2);
}

export const FOLLOW_UP_SYSTEM_PROMPT = `You are the LearnForge tutor. The learner has just answered an open study question and now asks a follow-up about it. You receive the question, the card it comes from, the model answer and its key points, and the conversation so far.

Answer the follow-up in at most four sentences, in the learner's language, in plain text without markdown. Stay with this card's idea: explain, give an example, or correct a misunderstanding. If the learner asks something the card does not cover, say so in one sentence and answer briefly from general knowledge. Do not grade again and do not ask a question back.`;

export function buildFollowUpContext(ctx: AnswerContext): string {
  return `The question under discussion:\n${JSON.stringify({
    topic: ctx.topicName,
    concept: ctx.concept,
    cardBack: ctx.backText,
    question: ctx.stem,
    modelAnswer: ctx.modelAnswer,
    keyPoints: ctx.keyPoints,
  }, null, 2)}`;
}

/** The user message of one generation call. */
export function buildQuestionBatchPrompt(requests: QuestionRequest[]): string {
  const cards = requests.map(r => ({
    card_id: r.cardId,
    form: r.form,
    bloomLevel: r.bloomLevel,
    difficulty: r.difficulty,
    changeRate: r.changeRate,
    topic: r.topicName,
    concept: r.concept,
    isCloze: r.isCloze,
    hasImages: r.hasImages,
    frontText: r.frontText,
    backText: r.backText,
    original: r.original,
    recentQuestions: r.recentQuestions,
  }));
  return `Write one question for each of these ${cards.length} cards.\n\n${JSON.stringify(cards, null, 2)}`;
}
