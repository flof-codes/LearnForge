# glasses

LearnForge on the Even Realities G2: compiled multiple-choice questions, answered with the R1 ring. Even Hub plugin built with Vite, TypeScript and `@evenrealities/even_hub_sdk`.

Admin only. Questions are compiled ahead of time from Claude Code through the LearnForge MCP (`/compile-glasses`); the glasses never call Claude.

## Run on the glasses

```bash
npm run dev -w glasses
evenhub qr --url "http://<laptop-lan-ip>:5174"
```

Scan the QR from the Even Hub tab of the Even Realities app (Developer Mode: sign in at hub.evenrealities.com once, then restart the phone app). Same Wi-Fi, port 5174 reachable. Copy `.env.development.example` to `.env.development` and set `VITE_API_URL` to point at a local api and add that origin to `app.json` for the sideload.

## Simulator

```bash
npm run simulate
```

## Package

```bash
npm run pack -w glasses
```

Upload `learnforge-glasses.ehpk` in the Even Hub portal as a Beta build.

## Layout

| File | Purpose |
|---|---|
| `src/main.ts` | Bridge boot, one text container, event routing, pairing, offline review queue |
| `src/state.ts` | Pure reducer: views, cursor, answers, prefetch |
| `src/render.ts` | View to text, ASCII markers only |
| `src/text.ts` | Word wrap and the display caps shared with core |
| `src/api.ts` | The `/glasses/*` routes |
| `src/storage.ts` | Token, session and review queue in SDK storage |
