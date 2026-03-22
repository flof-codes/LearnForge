import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { listTopics, getTopic, getTopicTree, getTopicBreadcrumb, createTopic, updateTopic, deleteTopic } from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

export default async function topicRoutes(app: FastifyInstance) {

  // GET /topics — root topics with child count + card stats (including descendants)
  app.get("/topics", async (req) => {
    const userId = getUserId(req);
    return listTopics(db, userId);
  });

  // GET /topics/:id — single topic with children + card count
  app.get<{ Params: { id: string } }>("/topics/:id", async (req) => {
    const userId = getUserId(req);
    return getTopic(db, userId, req.params.id);
  });

  // GET /topics/:id/tree — recursive CTE for full subtree
  app.get<{ Params: { id: string } }>("/topics/:id/tree", async (req) => {
    const userId = getUserId(req);
    return getTopicTree(db, userId, req.params.id);
  });

  // GET /topics/:id/breadcrumb — ancestor chain from root to this topic
  app.get<{ Params: { id: string } }>("/topics/:id/breadcrumb", async (req) => {
    const userId = getUserId(req);
    return getTopicBreadcrumb(db, userId, req.params.id);
  });

  // POST /topics
  app.post<{ Body: { name: string; description?: string; parentId?: string } }>("/topics", async (req, reply) => {
    const userId = getUserId(req);
    const result = await createTopic(db, userId, req.body);
    reply.status(201);
    return result;
  });

  // PUT /topics/:id
  app.put<{ Params: { id: string }; Body: { name?: string; description?: string; parentId?: string } }>("/topics/:id", async (req) => {
    const userId = getUserId(req);
    return updateTopic(db, userId, req.params.id, req.body);
  });

  // DELETE /topics/:id — only allowed when topic has no cards
  app.delete<{ Params: { id: string } }>("/topics/:id", async (req, reply) => {
    const userId = getUserId(req);
    await deleteTopic(db, userId, req.params.id);
    reply.status(204);
  });
}
