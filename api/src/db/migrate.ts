import { migrate } from "drizzle-orm/node-postgres/migrator";
import { convertLegacyClozeCards } from "@learnforge/core";
import { db } from "./connection.js";

export async function runMigrations() {
  console.log("Running migrations...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations complete.");
  // Release 2: one card per cloze gap. Idempotent, forward-only, API boot only.
  await convertLegacyClozeCards(db);
}
