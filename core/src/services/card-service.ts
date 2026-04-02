import { eq, and } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { cards, bloomState, fsrsState, reviews, topics } from "../db/schema/index.js";
import { computeEmbedding, buildEmbeddingText } from "./embeddings.js";
import { createInitialFsrsState } from "./fsrs.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { validateCardHtml } from "../lib/sanitize-card-html.js";
import { verifyCardOwnership } from "../lib/card-ownership.js";
import { validateClozeData, renderClozeHtml, type ClozeData } from "../lib/cloze-parser.js";

/** All card columns except `embedding` (internal-only, never exposed to clients). */
const cardColumns = {
  id: cards.id,
  topicId: cards.topicId,
  concept: cards.concept,
  frontHtml: cards.frontHtml,
  backHtml: cards.backHtml,
  tags: cards.tags,
  cardType: cards.cardType,
  clozeData: cards.clozeData,
  createdAt: cards.createdAt,
  updatedAt: cards.updatedAt,
};

export interface CreateCardInput {
  topic_id: string;
  concept: string;
  front_html?: string;
  back_html?: string;
  tags?: string[];
  card_type?: "standard" | "cloze";
  cloze_data?: ClozeData;
}

export async function createCard(db: Db, userId: string, input: CreateCardInput) {
  const { topic_id, concept, tags, card_type, cloze_data } = input;
  let { front_html, back_html } = input;

  if (!topic_id) throw new ValidationError("topic_id is required");
  if (!concept) throw new ValidationError("concept is required");

  const cardType = card_type ?? "standard";

  // Cross-validate card_type and cloze_data
  if (cardType === "cloze" && !cloze_data) {
    throw new ValidationError("cloze_data is required for cloze cards");
  }
  if (cloze_data && cardType !== "cloze") {
    throw new ValidationError("cloze_data can only be provided for cloze cards");
  }

  if (cardType === "cloze") {
    if (!validateClozeData(cloze_data)) {
      throw new ValidationError("Invalid cloze_data structure");
    }
    const rendered = renderClozeHtml(cloze_data);
    front_html = rendered.frontHtml;
    back_html = rendered.backHtml;
  } else {
    if (!front_html) throw new ValidationError("front_html is required");
    if (!back_html) throw new ValidationError("back_html is required");
    validateCardHtml(front_html, "front_html");
    validateCardHtml(back_html, "back_html");
  }

  // Verify topic belongs to user
  const [topic] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, topic_id), eq(topics.userId, userId)));
  if (!topic) throw new NotFoundError("Topic not found");

  const embeddingText = buildEmbeddingText(concept, tags ?? [], front_html!, back_html!);
  const embedding = await computeEmbedding(embeddingText);
  const initialFsrs = createInitialFsrsState();

  const result = await db.transaction(async (tx) => {
    const [card] = await tx.insert(cards).values({
      topicId: topic_id,
      concept,
      frontHtml: front_html!,
      backHtml: back_html!,
      tags: tags ?? [],
      cardType,
      clozeData: cloze_data ?? null,
      embedding,
    }).returning(cardColumns);

    const [bloom] = await tx.insert(bloomState).values({
      cardId: card.id,
    }).returning();

    const [fsrs] = await tx.insert(fsrsState).values({
      cardId: card.id,
      stability: initialFsrs.stability,
      difficulty: initialFsrs.difficulty,
      due: initialFsrs.due,
      lastReview: initialFsrs.lastReview,
      reps: initialFsrs.reps,
      lapses: initialFsrs.lapses,
      state: initialFsrs.state,
    }).returning();

    return { ...card, bloomState: bloom, fsrsState: fsrs };
  });

  return result;
}

export async function getCard(db: Db, userId: string, cardId: string) {
  // Single JOIN: card + ownership check + bloom + fsrs (replaces 4 sequential queries)
  const [row] = await db
    .select({
      id: cards.id,
      topicId: cards.topicId,
      concept: cards.concept,
      frontHtml: cards.frontHtml,
      backHtml: cards.backHtml,
      tags: cards.tags,
      cardType: cards.cardType,
      clozeData: cards.clozeData,
      createdAt: cards.createdAt,
      updatedAt: cards.updatedAt,
      bloomCardId: bloomState.cardId,
      bloomCurrentLevel: bloomState.currentLevel,
      bloomHighestReached: bloomState.highestReached,
      bloomUpdatedAt: bloomState.updatedAt,
      fsrsCardId: fsrsState.cardId,
      fsrsStability: fsrsState.stability,
      fsrsDifficulty: fsrsState.difficulty,
      fsrsDue: fsrsState.due,
      fsrsLastReview: fsrsState.lastReview,
      fsrsReps: fsrsState.reps,
      fsrsLapses: fsrsState.lapses,
      fsrsState: fsrsState.state,
    })
    .from(cards)
    .innerJoin(topics, eq(cards.topicId, topics.id))
    .leftJoin(bloomState, eq(bloomState.cardId, cards.id))
    .leftJoin(fsrsState, eq(fsrsState.cardId, cards.id))
    .where(and(eq(cards.id, cardId), eq(topics.userId, userId)));

  if (!row) throw new NotFoundError("Card not found");

  const bloom = row.bloomCardId != null
    ? { cardId: row.bloomCardId, currentLevel: row.bloomCurrentLevel!, highestReached: row.bloomHighestReached!, updatedAt: row.bloomUpdatedAt! }
    : null;

  const fsrs = row.fsrsCardId != null
    ? { cardId: row.fsrsCardId, stability: row.fsrsStability!, difficulty: row.fsrsDifficulty!, due: row.fsrsDue!, lastReview: row.fsrsLastReview, reps: row.fsrsReps!, lapses: row.fsrsLapses!, state: row.fsrsState! }
    : null;

  const cardReviews = await db.select().from(reviews).where(eq(reviews.cardId, cardId));

  return {
    id: row.id,
    topicId: row.topicId,
    concept: row.concept,
    frontHtml: row.frontHtml,
    backHtml: row.backHtml,
    tags: row.tags,
    cardType: row.cardType,
    clozeData: row.clozeData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    bloomState: bloom,
    fsrsState: fsrs,
    reviews: cardReviews,
  };
}

