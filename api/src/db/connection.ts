import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { config } from "../config.js";
import * as schema from "@learnforge/core/schema";

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
});

// Prevent unhandled pool errors from crashing the process
pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err);
});

export const db = drizzle(pool, { schema });
