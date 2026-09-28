import { eq, and } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { cards, bloomState, fsrsState, reviews, topics } from "../db/schema/index.js";
import { computeEmbedding, buildEmbeddingText } from "./embeddings.js";
import { createInitialFsrsState } from "./fsrs.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { validateCardHtml } from "../lib/sanitize-card-html.js";
import { verifyCardOwnership } from "../lib/card-ownership.js";
import { validateClozeData, renderClozeHtml, type ClozeData } from "../lib/cloze-parser.js";
import { markOriginalStale, getCurrentOriginals } from "./originals-service.js";
import { createNote, updateNote } from "./note-service.js";
import { stripHtml } from "../lib/strip-html.js";
import { loadTopicRates, resolveCardRate, resolveTopicRate, validateChangeRate } from "./change-rate.js";
import { sql } from "drizzle-orm";

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
  changeRate: cards.changeRate,
  currentOriginalId: cards.currentOriginalId,
  noteId: cards.noteId,
  templateId: cards.templateId,
  clozeNumber: cards.clozeNumber,
  suspended: cards.suspended,
  suspendedBy: cards.suspendedBy,
  createdAt: cards.createdAt,
  updatedAt: cards.updatedAt,
};

const MAX_CONCEPT = 200;

/** `concept` is optional since release 2; a missing one is the first line of text on the front. */
function conceptFromFront(frontHtml: string): string {
  return stripHtml(frontHtml).replace(/\s+/g, " ").trim().slice(0, MAX_CONCEPT) || "Card";
}

export interface CreateCardInput {
  topic_id: string;
  concept?: string;
  front_html?: string;
  back_html?: string;
  tags?: string[];
  card_type?: "standard" | "cloze";
  cloze_data?: ClozeData;
}

