# Integration Test Suite — Specification

## Goal

A fully isolated, reproducible integration test environment that:

- Spins up a dedicated Postgres (pgvector) + API + MCP stack via Docker Compose
- Seeds a predefined dataset covering all entity types, states, and edge cases
- Runs end-to-end workflow tests against both the REST API and MCP server (StreamableHTTP)
- Tears everything down afterwards, leaving zero artifacts
- Does **not** touch the development database or containers

One command: `npm run test:integration` (from repo root)

---

## Infrastructure

### File Layout

```
tests/
  SPEC.md                         # this file
  docker-compose.test.yml         # isolated test stack
  seed/
    seed.sql                      # deterministic dataset (SQL INSERT statements)
  src/
    setup.ts                      # global setup: compose up, wait healthy, seed
    teardown.ts                   # global teardown: compose down --volumes
    helpers/
      api-client.ts               # axios wrapper pre-configured for test API (base URL + auth)
      mcp-client.ts               # MCP StreamableHTTP client (initialize, call tool, close)
      fixtures.ts                 # exported constants for seed UUIDs, expected values
    workflows/
      card-lifecycle.test.ts      # create → read → update → delete
      study-flow.test.ts          # create cards → fetch due → submit reviews → verify scheduling
      bloom-progression.test.ts   # review cycle → level advancement → regression
      topic-hierarchy.test.ts     # nested topics → recursive stats → breadcrumb → tree
      image-management.test.ts    # upload → associate → serve → delete
      mcp-tools.test.ts           # all MCP tools mirror API behavior
      mcp-study-flow.test.ts      # full study workflow through MCP tools
      error-handling.test.ts      # 404s, 400s, 401s, constraint violations, edge cases
  vitest.config.ts                # vitest config for integration tests
  package.json                    # test-only dependencies (vitest, axios)
```

### docker-compose.test.yml

```yaml
services:
  test-db:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_USER: learnforge_test
      POSTGRES_PASSWORD: learnforge_test
      POSTGRES_DB: learnforge_test
    ports:
      - "5555:5432"              # different port from dev (5432)
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U learnforge_test"]
      interval: 2s
      timeout: 2s
      retries: 10
    tmpfs:
      - /var/lib/postgresql/data  # RAM-backed for speed, no persistence needed

  test-api:
    build: ../api
    ports:
      - "4444:3000"              # different port from dev (3333)
    environment:
      DATABASE_URL: postgresql://learnforge_test:learnforge_test@test-db:5432/learnforge_test
      PORT: "3000"
      IMAGE_PATH: /data/images
      JWT_SECRET: test-jwt-secret
      AUTH_PASSWORD: test-password
      JWT_EXPIRES_IN: "1h"
    volumes:
      - test-images:/data/images
    depends_on:
      test-db:
        condition: service_healthy

  test-mcp:
    build: ../mcp
    ports:
      - "4445:3001"              # different port from dev (3001)
    environment:
      DATABASE_URL: postgresql://learnforge_test:learnforge_test@test-db:5432/learnforge_test
      PORT: "3001"
      MCP_API_KEY: test-mcp-key
      IMAGE_PATH: /data/images
    volumes:
      - test-images:/data/images
    depends_on:
      test-db:
        condition: service_healthy

volumes:
  test-images:
```

Key differences from dev:
- Port `5555` (DB), `4444` (API), `4445` (MCP) — no conflicts with dev
- Separate DB name, user, password
- `tmpfs` for DB storage — fast, auto-cleaned
- Named volume for images, removed on `docker compose down --volumes`
- Short JWT expiry, test-specific secrets

### Startup / Teardown

**setup.ts** (vitest globalSetup):
1. `docker compose -f tests/docker-compose.test.yml up --build -d`
2. Wait for all services healthy (poll `/health` endpoints, max 60s)
3. Authenticate: `POST /auth/login` with test password → store JWT
4. Execute `seed.sql` against test-db via `psql` or `pg` client
5. Export `API_URL`, `MCP_URL`, `JWT_TOKEN`, `MCP_API_KEY` as env vars

**teardown.ts** (vitest globalTeardown):
1. `docker compose -f tests/docker-compose.test.yml down --volumes --remove-orphans`

---

## Seed Dataset

### Design Principles
- All UUIDs are **deterministic** (hardcoded in seed.sql and fixtures.ts) for assertion stability
- Cover every FSRS state (0=New, 1=Learning, 2=Review, 3=Relearning)
- Cover every Bloom level (0–5)
- Include topics at multiple nesting depths
- Include cards with and without embeddings
- Include cards with review history at varying ratings
- Include cards with due dates in the past (overdue) and future (not due)

