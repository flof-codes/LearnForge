import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import {
  getFocusTopics,
  setFocusTopics,
  clearFocusTopics,
  getExpandedFocus,
} from "@learnforge/core";
import type { FocusTopicInput } from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

export default async function focusRoutes(app: FastifyInstance) {
  app.get("/focus", async (req) => {
    const userId = getUserId(req);
    const rows = await getFocusTopics(db, userId);
    return rows.map((r) => ({
      id: r.id,
      topic_id: r.topicId,
      topic_name: r.topicName,
      priority: r.priority,
      expires_at: r.expiresAt,
      created_at: r.createdAt,
    }));
  });

  app.put<{ Body: { topics: FocusTopicInput[] } }>(
    "/focus",
    {
      schema: {
        body: {
          type: "object",
          required: ["topics"],
          properties: {
            topics: {
              type: "array",
              maxItems: 20,
              items: {
                type: "object",
                required: ["topic_id"],
                properties: {
                  topic_id: { type: "string", format: "uuid" },
                  expires_at: { type: ["string", "null"], format: "date-time" },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (req) => {
      const userId = getUserId(req);
      const rows = await setFocusTopics(db, userId, req.body.topics);
      return rows.map((r) => ({
        id: r.id,
        topic_id: r.topicId,
        topic_name: r.topicName,
        priority: r.priority,
        expires_at: r.expiresAt,
        created_at: r.createdAt,
      }));
    },
  );

  app.delete("/focus", async (req, reply) => {
    const userId = getUserId(req);
    await clearFocusTopics(db, userId);
    reply.status(204);
  });

  app.get("/focus/expanded", async (req) => {
    const userId = getUserId(req);
    const entries = await getExpandedFocus(db, userId);
    return entries.map((e) => ({
      topic_id: e.topicId,
      root_topic_id: e.rootTopicId,
      priority: e.priority,
      expires_at: e.expiresAt,
      inherited: e.inherited,
    }));
  });
}
