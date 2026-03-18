import { describe, it, expect, beforeAll } from "vitest";
import type { AxiosInstance } from "axios";
import AdmZip from "adm-zip";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { SEED, TOPICS, CARDS, IMAGES } from "../helpers/fixtures.js";

let api: AxiosInstance;

beforeAll(async () => {
  await login();
  api = getApi();
});

/** Parse the ZIP from an arraybuffer response and extract the JSON export. */
function parseExportZip(data: ArrayBuffer): {
  zip: AdmZip;
  exportData: {
    version: number;
    exportedAt: string;
    topics: Array<{ id: string; parentId: string | null; name: string; description: string | null; createdAt: string }>;
    cards: Array<{
      id: string;
      topicId: string;
      concept: string;
      frontHtml: string;
      backHtml: string;
      tags: string[];
      bloomState: { currentLevel: number; highestReached: number };
      fsrsState: { stability: number; difficulty: number; due: string; lastReview: string | null; reps: number; lapses: number; state: number } | null;
      reviews: Array<{ id: string; bloomLevel: number; rating: number; questionText: string; modality: string; reviewedAt: string }>;
    }>;
    images: Array<{ id: string; cardId: string | null; filename: string; mimeType: string; createdAt: string }>;
  };
} {
  const zip = new AdmZip(Buffer.from(data));
  const jsonEntry = zip.getEntry("learnforge-export.json");
  if (!jsonEntry) throw new Error("learnforge-export.json not found in ZIP");
  const exportData = JSON.parse(jsonEntry.getData().toString("utf8"));
  return { zip, exportData };
}

describe("Data Export", () => {
  it("returns a ZIP file with correct headers and magic bytes", async () => {
    const res = await api.get("/export", { responseType: "arraybuffer" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/zip");
    expect(res.headers["content-disposition"]).toContain("learnforge-export");
    expect(res.headers["content-disposition"]).toContain(".zip");

    // ZIP magic bytes: PK\x03\x04
    const header = new Uint8Array(res.data.slice(0, 4));
    expect(header[0]).toBe(0x50); // P
    expect(header[1]).toBe(0x4b); // K
  });

  it("contains valid JSON with expected top-level structure", async () => {
    const res = await api.get("/export", { responseType: "arraybuffer" });
    const { exportData } = parseExportZip(res.data);

    expect(exportData.version).toBe(1);
    expect(exportData.exportedAt).toBeDefined();
    expect(new Date(exportData.exportedAt).getTime()).not.toBeNaN();
    expect(Array.isArray(exportData.topics)).toBe(true);
    expect(Array.isArray(exportData.cards)).toBe(true);
    expect(Array.isArray(exportData.images)).toBe(true);
  });

  it("exports all topics for the user", async () => {
    const res = await api.get("/export", { responseType: "arraybuffer" });
    const { exportData } = parseExportZip(res.data);

    // Seed has 6 topics for test user (Mathematics, Algebra, Linear Equations, Biology, Cell Biology, Empty Topic)
    expect(exportData.topics.length).toBeGreaterThanOrEqual(6);

    // Verify topic structure
    const mathTopic = exportData.topics.find((t) => t.id === TOPICS.MATHEMATICS);
    expect(mathTopic).toBeDefined();
    expect(mathTopic!.name).toBe("Mathematics");
    expect(mathTopic!.parentId).toBeNull();

    // Verify parent-child relationship
    const algebraTopic = exportData.topics.find((t) => t.id === TOPICS.ALGEBRA);
    expect(algebraTopic).toBeDefined();
    expect(algebraTopic!.parentId).toBe(TOPICS.MATHEMATICS);
  });

  it("exports all cards with bloom state, FSRS state, and reviews", async () => {
    const res = await api.get("/export", { responseType: "arraybuffer" });
    const { exportData } = parseExportZip(res.data);

    expect(exportData.cards.length).toBeGreaterThanOrEqual(SEED.totalCards);

    // Check a specific card has all expected fields
    const card = exportData.cards.find((c) => c.id === CARDS.REV_SLOPE_INT);
    expect(card).toBeDefined();
    expect(card!.topicId).toBe(TOPICS.LINEAR_EQUATIONS);
    expect(card!.concept).toBeDefined();
    expect(card!.frontHtml).toBeDefined();
    expect(card!.backHtml).toBeDefined();
    expect(card!.tags).toBeDefined();

    // Bloom state
    expect(card!.bloomState).toBeDefined();
    expect(card!.bloomState.currentLevel).toBe(3);

    // FSRS state
    expect(card!.fsrsState).toBeDefined();
    expect(card!.fsrsState!.due).toBeDefined();
    expect(typeof card!.fsrsState!.stability).toBe("number");
    expect(typeof card!.fsrsState!.difficulty).toBe("number");
    expect(typeof card!.fsrsState!.reps).toBe("number");
    expect(typeof card!.fsrsState!.lapses).toBe("number");
    expect(typeof card!.fsrsState!.state).toBe("number");

    // Reviews
    expect(Array.isArray(card!.reviews)).toBe(true);
    expect(card!.reviews.length).toBeGreaterThan(0);
    const review = card!.reviews[0];
    expect(review.rating).toBeDefined();
    expect(review.bloomLevel).toBeDefined();
    expect(review.questionText).toBeDefined();
    expect(review.reviewedAt).toBeDefined();
  });

  it("exports image metadata and includes image files in ZIP", async () => {
    const res = await api.get("/export", { responseType: "arraybuffer" });
    const { zip, exportData } = parseExportZip(res.data);

    // Seeded images
    expect(exportData.images.length).toBeGreaterThanOrEqual(2);

    const cellDiagram = exportData.images.find((img) => img.id === IMAGES.CELL_DIAGRAM);
    expect(cellDiagram).toBeDefined();
    expect(cellDiagram!.cardId).toBe(CARDS.BIO_CELL_STRUCT);
    expect(cellDiagram!.mimeType).toBe("image/png");

    // Check that image file exists in the ZIP
    const imageEntry = zip.getEntry(`images/${IMAGES.CELL_DIAGRAM}.png`);
    expect(imageEntry).toBeDefined();
    expect(imageEntry!.getData().byteLength).toBeGreaterThan(0);
  });

  it("does not include embeddings in the export", async () => {
    const res = await api.get("/export", { responseType: "arraybuffer" });
    const { exportData } = parseExportZip(res.data);

    for (const card of exportData.cards) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((card as any).embedding).toBeUndefined();
    }
  });

  it("isolates data by user (multi-tenancy)", async () => {
    // Login as other user
    await login("other@learnforge.dev", "test-password");
    const otherApi = getApi();

    const res = await otherApi.get("/export", { responseType: "arraybuffer" });
    expect(res.status).toBe(200);

    const { exportData } = parseExportZip(res.data);

    // Other user should not see test user's topics
    const testTopicIds = Object.values(TOPICS);
    for (const topic of exportData.topics) {
      expect(testTopicIds).not.toContain(topic.id);
    }

    // Other user should not see test user's cards
    const testCardIds = Object.values(CARDS);
    for (const card of exportData.cards) {
      expect(testCardIds).not.toContain(card.id);
    }

    // Re-login as test user for subsequent tests
    await login();
  });

  it("rejects unauthenticated requests", async () => {
    const unauthApi = getUnauthApi();
    const res = await unauthApi.get("/export");
    expect(res.status).toBe(401);
  });
});