export interface UpdateCardInput {
  concept?: string;
  front_html?: string;
  back_html?: string;
  tags?: string[];
  topic_id?: string;
  cloze_data?: ClozeData;
}

export async function updateCard(db: Db, userId: string, cardId: string, input: UpdateCardInput) {
  const { concept, tags, topic_id, cloze_data } = input;
  let { front_html, back_html } = input;

  await verifyCardOwnership(db, cardId, userId);

  // If topic_id is being changed, verify new topic belongs to user
  if (topic_id !== undefined) {
    const [newTopic] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, topic_id), eq(topics.userId, userId)));
    if (!newTopic) throw new NotFoundError("Topic not found");
  }

  // Fetch current card to check card type when cloze_data is provided
  const [currentCard] = await db.select(cardColumns).from(cards).where(eq(cards.id, cardId));
  if (!currentCard) throw new NotFoundError("Card not found");

  // Handle cloze_data updates
  if (cloze_data !== undefined) {
    if (currentCard.cardType !== "cloze") {
      throw new ValidationError("cloze_data can only be updated on cloze cards");
    }
    if (!validateClozeData(cloze_data)) {
      throw new ValidationError("Invalid cloze_data structure");
    }
    const rendered = renderClozeHtml(cloze_data);
    front_html = rendered.frontHtml;
    back_html = rendered.backHtml;
  }

  if (currentCard.cardType !== "cloze") {
    if (front_html !== undefined) validateCardHtml(front_html, "front_html");
    if (back_html !== undefined) validateCardHtml(back_html, "back_html");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle .set() partial update
  const updates: Record<string, any> = {};
  if (concept !== undefined) updates.concept = concept;
  if (front_html !== undefined) updates.frontHtml = front_html;
  if (back_html !== undefined) updates.backHtml = back_html;
  if (tags !== undefined) updates.tags = tags;
  if (topic_id !== undefined) updates.topicId = topic_id;
  if (cloze_data !== undefined) updates.clozeData = cloze_data;

  if (concept !== undefined || front_html !== undefined || back_html !== undefined || tags !== undefined) {
    const finalConcept = concept ?? currentCard.concept;
    const finalTags = tags ?? currentCard.tags ?? [];
    const finalFront = front_html ?? currentCard.frontHtml;
    const finalBack = back_html ?? currentCard.backHtml;
    updates.embedding = await computeEmbedding(buildEmbeddingText(finalConcept, finalTags, finalFront, finalBack));
  }

  const [updated] = await db.update(cards).set(updates).where(eq(cards.id, cardId)).returning(cardColumns);
  if (!updated) throw new NotFoundError("Card not found");

  return updated;
}

export async function deleteCard(db: Db, userId: string, cardId: string) {
  await verifyCardOwnership(db, cardId, userId);

  const [deleted] = await db.delete(cards).where(eq(cards.id, cardId)).returning(cardColumns);
  if (!deleted) throw new NotFoundError("Card not found");

  return deleted;
}

export async function resetCard(db: Db, userId: string, cardId: string) {
  await verifyCardOwnership(db, cardId, userId);

  const [card] = await db.select(cardColumns).from(cards).where(eq(cards.id, cardId));
  if (!card) throw new NotFoundError("Card not found");

  const initialFsrs = createInitialFsrsState();

  const result = await db.transaction(async (tx) => {
    const [bloom] = await tx
      .update(bloomState)
      .set({ currentLevel: 0, highestReached: 0, updatedAt: new Date() })
      .where(eq(bloomState.cardId, cardId))
      .returning();

    const [fsrs] = await tx
      .update(fsrsState)
      .set({
        stability: initialFsrs.stability,
        difficulty: initialFsrs.difficulty,
        due: initialFsrs.due,
        lastReview: initialFsrs.lastReview,
        reps: initialFsrs.reps,
        lapses: initialFsrs.lapses,
        state: initialFsrs.state,
      })
      .where(eq(fsrsState.cardId, cardId))
      .returning();

    await tx.delete(reviews).where(eq(reviews.cardId, cardId));

    return { ...card, bloomState: bloom, fsrsState: fsrs, reviews: [] };
  });

  return result;
}