export async function createCard(db: Db, userId: string, input: CreateCardInput) {
  const { topic_id, tags, card_type, cloze_data } = input;
  const { front_html, back_html } = input;

  if (!topic_id) throw new ValidationError("topic_id is required");
  if (input.concept !== undefined && !input.concept.trim()) throw new ValidationError("concept must not be empty");

  const cardType = card_type ?? "standard";

  // Cross-validate card_type and cloze_data
  if (cardType === "cloze" && !cloze_data) {
    throw new ValidationError("cloze_data is required for cloze cards");
  }
  if (cloze_data && cardType !== "cloze") {
    throw new ValidationError("cloze_data can only be provided for cloze cards");
  }

  if (cardType === "cloze") {
    // Since release 2 a cloze is a Cloze note with one card per gap; the first
    // card is returned with its siblings so the old callers keep working.
    if (!validateClozeData(cloze_data)) {
      throw new ValidationError("Invalid cloze_data structure");
    }
    const note = await createNote(db, userId, {
      topic_id, note_type: "cloze", fields: { Text: escapeClozeSource(cloze_data.sourceText) }, tags, concept: input.concept,
    });
    const first = await getCard(db, userId, note.cards[0].id);
    return { ...first, siblingIds: note.cards.map(c => c.id), noteId: note.id };
  } else {
    if (!front_html) throw new ValidationError("front_html is required");
    if (!back_html) throw new ValidationError("back_html is required");
    validateCardHtml(front_html, "front_html");
    validateCardHtml(back_html, "back_html");
  }

  // Verify topic belongs to user
  const [topic] = await db.select({ id: topics.id }).from(topics).where(and(eq(topics.id, topic_id), eq(topics.userId, userId)));
  if (!topic) throw new NotFoundError("Topic not found");

  const concept = (input.concept?.trim() || conceptFromFront(front_html!)).slice(0, MAX_CONCEPT);
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

/** Old cloze sources were plain text; note fields are HTML. */
function escapeClozeSource(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      changeRate: cards.changeRate,
      noteId: cards.noteId,
      templateId: cards.templateId,
      clozeNumber: cards.clozeNumber,
      suspended: cards.suspended,
      suspendedBy: cards.suspendedBy,
      createdAt: cards.createdAt,
      updatedAt: cards.updatedAt,
      bloomCardId: bloomState.cardId,
      bloomCurrentLevel: bloomState.currentLevel,
      bloomHighestReached: bloomState.highestReached,
      bloomProgress: bloomState.progress,
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
    ? { cardId: row.bloomCardId, currentLevel: row.bloomCurrentLevel!, highestReached: row.bloomHighestReached!, progress: row.bloomProgress ?? 0, updatedAt: row.bloomUpdatedAt! }
    : null;

  const fsrs = row.fsrsCardId != null
    ? { cardId: row.fsrsCardId, stability: row.fsrsStability!, difficulty: row.fsrsDifficulty!, due: row.fsrsDue!, lastReview: row.fsrsLastReview, reps: row.fsrsReps!, lapses: row.fsrsLapses!, state: row.fsrsState! }
    : null;

  const cardReviews = await db.select().from(reviews).where(eq(reviews.cardId, cardId));
  const topicRates = await loadTopicRates(db, userId);
  const effective = resolveCardRate({ changeRate: row.changeRate, topicId: row.topicId }, topicRates);
  const inherited = resolveTopicRate(row.topicId, topicRates);
  const originals = await getCurrentOriginals(db, userId, [cardId]);
  const note = row.noteId ? await noteSummary(db, row.noteId) : null;

  return {
    id: row.id,
    topicId: row.topicId,
    concept: row.concept,
    frontHtml: row.frontHtml,
    backHtml: row.backHtml,
    tags: row.tags,
    cardType: row.cardType,
    clozeData: row.clozeData,
    noteId: row.noteId,
    templateId: row.templateId,
    clozeNumber: row.clozeNumber,
    suspended: row.suspended,
    suspendedBy: row.suspendedBy,
    note,
    changeRate: row.changeRate,
    effectiveChangeRate: effective.changeRate,
    rateSource: effective.rateSource,
    inheritedChangeRate: inherited.changeRate,
    inheritedFrom: inherited.sourceTopicName,
    original: originals.get(cardId) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    bloomState: bloom,
    fsrsState: fsrs,
    reviews: cardReviews,
  };
}

/** Type, template and siblings of a typed card, for the detail view. */
async function noteSummary(db: Db, noteId: string) {
  const rows = await db.execute<{ id: string; note_type_id: string; type_name: string; type_kind: string; fields: Record<string, string>; field_defs: Array<{ key: string; name: string; ord: number }> }>(sql`
    SELECT n.id, n.note_type_id, nt.name AS type_name, nt.kind AS type_kind, n.fields,
      (SELECT json_agg(json_build_object('key', f.key, 'name', f.name, 'ord', f.ord) ORDER BY f.ord) FROM note_type_fields f WHERE f.note_type_id = nt.id) AS field_defs
    FROM notes n JOIN note_types nt ON nt.id = n.note_type_id WHERE n.id = ${noteId}
  `);
  const n = rows.rows[0];
  if (!n) return null;
  const siblings = await db.execute<{ id: string; template_name: string | null; cloze_number: number; suspended: boolean }>(sql`
    SELECT c.id, ct.name AS template_name, c.cloze_number, c.suspended
    FROM cards c LEFT JOIN card_templates ct ON ct.id = c.template_id
    WHERE c.note_id = ${noteId} ORDER BY ct.ord NULLS LAST, c.cloze_number
  `);
  return {
    id: n.id, noteTypeId: n.note_type_id, noteTypeName: n.type_name, noteTypeKind: n.type_kind, fields: n.fields,
    fieldDefs: n.field_defs ?? [],
    siblings: siblings.rows.map(sb => ({ id: sb.id, templateName: sb.template_name, clozeNumber: sb.cloze_number, suspended: sb.suspended })),
  };
}

export interface UpdateCardInput {
  concept?: string;
  front_html?: string;
  back_html?: string;
  tags?: string[];
  topic_id?: string;
  cloze_data?: ClozeData;
  /** 0..1 question variation for this card; null re-inherits from the topic. */
  change_rate?: number | null;
}

export async function updateCard(db: Db, userId: string, cardId: string, input: UpdateCardInput) {
  const { concept, tags, topic_id, cloze_data, change_rate } = input;
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

  // Typed cards render from their note: content, concept and tags change there.
  // The topic moves the whole note, so siblings never split.
  if (currentCard.noteId) {
    if (concept !== undefined || front_html !== undefined || back_html !== undefined || tags !== undefined || cloze_data !== undefined) {
      throw new ValidationError("This card belongs to a note; edit its fields, tags or concept through the note");
    }
    if (topic_id !== undefined) {
      // {{Deck}} is part of the rendered HTML, so the note renders again.
      await updateNote(db, userId, currentCard.noteId, { topic_id });
    }
    if (change_rate !== undefined) {
      await db.execute(sql`UPDATE cards SET change_rate = ${validateChangeRate(change_rate)} WHERE id = ${cardId}`);
    }
    const [updated] = await db.select(cardColumns).from(cards).where(eq(cards.id, cardId));
    return updated;
  }

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
  if (change_rate !== undefined) updates.changeRate = validateChangeRate(change_rate);

  if (concept !== undefined || front_html !== undefined || back_html !== undefined || tags !== undefined) {
    const finalConcept = concept ?? currentCard.concept;
    const finalTags = tags ?? currentCard.tags ?? [];
    const finalFront = front_html ?? currentCard.frontHtml;
    const finalBack = back_html ?? currentCard.backHtml;
    updates.embedding = await computeEmbedding(buildEmbeddingText(finalConcept, finalTags, finalFront, finalBack));
  }

  const [updated] = await db.update(cards).set(updates).where(eq(cards.id, cardId)).returning(cardColumns);
  if (!updated) throw new NotFoundError("Card not found");

  // The tutor's original question may no longer match the edited content, and
  // neither does a question compiled for the glasses from the old content.
  if (concept !== undefined || front_html !== undefined || back_html !== undefined || cloze_data !== undefined) {
    await markOriginalStale(db, userId, cardId);
    await db.execute(sql`DELETE FROM glasses_questions WHERE card_id = ${cardId}`);
  }

  return updated;
}

export async function deleteCard(db: Db, userId: string, cardId: string) {
  await verifyCardOwnership(db, cardId, userId);

  // A typed card is one rendering of its note. As in Anki, deleting it deletes
  // the note and every sibling; suspending a single gap happens through the note.
  const [typed] = await db.select(cardColumns).from(cards).where(eq(cards.id, cardId));
  if (typed?.noteId) {
    await db.execute(sql`DELETE FROM notes WHERE id = ${typed.noteId}`);
    return typed;
  }

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
      .set({ currentLevel: 0, highestReached: 0, progress: 0, updatedAt: new Date() })
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
    // Open tickets would compare a NULL last_review against NULL and look valid again.
    await tx.execute(sql`DELETE FROM study_questions WHERE card_id = ${cardId}`);

    return { ...card, bloomState: bloom, fsrsState: fsrs, reviews: [] };
  });

  return result;
}
