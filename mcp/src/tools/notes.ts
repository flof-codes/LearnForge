import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Db } from "@learnforge/core";
import {
  createNote, getNote, updateNote, deleteNote, listNotes,
  listNoteTypes, getNoteType, saveNoteType, deleteNoteType,
} from "@learnforge/core";

function ok(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}
function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

const fields = z.record(z.string(), z.string().max(20000)).describe("Field values as HTML, keyed by field name (or key f1, f2 …)");

export function registerNoteTools(server: McpServer, db: Db, userId: string) {
  server.tool(
    "create_note",
    "Create a typed note; the server renders one card per template (or per cloze gap) and schedules each. Built-in types: 'open' (Question, Answer, Explanation), 'choice' (Question, Option A–F, Correct, Explanation), 'cloze' (Text with {{c1::answer::hint}} gaps, Extra). Use create_card only for a Freeform card with its own HTML. Preview the fields to the learner first and wait for approval.",
    {
      topic_id: z.string().uuid(),
      note_type: z.string().min(1).describe("'open', 'choice', 'cloze' or a note type id"),
      fields,
      tags: z.array(z.string()).optional(),
      concept: z.string().min(1).optional().describe("Short label for search; defaults to the first field's text"),
    },
    async (input) => {
      try { return ok(await createNote(db, userId, input)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "get_note",
    "Get a note with its fields, type and the cards it renders into.",
    { note_id: z.string().uuid() },
    async ({ note_id }) => {
      try { return ok(await getNote(db, userId, note_id)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "update_note",
    "Change a note's fields, tags, concept or topic. Every card of the note is re-rendered; new cloze gaps get new cards, vanished gaps are suspended. Moving the topic moves all sibling cards.",
    {
      note_id: z.string().uuid(),
      fields: fields.optional(),
      tags: z.array(z.string()).optional(),
      topic_id: z.string().uuid().optional(),
      concept: z.string().min(1).optional(),
    },
    async ({ note_id, ...input }) => {
      try { return ok(await updateNote(db, userId, note_id, input)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "delete_note",
    "Delete a note and every card rendered from it, with their history.",
    { note_id: z.string().uuid() },
    async ({ note_id }) => {
      try { return ok(await deleteNote(db, userId, note_id)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "list_notes",
    "List notes, optionally below a topic (recursive).",
    { topic_id: z.string().uuid().optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() },
    async ({ topic_id, limit, offset }) => {
      try { return ok(await listNotes(db, userId, topic_id, limit, offset)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "list_note_types",
    "List the learner's note types (card designs): the built-ins Open, Choice and Cloze plus their own, each with fields and card templates.",
    {},
    async () => {
      try { return ok(await listNoteTypes(db, userId)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "get_note_type",
    "Get one note type with fields, templates and CSS.",
    { note_type_id: z.string().uuid() },
    async ({ note_type_id }) => {
      try { return ok(await getNoteType(db, userId, note_type_id)); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "save_note_type",
    "Create a note type, or update one. Templates use Anki syntax: {{Field}}, {{#Field}}…{{/Field}}, {{FrontSide}}, {{cloze:Text}}, {{hint:Field}}, {{type:Field}}. Built-in types accept css and templates only; to change their fields, create a new type. Show the learner the design before saving.",
    {
      note_type_id: z.string().uuid().optional().describe("Omit to create"),
      name: z.string().min(1).optional(),
      kind: z.enum(["standard", "cloze"]).optional(),
      css: z.string().optional(),
      fields: z.array(z.object({ key: z.string().optional(), name: z.string().min(1) })).optional(),
      templates: z.array(z.object({ id: z.string().uuid().optional(), name: z.string().optional(), frontTemplate: z.string(), backTemplate: z.string() })).optional(),
      sortFieldKey: z.string().nullable().optional(),
    },
    async ({ note_type_id, ...input }) => {
      try { return ok(await saveNoteType(db, userId, { ...input, id: note_type_id })); } catch (err) { return fail(err); }
    },
  );

  server.tool(
    "delete_note_type",
    "Delete one of the learner's own note types. Refused while notes use it and for built-ins.",
    { note_type_id: z.string().uuid() },
    async ({ note_type_id }) => {
      try { await deleteNoteType(db, userId, note_type_id); return ok({ deleted: note_type_id }); } catch (err) { return fail(err); }
    },
  );
}
