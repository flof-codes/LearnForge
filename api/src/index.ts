import { buildApp } from "./app.js";
import { runMigrations } from "./db/migrate.js";
import { config } from "./config.js";

async function main() {
  await runMigrations();

  const app = buildApp();

  await app.listen({ port: config.port, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
