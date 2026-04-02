import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { McpTestClient } from "../helpers/mcp-client.js";
import { TOPICS, CARDS, IMAGES, TEST_CONFIG } from "../helpers/fixtures.js";
import { createFreshCard, deleteFreshCard, submitReview } from "../helpers/fresh-card.js";

let api: AxiosInstance;
let mcp: McpTestClient;
const freshCardIds: string[] = [];

beforeAll(async () => {
  await login();
  api = getApi();
  mcp = new McpTestClient();
  await mcp.initialize();
});

afterAll(async () => {
  for (const id of freshCardIds) {
    await deleteFreshCard(api, id);
  }
  await mcp.close();
});

// ── MCP upload_image / delete_image ─────────────────────────────────────────

describe("MCP Image Tools", () => {
  let uploadedImageId: string | null = null;

  afterAll(async () => {
    // Cleanup: delete the uploaded image if it still exists
    if (uploadedImageId) {
      try {
        await mcp.callTool("delete_image", { image_id: uploadedImageId });
      } catch { /* ignore */ }
    }
  });

  it("upload_image succeeds with a valid file from shared volume", async () => {
    // The setup.ts creates placeholder PNGs in the shared test-images volume.
    // The test-api container mounts this volume at /data/images.
    // We use the existing placeholder file as the source.
    const filePath = "/data/images/30000000-0000-0000-0000-000000000002.png";

    const result = await mcp.callTool("upload_image", {
      file_path: filePath,
    });

    expect(result.isError).toBeFalsy();
    const image = mcp.parseToolResult<{
      id: string;
      path: string;
      filename: string;
      mimeType: string;
      cardId: string | null;
    }>(result);

    expect(image.id).toBeDefined();
    expect(image.mimeType).toBe("image/png");
    expect(image.cardId).toBeNull();
    uploadedImageId = image.id;
  });

  it("upload_image with card_id associates the image", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "mcp-img-assoc");
    freshCardIds.push(card.id);

    const filePath = "/data/images/30000000-0000-0000-0000-000000000002.png";
    const result = await mcp.callTool("upload_image", {
      file_path: filePath,
      card_id: card.id,
    });

    expect(result.isError).toBeFalsy();
    const image = mcp.parseToolResult<{
      id: string;
      cardId: string | null;
    }>(result);

    expect(image.cardId).toBe(card.id);

    // Cleanup
    await mcp.callTool("delete_image", { image_id: image.id });
  });

  it("upload_image rejects unsupported file extension", async () => {
    const result = await mcp.callTool("upload_image", {
      file_path: "/tmp/test.txt",
    });

    expect(result.isError).toBe(true);
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/unsupported/i);
  });

  it("upload_image rejects path outside allowed directories", async () => {
    const result = await mcp.callTool("upload_image", {
      file_path: "/etc/passwd",
    });

    expect(result.isError).toBe(true);
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/allowed directory/i);
  });

  it("delete_image removes the uploaded image", async () => {
    // Upload a fresh image first
    const filePath = "/data/images/30000000-0000-0000-0000-000000000002.png";
    const uploadResult = await mcp.callTool("upload_image", {
      file_path: filePath,
    });
    expect(uploadResult.isError).toBeFalsy();
    const image = mcp.parseToolResult<{ id: string }>(uploadResult);

    // Delete it
    const deleteResult = await mcp.callTool("delete_image", {
      image_id: image.id,
    });
    expect(deleteResult.isError).toBeFalsy();
    const deleted = mcp.parseToolResult<{ deleted: string }>(deleteResult);
    expect(deleted.deleted).toBe(image.id);

    // Verify it's gone
    const getResult = await mcp.callTool("delete_image", {
      image_id: image.id,
    });
    expect(getResult.isError).toBe(true);

    // Clear the tracked ID since we already deleted
    if (uploadedImageId === image.id) uploadedImageId = null;
  });

  it("delete_image returns error for non-existent image", async () => {
    const result = await mcp.callTool("delete_image", {
      image_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    });
    expect(result.isError).toBe(true);
    const text = result.content.find((c) => c.type === "text")?.text ?? "";
    expect(text).toMatch(/not found/i);
  });

  it("upload_image accepts .mp3 audio file", async () => {
    const filePath = "/data/images/test-audio-placeholder.mp3";

    const result = await mcp.callTool("upload_image", {
      file_path: filePath,
    });

    expect(result.isError).toBeFalsy();
    const image = mcp.parseToolResult<{
      id: string;
      filename: string;
      mimeType: string;
      cardId: string | null;
    }>(result);

    expect(image.id).toBeDefined();
    expect(image.mimeType).toBe("audio/mpeg");
    expect(image.filename).toBe("test-audio-placeholder.mp3");
    expect(image.cardId).toBeNull();

    // Cleanup
    await mcp.callTool("delete_image", { image_id: image.id });
  });

  it("upload_image accepts .ogg audio file", async () => {
    const filePath = "/data/images/test-audio-placeholder.ogg";

    const result = await mcp.callTool("upload_image", {
      file_path: filePath,
    });

    expect(result.isError).toBeFalsy();
    const image = mcp.parseToolResult<{
      id: string;
      filename: string;
      mimeType: string;
      cardId: string | null;
    }>(result);

    expect(image.id).toBeDefined();
    expect(image.mimeType).toBe("audio/ogg");
    expect(image.filename).toBe("test-audio-placeholder.ogg");
    expect(image.cardId).toBeNull();

    // Cleanup
    await mcp.callTool("delete_image", { image_id: image.id });
  });
});