### Seed Data

**Topics** (6 topics, 3 levels deep):

| UUID (fixed)                           | Name              | Parent         |
|----------------------------------------|-------------------|----------------|
| `t-root-math-0000-000000000001`        | Mathematics       | NULL (root)    |
| `t-alge-bra0-0000-000000000002`        | Algebra           | Mathematics    |
| `t-line-ar00-0000-000000000003`        | Linear Equations  | Algebra        |
| `t-root-bio0-0000-000000000004`        | Biology           | NULL (root)    |
| `t-cell-bio0-0000-000000000005`        | Cell Biology      | Biology        |
| `t-empt-y000-0000-000000000006`        | Empty Topic       | NULL (root)    |

**Cards** (12 cards across various states):

| UUID (fixed)                           | Topic              | Concept                  | FSRS State | Bloom Level | Due        |
|----------------------------------------|--------------------|--------------------------|------------|-------------|------------|
| `c-new1-0000-0000-000000000001`        | Mathematics        | Addition basics          | 0 (New)    | 0 Remember  | NOW - 1h   |
| `c-new2-0000-0000-000000000002`        | Mathematics        | Subtraction basics       | 0 (New)    | 0 Remember  | NOW - 1h   |
| `c-lrn1-0000-0000-000000000003`        | Algebra            | Solve for x              | 1 (Learn)  | 1 Understand| NOW - 30m  |
| `c-lrn2-0000-0000-000000000004`        | Algebra            | Quadratic formula        | 1 (Learn)  | 2 Apply     | NOW + 2d   |
| `c-rev1-0000-0000-000000000005`        | Linear Equations   | Slope-intercept form     | 2 (Review) | 3 Analyze   | NOW - 2h   |
| `c-rev2-0000-0000-000000000006`        | Linear Equations   | Point-slope form         | 2 (Review) | 4 Evaluate  | NOW + 5d   |
| `c-rlrn-0000-0000-000000000007`        | Mathematics        | Multiplication tables    | 3 (Relrn)  | 1 Understand| NOW - 10m  |
| `c-mat1-0000-0000-000000000008`        | Mathematics        | Division rules           | 2 (Review) | 5 Create    | NOW + 30d  |
| `c-bio1-0000-0000-000000000009`        | Biology            | Cell structure           | 0 (New)    | 0 Remember  | NOW - 1h   |
| `c-bio2-0000-0000-000000000010`        | Cell Biology       | Mitosis phases           | 1 (Learn)  | 2 Apply     | NOW - 5m   |
| `c-bio3-0000-0000-000000000011`        | Cell Biology       | DNA replication          | 2 (Review) | 3 Analyze   | NOW - 1d   |
| `c-noemb-000-0000-000000000012`        | Biology            | Photosynthesis overview  | 0 (New)    | 0 Remember  | NOW - 1h   |

Card `c-noemb` has a NULL embedding (for testing similarity search exclusion).

**Reviews** (pre-populated for cards that have history):

| Card                  | Ratings (chronological) | Modalities        |
|-----------------------|-------------------------|-------------------|
| c-lrn1 (Solve for x) | [3, 3]                  | [web, chat]       |
| c-rev1 (Slope-int.)   | [3, 4, 3, 2]            | [web, web, chat, web] |
| c-rev2 (Point-slope)  | [3, 3, 4, 4, 3]         | [web, chat, chat, web, mcq] |
| c-rlrn (Multiply)     | [3, 3, 1]               | [web, web, web]   |
| c-bio2 (Mitosis)      | [3, 2]                  | [chat, web]       |
| c-bio3 (DNA rep.)     | [4, 3, 3]               | [web, web, chat]  |

**Images** (2 images):

| UUID (fixed)                           | Card               | Filename          |
|----------------------------------------|--------------------|-------------------|
| `i-img1-0000-0000-000000000001`        | c-bio1             | cell-diagram.png  |
| `i-img2-0000-0000-000000000002`        | NULL (orphaned)    | standalone.png    |

The seed.sql will also create placeholder image files on disk (1x1 PNG).

---

## Test Suites

### 1. Card Lifecycle (`card-lifecycle.test.ts`)

Full CRUD cycle for cards through the API.

