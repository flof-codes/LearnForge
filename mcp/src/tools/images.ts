import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@learnforge/core";
import { images } from "@learnforge/core";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const EXT_TO_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
  };
  return map[mime] ?? "";
}

export function registerImageTools(server: McpServer, db: Db, userId: string, imagePath: string) {
  server.tool(
    "upload_image",
    "Upload an image or audio file from a local file path. Supports png, jpg, jpeg, gif, webp, svg, mp3, wav, and ogg.",
    {
      file_path: z.string().describe("Absolute path to the image file on disk"),
      card_id: z.string().uuid().optional().describe("Optional card ID to associate the image with"),
    },
    async ({ file_path, card_id }) => {
      try {
        // If card_id is given, verify the card belongs to user
        if (card_id) {
          const ownerCheck = await db.execute<{ id: string }>(sql`
            SELECT c.id FROM cards c JOIN topics t ON c.topic_id = t.id
            WHERE c.id = ${card_id} AND t.user_id = ${userId}
          `);
          if (ownerCheck.rows.length === 0) {
            return { content: [{ type: "text" as const, text: "Error: Card not found" }], isError: true };
          }
        }

        // Restrict file reads to allowed directories to prevent arbitrary file exfiltration
        const resolved = path.resolve(file_path);
        const allowedPrefixes = [
          path.resolve(imagePath),
          path.resolve(process.env.HOME ?? "/nonexistent"),
          "/tmp",
        ];
        const isAllowed = allowedPrefixes.some(
          prefix => resolved === prefix || resolved.startsWith(prefix + path.sep),
        );
        if (!isAllowed) {
          return {
            content: [{ type: "text" as const, text: `Error: file_path must be under an allowed directory (${allowedPrefixes.join(", ")})` }],
            isError: true,
          };
        }

        const ext = path.extname(file_path).toLowerCase();
        const mimeType = EXT_TO_MIME[ext];
        if (!mimeType) {
          return {
            content: [{ type: "text" as const, text: `Error: Unsupported file extension: ${ext}. Allowed: ${Object.keys(EXT_TO_MIME).join(", ")}` }],
            isError: true,
          };
        }

        const fileData = await readFile(file_path);
        if (fileData.length > MAX_FILE_SIZE) {
          return {
            content: [{ type: "text" as const, text: `Error: File exceeds maximum size of ${MAX_FILE_SIZE} bytes` }],
            isError: true,
          };
        }

        await mkdir(imagePath, { recursive: true });

        const fileId = randomUUID();
        const storedFilename = `${fileId}${ext}`;
        const destPath = path.join(imagePath, storedFilename);
        await writeFile(destPath, fileData);

        const [row] = await db
          .insert(images)
          .values({
            id: fileId,
            cardId: card_id ?? null,
            userId,
            filename: path.basename(file_path),
            mimeType,
          })
          .returning();

        const result = {
          id: row.id,
          path: destPath,
          filename: row.filename,
          mimeType: row.mimeType,
          cardId: row.cardId,
        };

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );

  server.tool(
    "delete_image",
    "Delete an image by ID. Removes the database record and the file from disk.",
    {
      image_id: z.string().uuid(),
    },
    async ({ image_id }) => {
      try {
        const [row] = await db
          .select()
          .from(images)
          .where(sql`${images.id} = ${image_id} AND ${images.userId} = ${userId}`)
          .limit(1);

        if (!row) {
          return { content: [{ type: "text" as const, text: "Error: Image not found" }], isError: true };
        }

        await db.delete(images).where(eq(images.id, image_id));

        const filePath = path.join(imagePath, `${row.id}${mimeToExt(row.mimeType)}`);
        await unlink(filePath).catch(() => {});

        return { content: [{ type: "text" as const, text: JSON.stringify({ deleted: image_id }, null, 2) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}