// ── MCP submit_review with modalities ───────────────────────────────────────

describe("MCP Review Modalities", () => {
  it("submit_review with chat modality pushes due further than web", async () => {
    // Create two cards
    const createWeb = await mcp.callTool("create_card", {
      topic_id: TOPICS.EMPTY_TOPIC,
      concept: "MCP modality web test",
      front_html: "<p>Q</p>",
      back_html: "<p>A</p>",
    });
    const cardWeb = mcp.parseToolResult<{ id: string }>(createWeb);
    freshCardIds.push(cardWeb.id);

    const createChat = await mcp.callTool("create_card", {
      topic_id: TOPICS.EMPTY_TOPIC,
      concept: "MCP modality chat test",
      front_html: "<p>Q</p>",
      back_html: "<p>A</p>",
    });
    const cardChat = mcp.parseToolResult<{ id: string }>(createChat);
    freshCardIds.push(cardChat.id);

    const now = Date.now();

    const webResult = await mcp.callTool("submit_review", {
      card_id: cardWeb.id,
      bloom_level: 0,
      rating: 3,
      question_text: "MCP web modality test",
      modality: "web",
    });
    const webReview = mcp.parseToolResult<{ fsrsState: { due: string } }>(webResult);

    const chatResult = await mcp.callTool("submit_review", {
      card_id: cardChat.id,
      bloom_level: 0,
      rating: 3,
      question_text: "MCP chat modality test",
      modality: "chat",
    });
    const chatReview = mcp.parseToolResult<{ fsrsState: { due: string } }>(chatResult);

    const webInterval = new Date(webReview.fsrsState.due).getTime() - now;
    const chatInterval = new Date(chatReview.fsrsState.due).getTime() - now;

    // Chat (1.2x) should push due further than web (0.95x)
    expect(chatInterval).toBeGreaterThan(webInterval);
  });

  it("submit_review with mcq modality pushes due further than web", async () => {
    const createWeb = await mcp.callTool("create_card", {
      topic_id: TOPICS.EMPTY_TOPIC,
      concept: "MCP modality web2 test",
      front_html: "<p>Q</p>",
      back_html: "<p>A</p>",
    });
    const cardWeb = mcp.parseToolResult<{ id: string }>(createWeb);
    freshCardIds.push(cardWeb.id);

    const createMcq = await mcp.callTool("create_card", {
      topic_id: TOPICS.EMPTY_TOPIC,
      concept: "MCP modality mcq test",
      front_html: "<p>Q</p>",
      back_html: "<p>A</p>",
    });
    const cardMcq = mcp.parseToolResult<{ id: string }>(createMcq);
    freshCardIds.push(cardMcq.id);

    const now = Date.now();

    const webResult = await mcp.callTool("submit_review", {
      card_id: cardWeb.id,
      bloom_level: 0,
      rating: 3,
      question_text: "MCP web modality test 2",
      modality: "web",
    });
    const webReview = mcp.parseToolResult<{ fsrsState: { due: string } }>(webResult);

    const mcqResult = await mcp.callTool("submit_review", {
      card_id: cardMcq.id,
      bloom_level: 0,
      rating: 3,
      question_text: "MCP mcq modality test",
      modality: "mcq",
    });
    const mcqReview = mcp.parseToolResult<{ fsrsState: { due: string } }>(mcqResult);

    const webInterval = new Date(webReview.fsrsState.due).getTime() - now;
    const mcqInterval = new Date(mcqReview.fsrsState.due).getTime() - now;

    // MCQ (1.05x) should push due further than web (0.95x)
    expect(mcqInterval).toBeGreaterThan(webInterval);
  });
});

