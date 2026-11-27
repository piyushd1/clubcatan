# ClubCatan

A mobile-first, installable PWA of the classic Settlers of Catan board game. Built for a friend group — no accounts, no monetization, just a share link and a phone.

**Live:** [catan.piyushdev.com](https://catan.piyushdev.com)

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
- **Server-authoritative** — turn order, phase, resource counts and every placement are validated on the server; the client is a view
- **Games survive restarts** — state lives in Durable Object storage, so a deploy, an idle eviction or a phone reboot never loses a game. Rooms idle for 7 days are recycled
- **Mobile-first UI** — designed for one-handed portrait play on a phone, with a glassmorphic HUD and tap-friendly hit targets
- **Installable PWA** — Android Chromium shows an install prompt; iOS Safari gets a Share-sheet hint. Launches standalone, works offline for the app shell
- **Fast reconnect** — session + game snapshot cached to IndexedDB, so a reload rehydrates the board instantly while the WebSocket catches up
- **Screen stays on** — uses the Screen Wake Lock API during a live game so the phone doesn't dim mid-negotiation

## Tech stack

| Layer | What |
|---|---|
| UI | Preact via `preact/compat` alias, Vite, Tailwind CSS |
| State | Zustand + `mutative` for identity-preserving reducers; `idb` for IndexedDB |
| Realtime | [PartyServer](https://github.com/cloudflare/partykit) on Cloudflare Workers + Durable Objects, `partysocket` on the client |
| PWA | `vite-plugin-pwa` + Workbox |
| Fonts / icons | `@fontsource-variable/manrope`, inline-SVG icon set |

Client and server ship as **one Cloudflare Worker**: the Vite-built client in `client/dist/` is served as static assets, and `/parties/main/<ROOM>` routes to the room's Durable Object. One `wrangler deploy`, one domain.

## Repo layout

```
party/          Cloudflare Worker. server.js is the room (one Durable Object
                per game, JSON-envelope protocol over WebSocket); validate.js
                checks every payload before the engine sees it.
shared/         gameLogic.js — the rules engine. Pure functions, no I/O.
client/         Preact + Vite PWA. src/pages for screens, src/components for
                primitives, src/lib for the socket client, IndexedDB cache,
                hex math and UI helpers.
tests/          Engine suites (rules, edge cases, longest road, special build,
                server authority, payload validation) plus two live
                WebSocket smoke tests.
wrangler.jsonc  Worker config: Durable Object binding, static assets, domain.
.github/        CI on every branch; deploy to Cloudflare on push to main.
docs/           Design doc, audit, and the Phase 0 plan.
```

## Local development

```bash
npm ci
npm ci --prefix client
npm run dev          # builds the client, then `wrangler dev` on http://127.0.0.1:8787
```

Open `http://127.0.0.1:8787` in two tabs → two players. To test from a phone on the same Wi-Fi, run `npx wrangler dev --ip 0.0.0.0` instead and open your laptop's LAN IP on port 8787.

For client hot-reload, run `npm run dev:client` (Vite on :5173) alongside `npx wrangler dev` (:8787); the client points its WebSocket at :8787 automatically when served from :5173.

### Running tests

```bash
npm test             # unit: client helpers + all engine suites (~550 assertions, a few seconds)
npm run test:smoke   # two real WebSocket clients against a running `npm run dev`
npm run test:restart # starts wrangler dev, plays a game, kills and restarts it, checks the game survived
```

## Deploy

Pushing to `main` deploys to production. `.github/workflows/deploy.yml` builds, runs the unit suites, then runs `wrangler deploy` with two repo secrets: `CLOUDFLARE_API_TOKEN` (Workers edit + DNS edit on the zone) and `CLOUDFLARE_ACCOUNT_ID`. `ci.yml` runs the same build and tests on every branch and PR, plus a `wrangler deploy --dry-run` so a broken config fails before it reaches `main`.

To deploy by hand: `npm run build && npx wrangler deploy` (after `npx wrangler login`).

## Quick rules reference

| Build | Cost | VP |
|---|---|---|
| Road | 🧱 🪵 | 0 |
| Settlement | 🧱 🪵 🐑 🌾 | 1 |
| City | ⛏️⛏️⛏️ 🌾🌾 | 2 |
| Dev card | ⛏️ 🌾 🐑 | varies |

Longest Road (5+ connected) = 2 VP. Largest Army (3+ knights played) = 2 VP. First to 10 wins.

## Credits

Inspired by and originally forked from [Viral-Doshi/catan](https://github.com/Viral-Doshi/catan). The rules engine in `shared/gameLogic.js` is ported from that project — huge thanks to [@doshi-viral](https://www.linkedin.com/in/doshi-viral/) for the Catan implementation.

Everything else — the Preact frontend, the PartyServer/Cloudflare server, the PWA shell, the design system, the deploy pipeline — was rebuilt for this project.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

Independent fan-made project for a friend group. Not affiliated with, endorsed by, or connected to Catan GmbH, Catan Studio, or Asmodee. "Catan" is a registered trademark of Catan GmbH. Buy the real game at [catan.com](https://www.catan.com/).
