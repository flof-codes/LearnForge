import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { sql, eq } from "drizzle-orm";
import { images, extFromMime } from "@learnforge/core";
import { config } from "../config.js";
import { getUserId } from "../lib/auth-helpers.js";
import archiver from "archiver";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

export default async function exportRoutes(app: FastifyInstance) {
  app.get("/export", async (req, reply) => {
    const userId = getUserId(req);

    // 1. Query all topics for the user
    const topicResult = await db.execute(sql`
      SELECT id, parent_id, name, description, created_at
      FROM topics
      WHERE user_id = ${userId}
      ORDER BY created_at
    `);

    // 2. Query all cards with bloom_state, fsrs_state, and reviews
    const cardResult = await db.execute(sql`
      SELECT c.id, c.topic_id, c.concept, c.front_html, c.back_html, c.tags,
        c.created_at, c.updated_at,
        bs.current_level, bs.highest_reached,
        fs.stability, fs.difficulty, fs.due, fs.state as fsrs_state,
        fs.last_review, fs.reps, fs.lapses,
        json_agg(json_build_object(
          'id', r.id,
          'bloomLevel', r.bloom_level,
          'rating', r.rating,
          'questionText', r.question_text,
          'answerExpected', r.answer_expected,
          'userAnswer', r.user_answer,
          'modality', r.modality,
          'reviewedAt', r.reviewed_at
        ) ORDER BY r.reviewed_at) FILTER (WHERE r.id IS NOT NULL) as reviews
      FROM cards c
      JOIN topics t ON c.topic_id = t.id
      LEFT JOIN bloom_state bs ON bs.card_id = c.id
      LEFT JOIN fsrs_state fs ON fs.card_id = c.id
      LEFT JOIN reviews r ON r.card_id = c.id
      WHERE t.user_id = ${userId}
      GROUP BY c.id, c.topic_id, c.concept, c.front_html, c.back_html, c.tags,
        c.created_at, c.updated_at,
        bs.current_level, bs.highest_reached,
        fs.stability, fs.difficulty, fs.due, fs.state, fs.last_review, fs.reps, fs.lapses
      ORDER BY c.created_at
    `);

    // 3. Query image metadata
    const imageRows = await db.select().from(images).where(eq(images.userId, userId));

    // 4. Build export JSON
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
    const topics = topicResult.rows.map((row: any) => ({
      id: row.id,
      parentId: row.parent_id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQL result rows
    const cards = cardResult.rows.map((row: any) => ({
      id: row.id,
      topicId: row.topic_id,
      concept: row.concept,
      frontHtml: row.front_html,
      backHtml: row.back_html,
      tags: row.tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      bloomState: {
        currentLevel: row.current_level ?? 0,
        highestReached: row.highest_reached ?? 0,
      },
      fsrsState: row.due
        ? {
            stability: row.stability,
            difficulty: row.difficulty,
            due: row.due,
            lastReview: row.last_review,
            reps: row.reps,
            lapses: row.lapses,
            state: row.fsrs_state,
          }
        : null,
      reviews: row.reviews ?? [],
    }));

    const imageMeta = imageRows.map((row) => ({
      id: row.id,
      cardId: row.cardId,
      filename: row.filename,
      mimeType: row.mimeType,
      createdAt: row.createdAt,
    }));

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      topics,
      cards,
      images: imageMeta,
    };

    // 5. Stream ZIP response
    const archive = archiver("zip", { zlib: { level: 6 } });

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="learnforge-export-${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "no-cache",
    });

    archive.on("error", (err) => {
      app.log.error(err, "Archive error during export");
      reply.raw.end();
    });

    archive.pipe(reply.raw);

    // Add JSON data
    archive.append(JSON.stringify(exportData, null, 2), { name: "learnforge-export.json" });

    // Add image files
    for (const img of imageRows) {
      const ext = extFromMime(img.mimeType);
      const filePath = path.join(config.imagePath, `${img.id}${ext}`);
      try {
        await stat(filePath);
        archive.append(createReadStream(filePath), { name: `images/${img.id}${ext}` });
      } catch {
        // Image file missing on disk — skip silently, metadata still in JSON
      }
    }

    await archive.finalize();
  });
}
