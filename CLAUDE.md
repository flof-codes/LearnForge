# Projekt-Regeln für LearnForge Lernkarten

## Lernkarten erstellen (LearnForge MCP)
- **NIEMALS** eine Karte direkt erstellen ohne vorherige Bestätigung
- Workflow beim Erstellen einer neuen Karte:
  1. Vorder- und Rückseite im Chat als Vorschau anzeigen
  2. Auf Bestätigung oder Änderungswünsche des Users warten
  3. Erst nach expliziter Freigabe `create_card` aufrufen
- Gleiches gilt für Änderungen an bestehenden Karten: zuerst die geplante Änderung zeigen, dann umsetzen
- **Vorschau** als gerenderte HTML-Dateien bereitstellen (nicht als Code-Block im Chat)

## Kartenformat (PFLICHT)
- Kartenformat und Tutor-Instruktionen werden über den MCP Server bereitgestellt (`mcp/src/tools/skill.ts`)
- Tools: `get_instructions` (Tutor-Regeln), `get_templates` (HTML-Templates)
- **Dark Theme** ist Pflicht (bg: #111827, text: #e0e4ef, etc.)
- Alle CSS-Klassen mit `lf-` Prefix (z.B. `lf-card`, `lf-bloom-tag`, `lf-highlight`)
- Schlüsselbegriffe in `<span class="lf-highlight">` Tags
- Karten sollen **visuell und interaktiv** sein — kein reiner Text

## Formeln (PFLICHT)
- **NIEMALS** Formeln als `<span>`, `<sup>/<sub>` oder sonstige HTML-Hacks darstellen
- Formeln immer mit **KaTeX** rendern (CDN: `cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/`)
- LaTeX-Syntax in `$$...$$` Delimitern verwenden
- `renderMathInElement` im Script-Block aufrufen
- KaTeX CSS + JS im `back_html` per `<link>` und `<script>` einbinden

## Diagramme und Visualisierungen
- Bei Konzepten mit variierenden Werten (z.B. Kombinatorik, Funktionen) **Balkendiagramme oder SVG-Diagramme** verwenden
- Symmetrien und Muster visuell hervorheben (Farben, Badges)
- Diagramme sollen das Verständnis fördern, nicht nur dekorativ sein

## Vorderseite — Fragedesign
- Die Vorderseite stellt die **Frage**, sie gibt NICHT die Antwort interaktiv preis
- Interaktive Elemente (Slider, Diagramme) gehören auf die **Rückseite** oder in spätere Bloom-Stufen (Apply+)
- Vorderseite = clean, fokussiert: Begriff + Frage(n)

## Review-Flow im Chat (PFLICHT)
- Beim Abfragen von Karten im Chat: **IMMER `AskUserQuestion`-Tool verwenden** statt HTML-Karten zu zeigen
- MCQ → als Single-Choice Frage mit Optionen
- Zuordnung → als Serie von Fragen ("Wo gehört X hin?" → Optionen)
- Slider/Berechnung → als Frage mit Zahlenwert-Optionen
- Open Response → normale Chat-Frage (User tippt Antwort)
- **Vorteil:** Antwort kommt direkt zurück → Claude kann sofort bewerten und `submit_review` aufrufen
- Die interaktiven HTML-Karten bleiben als visuelles Lernmaterial auf der **Rückseite** erhalten

---

# Project Technical Reference

## Project Structure

Monorepo with 4 packages — all ESM (`"type": "module"`):

- `core/` — Shared package (`@learnforge/core`): DB schema, services, utilities
- `api/` — Fastify 5 REST backend (thin route handlers calling core services)
- `web-ui/` — React 19 SPA (React Router 7, TanStack Query 5, Tailwind CSS 4, Vite 7)
- `mcp/` — MCP server with tutor instructions and card templates (stdio + StreamableHTTP transport)

## Running

```bash
# Start all services (db, pgadmin, api, web, mcp)
docker compose up --build
```

| Service | URL |
|---------|-----|
| API | http://localhost:3333 |
| Web UI | http://localhost:5173 |
| MCP (HTTP) | http://localhost:3001 |
| pgAdmin | http://localhost:5050 |
| DB | localhost:5432 |

The MCP server can also run locally in stdio mode (for Claude Desktop):

```bash
cd mcp && npm run dev -- --stdio
```

## Environment Variables

Copy `.env.example` to `.env` at the project root. Required secrets:

| Variable | Used By | Purpose |
|----------|---------|---------|
| `JWT_SECRET` | API | Signs JWT auth tokens |
| `AUTH_PASSWORD` | API | Single-user login password |
| `MCP_API_KEY` | MCP | Bearer token for HTTP transport |

Docker Compose passes these via `${VAR:-default}` syntax. Dev defaults exist but must be changed for production.

## Build & Dev Commands

```bash
# Core (shared package — must build first)
cd core
npm run build        # tsc

# API
cd api
npm run dev          # tsx src/index.ts
npm run build        # tsc
npm run generate     # tsx node_modules/.bin/drizzle-kit generate (ESM workaround)
npm run migrate      # tsx src/db/migrate.ts

# Web UI
cd web-ui
npm run dev          # vite
npm run build        # tsc -b && vite build

# MCP
cd mcp
npm run dev          # tsx src/index.ts (HTTP mode, port 3001)
npm run build        # tsc

# Integration Tests (from root)
npm run test:integration:up    # start test containers
npm run test:integration:run   # run tests (Vitest)
npm run test:integration:down  # tear down
```

## Authentication

### API (JWT)
- `POST /auth/login` — accepts `{ password }`, returns `{ token }`
- All other routes require `Authorization: Bearer <token>` header
- Public paths: `/health`, `/auth/login`
- Plugin: `@fastify/jwt` registered via `api/src/plugins/auth.ts`
- Config: `JWT_SECRET`, `AUTH_PASSWORD`, `JWT_EXPIRES_IN` (default `"7d"`)

### MCP (API Key)
- HTTP transport requires `Authorization: Bearer <MCP_API_KEY>` header
- `/health` endpoint is public
- Stdio transport (Claude Desktop) has no auth

### Web UI
- `AuthContext` manages JWT token in localStorage
- `ProtectedRoute` component wraps all routes except `/login`
- Axios interceptor attaches token to all API requests

## Database

- PostgreSQL 16 with pgvector extension
- Credentials: `learnforge:learnforge@localhost:5432/learnforge`
- Schema defined in `core/src/db/schema/*.ts` (single source of truth, used by api and mcp via `@learnforge/core`)
- Migrations in `api/drizzle/`, config at `api/drizzle.config.ts`
- First migration SQL must include `CREATE EXTENSION IF NOT EXISTS vector;`
- Vector columns use Drizzle `customType` (no built-in pgvector support)

### Tables

- **topics** — hierarchical (self-referencing parent_id, SET NULL on delete)
- **cards** — belong to a topic (CASCADE), have embedding vector(384)
- **bloom_state** — 1:1 with cards (CASCADE), levels 0-5
- **fsrs_state** — 1:1 with cards (CASCADE), spaced repetition scheduling
- **reviews** — many per card (CASCADE), rating 1-4, modality (chat/web/mcq)
- **images** — optional card association (SET NULL), stored on disk

## API Endpoints

```
POST /auth/login
GET/POST /topics                GET/PUT/DELETE /topics/:id
GET /topics/:id/tree            GET /topics/:id/breadcrumb
POST /cards                     GET/PUT/DELETE /cards/:id
POST /cards/:id/reset
POST /reviews
GET /study/due?topic_id=&limit= GET /study/summary?topic_id=
GET /context/topic/:id?depth=   GET /context/similar/:card_id?limit=
POST /images                    GET/DELETE /images/:id
GET /health
```

## MCP Tools

| Action | Tool | Key Parameters |
|--------|------|----------------|
| Tutor instructions | get_instructions | — |
| Card templates | get_templates | template_name? |
| Study summary | get_study_summary | topic_id? |
| Due cards | get_study_cards | topic_id?, limit? |
| Submit review | submit_review | card_id, bloom_level, rating, question_text, modality? |
| Create card | create_card | topic_id, concept, front_html, back_html, tags? |
| Get/Update/Delete card | get_card, update_card, delete_card | card_id |
| List/Create/Update/Delete topics | list_topics, create_topic, update_topic, delete_topic | various |
| Topic tree | get_topic_tree | topic_id |
| Similar cards | get_similar_cards | card_id, limit? |
| Topic context | get_topic_context | topic_id, depth? |
| Upload/Delete image | upload_image, delete_image | file_path / image_id |

## Architecture Rules

- API and MCP share DB schema, services, and utilities via `@learnforge/core` (npm workspace package). Changes to shared code go in `core/src/`.
- All service functions in core receive `db: Db` and `userId: string` as first arguments (dependency injection).
- API routes and MCP tools are thin wrappers: parse input → call core service → return response.
- Error classes `NotFoundError` and `ValidationError` live in `core/src/lib/errors.ts`. API-specific errors (`UnauthorizedError`, `ForbiddenError`) remain in `api/src/lib/errors.ts`.
- Card creation always happens in a transaction: insert card + bloom_state + fsrs_state together.
- Concept changes trigger embedding recomputation.
- Topic filtering for study/context uses recursive CTEs to include descendant topics.
- Image files stored on disk at `IMAGE_PATH` (container: `/data/images`, MCP local: `~/.learnforge/images`).
- FSRS intervals are adjusted by study modality: chat (1.2x), web (0.95x), mcq (1.05x).

## Conventions

- Use snake_case for API request/response fields, camelCase internally in TypeScript.
- Custom error classes (`NotFoundError`, `ValidationError`, `UnauthorizedError`) in `api/src/lib/errors.ts` — throw these instead of manual reply codes.
- Fastify route type params: `app.get<{ Params: {...}; Querystring: {...}; Body: {...} }>`.
- MCP tools return `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`.
- MCP tools wrap in try/catch and return `{ isError: true }` on failure.
- Use `node:22-slim` Docker base (not alpine) for ONNX runtime compatibility.
- drizzle-kit must be invoked via `tsx` due to ESM/CJS incompatibility.

## Quality Gate (PFLICHT)

Nach jedem abgeschlossenen Plan **MUSS** die Quality-Gate-Pipeline ausgeführt werden, bevor der Plan als abgeschlossen gilt.

### Phase 1: Lint Gate (blockiert Phase 2)

```
Use the lint-gate agent to check type safety and linting.
```

Prüft:
- `tsc --noEmit` auf api/ und mcp/, `tsc -b` auf web-ui/
- `eslint .` auf alle 3 Packages
- **Null-Toleranz**: Ein einziger Fehler = BLOCKED. Phase 2 startet NICHT.

### Phase 2: Parallele Spezialisten (nach bestandenem Lint Gate)

Alle 2 Agenten gleichzeitig ausführen:

```
Use the code-review agent to verify plan completeness and check for security issues.
Use the test-coverage agent to run tests and check coverage.
```

| Agent | Prüft | Blocker-Kriterien |
|-------|-------|-------------------|
| **code-review** | Plan-Vollständigkeit, Diff-Review, Architektur, Dateigröße, Clean Code, Secrets, SQL-Injection, Input-Validation, Sensitive Logs, Auth | Fehlende Steps, unrelated Changes, jedes Security-Issue |
| **test-coverage** | Integration Tests, Coverage, Test-Abdeckung neuer Features | Failing Tests |

Jeder Agent gibt **PASS / WARN / BLOCKER** zurück.

**BLOCKED = Plan nicht abgeschlossen.** Erst wenn ALLE Agenten PASS oder WARN zurückgeben (kein BLOCKER), darf der Plan geschlossen werden.

### Pre-Commit Hook

Entwickler-Setup (einmalig nach Clone):
```bash
git config core.hooksPath .githooks
```

Der Hook führt `tsc` und `eslint` auf allen Packages aus und blockiert den Commit bei Fehlern.
