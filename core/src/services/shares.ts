import { randomBytes } from "node:crypto";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { eq, and, or, isNull, sql, inArray } from "drizzle-orm";
import { textArray } from "../lib/sql-array.js";
import type { Db } from "../db/types.js";
import { shareLinks, topics, cards, bloomState, fsrsState, images } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { extFromMime } from "../lib/image-utils.js";
import { createInitialFsrsState } from "./fsrs.js";
import { loadTopicRates, resolveTopicRate } from "./change-rate.js";
import { getNoteType, listNoteTypes, ensureBuiltinTypes, saveNoteType, type NoteType } from "./note-types.js";

const IMAGE_REF = /\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createShareLink(db: Db, userId: string, topicId: string) {
  const [topic] = await db
    .select({ id: topics.id })
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.userId, userId)));
  if (!topic) throw new NotFoundError("Topic not found");

  const [created] = await db
    .insert(shareLinks)
    .values({ token: generateToken(), topicId, ownerId: userId })
    .returning();

  return created;
}

export async function listShareLinks(db: Db, userId: string) {
  const rows = await db
    .select({
      id: shareLinks.id,
      token: shareLinks.token,
      topicId: shareLinks.topicId,
      topicName: topics.name,
      createdAt: shareLinks.createdAt,
      revokedAt: shareLinks.revokedAt,
    })
    .from(shareLinks)
    .innerJoin(topics, eq(topics.id, shareLinks.topicId))
    .where(eq(shareLinks.ownerId, userId));

  return rows;
}

export async function revokeShareLink(db: Db, userId: string, shareId: string) {
  const [revoked] = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, shareId), eq(shareLinks.ownerId, userId), isNull(shareLinks.revokedAt)))
    .returning();
  if (!revoked) throw new NotFoundError("Share link not found");
  return revoked;
}

export interface SharePreview {
  topicName: string;
  topicDescription: string | null;
  cardCount: number;
  subtopicCount: number;
}

export async function getSharePreview(db: Db, token: string): Promise<SharePreview> {
  const result = await db.execute<{
    topic_id: string;
    topic_name: string;
    topic_description: string | null;
    card_count: number;
    subtopic_count: number;
  }>(sql`
    WITH RECURSIVE tree AS (
      SELECT t.id FROM topics t
      INNER JOIN share_links sl ON sl.topic_id = t.id
      WHERE sl.token = ${token} AND sl.revoked_at IS NULL
      UNION ALL
      SELECT ch.id FROM topics ch JOIN tree tr ON ch.parent_id = tr.id
    )
    SELECT
      t.id AS topic_id,
      t.name AS topic_name,
      t.description AS topic_description,
      (SELECT count(*)::int FROM cards WHERE topic_id IN (SELECT id FROM tree)) AS card_count,
      (SELECT count(*)::int FROM tree) - 1 AS subtopic_count
    FROM share_links sl
    INNER JOIN topics t ON t.id = sl.topic_id
    WHERE sl.token = ${token} AND sl.revoked_at IS NULL
  `);

  if (result.rows.length === 0) throw new NotFoundError("Share link not found or revoked");
  const r = result.rows[0];
  return {
    topicName: r.topic_name,
    topicDescription: r.topic_description,
    cardCount: r.card_count,
    subtopicCount: r.subtopic_count,
  };
}

type SourceTopic = {
  id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  change_rate: number | null;
};


export interface AcceptShareOptions {
  imagePath: string;
}

