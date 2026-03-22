import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import { getStudyCards, getStudySummary, getDueForecast, getStudyStats } from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

export default async function studyRoutes(app: FastifyInstance) {

  // GET /study/due — Get next due cards
  app.get<{ Querystring: { topic_id?: string; limit?: string } }>("/study/due", async (req) => {
    const userId = getUserId(req);
    const limit = parseInt(req.query.limit ?? "10", 10) || 10;
    return getStudyCards(db, userId, req.query.topic_id, limit);
  });

  // GET /study/summary — Session overview
  app.get<{ Querystring: { topic_id?: string } }>("/study/summary", async (req) => {
    const userId = getUserId(req);
    return getStudySummary(db, userId, req.query.topic_id);
  });

  // GET /study/due-forecast — Due card forecast (day or month buckets)
  app.get<{ Querystring: { topic_id?: string; range?: string } }>("/study/due-forecast", async (req) => {
    const userId = getUserId(req);
    return getDueForecast(db, userId, req.query.topic_id, req.query.range);
  });

  // GET /study/stats — Anki-style statistics
  app.get<{ Querystring: { topic_id?: string } }>("/study/stats", async (req) => {
    const userId = getUserId(req);
    return getStudyStats(db, userId, req.query.topic_id);
  });
}
