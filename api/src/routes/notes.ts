import { FastifyInstance } from "fastify";
import { db } from "../db/connection.js";
import {
  createNote, getNote, updateNote, deleteNote, listNotes,
  listNoteTypes, getNoteType, saveNoteType, deleteNoteType,
  type CreateNoteInput, type UpdateNoteInput, type SaveNoteTypeInput,
} from "@learnforge/core";
import { getUserId } from "../lib/auth-helpers.js";

const fieldsSchema = { type: "object", additionalProperties: { type: "string", maxLength: 20000 } };

export default async function noteRoutes(app: FastifyInstance) {
  // ── Notes ────────────────────────────────────────────────────────────
  app.get<{ Querystring: { topic_id?: string; limit?: string; offset?: string } }>("/notes", async (req) => {
    const userId = getUserId(req);
    return listNotes(db, userId, req.query.topic_id, parseInt(req.query.limit ?? "50", 10) || 50, parseInt(req.query.offset ?? "0", 10) || 0);
  });

  app.post<{ Body: CreateNoteInput }>("/notes", {
    schema: {
      body: {
        type: "object",
        required: ["topic_id", "note_type", "fields"],
        properties: {
          topic_id: { type: "string", format: "uuid" },
          note_type: { type: "string", minLength: 1 },
          fields: fieldsSchema,
          tags: { type: "array", items: { type: "string" } },
          concept: { type: "string", minLength: 1 },
          anki_guid: { type: "string" },
          source_ref: { type: "string", minLength: 1, maxLength: 200 },
        },
        additionalProperties: false,
      },
    },
  }, async (req, reply) => {
    const userId = getUserId(req);
    const result = await createNote(db, userId, req.body);
    reply.status(201);
    return result;
  });

  app.get<{ Params: { id: string } }>("/notes/:id", async (req) => {
    const userId = getUserId(req);
    return getNote(db, userId, req.params.id);
  });

  app.put<{ Params: { id: string }; Body: UpdateNoteInput }>("/notes/:id", {
    schema: {
      body: {
        type: "object",
        properties: {
          fields: fieldsSchema,
          tags: { type: "array", items: { type: "string" } },
          topic_id: { type: "string", format: "uuid" },
          concept: { type: "string", minLength: 1 },
        },
        additionalProperties: false,
      },
    },
  }, async (req) => {
    const userId = getUserId(req);
    return updateNote(db, userId, req.params.id, req.body);
  });

  app.delete<{ Params: { id: string } }>("/notes/:id", async (req, reply) => {
    const userId = getUserId(req);
    await deleteNote(db, userId, req.params.id);
    reply.status(204);
  });

  // ── Note types (card designs) ────────────────────────────────────────
  app.get("/note-types", async (req) => {
    const userId = getUserId(req);
    return listNoteTypes(db, userId);
  });

  app.get<{ Params: { id: string } }>("/note-types/:id", async (req) => {
    const userId = getUserId(req);
    return getNoteType(db, userId, req.params.id);
  });

  const templateSchema = {
    type: "object",
    required: ["frontTemplate", "backTemplate"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      frontTemplate: { type: "string" },
      backTemplate: { type: "string" },
    },
  };
  const noteTypeBody = {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1 },
      kind: { type: "string", enum: ["standard", "cloze"] },
      css: { type: "string" },
      fields: { type: "array", items: { type: "object", required: ["name"], properties: { key: { type: "string" }, name: { type: "string" } } } },
      templates: { type: "array", items: templateSchema },
      sortFieldKey: { type: ["string", "null"] },
    },
    additionalProperties: false,
  };

  app.post<{ Body: SaveNoteTypeInput }>("/note-types", { schema: { body: noteTypeBody } }, async (req, reply) => {
    const userId = getUserId(req);
    const result = await saveNoteType(db, userId, req.body);
    reply.status(201);
    return result;
  });

  app.put<{ Params: { id: string }; Body: SaveNoteTypeInput }>("/note-types/:id", { schema: { body: noteTypeBody } }, async (req) => {
    const userId = getUserId(req);
    return saveNoteType(db, userId, { ...req.body, id: req.params.id });
  });

  app.delete<{ Params: { id: string } }>("/note-types/:id", async (req, reply) => {
    const userId = getUserId(req);
    await deleteNoteType(db, userId, req.params.id);
    reply.status(204);
  });
}
