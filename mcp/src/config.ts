import "dotenv/config";

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgresql://learnforge:learnforge@localhost:5432/learnforge",
  imagePath: process.env.IMAGE_PATH ?? `${process.env.HOME ?? "~"}/.learnforge/images`,
  port: parseInt(process.env.PORT ?? "3001", 10),
  mcpApiKey: process.env.MCP_API_KEY ?? "dev-mcp-key-change-me",
} as const;