export async function acceptShareLink(
  db: Db,
  recipientUserId: string,
  token: string,
  options: AcceptShareOptions,
): Promise<{ topicId: string }> {
  const [link] = await db
    .select({
      id: shareLinks.id,
      topicId: shareLinks.topicId,
      ownerId: shareLinks.ownerId,
      revokedAt: shareLinks.revokedAt,
    })
    .from(shareLinks)
    .where(eq(shareLinks.token, token));

  if (!link || link.revokedAt) throw new NotFoundError("Share link not found or revoked");
  if (link.ownerId === recipientUserId) throw new ValidationError("You cannot import your own share link");

  const topicRows = await db.execute<SourceTopic>(sql`
    WITH RECURSIVE tree AS (
      SELECT id, parent_id, name, description, change_rate FROM topics
      WHERE id = ${link.topicId} AND user_id = ${link.ownerId}
      UNION ALL
      SELECT t.id, t.parent_id, t.name, t.description, t.change_rate
      FROM topics t JOIN tree tr ON t.parent_id = tr.id
      WHERE t.user_id = ${link.ownerId}
    )
    SELECT id, parent_id, name, description, change_rate FROM tree
  `);

  if (topicRows.rows.length === 0) throw new NotFoundError("Source topic not found");

  const topicIds = topicRows.rows.map(r => r.id);

  const sourceCards = topicIds.length > 0
    ? await db.select().from(cards).where(inArray(cards.topicId, topicIds))
    : [];

  const cardIds = sourceCards.map(c => c.id);

  // Typed cards render from notes; copy each note once with its type. An
  // uncustomized built-in maps onto the recipient's own copy, anything else is cloned.
  const sourceNoteIds = [...new Set(sourceCards.map(c => c.noteId).filter((id): id is string => !!id))];
  const sourceNotes = sourceNoteIds.length > 0
    ? await db.execute<{ id: string; note_type_id: string; topic_id: string; fields: Record<string, string>; tags: string[] | null; anki_guid: string | null }>(sql`
        SELECT id, note_type_id, topic_id, fields, tags, anki_guid FROM notes WHERE id IN (${sql.join(sourceNoteIds.map(id => sql`${id}::uuid`), sql`, `)})
      `)
    : { rows: [] };
  const sourceTypeIds = [...new Set(sourceNotes.rows.map(n => n.note_type_id))];
  const sourceTypes = new Map<string, NoteType>();
  for (const id of sourceTypeIds) sourceTypes.set(id, await getNoteType(db, link.ownerId, id));
  await ensureBuiltinTypes(db, recipientUserId);
  const recipientTypes = await listNoteTypes(db, recipientUserId);

  // Media travel when a card owns them or when anything copied references them:
  // imported Anki media are shared by many notes and belong to no single card.
  const referenced = new Set<string>();
  const scan = (text: string | null | undefined) => {
    for (const m of (text ?? "").matchAll(IMAGE_REF)) referenced.add(m[1].toLowerCase());
  };
  for (const c of sourceCards) { scan(c.frontHtml); scan(c.backHtml); }
  for (const n of sourceNotes.rows) scan(JSON.stringify(n.fields));
  for (const t of sourceTypes.values()) { scan(t.css); for (const x of t.templates) { scan(x.frontTemplate); scan(x.backTemplate); } }
  const sourceImages = cardIds.length > 0 || referenced.size > 0
    ? await db.select().from(images).where(and(
        eq(images.userId, link.ownerId),
        or(
          cardIds.length > 0 ? inArray(images.cardId, cardIds) : undefined,
          referenced.size > 0 ? inArray(images.id, [...referenced]) : undefined,
        ),
      ))
    : [];

  const initialFsrs = createInitialFsrsState();

  // The recipient has none of the owner's ancestor topics, so the copied root
  // carries the rate the source root inherited. Overrides below it travel as they are.
  const ownerTopicRates = await loadTopicRates(db, link.ownerId);
  const rootEffective = resolveTopicRate(link.topicId, ownerTopicRates);

  const result = await db.transaction(async (tx) => {
    const topicIdMap = new Map<string, string>();
    const topicsByParent = new Map<string | null, SourceTopic[]>();
    for (const t of topicRows.rows) {
      const key = t.id === link.topicId ? "__ROOT__" : t.parent_id;
      if (!topicsByParent.has(key)) topicsByParent.set(key, []);
      topicsByParent.get(key)!.push(t);
    }

    const order: SourceTopic[] = [];
    const rootTopic = topicRows.rows.find(t => t.id === link.topicId)!;
    const queue: SourceTopic[] = [rootTopic];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);
      const children = topicsByParent.get(current.id) ?? [];
      queue.push(...children);
    }

    for (const src of order) {
      const isRoot = src.id === link.topicId;
      const newParentId = isRoot ? null : topicIdMap.get(src.parent_id!) ?? null;
      const [inserted] = await tx
        .insert(topics)
        .values({
          name: src.name,
          description: src.description,
          parentId: newParentId,
          userId: recipientUserId,
          changeRate: isRoot
            ? (rootEffective.rateSource === "default" ? null : rootEffective.changeRate)
            : src.change_rate,
        })
        .returning({ id: topics.id });
      topicIdMap.set(src.id, inserted.id);
    }

    // Note types: reuse the recipient's untouched built-in, otherwise clone.
    const typeIdMap = new Map<string, NoteType>();
    for (const [srcId, srcType] of sourceTypes) {
      const own = srcType.builtinKey && !srcType.customized
        ? recipientTypes.find(t => t.builtinKey === srcType.builtinKey)
        : undefined;
      if (own) { typeIdMap.set(srcId, own); continue; }
      const cloned = await saveNoteType(tx, recipientUserId, {
        name: srcType.name, kind: srcType.kind, css: srcType.css, sortFieldKey: srcType.sortFieldKey,
        fields: srcType.fields.map(f => ({ key: f.key, name: f.name })),
        templates: srcType.templates.map(t => ({ name: t.name, frontTemplate: t.frontTemplate, backTemplate: t.backTemplate })),
      });
      typeIdMap.set(srcId, cloned);
    }
    const noteIdMap = new Map<string, string>();
    for (const n of sourceNotes.rows) {
      const newTopicId = topicIdMap.get(n.topic_id);
      const type = typeIdMap.get(n.note_type_id);
      if (!newTopicId || !type) continue;
      const ins = await tx.execute<{ id: string }>(sql`
        INSERT INTO notes (user_id, note_type_id, topic_id, fields, tags, anki_guid)
        VALUES (${recipientUserId}, ${type.id}, ${newTopicId}, ${JSON.stringify(n.fields)}::jsonb, ${textArray(n.tags ?? [])},
                -- the recipient may already hold this guid from an own import; a guid names one note per user
                CASE WHEN EXISTS (SELECT 1 FROM notes WHERE user_id = ${recipientUserId} AND anki_guid = ${n.anki_guid}) THEN NULL ELSE ${n.anki_guid}::text END)
        RETURNING id
      `);
      noteIdMap.set(n.id, ins.rows[0].id);
    }

    const cardIdMap = new Map<string, string>();
    for (const srcCard of sourceCards) {
      const newTopicId = topicIdMap.get(srcCard.topicId);
      if (!newTopicId) continue;
      const newNoteId = srcCard.noteId ? noteIdMap.get(srcCard.noteId) ?? null : null;
      const srcType = srcCard.noteId ? sourceTypes.get(sourceNotes.rows.find(n => n.id === srcCard.noteId)?.note_type_id ?? "") : undefined;
      const srcTemplate = srcType?.templates.find(t => t.id === srcCard.templateId);
      const newType = srcType ? typeIdMap.get(srcType.id) : undefined;
      const newTemplateId = srcTemplate && newType ? newType.templates.find(t => t.ord === srcTemplate.ord)?.id ?? null : null;
      const [insertedCard] = await tx
        .insert(cards)
        .values({
          topicId: newTopicId,
          concept: srcCard.concept,
          frontHtml: srcCard.frontHtml,
          backHtml: srcCard.backHtml,
          tags: srcCard.tags ?? [],
          cardType: srcCard.cardType,
          clozeData: srcCard.clozeData,
          changeRate: srcCard.changeRate,
          noteId: newNoteId,
          templateId: newNoteId ? newTemplateId : null,
          clozeNumber: srcCard.clozeNumber,
          suspended: srcCard.suspended,
          suspendedBy: srcCard.suspendedBy,
          rendererVersion: srcCard.rendererVersion,
          embedding: srcCard.embedding ?? undefined,
        })
        .returning({ id: cards.id });
      cardIdMap.set(srcCard.id, insertedCard.id);

      await tx.insert(bloomState).values({
        cardId: insertedCard.id,
        currentLevel: 0,
        highestReached: 0,
      });

      await tx.insert(fsrsState).values({
        cardId: insertedCard.id,
        stability: initialFsrs.stability,
        difficulty: initialFsrs.difficulty,
        due: initialFsrs.due,
        lastReview: initialFsrs.lastReview,
        reps: initialFsrs.reps,
        lapses: initialFsrs.lapses,
        state: initialFsrs.state,
      });
    }

    const newTopicIds = [...topicIdMap.values()];
    const newNoteIds = [...noteIdMap.values()];
    const clonedTypeIds = [...new Set([...typeIdMap.entries()].filter(([, t]) => !t.builtinKey).map(([, t]) => t.id))];
    for (const img of sourceImages) {
      const newCardId = img.cardId ? cardIdMap.get(img.cardId) ?? null : null;
      if (img.cardId && !newCardId && !referenced.has(img.id)) continue;
      const [newImage] = await tx
        .insert(images)
        .values({
          cardId: newCardId,
          userId: recipientUserId,
          filename: img.filename,
          mimeType: img.mimeType,
          contentHash: img.contentHash,
          sizeBytes: img.sizeBytes,
        })
        .returning({ id: images.id });

      const ext = extFromMime(img.mimeType);
      const srcPath = path.join(options.imagePath, `${img.id}${ext}`);
      const dstPath = path.join(options.imagePath, `${newImage.id}${ext}`);
      try {
        await copyFile(srcPath, dstPath);
      } catch {
        // Source file missing on disk — recipient's card will show broken image.
        // Continue rather than fail the whole import.
      }

      const oldUrl = `/images/${img.id}`;
      const newUrl = `/images/${newImage.id}`;
      const like = `%${oldUrl}%`;
      await tx.execute(sql`
        UPDATE cards
        SET front_html = REPLACE(front_html, ${oldUrl}, ${newUrl}),
            back_html = REPLACE(back_html, ${oldUrl}, ${newUrl})
        WHERE topic_id = ANY(${textArray(newTopicIds)}::uuid[]) AND (front_html LIKE ${like} OR back_html LIKE ${like})
      `);
      // Note fields and cloned designs carry the same URLs.
      if (newNoteIds.length > 0) {
        await tx.execute(sql`
          UPDATE notes SET fields = REPLACE(fields::text, ${oldUrl}, ${newUrl})::jsonb
          WHERE id = ANY(${textArray(newNoteIds)}::uuid[]) AND fields::text LIKE ${like}
        `);
      }
      if (clonedTypeIds.length > 0) {
        await tx.execute(sql`UPDATE note_types SET css = REPLACE(css, ${oldUrl}, ${newUrl}) WHERE id = ANY(${textArray(clonedTypeIds)}::uuid[]) AND css LIKE ${like}`);
        await tx.execute(sql`
          UPDATE card_templates SET front_template = REPLACE(front_template, ${oldUrl}, ${newUrl}), back_template = REPLACE(back_template, ${oldUrl}, ${newUrl})
          WHERE note_type_id = ANY(${textArray(clonedTypeIds)}::uuid[]) AND (front_template LIKE ${like} OR back_template LIKE ${like})
        `);
      }
    }

    return { topicId: topicIdMap.get(link.topicId)! };
  });

  return result;
}