| Test | What it verifies |
|------|-----------------|
| **Create card with all fields** | POST /cards → 201, returns card + bloomState (level 0) + fsrsState (state 0, due ~now), embedding is 384-dim array |
| **Create card minimal fields** | POST /cards with only required fields → tags default to [], embedding still computed |
| **Read card with state** | GET /cards/:id → includes bloomState, fsrsState, reviews array |
| **Update concept triggers re-embedding** | PUT /cards/:id with new concept → embedding changes, updatedAt advances |
| **Update non-concept fields** | PUT /cards/:id with only front_html → embedding unchanged |
| **Move card to different topic** | PUT /cards/:id with new topic_id → card.topicId updated, old topic stats decrease, new topic stats increase |
| **Delete card cascades** | DELETE /cards/:id → 204, bloom_state gone, fsrs_state gone, reviews gone, associated image.card_id set to null |
| **Create card with invalid topic** | POST /cards with non-existent topic_id → 404 |
| **Reset card** | POST /cards/:id/reset → bloom back to 0/0, fsrs reset, reviews emptied |

### 2. Study Flow (`study-flow.test.ts`)

The core learning workflow: fetch due → answer → reschedule.

| Test | What it verifies |
|------|-----------------|
| **Fetch all due cards (no topic filter)** | GET /study/due → returns only cards with due <= NOW, sorted by due ASC |
| **Fetch due cards with topic filter** | GET /study/due?topic_id=Mathematics → returns cards from Math + Algebra + Linear Equations (recursive) |
| **Fetch due with limit** | GET /study/due?limit=2 → returns exactly 2 |
| **Submit review rating=Good** | POST /reviews (rating=3) → fsrsState.due pushed forward, fsrsState.reps incremented, fsrsState.state may advance |
| **Submit review rating=Again** | POST /reviews (rating=1) → fsrsState.lapses incremented, fsrsState.state may go to Relearning |
| **Review with chat modality** | POST /reviews (modality=chat) → due date pushed 1.25x further than web baseline |
| **Review with mcq modality** | POST /reviews (modality=mcq) → due date pushed 0.75x compared to web baseline |
| **Verify study summary** | GET /study/summary → totalCards, dueCount, bloomLevels distribution matches seed data |
| **Summary with topic filter** | GET /study/summary?topic_id=Biology → only counts Biology + Cell Biology cards |
| **Study stats** | GET /study/stats → streak, reviewsToday, cardStates breakdown matches expectations |
| **Card no longer due after Good review** | Submit rating=3 → re-fetch due → card not in list (due pushed to future) |
| **Full session: fetch → review all → fetch empty** | Get due cards, review each with rating=3, verify no more due cards remain |

### 3. Bloom Progression (`bloom-progression.test.ts`)

Bloom's taxonomy state machine transitions.

| Test | What it verifies |
|------|-----------------|
| **Advance on Good at current level** | Card at level 0, review bloom_level=0 rating=3 → currentLevel becomes 1 |
| **Advance on Easy at current level** | Card at level 0, review bloom_level=0 rating=4 → currentLevel becomes 1 |
| **No advance when reviewing below current** | Card at level 2, review bloom_level=1 rating=3 → currentLevel stays 2 (reinforces lower) |
| **Drop on Again** | Card at level 3, review bloom_level=3 rating=1 → currentLevel becomes 2 |
| **Drop on Hard** | Card at level 2, review bloom_level=2 rating=2 → currentLevel becomes 1 |
| **Cannot drop below 0** | Card at level 0, review rating=1 → currentLevel stays 0 |
| **Cannot advance above 5** | Card at level 5, review bloom_level=5 rating=4 → currentLevel stays 5 |
| **highestReached tracks peak** | Advance to 3, drop to 2, advance to 3 → highestReached=3 throughout |
| **highestReached updates on new peak** | Advance from 3 to 4 → highestReached updates to 4 |
| **skip_bloom flag** | POST /reviews with skip_bloom=true → bloom_state unchanged |
| **Multi-step climb** | Card at 0 → 6 consecutive Good reviews at matching levels → reaches level 5 (Create) |

### 4. Topic Hierarchy (`topic-hierarchy.test.ts`)

Topic CRUD, nesting, recursive stats, tree, breadcrumb.

