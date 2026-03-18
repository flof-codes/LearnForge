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

## Environment Variables

Copy `.env.example` to `.env` at the project root. Docker Compose reads this file automatically.

| Variable | Service | Required | Default | Description |
|----------|---------|----------|---------|-------------|
| `JWT_SECRET` | API | **Yes** | `dev-jwt-secret-change-me` | Secret key for signing JWT tokens. Must be changed for production. |
| `JWT_EXPIRES_IN` | API | No | `7d` | JWT token expiration duration. |
| `DATABASE_URL` | API, MCP | No | `postgresql://learnforge:learnforge@localhost:5432/learnforge` | PostgreSQL connection string. Set automatically by Docker Compose. |
| `PORT` | API, MCP | No | API: `3000`, MCP: `3001` | Server listening port. Set automatically by Docker Compose. |
| `IMAGE_PATH` | API, MCP | No | Docker: `/data/images`, Local: `~/.learnforge/images` | Directory for uploaded card images. |
| `MCP_PUBLIC_URL` | MCP | No | `http://localhost:3001` | Public URL of the MCP server (OAuth callbacks, image URLs). |
| `VITE_API_URL` | Web UI | No | `http://localhost:3333` | API base URL for the frontend (build-time). |

When running with Docker Compose, only `JWT_SECRET` needs to be set -- all other variables have working defaults. When running services locally (outside Docker), you may also need to set `DATABASE_URL` and `IMAGE_PATH`.

## Authentication

- **Web UI / API**: Password login via `POST /auth/login`, returns JWT token. All API routes require `Authorization: Bearer <token>`.
- **MCP HTTP**: OAuth 2.0 or API key via `Authorization: Bearer <token>`.
- **MCP stdio**: No auth (local process).

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

## License

LearnForge is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).
