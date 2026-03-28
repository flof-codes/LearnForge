import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import axios from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, CARDS, IMAGES, TEST_CONFIG } from "../helpers/fixtures.js";
import { McpTestClient } from "../helpers/mcp-client.js";

let api: AxiosInstance;
let otherApi: AxiosInstance;
const createdTopicIds: string[] = [];
const createdCardIds: string[] = [];

beforeAll(async () => {
  await login();
  api = getApi();

  // Create authenticated client for "other" user
  const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
  const loginRes = await axios.post(`${url}/auth/login`, {
    email: TEST_CONFIG.otherEmail,
    password: TEST_CONFIG.otherPassword,
  });
  otherApi = axios.create({
    baseURL: url,
    headers: { Authorization: `Bearer ${loginRes.data.token}` },
    validateStatus: () => true,
  });
});

afterAll(async () => {
  // Clean up cards first (they reference topics)
  for (const id of createdCardIds) {
    await api.delete(`/cards/${id}`);
  }
  // Clean up topics in reverse order (children before parents)
  for (const id of createdTopicIds.reverse()) {
    await api.delete(`/topics/${id}`);
  }
});

// ── Image Multi-Tenancy ──────────────────────────────────────────────────

describe("Image Multi-Tenancy", () => {
  it("User B cannot GET User A's card-associated image", async () => {
    const res = await otherApi.get(`/images/${IMAGES.CELL_DIAGRAM}`);
    expect(res.status).toBe(404);
  });

  it("User B cannot DELETE User A's image", async () => {
    const deleteRes = await otherApi.delete(`/images/${IMAGES.CELL_DIAGRAM}`);
    expect(deleteRes.status).toBe(404);

    // Image should still exist for User A
    const getRes = await api.get(`/images/${IMAGES.CELL_DIAGRAM}`);
    expect(getRes.status).toBe(200);
  });

  it("User B cannot GET User A's standalone (orphaned) image", async () => {
    const res = await otherApi.get(`/images/${IMAGES.STANDALONE}`);
    expect(res.status).toBe(404);
  });
});

// ── Cross-User Card Operations ───────────────────────────────────────────

describe("Cross-User Card Operations", () => {
  it("cannot move card to another user's topic", async () => {
    // Create a topic for User B
    const otherTopicRes = await otherApi.post("/topics", {
      name: "Other User Topic for Move Test",
    });
    expect(otherTopicRes.status).toBe(201);
    const otherTopicId = otherTopicRes.data.id;

    // Create a card for User B in that topic
    const otherCardRes = await otherApi.post("/cards", {
      topic_id: otherTopicId,
      concept: "Other user card for cross-user move test",
      front_html: "<div>Front</div>",
      back_html: "<div>Back</div>",
    });
    expect(otherCardRes.status).toBe(201);
    const otherCardId = otherCardRes.data.id;

    // User B tries to move their card to User A's MATHEMATICS topic
    const moveRes = await otherApi.put(`/cards/${otherCardId}`, {
      topic_id: TOPICS.MATHEMATICS,
    });
    // Should fail: User A's topic is not visible to User B
    expect(moveRes.status).toBe(404);

    // Clean up: delete the card and topic created for other user
    await otherApi.delete(`/cards/${otherCardId}`);
    await otherApi.delete(`/topics/${otherTopicId}`);
  });
});

// ── Topic Deep Cycle Detection ───────────────────────────────────────────

describe("Topic Deep Cycle Detection", () => {
  let topicA: string;
  let topicB: string;
  let topicC: string;

  beforeAll(async () => {
    // Create chain: A (root) -> B -> C
    const resA = await api.post("/topics", { name: "Cycle Test A" });
    expect(resA.status).toBe(201);
    topicA = resA.data.id;
    createdTopicIds.push(topicA);

    const resB = await api.post("/topics", {
      name: "Cycle Test B",
      parentId: topicA,
    });
    expect(resB.status).toBe(201);
    topicB = resB.data.id;
    createdTopicIds.push(topicB);

    const resC = await api.post("/topics", {
      name: "Cycle Test C",
      parentId: topicB,
    });
    expect(resC.status).toBe(201);
    topicC = resC.data.id;
    createdTopicIds.push(topicC);
  });

  it("rejects setting A's parent to C (would create A->B->C->A cycle)", async () => {
    const res = await api.put(`/topics/${topicA}`, {
      parentId: topicC,
    });
    expect(res.status).toBe(400);
    expect(res.data.error).toContain("circular");
  });

  it("still allows valid reparenting (no cycle)", async () => {
    // Moving C to be a root topic should be fine
    const res = await api.put(`/topics/${topicC}`, {
      parentId: null,
    });
    expect(res.status).toBe(200);

    // Restore original structure for cleanup
    await api.put(`/topics/${topicC}`, { parentId: topicB });
  });
});

// ── MCP search_cards Tool ────────────────────────────────────────────────

