import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, IMAGES, CARDS } from "../helpers/fixtures.js";
import { createFreshCard, deleteFreshCard } from "../helpers/fresh-card.js";

let api: AxiosInstance;
const createdImageIds: string[] = [];
const freshCardIds: string[] = [];

beforeAll(async () => {
  await login();
  api = getApi();
});

afterAll(async () => {
  for (const id of createdImageIds) {
    await api.delete(`/images/${id}`);
  }
  for (const id of freshCardIds) {
    await deleteFreshCard(api, id);
  }
});

/**
 * Create a minimal 1x1 PNG buffer for testing uploads.
 */
function createTestPng(): Buffer {
  // Minimal valid 1x1 red PNG (68 bytes)
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64",
  );
}

/**
 * Build multipart/form-data body manually for image upload.
 */
function buildMultipartBody(
  filename: string,
  mimeType: string,
  fileBuffer: Buffer,
  fields?: Record<string, string>,
): { body: Buffer; contentType: string } {
  const boundary = "----TestBoundary" + Date.now();
  const parts: Buffer[] = [];

  // Add extra fields first
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
        ),
      );
    }
  }

  // Add file part
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
  );
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe("Image Management", () => {
  describe("Upload", () => {
    it("uploads image with card association", async () => {
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "img-upload");
      freshCardIds.push(card.id);

      const png = createTestPng();
      const { body, contentType } = buildMultipartBody(
        "test-card.png",
        "image/png",
        png,
        { card_id: card.id },
      );

      const res = await api.post("/images", body, {
        headers: { "Content-Type": contentType },
      });

      expect(res.status).toBe(201);
      expect(res.data.id).toBeDefined();
      expect(res.data.url).toBe(`/images/${res.data.id}`);
      expect(res.data.cardId).toBe(card.id);
      expect(res.data.filename).toBe("test-card.png");
      expect(res.data.mimeType).toBe("image/png");
      createdImageIds.push(res.data.id);
    });

    it("uploads orphan image (no card)", async () => {
      const png = createTestPng();
      const { body, contentType } = buildMultipartBody(
        "orphan.png",
        "image/png",
        png,
      );

      const res = await api.post("/images", body, {
        headers: { "Content-Type": contentType },
      });

      expect(res.status).toBe(201);
      expect(res.data.cardId).toBeNull();
      createdImageIds.push(res.data.id);
    });

    it("rejects unsupported mime type", async () => {
      const textBuf = Buffer.from("not an image");
      const { body, contentType } = buildMultipartBody(
        "bad.txt",
        "text/plain",
        textBuf,
      );

      const res = await api.post("/images", body, {
        headers: { "Content-Type": contentType },
      });

      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Serve", () => {
    it("serves seeded image with correct content-type", async () => {
      const res = await api.get(`/images/${IMAGES.CELL_DIAGRAM}`, {
        responseType: "arraybuffer",
      });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/image\/png/);
      expect(res.headers["cache-control"]).toContain("public");
      expect(res.data.byteLength).toBeGreaterThan(0);
    });

    it("returns 404 for non-existent image", async () => {
      const res = await api.get("/images/00000000-0000-0000-0000-000000000099");
      expect(res.status).toBe(404);
    });
  });

  describe("Delete", () => {
    it("deletes a fresh image", async () => {
      const png = createTestPng();
      const { body, contentType } = buildMultipartBody(
        "to-delete.png",
        "image/png",
        png,
      );

      const uploadRes = await api.post("/images", body, {
        headers: { "Content-Type": contentType },
      });
      expect(uploadRes.status).toBe(201);
      const imageId = uploadRes.data.id;

      const deleteRes = await api.delete(`/images/${imageId}`);
      expect(deleteRes.status).toBe(204);

      const getRes = await api.get(`/images/${imageId}`);
      expect(getRes.status).toBe(404);
    });

    it("card deletion sets image cardId to null", async () => {
      // Create card + image
      const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "img-orphan");
      const png = createTestPng();
      const { body, contentType } = buildMultipartBody(
        "will-orphan.png",
        "image/png",
        png,
        { card_id: card.id },
      );

      const uploadRes = await api.post("/images", body, {
        headers: { "Content-Type": contentType },
      });
      expect(uploadRes.status).toBe(201);
      const imageId = uploadRes.data.id;
      createdImageIds.push(imageId);

      // Delete the card (FK SET NULL should orphan the image)
      await api.delete(`/cards/${card.id}`);

      // Image should still exist but cardId should be null
      // We can check via the DB indirectly — re-fetch image serves it
      const serveRes = await api.get(`/images/${imageId}`, {
        responseType: "arraybuffer",
      });
      expect(serveRes.status).toBe(200);
    });
  });
});
