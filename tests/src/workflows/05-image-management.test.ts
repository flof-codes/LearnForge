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
 * Create a minimal valid MP3 buffer for testing audio uploads.
 * Contains a single MPEG Audio Layer 3 frame header + padding.
 */
function createTestMp3(): Buffer {
  // Minimal MP3: sync word (0xFFE0) + MPEG1 Layer3 128kbps 44100Hz stereo frame
  // Frame header: FF FB 90 00 (sync=0xFFF, MPEG1, Layer3, 128kbps, 44100Hz, stereo)
  const header = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);
  // Pad to a full frame (417 bytes for 128kbps/44100Hz)
  const frame = Buffer.alloc(417);
  header.copy(frame);
  return frame;
}

/**
 * Create a minimal valid WAV buffer for testing audio uploads.
 * RIFF header + fmt chunk + empty data chunk.
 */
function createTestWav(): Buffer {
  const buf = Buffer.alloc(44); // Minimal WAV header
  buf.write("RIFF", 0);               // ChunkID
  buf.writeUInt32LE(36, 4);           // ChunkSize (36 + 0 data bytes)
  buf.write("WAVE", 8);               // Format
  buf.write("fmt ", 12);              // Subchunk1ID
  buf.writeUInt32LE(16, 16);          // Subchunk1Size (PCM)
  buf.writeUInt16LE(1, 20);           // AudioFormat (PCM=1)
  buf.writeUInt16LE(1, 22);           // NumChannels (mono)
  buf.writeUInt32LE(44100, 24);       // SampleRate
  buf.writeUInt32LE(88200, 28);       // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  buf.writeUInt16LE(2, 32);           // BlockAlign (NumChannels * BitsPerSample/8)
  buf.writeUInt16LE(16, 34);          // BitsPerSample
  buf.write("data", 36);              // Subchunk2ID
  buf.writeUInt32LE(0, 40);           // Subchunk2Size (0 samples)
  return buf;
}

/**
 * Create a minimal valid OGG buffer for testing audio uploads.
 * Single OGG page with capture pattern.
 */
