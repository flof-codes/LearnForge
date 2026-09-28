import { FastifyInstance } from "fastify";
import "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import {
  assertCanStartImport, createImportJob, getImportJob, listImportJobs, claimImportJob, deleteImportJob, markImportFailed,
} from "@learnforge/core";
import { db } from "../db/connection.js";
import { config } from "../config.js";
import { getUserId } from "../lib/auth-helpers.js";
import { ValidationError } from "../lib/errors.js";
import { enqueueAnkiJob } from "../services/anki-import-runner.js";

/**
 * Anki import in two steps: the upload is analysed into a preview (decks,
 * note types, counts, guids already here), then the user commits it with a
 * schedule choice. Both steps run as background jobs; the client polls.
 */

const MAX_PACKAGE_BYTES = 200 * 1024 * 1024;

export default async function ankiImportRoutes(app: FastifyInstance) {
  app.post("/import/anki", async (request, reply) => {
    const userId = getUserId(request);
    await assertCanStartImport(db, userId);

    const file = await request.file({ limits: { fileSize: MAX_PACKAGE_BYTES, files: 1 } });
    if (!file) throw new ValidationError("No file uploaded");
    const filename = path.basename(file.filename || "deck.apkg").slice(0, 255);
    if (!/\.(apkg|colpkg)$/i.test(filename)) {
      file.file.resume();
      throw new ValidationError("Choose an Anki package (.apkg or .colpkg)");
    }

    await mkdir(config.importPath, { recursive: true });
    const id = randomUUID();
    const stagedPath = path.join(config.importPath, `${id}.upload`);
    await pipeline(file.file, createWriteStream(stagedPath));
    if (file.file.truncated) {
      await unlink(stagedPath).catch(() => {});
      throw new ValidationError(`The package is larger than ${MAX_PACKAGE_BYTES / 1024 / 1024} MB`);
    }

    let job;
    try {
      job = await createImportJob(db, userId, { id, filename, stagedPath });
    } catch (err) {
      await unlink(stagedPath).catch(() => {});
      throw err;
    }
    enqueueAnkiJob({ importId: id, userId, mode: "analyze", stagedPath, schedule: "keep" });
    reply.status(202);
    return job;
  });

  app.get("/import/anki", async (request) => listImportJobs(db, getUserId(request)));

  app.get<{ Params: { id: string } }>("/import/anki/:id", async (request) => getImportJob(db, getUserId(request), request.params.id));

  app.post<{ Params: { id: string }; Body: { schedule?: "keep" | "fresh" } }>("/import/anki/:id/commit", {
    schema: {
      body: {
        type: "object",
        properties: { schedule: { type: "string", enum: ["keep", "fresh"] } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const userId = getUserId(request);
    const schedule = request.body?.schedule ?? "keep";
    const { job, stagedPath } = await claimImportJob(db, userId, request.params.id, schedule);
    if (!(await stat(stagedPath).then(() => true, () => false))) {
      // e.g. the container was recreated between preview and commit
      await markImportFailed(db, job.id, "The upload is no longer on the server; upload the file again");
      throw new ValidationError("The upload is no longer on the server; upload the file again");
    }
    enqueueAnkiJob({ importId: job.id, userId, mode: "import", stagedPath, schedule });
    reply.status(202);
    return job;
  });

  app.delete<{ Params: { id: string } }>("/import/anki/:id", async (request, reply) => {
    const { stagedPath } = await deleteImportJob(db, getUserId(request), request.params.id);
    if (stagedPath) await unlink(stagedPath).catch(() => {});
    return reply.code(204).send();
  });
}
