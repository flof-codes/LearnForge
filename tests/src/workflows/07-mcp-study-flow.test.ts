import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { McpTestClient } from "../helpers/mcp-client.js";
import { TOPICS, SEED } from "../helpers/fixtures.js";
import { deleteFreshCard } from "../helpers/fresh-card.js";

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

describe("MCP ↔ API Cross-Interface", () => {
  it("card created via MCP is visible via API", async () => {
    const mcpResult = await mcp.callTool("create_card", {
      topic_id: TOPICS.EMPTY_TOPIC,
      concept: "Cross-interface card",
      front_html: "<p>MCP Front</p>",
      back_html: "<p>MCP Back</p>",
      tags: ["cross-test"],
    });
    const mcpCard = mcp.parseToolResult<any>(mcpResult);
    freshCardIds.push(mcpCard.id);

    // Fetch via REST API
    const apiRes = await api.get(`/cards/${mcpCard.id}`);
    expect(apiRes.status).toBe(200);
    expect(apiRes.data.concept).toBe("Cross-interface card");
    expect(apiRes.data.tags).toEqual(["cross-test"]);
    expect(apiRes.data.bloomState.currentLevel).toBe(0);
    expect(apiRes.data.fsrsState.state).toBe(0);
  });

  it("review via API is visible via MCP get_card", async () => {
    // Create card via MCP
    const createResult = await mcp.callTool("create_card", {
      topic_id: TOPICS.EMPTY_TOPIC,
      concept: "API review cross-check",
      front_html: "<p>Q</p>",
      back_html: "<p>A</p>",
    });
    const card = mcp.parseToolResult<any>(createResult);
    freshCardIds.push(card.id);

    // Submit review via REST API
    const reviewRes = await api.post("/reviews", {
      card_id: card.id,
      bloom_level: 0,
      rating: 3,
      question_text: "API review test",
    });
    expect(reviewRes.status).toBe(201);

    // Verify via MCP
    const getResult = await mcp.callTool("get_card", { card_id: card.id });
    const mcpCard = mcp.parseToolResult<any>(getResult);

    expect(mcpCard.bloomState.currentLevel).toBe(1); // Advanced from 0
    expect(mcpCard.fsrsState.reps).toBeGreaterThan(0);
    expect(mcpCard.reviews.length).toBe(1);
    expect(mcpCard.reviews[0].rating).toBe(3);
  });

  it("MCP due cards match API due cards", async () => {
    const [mcpResult, apiRes] = await Promise.all([
      mcp.callTool("get_study_cards", { limit: 100 }),
      api.get("/study/due", { params: { limit: 100 } }),
    ]);

    const mcpCards = mcp.parseToolResult<any[]>(mcpResult);
    const apiCards = apiRes.data;

    const mcpIds = mcpCards.map((c: any) => c.id).sort();
    const apiIds = apiCards.map((c: any) => c.id).sort();

    expect(mcpIds).toEqual(apiIds);
  });

  it("MCP summary matches API summary", async () => {
    const [mcpResult, apiRes] = await Promise.all([
      mcp.callTool("get_study_summary", {}),
      api.get("/study/summary"),
    ]);

    const mcpSummary = mcp.parseToolResult<any>(mcpResult);
    const apiSummary = apiRes.data;

    expect(mcpSummary.totalCards).toBe(apiSummary.totalCards);
    expect(mcpSummary.dueCount).toBe(apiSummary.dueCount);
    expect(mcpSummary.bloomLevels).toEqual(apiSummary.bloomLevels);
  });

  it("card reviewed via API is no longer due in MCP", async () => {
    // Create card via MCP (it will be due immediately)
    const createResult = await mcp.callTool("create_card", {
      topic_id: TOPICS.EMPTY_TOPIC,
      concept: "Due cross-check card",
      front_html: "<p>Q</p>",
      back_html: "<p>A</p>",
    });
    const card = mcp.parseToolResult<any>(createResult);
    freshCardIds.push(card.id);

    // Verify it's in MCP due list
    const dueBeforeResult = await mcp.callTool("get_study_cards", { limit: 100 });
    const dueBefore = mcp.parseToolResult<any[]>(dueBeforeResult);
    const dueIdsBefore = dueBefore.map((c: any) => c.id);
    expect(dueIdsBefore).toContain(card.id);

    // Submit Good review via API (pushes due date into future)
    await api.post("/reviews", {
      card_id: card.id,
      bloom_level: 0,
      rating: 3,
      question_text: "Cross-check review",
    });

    // Verify it's no longer in MCP due list
    const dueAfterResult = await mcp.callTool("get_study_cards", { limit: 100 });
    const dueAfter = mcp.parseToolResult<any[]>(dueAfterResult);
    const dueIdsAfter = dueAfter.map((c: any) => c.id);
    expect(dueIdsAfter).not.toContain(card.id);
  });
});
