# ClubCatan

A mobile-first, installable PWA of the classic Settlers of Catan board game. Built for a friend group — no accounts, no monetization, just a share link and a phone.

**Live:** [clubcatan.piyushd1.partykit.dev](https://clubcatan.piyushd1.partykit.dev)

## How to play

1. Open the link on your phone
2. **Plan an Expedition** → enter a name → you get a 6-letter code
3. Tap **Copy Link** and share. Friends open the link, enter a name, and are dropped into your lobby
4. Host taps **Start Expedition** once 2–6 players are in
5. Place two settlements + two roads each, then roll, trade, and build your way to 10 VP

Already-started games let late arrivals **spectate** — up to four people can watch read-only.

## Features

- **Complete Catan ruleset** — setup phase, resource distribution, robber + discard, 4:1 / 3:1 / 2:1 port trades, player-to-player trades, all five development cards, longest road, largest army, win at 10 VP
- **5-6 player extended board** — optional, with the Special Building Phase when enabled
- **Mobile-first UI** — designed for one-handed portrait play on a phone, with a glassmorphic HUD and tap-friendly hit targets
- **Installable PWA** — Android Chromium shows an install prompt; iOS Safari gets a Share-sheet hint. Launches standalone, works offline for the app shell
- **Fast reconnect** — session + game snapshot cached to IndexedDB, so a reload rehydrates the board instantly while the WebSocket catches up
- **Screen stays on** — uses the Screen Wake Lock API during a live game so the phone doesn't dim mid-negotiation

## Tech stack

| Layer | What |
|---|---|
| UI | Preact via `preact/compat` alias, Vite, Tailwind CSS |
| State | Zustand + `mutative` for identity-preserving reducers; `idb` for IndexedDB |
| Realtime | PartyKit (Cloudflare Durable Objects) + `partysocket` |
| PWA | `vite-plugin-pwa` + Workbox |
| Fonts / icons | `@fontsource-variable/manrope`, inline-SVG icon set |

Both client and server ship from a **single unified PartyKit deploy** — the Vite-built client lives under `client/dist/` and PartyKit's `serve` directive hands it out of the same edge that runs the realtime server.

## Repo layout

```
party/          PartyKit server — Durable-Object per room, JSON-envelope
                protocol. gameLogic.js is the engine, server.js wires it
                to WebSocket events.
client/         Preact + Vite app. src/pages for screens, src/components
                for primitives, src/lib for the partykit client + IndexedDB
                cache + hex math.
partykit.json   Unified deploy config (static assets + server in one).
.github/        CI + auto-deploy workflows.
```

## Local development

```bash
# One-time
npm install
npm --prefix client install

# Terminal 1: PartyKit server (serves WS + static on :1999)
npm run build
npm run dev:party

# OR, for live client HMR:
# Terminal 1: Vite on :5173
# Terminal 2: `npx partykit dev` on :1999
# (Client connects to :1999 for WS while Vite serves the frontend.)
```

Open `http://localhost:1999` (or `:5173` with HMR) in your browser. Two tabs → two players.

### Running tests

```bash
npm run test:logic
```

Runs the four `party/test-*.js` suites — pure game-logic checks (setup, turn flow, edge cases, longest-road algorithm). Server-independent.

## Deploy

```bash
npx partykit deploy
```

Requires a `partykit login` first. The client is built automatically via the `deploy` npm script. Ships to `clubcatan.<your-user>.partykit.dev` by default.

## CI/CD

GitHub Actions handle the pipeline:

- **`ci.yml`** — runs on every push and PR. Installs deps, builds the client, runs `npm run test:logic`. PR merge stays locked until green.
- **`deploy.yml`** — runs only on pushes to `main`. Same checks, then `partykit deploy` using a `PARTYKIT_LOGIN` token from repo secrets.

### Branch workflow

- `main` — production. Every commit here auto-deploys.
- `debug` — development playground. Has an in-app diagnostic overlay (Shift+D), an end-to-end WebSocket smoke script, and the preview launch config. See [DEBUG.md](DEBUG.md).

Daily loop: work on `debug`, open a PR to `main`, watch CI, merge when green, deploy fires automatically.

## Quick rules reference

| Build | Cost | VP |
|---|---|---|
| Road | 🧱 🪵 | 0 |
| Settlement | 🧱 🪵 🐑 🌾 | 1 |
| City | ⛏️⛏️⛏️ 🌾🌾 | 2 |
| Dev card | ⛏️ 🌾 🐑 | varies |

Longest Road (5+ connected) = 2 VP. Largest Army (3+ knights played) = 2 VP. First to 10 wins.

## Credits

Inspired by and originally forked from [Viral-Doshi/catan](https://github.com/Viral-Doshi/catan). The rules engine in `party/gameLogic.js` is ported near-verbatim from that project — huge thanks to [@doshi-viral](https://www.linkedin.com/in/doshi-viral/) for the Catan implementation.

Everything else — the Preact frontend, the PartyKit migration, the PWA shell, the design system, the deploy pipeline — was rebuilt for this project.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

Independent fan-made project for a friend group. Not affiliated with, endorsed by, or connected to Catan GmbH, Catan Studio, or Asmodee. "Catan" is a registered trademark of Catan GmbH. Buy the real game at [catan.com](https://www.catan.com/).
