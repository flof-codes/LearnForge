import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const testsDir = join(__dirname, "..");

const API_URL = "http://localhost:4444";
const MCP_URL = "http://localhost:4445";
const DB_CONFIG = {
  host: "localhost",
  port: 5555,
  user: "learnforge_test",
  password: "learnforge_test",
  database: "learnforge_test",
};

// Minimal 1x1 transparent PNG (68 bytes)
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
  "Nl7BcQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Poll a URL until it returns 200 or timeout is reached.
 */
async function waitForHealth(url: string, label: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  const interval = 2000;

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`  [ok] ${label} is healthy`);
        return;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`${label} did not become healthy within ${timeoutMs / 1000}s`);
}

/**
 * Seed the test database by executing seed.sql directly.
 */
async function seedDatabase(): Promise<void> {
  const seedPath = join(testsDir, "seed", "seed.sql");
  const sql = readFileSync(seedPath, "utf-8");

  const client = new pg.Client(DB_CONFIG);
  await client.connect();
  try {
    await client.query(sql);
    console.log("  [ok] Database seeded");
  } finally {
    await client.end();
  }
}

/**
 * Authenticate with the test API and return the JWT token.
 */
async function authenticate(): Promise<string> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "test-password" }),
  });

  if (!res.ok) {
    throw new Error(`Auth failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { token: string };
  console.log("  [ok] Authenticated with test API");
  return data.token;
}

/**
 * Create placeholder image files in the test container's image volume.
 */
async function createPlaceholderImages(): Promise<void> {
  // On-disk files are named {uuid}{ext} — matching the API's image route logic
  const pngBase64 = TINY_PNG.toString("base64");

  const files = [
    "30000000-0000-0000-0000-000000000001.png",  // CELL_DIAGRAM
    "30000000-0000-0000-0000-000000000002.png",  // STANDALONE
  ];
  for (const filename of files) {
    execSync(
      `docker compose -f docker-compose.test.yml exec -T test-api node -e "require('fs').writeFileSync('/data/images/${filename}', Buffer.from('${pngBase64}', 'base64'))"`,
      { cwd: testsDir, stdio: "pipe" },
    );
  }
  console.log("  [ok] Placeholder images created");
}

/**
 * Warmup: create and delete a throwaway card to trigger embedding model download.
 */
async function warmupEmbeddings(token: string): Promise<void> {
  console.log("  [..] Warming up embedding model (may take ~10s on first run)...");

  // We need a valid topic to create a card — use the "Empty Topic" from seed
  const topicId = "10000000-0000-0000-0000-000000000006";

  const createRes = await fetch(`${API_URL}/cards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      topic_id: topicId,
      concept: "Warmup card — delete me",
      front_html: "<p>warmup</p>",
      back_html: "<p>warmup</p>",
    }),
  });

  if (!createRes.ok) {
    console.warn(`  [!!] Warmup card creation failed: ${createRes.status}`);
    return;
  }

  const card = (await createRes.json()) as { id: string };
  const cardId = card.id;

  // Delete the warmup card
  await fetch(`${API_URL}/cards/${cardId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  console.log("  [ok] Embedding model warmed up");
}

// ── Vitest Global Setup ────────────────────────────────────────────────────

export async function setup(): Promise<void> {
  console.log("\n=== Integration Test Setup ===\n");

  // 1. Start containers
  console.log("Starting test containers...");
  execSync("docker compose -f docker-compose.test.yml up --build -d", {
    cwd: testsDir,
    stdio: "inherit",
  });

  // 2. Wait for services
  console.log("\nWaiting for services...");
  await waitForHealth(`${API_URL}/health`, "API");
  await waitForHealth(`${MCP_URL}/health`, "MCP");

  // 3. Seed database
  console.log("\nSeeding database...");
  await seedDatabase();

  // 4. Authenticate
  console.log("\nAuthenticating...");
  const token = await authenticate();

  // 5. Create placeholder images
  console.log("\nCreating placeholder images...");
  await createPlaceholderImages();

  // 6. Warmup embedding model
  console.log("\nWarming up embeddings...");
  await warmupEmbeddings(token);

  // 7. Set environment variables for test processes
  process.env.TEST_API_URL = API_URL;
  process.env.TEST_MCP_URL = MCP_URL;
  process.env.TEST_JWT_TOKEN = token;
  process.env.TEST_MCP_API_KEY = "test-mcp-key";

  console.log("\n=== Setup Complete ===\n");
}

export async function teardown(): Promise<void> {
  console.log("\n=== Integration Test Teardown ===\n");

  try {
    execSync(
      "docker compose -f docker-compose.test.yml down --volumes --remove-orphans",
      { cwd: testsDir, stdio: "inherit" },
    );
    console.log("\n=== Teardown Complete ===\n");
  } catch (err) {
    console.error("Teardown failed:", err);
  }
}