describe("MCP search_cards Tool", () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.initialize();
  });

  afterAll(async () => {
    await mcp.close();
  });

  it("finds cards matching query text", async () => {
    const result = await mcp.callTool("search_cards", { query: "slope" });
    expect(result.isError).toBeFalsy();

    const cards = mcp.parseToolResult<
      Array<{
        id: string;
        concept: string;
        tags: string[];
        topicId: string;
        score: number;
        bloomState: { currentLevel: number | null; highestReached: number | null };
      }>
    >(result);

    expect(cards.length).toBeGreaterThan(0);

    // REV_SLOPE_INT card should appear (concept = "Slope-intercept form")
    const slopeCard = cards.find((c) => c.id === CARDS.REV_SLOPE_INT);
    expect(slopeCard).toBeDefined();
    expect(slopeCard!.concept).toBe("Slope-intercept form");
  });

  it("filters results by topic_id", async () => {
    // Search within LINEAR_EQUATIONS topic only
    const result = await mcp.callTool("search_cards", {
      query: "slope",
      topic_id: TOPICS.LINEAR_EQUATIONS,
    });
    expect(result.isError).toBeFalsy();

    const cards = mcp.parseToolResult<Array<{ id: string; topicId: string }>>(
      result,
    );

    // All returned cards should belong to LINEAR_EQUATIONS topic tree
    for (const card of cards) {
      expect(card.topicId).toBe(TOPICS.LINEAR_EQUATIONS);
    }
  });

  it("returns correct response shape", async () => {
    const result = await mcp.callTool("search_cards", {
      query: "cell",
      limit: 3,
    });
    expect(result.isError).toBeFalsy();

    const cards = mcp.parseToolResult<
      Array<{
        id: string;
        concept: string;
        tags: string[];
        topicId: string;
        score: number;
        bloomState: { currentLevel: number | null; highestReached: number | null };
      }>
    >(result);

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThanOrEqual(3);

    const card = cards[0];
    expect(card).toHaveProperty("id");
    expect(card).toHaveProperty("concept");
    expect(card).toHaveProperty("tags");
    expect(card).toHaveProperty("topicId");
    expect(card).toHaveProperty("score");
    expect(card).toHaveProperty("bloomState");
    expect(card.bloomState).toHaveProperty("currentLevel");
    expect(card.bloomState).toHaveProperty("highestReached");
  });

  it("returns empty or low-relevance results for nonsense query", async () => {
    const result = await mcp.callTool("search_cards", {
      query: "qzxwvk7389jfm",
    });
    expect(result.isError).toBeFalsy();

    // Text search won't match a truly random string.
    // Semantic search may return low-relevance results below the cosine threshold.
    const cards = mcp.parseToolResult<any[]>(result);
    expect(Array.isArray(cards)).toBe(true);
    // Allow 0 or very few results — semantic search can be noisy for gibberish
    expect(cards.length).toBeLessThanOrEqual(2);
  });
});

// ── MCP get_due_forecast Tool ────────────────────────────────────────────

describe("MCP get_due_forecast Tool", () => {
  let mcp: McpTestClient;

  beforeAll(async () => {
    mcp = new McpTestClient();
    await mcp.initialize();
  });

  afterAll(async () => {
    await mcp.close();
  });

  it("returns month forecast with default params", async () => {
    const result = await mcp.callTool("get_due_forecast", {});
    expect(result.isError).toBeFalsy();

    const forecast = mcp.parseToolResult<{
      range: string;
      buckets: Array<{ label: string; date: string; count: number }>;
      overdue: number;
    }>(result);

    expect(forecast.range).toBe("month");
    expect(Array.isArray(forecast.buckets)).toBe(true);
    expect(forecast.buckets.length).toBe(30);
    expect(typeof forecast.overdue).toBe("number");

    // Each bucket should have the right shape
    const bucket = forecast.buckets[0];
    expect(bucket).toHaveProperty("label");
    expect(bucket).toHaveProperty("date");
    expect(bucket).toHaveProperty("count");
    expect(typeof bucket.count).toBe("number");
  });

  it("returns year forecast when range is 'year'", async () => {
    const result = await mcp.callTool("get_due_forecast", { range: "year" });
    expect(result.isError).toBeFalsy();

    const forecast = mcp.parseToolResult<{
      range: string;
      buckets: Array<{ label: string; date: string; count: number }>;
      overdue: number;
    }>(result);

    expect(forecast.range).toBe("year");
    expect(Array.isArray(forecast.buckets)).toBe(true);
    expect(forecast.buckets.length).toBe(12);
    expect(typeof forecast.overdue).toBe("number");
  });

  it("accepts optional topic_id filter", async () => {
    const result = await mcp.callTool("get_due_forecast", {
      topic_id: TOPICS.MATHEMATICS,
    });
    expect(result.isError).toBeFalsy();

    const forecast = mcp.parseToolResult<{
      range: string;
      buckets: Array<{ label: string; date: string; count: number }>;
      overdue: number;
    }>(result);

    expect(forecast.range).toBe("month");
    expect(Array.isArray(forecast.buckets)).toBe(true);
  });
});
