import { type FastifyInstance, type FastifyReply } from "fastify";
import "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, unlink, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import { db } from "../db/connection.js";
import { images, extFromMime, verifyMediaSignature } from "@learnforge/core";
import { config, mediaUrlSecret } from "../config.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { getUserId } from "../lib/auth-helpers.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ensureImageDir(): Promise<void> {
  await mkdir(config.imagePath, { recursive: true });
}

/**
 * Streams a stored file. SVG may not run scripts; files of unknown type
 * (kept from Anki packages for a lossless round trip) only download.
 */
async function sendStoredFile(reply: FastifyReply, row: { id: string; mimeType: string; filename: string }) {
  const filePath = path.join(config.imagePath, `${row.id}${extFromMime(row.mimeType)}`);
  try {
    await stat(filePath);
  } catch {
    throw new NotFoundError(`Image file for ${row.id} not found on disk`);
  }
  if (row.mimeType === "image/svg+xml") {
    reply.header("Content-Security-Policy", "script-src 'none'");
  }
  if (row.mimeType === "application/octet-stream") {
    reply.header("Content-Disposition", "attachment");
  }
  return reply
    .type(row.mimeType)
    .header("Cache-Control", "public, max-age=31536000, immutable")
    .header("X-Content-Type-Options", "nosniff")
    .send(createReadStream(filePath));
}

export default async function imageRoutes(app: FastifyInstance) {
  // POST /images  —  multipart file upload
  app.post("/images", async (request, reply) => {
    const data = await request.file();
    if (!data) {
      throw new ValidationError("No file uploaded");
    }

    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      throw new ValidationError(
        `Unsupported mime type: ${data.mimetype}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
      );
    }

    const userId = getUserId(request);

    // Extract optional card_id from fields (accept both snake_case and camelCase)
    const cardIdField = data.fields["card_id"] ?? data.fields["cardId"];
    let cardId: string | null = null;
    if (
      cardIdField &&
      "value" in cardIdField &&
      typeof cardIdField.value === "string" &&
      cardIdField.value.length > 0
    ) {
      cardId = cardIdField.value;
    }

    await ensureImageDir();

    const fileId = randomUUID();
    const ext = extFromMime(data.mimetype);
    const storedFilename = `${fileId}${ext}`;
    const filePath = path.join(config.imagePath, storedFilename);

    // Stream the upload to disk
    await pipeline(data.file, createWriteStream(filePath));

    // Check if the stream was truncated (exceeded size limit)
    if (data.file.truncated) {
      await unlink(filePath).catch(() => {});
      throw new ValidationError(`File exceeds maximum size of ${MAX_FILE_SIZE} bytes`);
    }

    // Insert DB record (store original filename, not the on-disk UUID name)
    const [row] = await db
      .insert(images)
      .values({
        id: fileId,
        cardId,
        userId,
        filename: data.filename,
        mimeType: data.mimetype,
        sizeBytes: (await stat(filePath)).size, // counts toward the per-user media quota
      })
      .returning();

    return reply.code(201).send({
      id: row.id,
      url: `/images/${row.id}`,
      cardId: row.cardId,
      filename: row.filename,
      mimeType: row.mimeType,
      createdAt: row.createdAt,
    });
  });

  // GET /images/:id  —  stream the image file
  app.get<{ Params: { id: string } }>("/images/:id", async (request, reply) => {
    const { id } = request.params;
    const userId = getUserId(request);

    const [row] = await db
      .select()
      .from(images)
      .where(and(eq(images.id, id), eq(images.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundError(`Image ${id} not found`);
    }
    return sendStoredFile(reply, row);
  });

  // GET /media/:id/:sig  —  the same file for card HTML, which runs in a sandboxed
  // frame without the login token. Public; the HMAC signature is the credential.
  app.get<{ Params: { id: string; sig: string } }>("/media/:id/:sig", async (request, reply) => {
    const { id, sig } = request.params;
    if (!UUID_RE.test(id)) throw new NotFoundError("Media not found");
    const [row] = await db.select().from(images).where(eq(images.id, id)).limit(1);
    // The signature binds id and owner: a URL is only ever issued to the file's owner.
    if (!row || !verifyMediaSignature(id, row.userId, sig, mediaUrlSecret)) throw new NotFoundError("Media not found");
    // Fonts load cross-origin only with CORS; the card frame has an opaque origin.
    reply.header("Access-Control-Allow-Origin", "*");
    return sendStoredFile(reply, row);
  });

  // DELETE /images/:id  —  remove image from DB and disk
  app.delete<{ Params: { id: string } }>("/images/:id", async (request, reply) => {
    const { id } = request.params;
    const userId = getUserId(request);

    const [row] = await db
      .select()
      .from(images)
      .where(and(eq(images.id, id), eq(images.userId, userId)))
      .limit(1);

    if (!row) {
      throw new NotFoundError(`Image ${id} not found`);
    }

    // Delete DB record first
    await db.delete(images).where(and(eq(images.id, id), eq(images.userId, userId)));

    // Then remove file from disk (best-effort)
    const filePath = path.join(config.imagePath, `${row.id}${extFromMime(row.mimeType)}`);
    await unlink(filePath).catch(() => {});

    return reply.code(204).send();
  });
}
