import { buildApp } from "./app.js";
import { runMigrations } from "./db/migrate.js";
import { config } from "./config.js";
import { db } from "./db/connection.js";
import { createMcpHttpApp } from "learnforge-mcp/http";

async function main() {
  await runMigrations();

  const app = buildApp();
  await app.listen({ port: config.port, host: "0.0.0.0" });

  const { app: mcpApp, cleanup: mcpCleanup } = createMcpHttpApp(db, {
    mcpPublicUrl: config.mcpPublicUrl,
    imagePath: config.imagePath,
  });
  const mcpServer = mcpApp.listen(config.mcpPort, "0.0.0.0", () => {
    console.log(`MCP server listening on port ${config.mcpPort}`);
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      mcpCleanup();
      mcpServer.close();
      await app.close();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
