import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AxiosInstance } from "axios";
import { login, getApi } from "../helpers/api-client.js";
import { TOPICS, SEED } from "../helpers/fixtures.js";

let api: AxiosInstance;
const createdTopicIds: string[] = [];

beforeAll(async () => {
  await login();
  api = getApi();
});

afterAll(async () => {
  // Clean up created topics (reverse order to handle parent-child)
  for (const id of [...createdTopicIds].reverse()) {
    await api.delete(`/topics/${id}`);
  }
});

describe("Topic Hierarchy", () => {

  describe("Read Operations", () => {
    it("lists root topics only", async () => {
      const res = await api.get("/topics");
      expect(res.status).toBe(200);

      const names = res.data.map((t: any) => t.name);
      expect(names).toContain("Mathematics");
      expect(names).toContain("Biology");
      expect(names).toContain("Empty Topic");
      // Children should not appear at root level
      expect(names).not.toContain("Algebra");
      expect(names).not.toContain("Linear Equations");
      expect(names).not.toContain("Cell Biology");
    });

    it("root topics have recursive cardCount", async () => {
      const res = await api.get("/topics");
      const math = res.data.find((t: any) => t.id === TOPICS.MATHEMATICS);
      const bio = res.data.find((t: any) => t.id === TOPICS.BIOLOGY);
      const empty = res.data.find((t: any) => t.id === TOPICS.EMPTY_TOPIC);

      expect(math.cardCount).toBe(SEED.mathTreeCards);
      expect(bio.cardCount).toBe(SEED.bioTreeCards);
      expect(empty.cardCount).toBe(SEED.emptyTopicCards);
    });

    it("root topics have recursive dueCount", async () => {
      const res = await api.get("/topics");
      const math = res.data.find((t: any) => t.id === TOPICS.MATHEMATICS);
      const bio = res.data.find((t: any) => t.id === TOPICS.BIOLOGY);

      expect(math.dueCount).toBe(SEED.mathTreeDueCount);     // excludes new cards
      expect(bio.dueCount).toBe(SEED.bioTreeDueCount);       // excludes new cards
    });

    it("gets topic detail with children", async () => {
      const res = await api.get(`/topics/${TOPICS.MATHEMATICS}`);
      expect(res.status).toBe(200);
      expect(res.data.name).toBe("Mathematics");
      expect(res.data.children).toBeDefined();
      expect(Array.isArray(res.data.children)).toBe(true);

      const algebraChild = res.data.children.find((c: any) => c.id === TOPICS.ALGEBRA);
      expect(algebraChild).toBeDefined();
      expect(algebraChild.name).toBe("Algebra");
      expect(algebraChild.childCount).toBe(1); // Linear Equations
    });

    it("gets topic tree (nested)", async () => {
      const res = await api.get(`/topics/${TOPICS.MATHEMATICS}/tree`);
      expect(res.status).toBe(200);
      expect(res.data.name).toBe("Mathematics");
      expect(res.data.children).toBeDefined();

      const algebra = res.data.children.find((c: any) => c.name === "Algebra");
      expect(algebra).toBeDefined();
      expect(algebra.children).toBeDefined();

      const linear = algebra.children.find((c: any) => c.name === "Linear Equations");
      expect(linear).toBeDefined();
      expect(linear.children).toHaveLength(0);
    });

    it("gets breadcrumb for nested topic", async () => {
      const res = await api.get(`/topics/${TOPICS.LINEAR_EQUATIONS}/breadcrumb`);
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(3);
      expect(res.data[0].name).toBe("Mathematics");
      expect(res.data[1].name).toBe("Algebra");
      expect(res.data[2].name).toBe("Linear Equations");
    });

    it("gets breadcrumb for root topic", async () => {
      const res = await api.get(`/topics/${TOPICS.MATHEMATICS}/breadcrumb`);
      expect(res.status).toBe(200);
      expect(res.data).toHaveLength(1);
      expect(res.data[0].name).toBe("Mathematics");
    });
  });

  describe("Create Operations", () => {
    it("creates a root topic", async () => {
      const res = await api.post("/topics", { name: "Physics", description: "Test topic" });
      expect(res.status).toBe(201);
      expect(res.data.name).toBe("Physics");
      expect(res.data.parentId).toBeNull();
      expect(res.data.id).toBeDefined();
      createdTopicIds.push(res.data.id);

      // Verify it shows up in root list
      const listRes = await api.get("/topics");
      const names = listRes.data.map((t: any) => t.name);
      expect(names).toContain("Physics");
    });

    it("creates a child topic", async () => {
      const res = await api.post("/topics", {
        name: "Mechanics",
        parentId: createdTopicIds[0], // Physics
      });
      expect(res.status).toBe(201);
      expect(res.data.parentId).toBe(createdTopicIds[0]);
      createdTopicIds.push(res.data.id);
    });
  });

  describe("Update Operations", () => {
    it("updates topic name", async () => {
      // Create a topic to update
      const createRes = await api.post("/topics", { name: "Temp Topic" });
      createdTopicIds.push(createRes.data.id);

      const res = await api.put(`/topics/${createRes.data.id}`, { name: "Updated Name" });
      expect(res.status).toBe(200);
      expect(res.data.name).toBe("Updated Name");
    });

    it("reparents a topic", async () => {
      const createRes = await api.post("/topics", { name: "Orphan" });
      createdTopicIds.push(createRes.data.id);

      const res = await api.put(`/topics/${createRes.data.id}`, {
        parentId: TOPICS.BIOLOGY,
      });
      expect(res.status).toBe(200);
      expect(res.data.parentId).toBe(TOPICS.BIOLOGY);
    });

    it("rejects self-parenting", async () => {
      const createRes = await api.post("/topics", { name: "Self Parent" });
      createdTopicIds.push(createRes.data.id);

      const res = await api.put(`/topics/${createRes.data.id}`, {
        parentId: createRes.data.id,
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("Delete Operations", () => {
    it("deletes an empty topic", async () => {
      const createRes = await api.post("/topics", { name: "To Delete" });
      const deleteRes = await api.delete(`/topics/${createRes.data.id}`);
      expect(deleteRes.status).toBe(204);

      // Verify it's gone
      const getRes = await api.get(`/topics/${createRes.data.id}`);
      expect(getRes.status).toBe(404);
    });

    it("fails to delete topic with cards", async () => {
      const res = await api.delete(`/topics/${TOPICS.MATHEMATICS}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.data.error).toMatch(/card/i);
    });

    it("orphans children when parent is deleted", async () => {
      // Create parent + child
      const parentRes = await api.post("/topics", { name: "Parent To Delete" });
      const childRes = await api.post("/topics", {
        name: "Child To Orphan",
        parentId: parentRes.data.id,
      });

      // Delete parent
      await api.delete(`/topics/${parentRes.data.id}`);

      // Child should now have null parentId
      const childDetail = await api.get(`/topics/${childRes.data.id}`);
      expect(childDetail.status).toBe(200);
      expect(childDetail.data.parentId).toBeNull();

      // Cleanup child
      await api.delete(`/topics/${childRes.data.id}`);
    });
  });

  describe("Validation", () => {
    it("rejects creating topic with missing name", async () => {
      const res = await api.post("/topics", { description: "No name given" });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/name/i);
    });

    it("rejects creating topic with empty name", async () => {
      const res = await api.post("/topics", { name: "" });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/name/i);
    });

    it("rejects updating non-existent topic", async () => {
      const res = await api.put("/topics/ffffffff-ffff-ffff-ffff-ffffffffffff", {
        name: "Ghost Topic",
      });
      expect(res.status).toBe(404);
    });

    it("rejects creating topic with non-existent parentId", async () => {
      const res = await api.post("/topics", {
        name: "Bad Parent",
        parentId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
      });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });
});
