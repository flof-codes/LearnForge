import { describe, it, expect, beforeAll, afterAll } from "vitest";
import axios, { type AxiosInstance } from "axios";
import { login, getApi, getUnauthApi } from "../helpers/api-client.js";
import { TEST_CONFIG } from "../helpers/fixtures.js";

let userAApi: AxiosInstance;
let userBApi: AxiosInstance;

const createdTopicIdsA: string[] = [];
const createdTopicIdsB: string[] = [];

async function loginAs(email: string, password: string): Promise<AxiosInstance> {
  const url = process.env.TEST_API_URL ?? TEST_CONFIG.apiUrl;
  const res = await axios.post(`${url}/auth/login`, { email, password });
  return axios.create({
    baseURL: url,
    headers: { Authorization: `Bearer ${res.data.token}` },
    validateStatus: () => true,
  });
}

beforeAll(async () => {
  await login(TEST_CONFIG.email, TEST_CONFIG.password);
  userAApi = getApi();
  userBApi = await loginAs(TEST_CONFIG.otherEmail, TEST_CONFIG.otherPassword);
});

afterAll(async () => {
  // Best-effort cleanup — tests create their own topics; recipients' trees are created via accept.
  for (const id of [...createdTopicIdsA].reverse()) {
    await userAApi.delete(`/topics/${id}`).catch(() => {});
  }
  for (const id of [...createdTopicIdsB].reverse()) {
    await userBApi.delete(`/topics/${id}`).catch(() => {});
  }
});

function createTestPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "base64",
  );
}

