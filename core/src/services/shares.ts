import { randomBytes } from "node:crypto";
import { copyFile } from "node:fs/promises";
import path from "node:path";
import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import type { Db } from "../db/types.js";
import { shareLinks, topics, cards, bloomState, fsrsState, images } from "../db/schema/index.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { extFromMime } from "../lib/image-utils.js";
import { createInitialFsrsState } from "./fsrs.js";

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
      SELECT id, parent_id, name, description FROM topics
      WHERE id = ${link.topicId} AND user_id = ${link.ownerId}
      UNION ALL
      SELECT t.id, t.parent_id, t.name, t.description
      FROM topics t JOIN tree tr ON t.parent_id = tr.id
      WHERE t.user_id = ${link.ownerId}
    )
    SELECT id, parent_id, name, description FROM tree
  `);

  if (topicRows.rows.length === 0) throw new NotFoundError("Source topic not found");

  const topicIds = topicRows.rows.map(r => r.id);

  const sourceCards = topicIds.length > 0
    ? await db.select().from(cards).where(inArray(cards.topicId, topicIds))
    : [];

  const cardIds = sourceCards.map(c => c.id);

  const sourceImages = cardIds.length > 0
    ? await db.select().from(images).where(inArray(images.cardId, cardIds))
    : [];

  const initialFsrs = createInitialFsrsState();

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
        })
        .returning({ id: topics.id });
      topicIdMap.set(src.id, inserted.id);
    }

    const cardIdMap = new Map<string, string>();
    for (const srcCard of sourceCards) {
      const newTopicId = topicIdMap.get(srcCard.topicId);
      if (!newTopicId) continue;
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

    for (const img of sourceImages) {
      if (!img.cardId) continue;
      const newCardId = cardIdMap.get(img.cardId);
      if (!newCardId) continue;
      const [newImage] = await tx
        .insert(images)
        .values({
          cardId: newCardId,
          userId: recipientUserId,
          filename: img.filename,
          mimeType: img.mimeType,
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
      await tx.execute(sql`
        UPDATE cards
        SET front_html = REPLACE(front_html, ${oldUrl}, ${newUrl}),
            back_html = REPLACE(back_html, ${oldUrl}, ${newUrl})
        WHERE id = ${newCardId}
      `);
    }

    return { topicId: topicIdMap.get(link.topicId)! };
  });

  return result;
}
