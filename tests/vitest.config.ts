import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./src/setup.ts"],
    include: ["src/workflows/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ["verbose"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json"],
      reportsDirectory: "./coverage",
    },
  },
});