| Test | What it verifies |
|------|-----------------|
| **List root topics** | GET /topics → returns Mathematics, Biology, Empty Topic (not children) |
| **Root topic stats roll up descendants** | Mathematics.cardCount includes Algebra + Linear Equations cards |
| **Root topic due count is recursive** | Mathematics.dueCount includes due cards from all descendants |
| **Get topic detail with children** | GET /topics/:id → includes children array with their own stats |
| **Get topic tree** | GET /topics/Mathematics/tree → nested JSON: Math → Algebra → Linear Equations |
| **Get breadcrumb** | GET /topics/LinearEquations/breadcrumb → [Mathematics, Algebra, Linear Equations] |
| **Create child topic** | POST /topics { parentId: Algebra } → new topic under Algebra |
| **Create root topic** | POST /topics { name: "Physics" } → parentId null |
| **Update topic parent** | PUT /topics/:id { parentId: Biology } → moves topic to different parent |
| **Cannot self-parent** | PUT /topics/:id { parentId: same-id } → 400 |
| **Delete empty topic** | DELETE /topics/EmptyTopic → 204, children orphaned (none in this case) |
| **Delete topic with cards fails** | DELETE /topics/Mathematics → 400 (has cards) |
| **Delete topic orphans children** | Create parent → child, delete parent → child.parentId becomes null |

### 5. Image Management (`image-management.test.ts`)

Image upload, serving, association, deletion.

| Test | What it verifies |
|------|-----------------|
| **Upload image with card association** | POST /images (multipart) → 201, returns id, url, cardId, filename, mimeType |
| **Upload orphan image** | POST /images without card_id → cardId is null |
| **Serve image** | GET /images/:id → correct Content-Type, binary body, Cache-Control header |
| **Delete image** | DELETE /images/:id → 204, file removed from disk |
| **Card deletion sets image cardId to null** | Delete card → image record still exists, cardId now null |
| **Upload invalid mime type** | POST /images with .txt file → 400 |
| **Get non-existent image** | GET /images/bad-uuid → 404 |

### 6. MCP Tools (`mcp-tools.test.ts`)

All MCP tools tested via StreamableHTTP transport.

| Test | What it verifies |
|------|-----------------|
| **Initialize session** | POST /mcp with initialize request → valid JSON-RPC response with capabilities |
| **list_topics** | Returns root topics with correct childCount, cardCount |
| **get_topic_tree** | Returns nested tree structure matching API /topics/:id/tree |
| **create_topic → list_topics** | Create topic via MCP, verify it appears in list |
| **update_topic** | Update name, verify change persisted |
| **delete_topic** | Delete topic, verify gone |
| **create_card** | Returns card + bloomState + fsrsState, embedding computed |
| **get_card** | Returns full card with state and reviews |
| **update_card concept** | Concept change triggers re-embedding |
| **delete_card** | Cascades correctly |
| **get_study_cards** | Returns same set as API /study/due |
| **get_study_summary** | Matches API /study/summary |
| **get_topic_context** | Returns cards with bloom/fsrs/reviews for topic tree |
| **get_similar_cards** | Returns cards sorted by cosine similarity, excludes self and NULL embeddings |
| **get_instructions** | Returns non-empty markdown string |
| **get_templates (all)** | Returns all 5 templates with description, variables, html |
| **get_templates (single)** | Returns only the requested template |
| **Error: invalid UUID** | Returns isError: true with message |
| **Auth: missing API key** | POST /mcp without Bearer → 401 |
| **Auth: wrong API key** | POST /mcp with bad key → 403 |

### 7. MCP Study Flow (`mcp-study-flow.test.ts`)

Full study workflow through MCP, verifying MCP and API see the same state.

| Test | What it verifies |
|------|-----------------|
| **Create card via MCP, fetch via API** | Card visible in both interfaces |
| **Submit review via MCP, verify via API** | FSRS + Bloom state updated, review appears in card detail |
| **MCP due cards match API due cards** | Same cards returned (after accounting for sort) |
| **MCP summary matches API summary** | Same counts and distributions |
| **Cross-interface workflow** | Create card (MCP) → review (API) → check due (MCP) → verify states match |

### 8. Error Handling (`error-handling.test.ts`)

Edge cases, validation failures, constraint violations.

