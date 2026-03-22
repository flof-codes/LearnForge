FROM node:22-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY core/package.json core/
COPY api/package.json api/
COPY mcp/package.json mcp/
COPY web-ui/package.json web-ui/
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN npm ci --ignore-scripts && npm rebuild argon2 sharp

COPY core/ core/
COPY api/ api/
RUN npm run -w core build && npm run -w api build

FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/core/package.json core/package.json
COPY --from=build /app/core/dist core/dist
COPY --from=build /app/api/package.json api/package.json
COPY --from=build /app/api/node_modules api/node_modules
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/api/drizzle api/drizzle

RUN mkdir -p /data/images

EXPOSE 3000
WORKDIR /app/api
CMD ["node", "dist/index.js"]