function buildMultipartBody(
  filename: string,
  mimeType: string,
  fileBuffer: Buffer,
  fields?: Record<string, string>,
): { body: Buffer; contentType: string } {
  const boundary = "----ShareTestBoundary" + Date.now();
  const parts: Buffer[] = [];
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
      ));
    }
  }
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ));
  parts.push(fileBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe("Share Cards - Copy Mode", () => {
  let sourceTopicId: string;
  let sourceChildTopicId: string;
  let shareId: string;
  let shareToken: string;
  let importedTopicId: string;

  it("sets up source topic tree with cards", async () => {
    // Parent topic
    const parent = await userAApi.post("/topics", {
      name: "Share Source Parent",
      description: "Topic to share",
    });
    expect(parent.status).toBe(201);
    sourceTopicId = parent.data.id;
    createdTopicIdsA.push(sourceTopicId);

    // Child topic
    const child = await userAApi.post("/topics", {
      name: "Share Source Child",
      parentId: sourceTopicId,
    });
    expect(child.status).toBe(201);
    sourceChildTopicId = child.data.id;

    // 2 cards in parent, 1 card in child
    await userAApi.post("/cards", {
      topic_id: sourceTopicId,
      concept: "Parent Card 1",
      front_html: "<p>Front 1</p>",
      back_html: "<p>Back 1</p>",
      tags: ["share", "test"],
    });
    await userAApi.post("/cards", {
      topic_id: sourceTopicId,
      concept: "Parent Card 2",
      front_html: "<p>Front 2</p>",
      back_html: "<p>Back 2</p>",
    });
    await userAApi.post("/cards", {
      topic_id: sourceChildTopicId,
      concept: "Child Card",
      front_html: "<p>Child Front</p>",
      back_html: "<p>Child Back</p>",
    });
    void sourceChildTopicId;
  });

  it("creates a share link", async () => {
    const res = await userAApi.post("/shares", { topic_id: sourceTopicId });
    expect(res.status).toBe(201);
    expect(res.data.token).toBeDefined();
    expect(res.data.url).toContain(`/share/${res.data.token}`);
    expect(res.data.revoked_at).toBeNull();
    shareId = res.data.id;
    shareToken = res.data.token;
  });

  it("lists share links for sharer", async () => {
    const res = await userAApi.get("/shares");
    expect(res.status).toBe(200);
    const link = res.data.find((l: { id: string }) => l.id === shareId);
    expect(link).toBeDefined();
    expect(link.topic_name).toBe("Share Source Parent");
  });

  it("returns public preview without auth", async () => {
    const unauth = getUnauthApi();
    const res = await unauth.get(`/shares/preview/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.data.topic_name).toBe("Share Source Parent");
    expect(res.data.card_count).toBe(3);
    expect(res.data.subtopic_count).toBe(1);
    expect(res.data.owner_email).toBeUndefined();
  });

  it("sharer cannot import their own share link", async () => {
    const res = await userAApi.post(`/shares/accept/${shareToken}`, {});
    expect(res.status).toBe(400);
    expect(res.data.error).toMatch(/own share/i);
  });

  it("requires auth for accept", async () => {
    const unauth = getUnauthApi();
    const res = await unauth.post(`/shares/accept/${shareToken}`, {});
    expect(res.status).toBe(401);
  });

  it("recipient accepts link and gets copied tree", async () => {
    const res = await userBApi.post(`/shares/accept/${shareToken}`, {});
    expect(res.status).toBe(200);
    importedTopicId = res.data.topic_id;
    createdTopicIdsB.push(importedTopicId);

    // Verify it's at root (parentId null)
    const detail = await userBApi.get(`/topics/${importedTopicId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.name).toBe("Share Source Parent");
    expect(detail.data.parentId).toBeNull();
    expect(detail.data.children).toHaveLength(1);
    expect(detail.data.children[0].name).toBe("Share Source Child");

    // Tree rollup should show 3 cards
    expect(detail.data.cardCount).toBe(3);
  });

  it("recipient's copied cards have fresh bloom/fsrs state", async () => {
    const detail = await userBApi.get(`/topics/${importedTopicId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.cardCount).toBe(3);
    expect(detail.data.newCount).toBe(3); // all fresh (state=0)
  });

  it("sharer's cards are unaffected when recipient edits their copy", async () => {
    // Rename recipient's copy
    const renameRes = await userBApi.put(`/topics/${importedTopicId}`, { name: "Recipient Rename" });
    expect(renameRes.status).toBe(200);

    // Sharer's topic name unchanged
    const sharerDetail = await userAApi.get(`/topics/${sourceTopicId}`);
    expect(sharerDetail.data.name).toBe("Share Source Parent");

    // Undo rename for consistency
    await userBApi.put(`/topics/${importedTopicId}`, { name: "Share Source Parent" });
  });

  it("revokes share link", async () => {
    const res = await userAApi.delete(`/shares/${shareId}`);
    expect(res.status).toBe(204);
  });

  it("revoked link preview returns 404", async () => {
    const unauth = getUnauthApi();
    const res = await unauth.get(`/shares/preview/${shareToken}`);
    expect(res.status).toBe(404);
  });

  it("revoked link accept returns 404", async () => {
    const res = await userBApi.post(`/shares/accept/${shareToken}`, {});
    expect(res.status).toBe(404);
  });

  it("previously imported copy is unaffected by revocation", async () => {
    const detail = await userBApi.get(`/topics/${importedTopicId}`);
    expect(detail.status).toBe(200);
    expect(detail.data.cardCount).toBe(3);
  });

  it("cannot revoke already-revoked link", async () => {
    const res = await userAApi.delete(`/shares/${shareId}`);
    expect(res.status).toBe(404);
  });

  it("cannot revoke another user's share", async () => {
    // Create a new share as A
    const share = await userAApi.post("/shares", { topic_id: sourceTopicId });
    expect(share.status).toBe(201);
    // B tries to delete A's share
    const res = await userBApi.delete(`/shares/${share.data.id}`);
    expect(res.status).toBe(404);
    // Cleanup: A revokes it
    await userAApi.delete(`/shares/${share.data.id}`);
  });

  it("cannot create share for another user's topic", async () => {
    const res = await userBApi.post("/shares", { topic_id: sourceTopicId });
    expect(res.status).toBe(404);
  });

  it("deleting source topic cascades its share links", async () => {
    // Create new share
    const tempTopic = await userAApi.post("/topics", { name: "Temp Shareable" });
    const share = await userAApi.post("/shares", { topic_id: tempTopic.data.id });
    const token = share.data.token;

    // Delete the topic (it has no cards)
    const del = await userAApi.delete(`/topics/${tempTopic.data.id}`);
    expect(del.status).toBe(204);

    // Preview should now 404 (cascaded)
    const unauth = getUnauthApi();
    const preview = await unauth.get(`/shares/preview/${token}`);
    expect(preview.status).toBe(404);
  });

  it("rejects creating share with non-existent topic id", async () => {
    const res = await userAApi.post("/shares", {
      topic_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
    });
    expect(res.status).toBe(404);
  });

  it("preview returns 404 for unknown token", async () => {
    const unauth = getUnauthApi();
    const res = await unauth.get("/shares/preview/not-a-real-token");
    expect(res.status).toBe(404);
  });

  describe("Image copy path", () => {
    let imageTopicId: string;
    let imageCardId: string;
    let imageId: string;
    let imageShareToken: string;
    let importedImageTopicId: string;

    it("sets up topic with card containing an image", async () => {
      const topic = await userAApi.post("/topics", { name: "Image Share Source" });
      expect(topic.status).toBe(201);
      imageTopicId = topic.data.id;
      createdTopicIdsA.push(imageTopicId);

      // Create card first (without image in HTML), then upload image, then patch HTML
      const card = await userAApi.post("/cards", {
        topic_id: imageTopicId,
        concept: "Card with image",
        front_html: "<p>Question</p>",
        back_html: "<p>Answer placeholder</p>",
      });
      expect(card.status).toBe(201);
      imageCardId = card.data.id;

      const png = createTestPng();
      const { body, contentType } = buildMultipartBody(
        "share-test.png",
        "image/png",
        png,
        { card_id: imageCardId },
      );
      const uploadRes = await userAApi.post("/images", body, {
        headers: { "Content-Type": contentType },
      });
      expect(uploadRes.status).toBe(201);
      imageId = uploadRes.data.id;

      // Update card HTML to reference the uploaded image
      const updateRes = await userAApi.put(`/cards/${imageCardId}`, {
        back_html: `<p>Look: <img src="/images/${imageId}" alt="test"></p>`,
      });
      expect(updateRes.status).toBe(200);
    });

    it("creates a share link for the image topic", async () => {
      const res = await userAApi.post("/shares", { topic_id: imageTopicId });
      expect(res.status).toBe(201);
      imageShareToken = res.data.token;
    });

    async function findImportedCardBackHtml(): Promise<{ cardId: string; backHtml: string }> {
      const ctxRes = await userBApi.get(`/context/topic/${importedImageTopicId}?depth=1`);
      expect(ctxRes.status).toBe(200);
      const stub = (ctxRes.data as { concept: string; id: string }[])
        .find(c => c.concept === "Card with image");
      expect(stub).toBeDefined();
      const detail = await userBApi.get(`/cards/${stub!.id}`);
      expect(detail.status).toBe(200);
      return { cardId: stub!.id, backHtml: detail.data.backHtml };
    }

    it("recipient accepts and gets a new image with rewritten HTML", async () => {
      const res = await userBApi.post(`/shares/accept/${imageShareToken}`, {});
      expect(res.status).toBe(200);
      importedImageTopicId = res.data.topic_id;
      createdTopicIdsB.push(importedImageTopicId);

      const { backHtml } = await findImportedCardBackHtml();

      // Back HTML should reference a NEW image id (not the sharer's)
      expect(backHtml).not.toContain(`/images/${imageId}`);
      const match = backHtml.match(/\/images\/([0-9a-f-]{36})/);
      expect(match).toBeTruthy();
      const newImageId = match![1];
      expect(newImageId).not.toBe(imageId);

      // Recipient can fetch the new image; sharer cannot (it belongs to recipient)
      const recipientFetch = await userBApi.get(`/images/${newImageId}`);
      expect(recipientFetch.status).toBe(200);
      const sharerFetch = await userAApi.get(`/images/${newImageId}`);
      expect(sharerFetch.status).toBe(404);

      // Sharer's original image still exists for sharer
      const originalFetch = await userAApi.get(`/images/${imageId}`);
      expect(originalFetch.status).toBe(200);
    });

    it("deleting recipient's image does not break sharer's original", async () => {
      const { backHtml } = await findImportedCardBackHtml();
      const match = backHtml.match(/\/images\/([0-9a-f-]{36})/);
      const newImageId = match![1];

      const delRes = await userBApi.delete(`/images/${newImageId}`);
      expect(delRes.status).toBe(204);

      // Sharer's original image still fetches 200
      const originalFetch = await userAApi.get(`/images/${imageId}`);
      expect(originalFetch.status).toBe(200);
    });
  });
});