// ── MCP search_cards multi-tenancy ──────────────────────────────────────────

describe("MCP search_cards Multi-Tenancy", () => {
  it("MCP search does not return other user's cards", async () => {
    // The default MCP client uses test user's API key.
    // The test user owns seed cards. "Other user" owns none of the seed cards.
    // Search for a concept that only the test user has.
    const result = await mcp.callTool("search_cards", {
      query: "slope-intercept form",
    });
    expect(result.isError).toBeFalsy();
    const cards = mcp.parseToolResult<Array<{ id: string; concept: string }>>(result);

    // Should find the test user's card
    const ids = cards.map((c) => c.id);
    expect(ids).toContain(CARDS.REV_SLOPE_INT);

    // Now verify via API that other user's search returns nothing for same query
    const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
    const loginRes = await axios.post(`${url}/auth/login`, {
      email: TEST_CONFIG.otherEmail,
      password: TEST_CONFIG.otherPassword,
    });
    const otherApi = axios.create({
      baseURL: url,
      headers: { Authorization: `Bearer ${loginRes.data.token}` },
      validateStatus: () => true,
    });

    const otherRes = await otherApi.get("/cards/search", {
      params: { q: "slope-intercept form" },
    });
    expect(otherRes.status).toBe(200);
    expect(otherRes.data).toHaveLength(0);
  });
});

// ── Invalid UUID format handling ────────────────────────────────────────────

describe("Invalid UUID Format", () => {
  it("GET /cards/not-a-uuid returns 400 or 404", async () => {
    const res = await api.get("/cards/not-a-uuid");
    // Fastify may return 400 (bad request) or 404 depending on route param validation
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("GET /topics/not-a-uuid returns 400 or 404", async () => {
    const res = await api.get("/topics/not-a-uuid");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("GET /images/not-a-uuid returns 400 or 404", async () => {
    const res = await api.get("/images/not-a-uuid");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("POST /reviews with malformed card_id returns 400", async () => {
    const res = await api.post("/reviews", {
      card_id: "not-a-uuid",
      bloom_level: 0,
      rating: 3,
      question_text: "Test",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("DELETE /cards/not-a-uuid returns 400 or 404", async () => {
    const res = await api.delete("/cards/not-a-uuid");
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

// ── Rating edge cases ───────────────────────────────────────────────────────

describe("Review Rating Edge Cases", () => {
  it("rating=0 returns 400", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "rating-zero");
    freshCardIds.push(card.id);

    const res = await api.post("/reviews", {
      card_id: card.id,
      bloom_level: 0,
      rating: 0,
      question_text: "Test zero rating",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("negative rating returns 400", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "rating-neg");
    freshCardIds.push(card.id);

    const res = await api.post("/reviews", {
      card_id: card.id,
      bloom_level: 0,
      rating: -1,
      question_text: "Test negative rating",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("negative bloom_level returns 400", async () => {
    const card = await createFreshCard(api, TOPICS.EMPTY_TOPIC, "bloom-neg");
    freshCardIds.push(card.id);

    const res = await api.post("/reviews", {
      card_id: card.id,
      bloom_level: -1,
      rating: 3,
      question_text: "Test negative bloom",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ── GET /auth/me for existing seed user ─────────────────────────────────────

describe("GET /auth/me for Seed User", () => {
  it("returns user profile with expected fields", async () => {
    const res = await api.get("/auth/me");
    expect(res.status).toBe(200);

    expect(res.data).toHaveProperty("id");
    expect(res.data).toHaveProperty("email");
    expect(res.data).toHaveProperty("name");
    expect(res.data).toHaveProperty("isActive");

    expect(res.data.email).toBe(TEST_CONFIG.email);
    expect(typeof res.data.isActive).toBe("boolean");
  });

  it("returns correct user ID", async () => {
    const res = await api.get("/auth/me");
    expect(res.status).toBe(200);
    // The test user UUID is deterministic from the seed
    expect(res.data.id).toBe("00000000-0000-0000-0000-000000000099");
  });
});
