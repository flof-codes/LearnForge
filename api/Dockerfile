# ---------------------------------------------------------------------------
# api + MCP.
#
# ONE image, TWO listeners. api/src/index.ts starts Fastify on PORT (3000) and
# then, in the same process, the MCP StreamableHTTP server on MCP_PORT (3001) via
# `createMcpHttpApp` from learnforge-mcp/http. There is deliberately no separate
# mcp image: nothing in the repo builds one, and splitting the process would be an
# architecture change rather than a migration.
#
# Base images are pinned to a MINOR version, never a floating major. Phase 0e lost
# time to certbot's default key type moving between releases and silently changing
# a live certificate; `node:24-slim` moves underneath a build the same way.
# ---------------------------------------------------------------------------
FROM node:24.18-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY core/package.json core/
COPY api/package.json api/
COPY mcp/package.json mcp/
COPY web-ui/package.json web-ui/
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*
# --ignore-scripts then an explicit rebuild: argon2 and sharp are native and must
# be built for this platform. sharp is required by @xenova/transformers for
# embeddings -- without it the api crashes on the first card creation, not at boot.
RUN npm ci --ignore-scripts && npm rebuild argon2 sharp

COPY core/ core/
COPY mcp/ mcp/
COPY api/ api/
RUN npm run -w core build && npm run -w mcp build && npm run -w api build \
    && mkdir -p api/node_modules mcp/node_modules

# ---------------------------------------------------------------------------
# Reproduce, inside the build, what the retired CI job checked.
#
# `-s` rather than `-f`: an empty file is a failed build wearing the costume of a
# successful one. tsc can also succeed while emitting nothing -- a stale
# .tsbuildinfo from a composite build makes it skip .d.ts emission entirely,
# which is why *.tsbuildinfo is in .dockerignore and why these are checked.
#
# The migration count is checked because runMigrations() runs on every boot
# (api/src/index.ts) against ./drizzle relative to WORKDIR. A migration file that
# failed to reach the image does not error -- drizzle applies the ones it can find
# and the app starts against a schema that is quietly one version behind.
#
# This runs in the build stage, so it does not affect the published image digest.
# ---------------------------------------------------------------------------
RUN set -eu; \
    for f in core/dist/index.js \
             core/dist/index.d.ts \
             mcp/dist/index.js \
             mcp/dist/http.js \
             api/dist/index.js \
             api/dist/app.js; do \
      test -s "$f" || { echo "build output missing or empty: $f" >&2; exit 1; }; \
    done; \
    test -s api/drizzle/meta/_journal.json \
      || { echo "drizzle journal missing or empty" >&2; exit 1; }; \
    node -e ' \
      const fs = require("node:fs"); \
      const journal = JSON.parse(fs.readFileSync("api/drizzle/meta/_journal.json", "utf8")); \
      const onDisk = fs.readdirSync("api/drizzle").filter((f) => f.endsWith(".sql")); \
      for (const f of onDisk) { \
        if (fs.statSync("api/drizzle/" + f).size === 0) { \
          console.error("migration is empty: " + f); process.exit(1); \
        } \
      } \
      if (onDisk.length !== journal.entries.length) { \
        console.error("migration count mismatch: " + onDisk.length + " .sql files vs " \
          + journal.entries.length + " journal entries"); \
        process.exit(1); \
      } \
      console.log("migrations verified: " + onDisk.length); \
    '

FROM node:24.18-slim

WORKDIR /app
ENV NODE_ENV=production

# BOTH the root node_modules and the workspace-local ones: npm hoisting splits
# the dependency tree between them, and copying only the root leaves the
# workspaces unable to resolve their own deps.
COPY --from=build /app/package.json package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/core/package.json core/package.json
COPY --from=build /app/core/dist core/dist
COPY --from=build /app/mcp/package.json mcp/package.json
COPY --from=build /app/mcp/node_modules mcp/node_modules
COPY --from=build /app/mcp/dist mcp/dist
COPY --from=build /app/api/package.json api/package.json
COPY --from=build /app/api/node_modules api/node_modules
COPY --from=build /app/api/dist api/dist
# Required at RUNTIME, not just at build: runMigrations() reads ./drizzle on boot.
COPY --from=build /app/api/drizzle api/drizzle

RUN mkdir -p /data/images

# STILL RUNS AS ROOT, and that is a deliberate deferral rather than an oversight.
#
# Ports 3000 and 3001 need no privilege, so nothing here requires it. The blocker
# is /data/images: it is a BIND MOUNT from the host, so the host directory's
# ownership wins over anything this Dockerfile does, and switching to uid 1000
# would break image uploads until the host directory is chowned to match.
#
# That chown is a server-side action, and until the flip commit every push to main
# still deploys via `docker compose up --build` -- so making the change here would
# land it live before the host was ready for it. Sequenced in the handoff report as
# a post-flip follow-up: chown the bind mount, then add `USER node` here.

EXPOSE 3000 3001

# Declared in the IMAGE so the server can derive its deploy wait ceiling from the
# artifact rather than from a compose file that might disagree with it:
#
#   start_period + (retries + 1) * interval + 30s  =  15 + 6*10 + 30  =  105s
#
# start_period covers runMigrations() against a real database, which is the slow
# part of boot and grows with every schema-changing migration.
#
# 15s, matching the existing compose value, NOT the 30s an earlier draft used. The
# production database is ~17 MB and reaches "ready to accept connections" in about
# 4s (measured server-side); a cold start against an empty database measured ~2s
# here. The 30s came from pgvector caution imported from a 25 GB deployment and did
# not apply. Revisit only against a measurement, not against a worry.
#
# `node -e`, not curl or wget: node:*-slim ships neither, and a missing probe
# binary fails closed and reads as an application fault. The port comes from
# process.env so the check follows a PORT override instead of silently probing the
# wrong one. It matches the SENTINEL BODY, not just the status code.
#
# 127.0.0.1, NOT localhost: Fastify listens on 0.0.0.0, which is IPv4 only, while
# `localhost` in the container resolves to ::1 first. That combination produced a
# permanently unhealthy container in the web image with the server working fine.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD ["node", "-e", "const p=process.env.PORT||3000;fetch('http://127.0.0.1:'+p+'/health').then(r=>r.text().then(t=>process.exit(r.ok&&t.includes('learnforge-api')?0:1))).catch(()=>process.exit(1))"]

WORKDIR /app/api
CMD ["node", "dist/index.js"]
