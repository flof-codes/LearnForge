import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db } from "./connection.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(__dirname, "../../drizzle");

export async function runMigrations(retries = 5, delayMs = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await migrate(db, { migrationsFolder });
      return;
    } catch (e: unknown) {
      const code = (e as { code?: string }).code;
      // In shared-DB setups (e.g. tests) the API may have already created
      // the tables. Drizzle migration files differ between API and MCP,
      // so the MCP migration tries to CREATE TABLE and hits "already exists".
      if (code === "42P07") {
        console.log("Tables already exist (shared DB with API), skipping migration");
        return;
      }
      // DB not ready yet (recovery mode, starting up, connection refused)
      const retryable = code === "57P03" || code === "ECONNREFUSED" || code === "57P01";
      if (retryable && attempt < retries) {
        console.error(`DB not ready (${code}), retrying in ${delayMs}ms... (${attempt}/${retries})`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw e;
    }
  }
}
