import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
  getSharePreview,
  acceptShareLink,
} from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";
import { config } from "../config.js";

function buildShareUrl(token: string): string {
  return `${config.appUrl.replace(/\/$/, "")}/share/${token}`;
}

export default async function shareRoutes(app: FastifyInstance) {
  app.post<{ Body: { topic_id: string } }>("/shares", {
    schema: {
      body: {
        type: "object",
        required: ["topic_id"],
        properties: { topic_id: { type: "string", format: "uuid" } },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const userId = getUserId(req);
    const link = await createShareLink(db, userId, req.body.topic_id);
    reply.status(201);
    return {
      id: link.id,
      token: link.token,
      topic_id: link.topicId,
      url: buildShareUrl(link.token),
      created_at: link.createdAt,
      revoked_at: link.revokedAt,
    };
  });

  app.get("/shares", async (req) => {
    const userId = getUserId(req);
    const rows = await listShareLinks(db, userId);
    return rows.map(r => ({
      id: r.id,
      token: r.token,
      topic_id: r.topicId,
      topic_name: r.topicName,
      url: buildShareUrl(r.token),
      created_at: r.createdAt,
      revoked_at: r.revokedAt,
    }));
  });

  app.delete<{ Params: { id: string } }>("/shares/:id", async (req, reply) => {
    const userId = getUserId(req);
    await revokeShareLink(db, userId, req.params.id);
    reply.status(204);
  });

  app.get<{ Params: { token: string } }>("/shares/preview/:token", async (req) => {
    const preview = await getSharePreview(db, req.params.token);
    return {
      topic_name: preview.topicName,
      topic_description: preview.topicDescription,
      card_count: preview.cardCount,
      subtopic_count: preview.subtopicCount,
    };
  });

  app.post<{ Params: { token: string } }>("/shares/accept/:token", async (req) => {
    const userId = getUserId(req);
    const result = await acceptShareLink(db, userId, req.params.token, { imagePath: config.imagePath });
    return { topic_id: result.topicId };
  });
}
