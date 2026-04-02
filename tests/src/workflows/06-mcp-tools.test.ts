import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { McpTestClient, createUnauthMcpClient } from "../helpers/mcp-client.js";
import { TOPICS, CARDS, SEED } from "../helpers/fixtures.js";

let mcp: McpTestClient;
const createdTopicIds: string[] = [];
const createdCardIds: string[] = [];

beforeAll(async () => {
  mcp = new McpTestClient();
  await mcp.initialize();
});

afterAll(async () => {
  // Cleanup in reverse order
  for (const id of [...createdCardIds].reverse()) {
    try {
      await mcp.callTool("delete_card", { card_id: id });
    } catch { /* ignore */ }
  }
  for (const id of [...createdTopicIds].reverse()) {
    try {
      await mcp.callTool("delete_topic", { topic_id: id });
    } catch { /* ignore */ }
  }
  await mcp.close();
});

describe("MCP Tools", () => {
  describe("Session", () => {
    it("initialized with session ID", () => {
      expect(mcp.getSessionId()).toBeTruthy();
    });

    it("lists available tools", async () => {
      const tools = await mcp.listTools();
      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("list_topics");
      expect(toolNames).toContain("create_card");
      expect(toolNames).toContain("get_study_cards");
      expect(toolNames).toContain("submit_review");
      expect(toolNames).toContain("get_instructions");
      expect(toolNames).toContain("get_templates");
    });
  });

  describe("Topics", () => {
    it("list_topics returns root topics", async () => {
      const result = await mcp.callTool("list_topics");
      const topics = mcp.parseToolResult<any[]>(result);

      expect(topics).toHaveLength(SEED.rootTopicCount);
      const names = topics.map((t: any) => t.name);
      expect(names).toContain("Mathematics");
      expect(names).toContain("Biology");
      expect(names).toContain("Empty Topic");

      const math = topics.find((t: any) => t.id === TOPICS.MATHEMATICS);
      expect(math.cardCount).toBe(SEED.mathTreeCards);
    });

    it("get_topic_tree returns nested tree", async () => {
      const result = await mcp.callTool("get_topic_tree", {
        topic_id: TOPICS.MATHEMATICS,
      });
      const tree = mcp.parseToolResult<any>(result);

      expect(tree.name).toBe("Mathematics");
      expect(tree.children).toBeDefined();
      expect(tree.children.length).toBeGreaterThan(0);

      const algebra = tree.children.find((c: any) => c.name === "Algebra");
      expect(algebra).toBeDefined();
      expect(algebra.children).toBeDefined();

      const linear = algebra.children.find(
        (c: any) => c.name === "Linear Equations",
      );
      expect(linear).toBeDefined();
    });

    it("create_topic creates and appears in list", async () => {
      const result = await mcp.callTool("create_topic", {
        name: "MCP Test Topic",
        description: "Created via MCP",
      });
      const topic = mcp.parseToolResult<any>(result);

      expect(topic.name).toBe("MCP Test Topic");
      expect(topic.id).toBeDefined();
      createdTopicIds.push(topic.id);

      // Verify in list
      const listResult = await mcp.callTool("list_topics");
      const topics = mcp.parseToolResult<any[]>(listResult);
      const names = topics.map((t: any) => t.name);
      expect(names).toContain("MCP Test Topic");
    });

    it("update_topic changes name", async () => {
      const result = await mcp.callTool("update_topic", {
        topic_id: createdTopicIds[0],
        name: "Updated MCP Topic",
      });
      const topic = mcp.parseToolResult<any>(result);
      expect(topic.name).toBe("Updated MCP Topic");
    });

    it("delete_topic removes topic", async () => {
      // Create a throwaway topic to delete
      const createResult = await mcp.callTool("create_topic", {
        name: "To Delete",
      });
      const topic = mcp.parseToolResult<any>(createResult);

      const deleteResult = await mcp.callTool("delete_topic", {
        topic_id: topic.id,
      });
      expect(deleteResult.isError).toBeFalsy();

      // Verify gone from list
      const listResult = await mcp.callTool("list_topics");
      const topics = mcp.parseToolResult<any[]>(listResult);
      const ids = topics.map((t: any) => t.id);
      expect(ids).not.toContain(topic.id);
    });
  });

  describe("Cards", () => {
    it("create_card returns card with bloom and fsrs state", async () => {
      const result = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "MCP test card",
        front_html: "<div>Front</div>",
        back_html: "<div>Back</div>",
        tags: ["mcp", "test"],
      });
      const card = mcp.parseToolResult<any>(result);

      expect(card.id).toBeDefined();
      expect(card.concept).toBe("MCP test card");
      expect(card.bloomState).toBeDefined();
      expect(card.bloomState.currentLevel).toBe(0);
      expect(card.fsrsState).toBeDefined();
      expect(card.fsrsState.state).toBe(0);
      // Embedding is excluded from responses (internal-only)
      expect(card.embedding).toBeUndefined();
      createdCardIds.push(card.id);
    });

    it("get_card returns card with full state", async () => {
      const result = await mcp.callTool("get_card", {
        card_id: CARDS.REV_SLOPE_INT,
      });
      const card = mcp.parseToolResult<any>(result);

      expect(card.concept).toBe("Slope-intercept form");
      expect(card.bloomState).toBeDefined();
      expect(card.bloomState.currentLevel).toBe(3);
      expect(card.fsrsState).toBeDefined();
      expect(card.reviews).toBeDefined();
      expect(card.reviews.length).toBe(4);
    });

    it("update_card concept triggers re-embedding", async () => {
      // Use the card created in the create_card test
      const cardId = createdCardIds[0];

      const beforeResult = await mcp.callTool("get_card", {
        card_id: cardId,
      });
      const before = mcp.parseToolResult<any>(beforeResult);

      const updateResult = await mcp.callTool("update_card", {
        card_id: cardId,
        concept: "Completely different quantum mechanics concept",
      });
      const updated = mcp.parseToolResult<any>(updateResult);

      expect(updated.concept).toBe(
        "Completely different quantum mechanics concept",
      );
      // Embedding is excluded from response but recomputed server-side;
      // verify update happened by checking updatedAt changed
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
        new Date(before.updatedAt).getTime(),
      );
    });

    it("delete_card removes card", async () => {
      // Create a throwaway card
      const createResult = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "MCP delete test",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      const card = mcp.parseToolResult<any>(createResult);

      const deleteResult = await mcp.callTool("delete_card", {
        card_id: card.id,
      });
      expect(deleteResult.isError).toBeFalsy();

      // Verify gone
      const getResult = await mcp.callTool("get_card", {
        card_id: card.id,
      });
      expect(getResult.isError).toBe(true);
    });
  });

  describe("Cloze Cards", () => {
    it("create_card with cloze_source convenience param succeeds", async () => {
      const result = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "MCP cloze test card",
        cloze_source:
          "{{c1::mitochondria::organelle}} is the {{c2::powerhouse}} of the cell.",
      });
      expect(result.isError).toBeFalsy();

      const card = mcp.parseToolResult<any>(result);
      expect(card.id).toBeDefined();
      expect(card.cardType).toBe("cloze");
      expect(card.clozeData).toBeDefined();
      expect(card.clozeData.deletions).toHaveLength(2);
      expect(card.clozeData.sourceText).toContain("{{c1::");
      expect(card.bloomState.currentLevel).toBe(0);
      expect(card.fsrsState.state).toBe(0);
      // Auto-rendered HTML
      expect(card.frontHtml).toContain("[organelle]");
      expect(card.backHtml).toContain("<mark>");
      createdCardIds.push(card.id);
    });

    it("get_card returns cloze fields", async () => {
      const clozeCardId = createdCardIds[createdCardIds.length - 1];
      const result = await mcp.callTool("get_card", {
        card_id: clozeCardId,
      });
      expect(result.isError).toBeFalsy();

      const card = mcp.parseToolResult<any>(result);
      expect(card.cardType).toBe("cloze");
      expect(card.clozeData).toBeDefined();
      expect(card.clozeData.deletions).toHaveLength(2);
      expect(card.frontHtml).toContain("[organelle]");
      expect(card.backHtml).toContain("<mark>");
    });

    it("get_study_cards returns cloze cards with proper shape", async () => {
      const result = await mcp.callTool("get_study_cards", { limit: 100 });
      const cards = mcp.parseToolResult<any[]>(result);

      const clozeCards = cards.filter((c: any) => c.cardType === "cloze");
      expect(clozeCards.length).toBeGreaterThan(0);

      for (const card of clozeCards) {
        expect(card.clozeData).toBeDefined();
        expect(card.clozeData.deletions).toBeDefined();
        expect(card.clozeData.sourceText).toBeDefined();
      }
    });

    it("submit_review works for cloze cards", async () => {
      const clozeCardId = createdCardIds[createdCardIds.length - 1];
      const reviewResult = await mcp.callTool("submit_review", {
        card_id: clozeCardId,
        bloom_level: 0,
        rating: 3,
        question_text: "MCP cloze review test",
      });
      expect(reviewResult.isError).toBeFalsy();

      const review = mcp.parseToolResult<any>(reviewResult);
      expect(review.review.rating).toBe(3);
      expect(review.fsrsState.reps).toBeGreaterThan(0);
      expect(review.bloomState.currentLevel).toBe(1);
    });

    it("create_card with invalid cloze_source returns error", async () => {
      const result = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Invalid cloze source",
        cloze_source: "No cloze syntax here at all.",
      });
      expect(result.isError).toBe(true);
    });

    it("create_card rejects cloze_source with front_html/back_html", async () => {
      const result = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Both params",
        cloze_source: "{{c1::test}}",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      expect(result.isError).toBe(true);
    });

    it("create_card with card_type cloze but no cloze_source returns error", async () => {
      const result = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Missing cloze source",
        card_type: "cloze",
      });
      expect(result.isError).toBe(true);
    });
  });

  describe("Study", () => {
    it("get_study_cards returns due cards", async () => {
      const result = await mcp.callTool("get_study_cards", { limit: 50 });
      const cards = mcp.parseToolResult<any[]>(result);

      // Should match the expected due count (may vary if previous tests left cards)
      expect(cards.length).toBeGreaterThanOrEqual(SEED.totalStudyable);

      // All should have fsrsState with due in the past
      const now = new Date();
      for (const card of cards) {
        expect(card.fsrsState).toBeDefined();
        expect(
          new Date(card.fsrsState.due).getTime(),
        ).toBeLessThanOrEqual(now.getTime() + 60_000);
      }
    });

    it("get_study_cards filters by topic", async () => {
      const result = await mcp.callTool("get_study_cards", {
        topic_id: TOPICS.MATHEMATICS,
        limit: 50,
      });
      const cards = mcp.parseToolResult<any[]>(result);

      expect(cards.length).toBe(SEED.mathTreeStudyable);

      // No bio cards
      const ids = cards.map((c: any) => c.id);
      expect(ids).not.toContain(CARDS.BIO_CELL_STRUCT);
      expect(ids).not.toContain(CARDS.BIO_MITOSIS);
    });

    it("get_study_summary returns correct counts", async () => {
      const result = await mcp.callTool("get_study_summary", {});
      const summary = mcp.parseToolResult<any>(result);

      expect(summary.totalCards).toBeGreaterThanOrEqual(SEED.totalCards);
      expect(summary.dueCount).toBeGreaterThanOrEqual(SEED.totalDueCount);  // excludes new cards
      expect(summary.bloomLevels).toBeDefined();
    });

    it("submit_review updates state", async () => {
      // Create a fresh card
      const createResult = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "MCP review test",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      const card = mcp.parseToolResult<any>(createResult);
      createdCardIds.push(card.id);

      const reviewResult = await mcp.callTool("submit_review", {
        card_id: card.id,
        bloom_level: 0,
        rating: 3,
        question_text: "MCP test question",
      });
      const review = mcp.parseToolResult<any>(reviewResult);

      expect(review.review).toBeDefined();
      expect(review.review.rating).toBe(3);
      expect(review.fsrsState.reps).toBeGreaterThan(0);
      expect(review.bloomState.currentLevel).toBe(1);
    });
  });

  describe("Context", () => {
    it("get_topic_context returns cards for topic tree", async () => {
      const result = await mcp.callTool("get_topic_context", {
        topic_id: TOPICS.MATHEMATICS,
      });
      const cards = mcp.parseToolResult<any[]>(result);

      expect(cards.length).toBe(SEED.mathTreeCards);
      for (const card of cards) {
        expect(card.id).toBeDefined();
        expect(card.concept).toBeDefined();
        expect(card.bloomState).toBeDefined();
      }
    });

    it("get_similar_cards returns ranked results", async () => {
      const result = await mcp.callTool("get_similar_cards", {
        card_id: CARDS.NEW_ADDITION,
        limit: 15,
      });
      const cards = mcp.parseToolResult<any[]>(result);

      expect(cards.length).toBeGreaterThan(0);

      // Should not contain the source card itself
      const ids = cards.map((c: any) => c.id);
      expect(ids).not.toContain(CARDS.NEW_ADDITION);

      // Should not contain the NULL-embedding card
      expect(ids).not.toContain(CARDS.BIO_PHOTO_NOEMB);

      // Should have similarity scores in descending order
      for (let i = 1; i < cards.length; i++) {
        expect(cards[i].similarity).toBeLessThanOrEqual(cards[i - 1].similarity);
      }
    });
  });

  describe("Skill Tools", () => {
    it("get_instructions returns non-empty instructions", async () => {
      const result = await mcp.callTool("get_instructions", {});
      const textContent = result.content.find((c) => c.type === "text");

      expect(textContent).toBeDefined();
      expect(textContent!.text).toContain("LearnForge");
      expect(textContent!.text.length).toBeGreaterThan(100);
    });

    it("get_templates returns all templates", async () => {
      const result = await mcp.callTool("get_templates", {});
      const templates = mcp.parseToolResult<any[]>(result);

      expect(templates.length).toBe(6);
      const names = templates.map((t: any) => t.name);
      expect(names).toContain("mcq");
      expect(names).toContain("open-response");
      expect(names).toContain("visual-explain");
      expect(names).toContain("label-diagram");
      expect(names).toContain("slider");
      expect(names).toContain("cloze");

      for (const t of templates) {
        expect(t.description).toBeTruthy();
        expect(t.variables).toBeTruthy();
        expect(t.html).toBeTruthy();
      }
    });

    it("get_templates returns single template", async () => {
      const result = await mcp.callTool("get_templates", {
        template_name: "mcq",
      });
      const template = mcp.parseToolResult<any>(result);

      expect(template.name).toBe("mcq");
      expect(template.html).toContain("fieldset");
    });
  });

  describe("Error Handling", () => {
    /** Extract error text and verify no stack traces leak through. */
    function getErrorText(result: { content: Array<{ type: string; text?: string }> }): string {
      const text = result.content.find((c) => c.type === "text")?.text ?? "";
      // MCP errors should never expose raw stack traces
      expect(text).not.toMatch(/^\s+at\s+/m);
      expect(text).not.toContain("node_modules");
      return text;
    }

    it("get_card with non-existent UUID returns error", async () => {
      const result = await mcp.callTool("get_card", {
        card_id: "00000000-0000-0000-0000-000000000099",
      });
      expect(result.isError).toBe(true);
      getErrorText(result);
    });

    it("delete_topic with cards returns error", async () => {
      const result = await mcp.callTool("delete_topic", {
        topic_id: TOPICS.MATHEMATICS,
      });
      expect(result.isError).toBe(true);

      const text = getErrorText(result);
      expect(text).toMatch(/card/i);
    });

    it("create_card with missing concept returns error", async () => {
      const result = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      expect(result.isError).toBe(true);
      const text = getErrorText(result);
      expect(text).toMatch(/concept/i);
    });

    it("create_card with missing front_html returns error", async () => {
      const result = await mcp.callTool("create_card", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Test concept",
        back_html: "<p>A</p>",
      });
      expect(result.isError).toBe(true);
      const text = getErrorText(result);
      expect(text).toMatch(/front_html/i);
    });

    it("create_card with non-existent topic_id returns error", async () => {
      const result = await mcp.callTool("create_card", {
        topic_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        concept: "Orphan card",
        front_html: "<p>Q</p>",
        back_html: "<p>A</p>",
      });
      expect(result.isError).toBe(true);
      getErrorText(result);
    });

    it("submit_review with rating 0 returns error", async () => {
      const result = await mcp.callTool("submit_review", {
        card_id: CARDS.NEW_ADDITION,
        bloom_level: 0,
        rating: 0,
        question_text: "Invalid rating test",
      });
      expect(result.isError).toBe(true);
      const text = getErrorText(result);
      expect(text).toMatch(/rating/i);
    });

    it("submit_review with rating 5 returns error", async () => {
      const result = await mcp.callTool("submit_review", {
        card_id: CARDS.NEW_ADDITION,
        bloom_level: 0,
        rating: 5,
        question_text: "Invalid rating test",
      });
      expect(result.isError).toBe(true);
      const text = getErrorText(result);
      expect(text).toMatch(/rating/i);
    });

    it("submit_review with non-existent card_id returns error", async () => {
      const result = await mcp.callTool("submit_review", {
        card_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        bloom_level: 0,
        rating: 3,
        question_text: "Ghost card test",
      });
      expect(result.isError).toBe(true);
      getErrorText(result);
    });

    it("update_card with non-existent card_id returns error", async () => {
      const result = await mcp.callTool("update_card", {
        card_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        concept: "Updated ghost",
      });
      expect(result.isError).toBe(true);
      getErrorText(result);
    });

    it("create_topic with empty name returns error", async () => {
      const result = await mcp.callTool("create_topic", {
        name: "",
      });
      expect(result.isError).toBe(true);
      const text = getErrorText(result);
      expect(text).toMatch(/name/i);
    });
  });

  describe("Auth", () => {
    it("rejects request without API key", async () => {
      const unauth = createUnauthMcpClient();
      const res = await unauth.post("/mcp", {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0.0" },
        },
      });
      expect(res.status).toBe(401);
    });

    it("rejects request with wrong API key", async () => {
      const badClient = new McpTestClient(undefined, "wrong-key");
      const { status } = await badClient.rawRequest("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      });
      expect(status).toBe(401);
    });
  });
});
