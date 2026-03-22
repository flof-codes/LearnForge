FROM node:24-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY core/package.json core/
COPY api/package.json api/
COPY mcp/package.json mcp/
COPY web-ui/package.json web-ui/
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN npm ci --ignore-scripts && npm rebuild argon2 sharp

COPY core/ core/
COPY mcp/ mcp/
RUN npm run -w core build && npm run -w mcp build

FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json package.json
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/core/package.json core/package.json
COPY --from=build /app/core/dist core/dist
COPY --from=build /app/mcp/package.json mcp/package.json
COPY --from=build /app/mcp/node_modules mcp/node_modules
COPY --from=build /app/mcp/dist mcp/dist
COPY --from=build /app/mcp/drizzle mcp/drizzle

RUN mkdir -p /data/images

EXPOSE 3001
WORKDIR /app/mcp
CMD ["node", "dist/index.js"]
