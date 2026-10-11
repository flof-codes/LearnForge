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
- **Pico CSS classless** theme mit automatischem Light/Dark Mode (+ Inter Font via CDN)
- Semantisches HTML: `<article>`, `<mark>`, `<blockquote>`, `<details>/<summary>`, `<fieldset>`
- **KEINE** hardcodierten Hintergrund-/Textfarben — Pico übernimmt das Theming
- Kein Bloom-Level-Badge auf Karten (Bloom-Level ist ein dynamischer Zustand, kein Kartenattribut)
- Schlüsselbegriffe in `<mark>` Tags
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
- Beim Abfragen von Karten im Chat: **keine HTML-Karten zeigen**
- MCQ → die ganze Karte im Widget: `visualize:show_widget` mit dem `mcq-selector`-Template
  (Header, Fragestamm, Options-Buttons, „Don't know", Begriffs-Chips).
  **Kein Fragen- oder Optionstext im Chat.**
- **Zwei Widgets pro Turn, Feedback zuerst:** das Feedback zur vorigen Antwort ist ein eigener
  `show_widget`-Call mit dem `mcq-feedback`-Template (statisches HTML, erscheint schon beim Streamen),
  danach folgt die Karte als zweiter Call. Nie beides in einem Widget: die Karte hält das Feedback sonst auf.
- **Warum alles im Widget:** die claude.ai-iOS-App klappt Text vor einem Tool-Call in die Tool-Zeile ein,
  Frage und Optionen waren dadurch unsichtbar. KaTeX lädt im Widget von cdnjs (auf iOS verifiziert).
- Zuordnung → Serie von MCQ-Fragen ("Wo gehört X hin?")
- Slider/Berechnung → Frage mit Zahlenwert-Optionen
- Open Response → normale Chat-Frage (User tippt Antwort)
- **Erst anzeigen, dann `submit_review`:** Feedback + nächste Frage gehen zuerst raus (Tempo),
  der Review wird danach gespeichert. Level und Fälligkeit stehen im Feedback-Widget vor der übernächsten Karte.
- Das Karten-Widget antwortet als normaler User-Turn: `Answer: A, C`, `Answer: I don't know` oder
  `Explain term: <Begriff>` (ungewertet: Begriff im Feedback-Widget, dann die gleiche Karte erneut)
- Die interaktiven HTML-Karten bleiben als visuelles Lernmaterial auf der **Rückseite** erhalten

## Git Conventions
- Never include co-authored-by or co-author attribution in git commit messages unless explicitly requested.
- Keep commit messages short and concise. Do not write multi-paragraph commit messages unless asked.

## Workflow
- When implementing changes, present a brief plan and wait for user confirmation before making edits — especially for UI changes, multi-file refactors, and commit operations.

## Debugging
- When debugging issues, investigate the actual error path first rather than guessing at common causes. Don't suggest generic fixes (check Docker logs, restart containers) before understanding the specific problem. Focus diagnosis on the exact symptoms reported.

---

# Project Technical Reference

## Project Structure

Monorepo with 4 packages — all ESM (`"type": "module"`):

- `core/` — Shared package (`@learnforge/core`): DB schema, services, utilities
- `api/` — Fastify 5 REST backend (thin route handlers calling core services)
- `web-ui/` — React 19 SPA (React Router 7, TanStack Query 5, Tailwind CSS 4, Vite 7)
- `mcp/` — MCP server with tutor instructions and card templates (stdio + StreamableHTTP transport)

This project uses internationalization (i18n) with DE/EN translations. When modifying user-facing text, update both language files. Translation keys are spread across 25+ components.

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
| `SETTINGS_SECRET` | API | Optional. Seals the Anthropic API keys users save for the tutor; empty derives it from `JWT_SECRET` |
| `ANTHROPIC_API_KEY` | API | Deprecated. Stands in for an admin account that has saved no key of its own, for no one else |

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

### E-Mail Verification & Password Reset
- Registration leaves `users.email_verified_at` NULL and mails a link; until it is confirmed, `api/src/plugins/auth.ts` rejects every write with 403 `EMAIL_NOT_VERIFIED` (reads and `/auth/*`, `/billing/*` stay open). MCP mirrors the check and refuses the session outright.
- Tokens live in `auth_tokens`, SHA-256 hashed, single-use: verification 24 h, reset 1 h. Same user + type is rate limited to one mail per minute.
- `POST /auth/password-reset/request` always answers 200 — it must not reveal whether an address is registered.
- Changing the e-mail via `PUT /auth/profile` clears verification and re-sends.
- Mail goes out over SMTP (`SMTP_HOST` … `SMTP_FROM`). With `SMTP_HOST` empty the API only logs what it would have sent — that is how dev and the integration tests run.
- Tests that register a throwaway user and then write must call `markEmailVerified()` from `tests/src/helpers/email-verification.js`.

### Subscription Lifecycle Mails
- Three mails from the Stripe webhook in `api/src/routes/billing.ts`: abo confirmed (`checkout.session.completed`), cancellation scheduled (`customer.subscription.updated` when `cancel_at_period_end` flips on), subscription ended (`customer.subscription.deleted`).
- The webhook answers **500** on a processing error, so Stripe redelivers. Every send therefore sits last in its branch, keyed off a local state transition a redelivery cannot repeat: prior `subscription_status` for the confirmation, `users.subscription_cancel_at_period_end` for the cancellation, the cleared `stripe_subscription_id` for the end mail. Sends swallow their own errors so a mail fault never retries work that already succeeded.
- `users.locale` carries the language, since a webhook has no request to read it from. Set at registration, updated by `PUT /auth/profile` (the language switcher writes it for signed-in users).
- The admin `free` override still short-circuits every branch before any mail.

### MCP (API Key)
- HTTP transport requires `Authorization: Bearer <MCP_API_KEY>` header
- `/health` endpoint is public
- Stdio transport requires `--api-key <key>` argument

### Connected apps (app tokens)
- Lecture Scribe connects by pairing: the app makes its own secret (prefix `lfa_`), sends only the SHA-256 to `POST /apps/pair/start` and gets a 6-character code plus `verifyUrl` (`APP_URL/connect?code=`). The signed-in user approves on `/connect` (`POST /apps/claim`); the app polls `/apps/pair/poll`, which only ever returns a status.
- `api/src/plugins/auth.ts` accepts an app token **only** on `APP_TOKEN_ROUTES`: read topics and a topic's context, search cards, create topics, notes and cards, `GET/DELETE /apps/me`. Everything else answers 403 `APP_TOKEN_SCOPE`. Adding a route there widens what a leaked token can do.
- Tokens live in `app_tokens`, hash only. Each use pushes `expires_at` 90 days out; revoked and expired tokens answer 401 `TOKEN_REVOKED` / `TOKEN_EXPIRED`. The write gate (verified e-mail, subscription) applies to app tokens like to a login.
- `POST /notes` takes `source_ref`: the same ref for the same user returns the existing note, so an app's retried upload creates nothing.
- Settings → Connected apps lists app tokens for every user.

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
- **images** — optional card association (SET NULL), stored on disk; `content_hash` + `size_bytes` for imported media (one file per distinct content per user)
- **app_pair_codes**, **app_tokens** — pairing codes and bearer tokens of connected apps (Lecture Scribe); hash only
- **card_questions** — one stored question per card, Bloom level and form (`choice` | `gap` | `open`), payload as JSON; `used_at` is set by the review
- **tutor_settings** — 1:1 with users: Anthropic API key (sealed), model, effort
- **anki_imports** — one uploaded package and its job state (analyzing → staged → queued → running → done | failed)
- **anki_records** — everything from Anki that LearnForge does not model (raw note/card columns, review log per card, deck options, note type configs), unique per (user, kind, anki_key)

## API Endpoints

```
POST /auth/login
POST /auth/register             POST /auth/verify-email/request
POST /auth/verify-email/confirm
POST /auth/password-reset/request
POST /auth/password-reset/confirm
GET/POST /topics                GET/PUT/DELETE /topics/:id
GET /topics/:id/tree            GET /topics/:id/breadcrumb
POST /cards                     GET/PUT/DELETE /cards/:id
POST /cards/:id/reset
POST /reviews
GET /study/due?topic_id=&limit= GET /study/summary?topic_id=
GET /context/topic/:id?depth=   GET /context/similar/:card_id?limit=
POST /images                    GET/DELETE /images/:id
GET /media/:id/:sig             (public, HMAC-signed; see Media URLs)
POST/GET /import/anki           GET/DELETE /import/anki/:id
POST /import/anki/:id/commit
POST/GET /shares                DELETE /shares/:id
GET /shares/preview/:token      POST /shares/accept/:token
POST /apps/pair/start           POST /apps/pair/poll        (public, rate limited)
GET /apps/pair/info?code=       POST /apps/claim            GET/DELETE /apps/tokens[/:id]   (JWT)
GET/DELETE /apps/me             (app bearer token, see APP_TOKEN_ROUTES in api/src/plugins/auth.ts)
GET /tutor/status               POST /tutor/prepare         POST /tutor/sessions
POST /tutor/next                POST /tutor/answer          (403 TUTOR_UNAVAILABLE without a key)
GET/PUT /tutor/settings         DELETE /tutor/settings/key  POST /tutor/settings/check
POST /tutor/grade               POST /tutor/followup        (open questions; 503 TUTOR_CREDITS etc. when the model fails)
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
| Get/Update/Delete card | get_card, update_card, delete_card | card_id (get_card and get_study_cards attach the card's pictures as image blocks, resized by core `lib/card-media.ts`; `media` lists all files, audio is listed only) |
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
- Topic sharing is **copy-only**: `acceptShareLink` deep-copies topic tree + cards into recipient's account with fresh bloom/fsrs state. Image files are copied on disk (new UUID filenames, independent DB rows). Revoking a link blocks new imports; already-imported copies remain untouched. Link tokens are 24-byte url-safe random.

## Media URLs

- The database stores media as `/images/<id>`. Card HTML renders in a sandboxed iframe that cannot send the login token, so an `onSend` hook in `api/src/app.ts` rewrites those references in every JSON response to `/media/<id>/<sig>` (HMAC of id + owner from core `lib/media-url.ts`, secret derived from `JWT_SECRET`), prefixed with `API_PUBLIC_URL` only when that is set. Only ids the requesting user owns are signed. The links are relative on purpose: `CardHtmlRender.resolveMediaLinks` puts the web app's full API address (`VITE_API_URL`, which may include a path such as `/api`) in front of them before the card frame is built, so neither the proxy's Host handling nor a path prefix can misdirect them. A `preValidation` hook turns signed URLs in request bodies back, so they never reach the database. `/export` keeps the stored form.

- CORS: browsers may call the API only from `APP_URL` plus `CORS_ORIGINS`; `/health` accepts any origin.

## Tutor in the web app

- Every user runs the tutor on their own Anthropic API key, saved with a model and an effort under Settings → Tutor (`tutor_settings`, core `services/tutor-settings.ts`). A key is only ever used for the account that saved it; `api/src/services/tutor-access.ts` is the one place that decides whose key a call runs on. Without a key `GET /tutor/status` answers `available: false` and the study view keeps the plain cards.
- The key is sealed with AES-256-GCM (core `lib/secret-box.ts`) under `settingsSecret` from `api/src/config.ts`, returned by no route (only `keyHint`, its last four characters) and never logged. `ANTHROPIC_API_KEY` in the environment is deprecated: it serves an admin without a saved key only.
- Models on offer are `TUTOR_MODELS` in core; efforts are low, medium, high. Haiku takes no effort, so none is sent for it. Model and effort apply to writing, grading and follow-ups alike.
- Questions are written ahead, five cards per call, by `api/src/services/question-model.ts` (the only file that calls Anthropic; `TUTOR_MODEL=stub` swaps in a canned writer for the tests) and stored in `card_questions`. The rules the model works from are `QUESTION_SYSTEM_PROMPT` in core `lib/question-prompt.ts`; bump `QUESTION_PROMPT_VERSION` when they change.
- A stored question is fresh while `card_updated_at` and `original_id` match the card and `used_at` is null. The review sets `used_at`, so the next visit gets a new variant; card and note edits delete unused rows.
- `pickQuestionForm` (core `services/card-questions.ts`) decides the form from session difficulty, Bloom level, cloze or not, and the answer modes (`tap`, `type`, `dictate`). Tap only is always `choice`; with typing or dictation a cloze card becomes a typed `gap` and any other card an `open` question once session and level are past recognition.
- `POST /tutor/next` serves stored questions with a study ticket each (`study_questions.card_question_id`) and starts the writer for cards that have none; the client polls while `pending > 0`. A card the writer skipped, and every card while the writer is paused (credits used up, API error), is served as `type: "card"` and rated by hand.
- `POST /tutor/answer` sends the picked letters or the typed text plus the rating the learner tapped. The server grades (`gradeChoice`, `gradeGap` against the stored spellings) and `submitReview` takes the tapped rating as `rating_override`.
- An open answer is the only live model call while studying: `POST /tutor/grade` grades the text against the question's key points and keeps the grade in memory until the rating arrives; `POST /tutor/answer` takes the correctness from there, never from the request, and grades again if the grade is gone. `POST /tutor/followup` answers up to `FOLLOW_UP_LIMIT` questions about the answer; the client sends the whole thread.
- Dictation is the browser's speech recognition (`web-ui/src/hooks/useDictation.ts`). Where it is missing the microphone button is not rendered and the keyboard's own microphone does the job.
- The writer (`api/src/services/question-generator.ts`) keeps its state in memory: one batch per user at a time, a pause after a failure. A restart forgets both.

## Anki Import

- Upload (`POST /import/anki`, 200 MB, `.apkg`/`.colpkg`) → analysis job → preview → `commit` with `schedule: keep | fresh` → import job. Jobs run one at a time in a worker thread (`api/src/workers/anki-import-worker.ts`, 30 min timeout); a restart marks in-flight jobs failed (`recoverAnkiImports`), and an hourly sweep expires uploads left staged for 24 h. Job rows are handled in core `anki-import-jobs.ts`. Staged files live under `IMPORT_PATH` (default `IMAGE_PATH/.imports`, so they survive a recreated container).
- Reader in `core/src/lib/apkg/`: all package versions (legacy 1/2, latest zstd + protobuf), own zip reader with inflate caps, `node:sqlite` on a temp copy (Anki's `unicase` collation is stripped from the schema first).
- Mapping in `core/src/services/anki-import.ts`: decks → topics (filtered decks never; cards go home via `odid`), note types → own types reused by (`anki_key`, `anki_schema`), notes by guid (newer `mod` wins, `notes_user_guid_uq`), schedule from `cards.data` FSRS state → revlog replay → SM-2 estimate, Anki's due date always kept. Review log stays in `anki_records` only (no `reviews` rows). Image occlusion is imported with `suspended_by = 'unsupported'`. Embeddings are filled in the background afterwards.
- `cards.suspended_by`: `gap` (cloze gap vanished; un-suspended when it returns), `user`, `anki`, `unsupported`. Only `gap` is lifted automatically.
- Fixtures from real Anki: `tests/fixtures/anki/` (regenerate with `make_fixtures.py`, needs `pip install anki`).
- The reverse proxy in front of the API must allow 200 MB request bodies for the upload.

## Conventions

- Use snake_case for API request/response fields, camelCase internally in TypeScript.
- Custom error classes (`NotFoundError`, `ValidationError`, `UnauthorizedError`) in `api/src/lib/errors.ts` — throw these instead of manual reply codes.
- Fastify route type params: `app.get<{ Params: {...}; Querystring: {...}; Body: {...} }>`.
- MCP tools return `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`.
- MCP tools wrap in try/catch and return `{ isError: true }` on failure.
- Use `node:24-slim` Docker base (not alpine) for ONNX runtime compatibility.
- drizzle-kit must be invoked via `tsx` due to ESM/CJS incompatibility.

## Quality Gate (PFLICHT)

Nach jedem abgeschlossenen Plan **MUSS** die Quality-Gate-Pipeline ausgeführt werden, bevor der Plan als abgeschlossen gilt.

### Phase 1: Lint Gate (blockiert Phase 2)

```
Use the lint-gate agent to check type safety and linting.
```

Prüft:
- `tsc --noEmit` auf api/ und mcp/, `tsc -b` auf web-ui/
- `eslint .` auf alle 3 Packages (api, mcp, web-ui)
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