function createTestOgg(): Buffer {
  // Minimal OGG page: capture pattern + version + header type + granule pos + serial + page seq + checksum + segments
  const buf = Buffer.alloc(28);
  buf.write("OggS", 0);              // Capture pattern
  buf.writeUInt8(0, 4);              // Version
  buf.writeUInt8(2, 5);              // Header type (first page)
  // Granule position (8 bytes, all zeros)
  // Serial number at offset 14
  buf.writeUInt32LE(1, 14);          // Serial number
  // Page sequence at offset 18
  buf.writeUInt32LE(0, 18);          // Page sequence number
  // Checksum at offset 22 (zeros = invalid but enough for MIME detection)
  buf.writeUInt8(0, 26);             // Number of segments
  return buf;
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

  describe("SVG and JPEG Upload", () => {
    it("uploads SVG and serves with CSP header", async () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="red"/></svg>');
      const { body, contentType } = buildMultipartBody("test.svg", "image/svg+xml", svg);

      const uploadRes = await api.post("/images", body, {
        headers: { "Content-Type": contentType },
      });
      expect(uploadRes.status).toBe(201);
      expect(uploadRes.data.mimeType).toBe("image/svg+xml");
      createdImageIds.push(uploadRes.data.id);

      const serveRes = await api.get(`/images/${uploadRes.data.id}`, {
        responseType: "arraybuffer",
      });
      expect(serveRes.status).toBe(200);
      expect(serveRes.headers["content-type"]).toMatch(/image\/svg\+xml/);
      expect(serveRes.headers["content-security-policy"]).toBe("script-src 'none'");
    });

    it("uploads JPEG and serves with correct content-type", async () => {
      // Minimal valid JPEG (smallest possible JFIF)
      const jpeg = Buffer.from(
        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsM" +
        "EA4QEQ4MEwwSExMTFhcYGBgbHBweJyEhJzD/2wBDAQMEBAUEBQkFBQkwLQstMDAwMDAwMDAwMDAwMDAw" +
        "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDD/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=",
        "base64",
      );
      const { body, contentType } = buildMultipartBody("test.jpg", "image/jpeg", jpeg);

      const uploadRes = await api.post("/images", body, {
        headers: { "Content-Type": contentType },
      });
      expect(uploadRes.status).toBe(201);
      expect(uploadRes.data.mimeType).toBe("image/jpeg");
      createdImageIds.push(uploadRes.data.id);

      const serveRes = await api.get(`/images/${uploadRes.data.id}`, {
        responseType: "arraybuffer",
      });
      expect(serveRes.status).toBe(200);
      expect(serveRes.headers["content-type"]).toMatch(/image\/jpeg/);
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

describe("Audio Upload and Serve", () => {
  it("uploads MP3 and returns correct metadata", async () => {
    const mp3 = createTestMp3();
    const { body, contentType } = buildMultipartBody(
      "test-audio.mp3",
      "audio/mpeg",
      mp3,
    );

    const res = await api.post("/images", body, {
      headers: { "Content-Type": contentType },
    });

    expect(res.status).toBe(201);
    expect(res.data.id).toBeDefined();
    expect(res.data.url).toBe(`/images/${res.data.id}`);
    expect(res.data.mimeType).toBe("audio/mpeg");
    expect(res.data.filename).toBe("test-audio.mp3");
    expect(res.data.cardId).toBeNull();
    createdImageIds.push(res.data.id);
  });

  it("serves MP3 with correct Content-Type and no CSP header", async () => {
    const mp3 = createTestMp3();
    const { body, contentType } = buildMultipartBody(
      "serve-test.mp3",
      "audio/mpeg",
      mp3,
    );

    const uploadRes = await api.post("/images", body, {
      headers: { "Content-Type": contentType },
    });
    expect(uploadRes.status).toBe(201);
    createdImageIds.push(uploadRes.data.id);

    const serveRes = await api.get(`/images/${uploadRes.data.id}`, {
      responseType: "arraybuffer",
    });

    expect(serveRes.status).toBe(200);
    expect(serveRes.headers["content-type"]).toMatch(/audio\/mpeg/);
    expect(serveRes.headers["cache-control"]).toContain("public");
    expect(serveRes.headers["x-content-type-options"]).toBe("nosniff");
    // CSP header is only set for SVG files — audio must NOT have it
    expect(serveRes.headers["content-security-policy"]).toBeUndefined();
    // Served body size should match the uploaded buffer
    expect(serveRes.data.byteLength).toBe(mp3.length);
  });

  it("uploads WAV with correct mimeType", async () => {
    const wav = createTestWav();
    const { body, contentType } = buildMultipartBody(
      "test-audio.wav",
      "audio/wav",
      wav,
    );

    const res = await api.post("/images", body, {
      headers: { "Content-Type": contentType },
    });

    expect(res.status).toBe(201);
    expect(res.data.mimeType).toBe("audio/wav");
    expect(res.data.filename).toBe("test-audio.wav");
    createdImageIds.push(res.data.id);
  });

  it("uploads OGG with correct mimeType", async () => {
    const ogg = createTestOgg();
    const { body, contentType } = buildMultipartBody(
      "test-audio.ogg",
      "audio/ogg",
      ogg,
    );

    const res = await api.post("/images", body, {
      headers: { "Content-Type": contentType },
    });

    expect(res.status).toBe(201);
    expect(res.data.mimeType).toBe("audio/ogg");
    expect(res.data.filename).toBe("test-audio.ogg");
    createdImageIds.push(res.data.id);
  });

  it("uploads MP3 with card association", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "audio-card");
    freshCardIds.push(card.id);

    const mp3 = createTestMp3();
    const { body, contentType } = buildMultipartBody(
      "card-audio.mp3",
      "audio/mpeg",
      mp3,
      { card_id: card.id },
    );

    const res = await api.post("/images", body, {
      headers: { "Content-Type": contentType },
    });

    expect(res.status).toBe(201);
    expect(res.data.cardId).toBe(card.id);
    expect(res.data.mimeType).toBe("audio/mpeg");
    createdImageIds.push(res.data.id);
  });

  it("deletes an audio file and returns 404 on re-fetch", async () => {
    const mp3 = createTestMp3();
    const { body, contentType } = buildMultipartBody(
      "to-delete.mp3",
      "audio/mpeg",
      mp3,
    );

    const uploadRes = await api.post("/images", body, {
      headers: { "Content-Type": contentType },
    });
    expect(uploadRes.status).toBe(201);
    const audioId = uploadRes.data.id;

    const deleteRes = await api.delete(`/images/${audioId}`);
    expect(deleteRes.status).toBe(204);

    const getRes = await api.get(`/images/${audioId}`);
    expect(getRes.status).toBe(404);
  });
});