| Test | What it verifies |
|------|-----------------|
| **401 without auth** | Any authenticated endpoint without JWT → 401 |
| **401 with invalid token** | Random JWT → 401 |
| **404 non-existent card** | GET /cards/random-uuid → 404 |
| **404 non-existent topic** | GET /topics/random-uuid → 404 |
| **400 invalid UUID format** | GET /cards/not-a-uuid → 400 |
| **400 missing required fields** | POST /cards without concept → 400 |
| **400 rating out of range** | POST /reviews with rating=5 → 400 |
| **400 bloom level out of range** | POST /reviews with bloom_level=6 → 400 |
| **400 invalid modality** | POST /reviews with modality="invalid" → 400 |
| **409/400 duplicate card creation** | Two identical creates succeed (UUIDs differ) — no conflict |
| **FK constraint: card for non-existent topic** | POST /cards with bad topic_id → error |
| **FK constraint: review for non-existent card** | POST /reviews with bad card_id → error |
| **Concurrent reviews on same card** | Two reviews submitted simultaneously → both succeed, state is consistent |

---

## Test Helpers

### api-client.ts

```typescript
// Pre-configured axios instance
const api = axios.create({
  baseURL: process.env.TEST_API_URL ?? "http://localhost:4444",
});

// Auto-attach JWT after login
export async function login(): Promise<void>;
export function getApi(): AxiosInstance;
```

### mcp-client.ts

```typescript
// Manages MCP session lifecycle over StreamableHTTP
export class McpTestClient {
  constructor(baseUrl: string, apiKey: string);
  async initialize(): Promise<void>;       // sends initialize JSON-RPC
  async callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
  async listTools(): Promise<string[]>;
  async close(): Promise<void>;            // sends session terminate
}
```

### fixtures.ts

```typescript
// All deterministic UUIDs from seed.sql
export const TOPICS = {
  MATHEMATICS: "t-root-math-0000-000000000001",
  ALGEBRA: "t-alge-bra0-0000-000000000002",
  // ...
} as const;

export const CARDS = {
  NEW_ADDITION: "c-new1-0000-0000-000000000001",
  // ...
} as const;

// Expected seed state
export const SEED_EXPECTATIONS = {
  totalCards: 12,
  mathDueCount: 5,   // cards with due <= NOW in Math tree
  bioCardCount: 4,    // cards in Bio tree
  // ...
};
```

---

## Execution

### Commands

```bash
# From repo root
npm run test:integration          # full cycle: up → seed → test → down
npm run test:integration:up       # only spin up (for debugging)
npm run test:integration:run      # only run tests (assumes stack is up)
npm run test:integration:down     # only tear down
```

### Root package.json scripts

```json
{
  "scripts": {
    "test:integration": "cd tests && docker compose -f docker-compose.test.yml up --build -d && npx vitest run --config vitest.config.ts; docker compose -f docker-compose.test.yml down --volumes --remove-orphans",
    "test:integration:up": "cd tests && docker compose -f docker-compose.test.yml up --build -d",
    "test:integration:run": "cd tests && npx vitest run --config vitest.config.ts",
    "test:integration:down": "cd tests && docker compose -f docker-compose.test.yml down --volumes --remove-orphans"
  }
}
```

### Vitest Config

```typescript
// tests/vitest.config.ts
export default defineConfig({
  test: {
    globalSetup: ["./src/setup.ts"],
    include: ["src/workflows/**/*.test.ts"],
    testTimeout: 30_000,        // embeddings can be slow
    hookTimeout: 120_000,       // docker startup
    sequence: { concurrent: false }, // tests run serially (shared DB state)
    reporters: ["verbose"],
  },
});
```

### Test Ordering

Tests run **sequentially** because they share a database. The seed data provides a known starting state. Tests that mutate data (create/delete) should either:
1. Use isolated entities created within the test and cleaned up after
2. Run in a defined order where mutations are accounted for

Recommendation: **Read-only tests first** (study flow, stats, due cards against seed data), **mutating tests last** (create, update, delete cycles using fresh entities).

---

## CI Considerations (Future)

- Docker Compose v2 required
- `tmpfs` for DB ensures fast, clean runs
- Total runtime estimate: ~2-3 minutes (dominated by Docker build + first embedding computation)
- Exit code from vitest propagates → CI pass/fail
- Compose down in `finally` block or CI post-step to guarantee cleanup

---

## Open Decisions

1. **Embedding warmup**: Should setup.ts create one throwaway card to pre-download the model before tests start? This would prevent the first test from timing out. → **Recommendation: Yes**, add a warmup step in global setup.
2. **Seed SQL generation**: Hand-write SQL or generate from a TypeScript fixture file? → **Recommendation: Hand-write SQL** for maximum clarity and no runtime dependencies.
3. **Test isolation strategy**: Reset DB between test suites or rely on ordered execution? → **Recommendation: Ordered execution** with fresh entities for mutation tests. Full DB reset is slow and unnecessary if tests are well-designed.
