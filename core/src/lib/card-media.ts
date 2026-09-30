import { readFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import sharp from "sharp";
import type { Db } from "../db/types.js";
import { extFromMime } from "./image-utils.js";
import { textArray } from "./sql-array.js";

/**
 * Media a card refers to, for a tutor that reads cards through the MCP: the
 * chat can look at a picture only when the tool hands over the bytes, and it
 * cannot listen at all. So pictures come back resized to a chat-friendly
 * size as image blocks; audio and other files are only listed, so the tutor
 * knows the card has them and can say so.
 */

export interface CardMediaEntry {
  id: string;
  kind: "image" | "audio" | "video" | "file";
  mimeType: string;
  filename: string;
  /** Whether the picture is included as an image block. */
  attached: boolean;
}

export interface AttachedImage {
  id: string;
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
}

/** Files up to this size go out unchanged when they cannot be re-encoded. */
const MAX_RAW_BYTES = 1024 * 1024;
const RAW_OK = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export interface CardMedia {
  entries: CardMediaEntry[];
  images: AttachedImage[];
}

export interface CardMediaOptions {
  imagePath: string;
  /** Pictures attached per call; the rest are listed only. */
  maxImages?: number;
  /** Longest edge after resizing. */
  maxEdge?: number;
}

const UUID_REF = /\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
const ATTACHABLE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/tiff", "image/avif"]);

function kindOf(mime: string): CardMediaEntry["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

/** Ids referenced in the given HTML, in order of first appearance. */
export function mediaIdsIn(...htmls: Array<string | null | undefined>): string[] {
  const ids: string[] = [];
  for (const h of htmls) for (const m of (h ?? "").matchAll(UUID_REF)) {
    const id = m[1].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Loads the media the HTML refers to and the user owns. Pictures are resized
 * to `maxEdge` and re-encoded (JPEG, or PNG when the source has transparency
 * or is a PNG) so a card with a 4 MB photo still fits a chat turn.
 */
export async function loadCardMedia(db: Db, userId: string, htmls: string[], opts: CardMediaOptions): Promise<CardMedia> {
  const ids = mediaIdsIn(...htmls);
  if (ids.length === 0) return { entries: [], images: [] };
  const rows = await db.execute<{ id: string; mime_type: string; filename: string }>(sql`
    SELECT id, mime_type, filename FROM images WHERE user_id = ${userId} AND id = ANY(${textArray(ids)}::uuid[])
  `);
  const byId = new Map(rows.rows.map(r => [r.id.toLowerCase(), r]));
  const maxImages = opts.maxImages ?? 4;
  const maxEdge = opts.maxEdge ?? 1024;
  const entries: CardMediaEntry[] = [];
  const images: AttachedImage[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const entry: CardMediaEntry = { id: row.id, kind: kindOf(row.mime_type), mimeType: row.mime_type, filename: row.filename, attached: false };
    entries.push(entry);
    if (!ATTACHABLE.has(row.mime_type) || images.length >= maxImages) continue;
    let bytes: Buffer;
    try {
      bytes = await readFile(path.join(opts.imagePath, `${row.id}${extFromMime(row.mime_type)}`));
    } catch {
      continue; // missing file: listed, not attached
    }
    try {
      const image = sharp(bytes, { animated: false }).rotate().resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true });
      const meta = await sharp(bytes).metadata();
      const png = row.mime_type === "image/png" || meta.hasAlpha === true;
      const out = png ? await image.png({ compressionLevel: 9 }).toBuffer() : await image.jpeg({ quality: 80 }).toBuffer();
      images.push({ id: row.id, mimeType: png ? "image/png" : "image/jpeg", base64: out.toString("base64") });
      entry.attached = true;
    } catch {
      // libvips refuses some files browsers still show (tiny or oddly written PNGs): send them as they are when small.
      if (bytes.length <= MAX_RAW_BYTES && RAW_OK.has(row.mime_type)) {
        images.push({ id: row.id, mimeType: row.mime_type as AttachedImage["mimeType"], base64: bytes.toString("base64") });
        entry.attached = true;
      }
    }
  }
  return { entries, images };
}
