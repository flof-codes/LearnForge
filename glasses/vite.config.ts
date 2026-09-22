import { defineConfig } from 'vite'

// 5174, not 5173: the web-ui dev server already owns 5173 in docker compose.
export default defineConfig({
  server: { host: true, port: 5174 },
  build: { target: 'esnext' },
})
