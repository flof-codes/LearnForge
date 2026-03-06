# LearnForge

Spaced-repetition flashcard app with Bloom's Taxonomy progression, vector similarity search, and an MCP server for AI-assisted card creation.

## Architecture

Monorepo with 3 packages:

| Package | Stack | Description |
|---------|-------|-------------|
| `api/` | Fastify 5, Drizzle ORM, ts-fsrs, @xenova/transformers | REST backend with JWT auth |
| `web-ui/` | React 19, React Router 7, TanStack Query 5, Tailwind CSS 4 | SPA frontend |
| `mcp/` | MCP SDK, Express 5, Zod | AI tutor with stdio + HTTP transport |

All packages use ESM (`"type": "module"`). Orchestrated via `docker-compose.yml`.

## Getting Started

```bash
# Copy env and set secrets
cp .env.example .env

# Start all services (db, pgadmin, api, web, mcp)
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web UI | http://localhost:5173 |
| API | http://localhost:3333 |
| MCP (HTTP) | http://localhost:3001 |
| pgAdmin | http://localhost:5050 |
| Database | localhost:5432 |

The MCP server can also run locally in stdio mode (for Claude Desktop):

```bash
cd mcp && npm run dev -- --stdio
```

## Authentication

- **Web UI / API**: Password login via `POST /auth/login`, returns JWT token. All API routes require `Authorization: Bearer <token>`.
- **MCP HTTP**: API key via `Authorization: Bearer <MCP_API_KEY>`.
- **MCP stdio**: No auth (local process).

Env vars: `JWT_SECRET`, `AUTH_PASSWORD`, `MCP_API_KEY` (see `.env.example`).

## Database Backup

To export the current dev database as a SQL dump:

```bash
./scripts/backup.sh
```

This creates a timestamped file in `scripts/backup/` (e.g. `scripts/backup/learnforge_20260221_221316.sql`). The backup folder is git-ignored.

## Dev Commands

```bash
# API
cd api
npm run dev          # tsx src/index.ts
npm run build        # tsc
npm run generate     # drizzle-kit generate (via tsx)
npm run migrate      # run migrations

# Web UI
cd web-ui
npm run dev          # vite
npm run build        # tsc -b && vite build

# MCP
cd mcp
npm run dev          # tsx src/index.ts (HTTP mode)
npm run build        # tsc

# Integration Tests (from root)
npm run test:integration:up    # start test containers
npm run test:integration:run   # run Vitest
npm run test:integration:down  # tear down
```
