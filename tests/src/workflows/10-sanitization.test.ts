import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS } from "../helpers/fixtures.js";
import { deleteFreshCard } from "../helpers/fresh-card.js";

let api: AxiosInstance;
const freshCardIds: string[] = [];

beforeAll(async () => {
  await login();
  api = getApi();
});

afterAll(async () => {
  for (const id of freshCardIds) {
    await deleteFreshCard(api, id);
  }
});

describe("HTML Sanitization", () => {

  describe("Size validation", () => {
    it("rejects card with oversized front_html", async () => {
      const hugeHtml = "<div>" + "x".repeat(110 * 1024) + "</div>";
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Oversized front",
        front_html: hugeHtml,
        back_html: "<div>Back</div>",
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("front_html");
      expect(res.data.error).toContain("100KB");
    });

    it("rejects card with oversized back_html", async () => {
      const hugeHtml = "<div>" + "x".repeat(110 * 1024) + "</div>";
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Oversized back",
        front_html: "<div>Front</div>",
        back_html: hugeHtml,
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("back_html");
    });

    it("rejects update with oversized html", async () => {
      // First create a valid card
      const createRes = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Card to update with oversized",
        front_html: "<div>Front</div>",
        back_html: "<div>Back</div>",
      });
      expect(createRes.status).toBe(201);
      freshCardIds.push(createRes.data.id);

      const hugeHtml = "<div>" + "x".repeat(110 * 1024) + "</div>";
      const res = await api.put(`/cards/${createRes.data.id}`, {
        back_html: hugeHtml,
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain("back_html");
    });
  });

  describe("Legitimate content passes", () => {
    it("accepts card with inline scripts (MCQ interactivity)", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "MCQ card with scripts",
        front_html: '<div class="lf-card"><div class="lf-question">What is 2+2?</div></div>',
        back_html: `<div class="lf-card">
          <div class="lf-opt" onclick="lfMcqToggle(this)">4</div>
          <script>function lfMcqToggle(el) { el.classList.toggle('lf-selected'); }</script>
        </div>`,
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);
    });

    it("accepts card with KaTeX CDN scripts", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "KaTeX math card",
        front_html: "<div>What is $$E=mc^2$$?</div>",
        back_html: `<div>Energy formula: $$E=mc^2$$</div>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>`,
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);
    });

    it("accepts card with external images", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Card with external image",
        front_html: '<div><img src="https://example.com/diagram.png" alt="diagram"></div>',
        back_html: "<div>Answer with image</div>",
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);
    });

    it("accepts card with SVG and event handlers", async () => {
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "SVG drag-drop card",
        front_html: "<div>Label the diagram</div>",
        back_html: `<div>
          <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r="50" fill="#3b82f6"/></svg>
          <div draggable="true" ondragstart="lfDragStart(event)">Label A</div>
          <script>function lfDragStart(e) { e.dataTransfer.setData('text', e.target.id); }</script>
        </div>`,
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);
    });

    it("accepts card just under size limit", async () => {
      // ~10KB of realistic content (well under 100KB limit)
      const paragraph = "<p>This is a sample paragraph with some educational content about mathematics and science. </p>\n";
      const html = "<div>" + paragraph.repeat(Math.floor((10 * 1024) / paragraph.length)) + "</div>";
      const res = await api.post("/cards", {
        topic_id: TOPICS.EMPTY_TOPIC,
        concept: "Large but valid card",
        front_html: "<div>Front</div>",
        back_html: html,
      });
      expect(res.status).toBe(201);
      freshCardIds.push(res.data.id);
    });
  });
});
