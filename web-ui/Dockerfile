# ---------------------------------------------------------------------------
# Stage 1: Build
#
# Base images are pinned to a MINOR version, never a floating major. Phase 0e
# lost time to certbot's default key type moving from RSA to ECDSA between
# releases and silently changing a live certificate; `node:24-slim` and
# `nginx:alpine` move underneath a build in exactly the same way.
# ---------------------------------------------------------------------------
FROM node:24.18-slim AS build
WORKDIR /app

# PLACEHOLDER TOKENS, NOT REAL VALUES -- and not ARGs either.
#
# Vite replaces import.meta.env.* with string literals at build time (see
# `envPrefix: ['VITE_', 'OPERATOR_']` in web-ui/vite.config.ts), so a real value
# passed in here would be frozen into the artifact and make this image
# environment-specific: one image per configuration, which is most of what
# publishing to a registry exists to avoid. It would also record the operator's
# postal address in the image history, readable by anyone who can pull it.
#
# docker-entrypoint.sh substitutes these at container start from the service's
# .env. Keep this list, that script's variable lists, and .env.example in sync.
ENV VITE_API_URL=__LF_VITE_API_URL__ \
    VITE_DONATION_URL=__LF_VITE_DONATION_URL__ \
    OPERATOR_NAME=__LF_OPERATOR_NAME__ \
    OPERATOR_ADDRESS=__LF_OPERATOR_ADDRESS__ \
    OPERATOR_CITY=__LF_OPERATOR_CITY__ \
    OPERATOR_EMAIL=__LF_OPERATOR_EMAIL__

COPY package.json ./
COPY web-ui/package.json web-ui/
# `npm install`, not `npm ci`: the root lockfile carries macOS-only rollup
# binaries (npm bug #4828), so `npm ci` on linux/amd64 fails on the missing
# optional platform dependency.
RUN npm install -w web-ui --no-audit --no-fund

COPY web-ui/ web-ui/
# `npm run build` is tsc -b && vite build && vite build --ssr && node prerender.mjs.
# dist/server is the SSR bundle prerender.mjs consumes; it must not ship.
RUN npm run -w web-ui build && rm -rf web-ui/dist/server

# ---------------------------------------------------------------------------
# Reproduce, inside the build, what the retired CI job checked.
#
# `-s` rather than `-f`: an empty file is a failed build wearing the costume of a
# successful one. And a site that stops emitting impressum/ and datenschutz/
# still starts, still answers 200 on /, and passes every downstream health check
# while legally required pages are simply gone.
#
# The prerendered entries mirror ROUTES in web-ui/prerender.mjs; the rest are
# passthrough files from web-ui/public/. Both lists have to be updated together.
#
# This runs in the build stage, so it does not affect the published image digest.
# ---------------------------------------------------------------------------
RUN set -eu; \
    for f in index.html \
             docs/index.html \
             impressum/index.html \
             datenschutz/index.html \
             agb/index.html \
             privacy/index.html \
             terms/index.html \
             imprint/index.html \
             robots.txt \
             sitemap.xml \
             llms.txt \
             .well-known/llms.txt \
             favicon.ico \
             favicon.svg \
             logo.svg; do \
      test -s "web-ui/dist/$f" \
        || { echo "build output missing or empty: $f" >&2; exit 1; }; \
    done; \
    # prerender.mjs exits non-zero when it throws, but it can also succeed and
    # emit a bare SPA shell if entry-server stops rendering. The marker it writes
    # into the root div is the cheapest proof the route was actually rendered.
    grep -q 'data-server-rendered="true"' web-ui/dist/impressum/index.html \
      || { echo "impressum/index.html was not prerendered" >&2; exit 1; }; \
    # The placeholders must survive the build for the entrypoint to have anything
    # to substitute. If a refactor drops import.meta.env in favour of a literal,
    # this catches it here rather than on the server.
    grep -rq '__LF_VITE_API_URL__' web-ui/dist \
      || { echo "placeholder __LF_VITE_API_URL__ absent from build output" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Stage 2: Serve with nginx
#
# nginxinc/nginx-unprivileged, NOT nginx: stock nginx still runs its master
# process as root. This variant is uid 101 throughout and already expects 8080,
# which makes the handoff report's "runs as" field honest rather than
# aspirational.
#
# 1.28 is nginx's stable branch -- bugfixes and security only, no feature
# movement -- which suits a static file server better than mainline.
# ---------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:1.28-alpine

USER root

# COPY MERGES into its target, it does not replace it. Without this the base
# image's stock 50x.html survives into the published image (observed on
# flof_codes). The entrypoint clears the serve root at every start too, but the
# IMAGE has to be clean as well -- verification inspects the image, not just a
# running container.
RUN rm -rf /usr/share/nginx/html/*

# The pristine tree the entrypoint substitutes FROM on every start. Editing the
# serve root in place would be a one-way door: the placeholders are gone after
# the first start, so `docker restart` with a changed .env would silently keep
# serving the old values. See docker-entrypoint.sh.
COPY --from=build /app/web-ui/dist /opt/learnforge/dist
COPY web-ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY web-ui/docker-entrypoint.sh /usr/local/bin/learnforge-entrypoint.sh
RUN chmod 0755 /usr/local/bin/learnforge-entrypoint.sh \
    && chown -R 101:101 /usr/share/nginx/html

USER 101
EXPOSE 8080

# The healthcheck is declared HERE, in the image, so the server side can derive
# its deploy wait ceiling from the artifact rather than from a compose file that
# might disagree with it:
#
#   start_period + (retries + 1) * interval + 30s  =  5 + 4*10 + 30  =  75s
#
# It greps the SENTINEL BODY rather than trusting the status code, because
# nginx.conf's SPA fallback answers every path with index.html and a 200 -- a
# status-only check cannot tell the sentinel from the SPA shell.
#
# wget, not curl: alpine ships busybox wget and no curl. A missing probe binary
# fails closed and reads as an application fault, which is a bad way to spend an
# afternoon.
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:8080/health | grep -q learnforge-web

ENTRYPOINT ["/usr/local/bin/learnforge-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
