# ClubCatan — mobile-first PWA rebuild

_Last revised: 2026-04-19 (incorporates external engineering review — see "Revision notes" at bottom.)_

## Context

This repo is a fork of [Viral-Doshi/catan](https://github.com/Viral-Doshi/catan) (React + Socket.io + Node). The goal is to turn it into a fast, installable, mobile-first PWA for a private friend group (no monetization, no accounts). The target experience is "A1 smooth" on phones — sub-second loads, instant interactions, and near-instant recovery after idle.

The rules stay the same; the frontend gets a full redesign guided by the existing `images-inspiration/wilderbound/DESIGN.md` ("Tactile Naturalist") system and 8 screen mocks. The whole stack moves to **Cloudflare** (unified under PartyKit with bundled static assets) — no Vercel, no Render. We ship to PartyKit's default subdomain in Phase 1; a custom domain is a later option, not a requirement. The frontend swaps React for **Preact** via compat alias from the first commit for a ~35KB bundle win on mobile. We unfork now and credit upstream in README + LICENSE so the repo has its own identity from day one. GitHub stays the source of truth; CI/CD (lint + tests + Lighthouse budgets) is deferred to Phase 3. Phased delivery: a playable MVP in 1–2 weekends, then visual/UX polish, then niceties.

## Decisions locked with user

| Area | Decision |
|---|---|
| Game rules | Keep Catan rules as-is; preserve [shared/gameLogic.js](../../shared/gameLogic.js) (2,309 LOC) nearly verbatim |
| Form factor | Installable PWA (manifest + service worker + "Add to Home Screen") |
| Aesthetic | Adopt existing `wilderbound/DESIGN.md` ("Tactile Naturalist") — Manrope, cream paper `#fafaf3`, forest `#154212`, brick `#9c4323`, no-line rule, glassmorphic HUD |
| Phase 1 board | Var 3 (full-color playable board from `images-inspiration/game_board_var_3_multiplayer/`) |
| Voice | Storytelling ("Expedition Members", "Preparing for Settlement", "Marketplace"); bottom nav stays direct (BOARD/TRADE/CARDS/STATUS) |
| Hosting | **100% Cloudflare.** PartyKit with bundled static assets — one `npx partykit deploy`, client + server share the same edge POP |
| Custom domain | **Not in Phase 1.** Use PartyKit's default subdomain (e.g. `clubcatan.<you>.partykit.dev`). Bind a custom domain later only if you want a nicer share URL |
| Framework | **Preact via `preact/compat` alias from day 1** — drop-in React API, ~35KB gzipped bundle savings |
| Pacing | Phased: MVP → visual polish → A1 refinements (optimistic moves, haptics, CI/CD) |
| Repo | Unfork now, new standalone GitHub repo, credit upstream in README + LICENSE |

## Target stack

**Client:** Preact 10 + `preact/compat` (drops into Vite via alias — all existing `import React from 'react'` code works untouched) · Vite 5 · Tailwind CSS · Zustand + **mutative** for game state (so full-snapshot reducers preserve object identities on untouched branches — see §1.7) · `idb` for IndexedDB · `partysocket` WebSocket client (replaces `socket.io-client`) · `vite-plugin-pwa` + Workbox · `@fontsource-variable/manrope` · `@use-gesture/react` for pinch/pan.

**Server:** PartyKit (Cloudflare-backed). Port [shared/gameLogic.js](../../shared/gameLogic.js) verbatim; rewrite [server/index.js](../../server/index.js) socket handlers (~886 LOC) as PartyKit `onMessage` handlers, preserving the existing event contract so tests still apply.

**Deploy:** **Single unified PartyKit project.** Vite builds the client to `client/dist/`; `partykit.json` declares `"assets": "./client/dist"` so PartyKit serves the static PWA and the realtime server from the same edge. One deploy, one domain.

## Phase 1 — MVP ("playable on your phone with friends")

Estimated 1–2 weekends of evening work. Order matters — later steps depend on earlier ones.

### 1.1 Repo + upstream detach

- Create new GitHub repo `clubcatan` under your account (independent, not a fork).
- Push current `main` to the new remote; archive the old fork.
- Update `README.md`: project description + **"Originally forked from [Viral-Doshi/catan](https://github.com/Viral-Doshi/catan), now a standalone project."** Note the stack (Preact + PartyKit) and "made for phones."
- Update `LICENSE`: preserve the original copyright line, add a line for your contributions (same license to stay compatible).

### 1.2 Server → PartyKit

- New top-level `party/` directory (PartyKit convention).
- Copy `shared/gameLogic.js` → `shared/gameLogic.js` unchanged (pure module, no I/O).
- New `party/server.js` implementing `Party.Server` with `onConnect`, `onMessage`, `onClose`. Translate each Socket.io event from `server/index.js` into a typed JSON envelope: `{ type: 'roll_dice', payload: {...} }`. Keep event names and payloads identical so existing test fixtures still apply.
- Rooms map to PartyKit rooms (the 6-letter room code is the room ID).
- Keep the existing `test-*.js` server tests; run against the ported `gameLogic.js` (tests exercise pure logic, not sockets).

### 1.3 Client — Vite + Preact + toolchain

```bash
cd client
npm uninstall react react-dom socket.io-client
npm install preact @preact/preset-vite partysocket zustand mutative idb \
  @fontsource-variable/manrope @use-gesture/react
npm install -D tailwindcss postcss autoprefixer vite-plugin-pwa workbox-window
npx tailwindcss init -p
```

In [client/vite.config.js](../../client/vite.config.js):

```js
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
export default {
  plugins: [preact(), VitePWA({ /* see 1.6 */ })],
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
};
```

All existing `import React from 'react'` code keeps working through the alias — no refactor needed.

### 1.4 Design tokens

[client/tailwind.config.js](../../client/tailwind.config.js) from `wilderbound/DESIGN.md`:

```js
colors: {
  primary: '#154212',
  secondary: '#9c4323',
  tertiary: '#4b3600',
  surface: '#fafaf3',
  'surface-low': '#f3f3ec',
  'surface-container': '#edede6',
  'surface-high': '#e7e7e0',
  'on-surface': '#1a1c18',
  'faction-red': '#9c4323',
  'faction-blue': '#3b5f7a',
  'faction-green': '#154212',
  'faction-gold': '#a48a2e',
},
fontFamily: { sans: ['"Manrope Variable"', 'system-ui', 'sans-serif'] },
borderRadius: { md: '0.75rem', xl: '1.5rem', full: '9999px' },
```

[client/src/index.css](../../client/src/index.css): `@import '@fontsource-variable/manrope'`, Tailwind base/components/utilities, body defaults. Viewport meta `width=device-width, initial-scale=1, viewport-fit=cover`.

### 1.5 PWA shell + iOS install fallback

- [client/public/manifest.webmanifest](../../client/public/manifest.webmanifest): name "ClubCatan", short_name "ClubCatan", theme_color `#154212`, background_color `#fafaf3`, `display: standalone`, `orientation: portrait-primary`.
- Icons 192, 512, and 512 maskable in [client/public/icons/](../../client/public/icons/).
- `<link rel="manifest">`, `<meta name="apple-mobile-web-app-capable">`, Apple touch icon in [client/index.html](../../client/index.html).
- **`PWAInstallHint` component**, with platform-specific UX — **iOS Safari does NOT fire `beforeinstallprompt`**:
  - **Android/Chromium:** stash the `beforeinstallprompt` event, show an "Install ClubCatan" button that triggers `event.prompt()`, dismiss persists in `localStorage`.
  - **iOS Safari:** if `navigator.userAgent` matches `/iPhone|iPad|iPod/i` AND `!window.matchMedia('(display-mode: standalone)').matches` AND not dismissed, show a custom hint: **"Tap the Share icon ⎋ and choose Add to Home Screen."** Dismiss persists.
  - **Already installed** (`standalone` matches): no hint.

### 1.6 Service worker (vite-plugin-pwa + Workbox)

```js
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,woff2,png}'],
    navigateFallback: '/index.html',
    runtimeCaching: [{
      urlPattern: /^https?:\/\/[^/]*\.partykit\.dev\/.*/,  // runtime party messages not cached
      handler: 'NetworkOnly',
    }],
  },
  manifest: { /* ref 1.5 */ },
})
```

Precache on first load → instant app shell on repeat visits.

### 1.7 State + caching (the "fast + cached" requirement)

**Game state:** [client/src/stores/gameStore.js](../../client/src/stores/gameStore.js) — Zustand store with fine-grained selectors (`useGameStore(s => s.players)`) so a dice-roll re-renders the turn indicator only.

**Reducer identity-preservation (the memo footgun):** `set({ game: snapshot })` with a fresh server snapshot replaces the root reference, invalidating every memoized child even when 95% of the tree is unchanged. We wrap the reducer with **`mutative`** (~2KB, immer-compatible API, faster than immer) so only touched branches get new references:

```js
import { create as mutativeCreate } from 'mutative';
import { create } from 'zustand';

export const useGameStore = create((set) => ({
  game: null,
  applyServerMessage: (msg) => set((s) =>
    mutativeCreate(s, (draft) => {
      if (msg.type === 'gameState') {
        draft.game = mergeSnapshot(draft.game, msg.state);
      } else if (msg.type === 'diceRolled') {
        draft.lastRoll = msg.roll;
      } // … etc.
    })
  ),
}));

/** Field-by-field merge so untouched refs (players[0], hexes, etc.) stay identical. */
function mergeSnapshot(prev, next) { /* shallow-recursive merge */ }
```

This + `React.memo` on `HexTile`/`Vertex`/`Edge` gives us the "resource changes → only the resource chip re-renders" behavior the fine-grained-selector plan depends on.

**Persistence:** [client/src/lib/cache.js](../../client/src/lib/cache.js) — `idb` wrapper with object stores:

```
profile:     { nickname, factionColor, lastSeen }
recentRooms: [{ code, joinedAt, host }]                 // last 10
activeGame:  { roomCode, snapshot, updatedAt }          // fast reconnect
settings:    { theme, haptics, storytellingVoice, wakeLock }
```

**localStorage** (sync, small): `sessionId`, theme preference, install-hint dismissal.

**Sync model:** server-authoritative, full JSON snapshots (Catan state <10KB). Optimistic UI limited to *safe local actions* in Phase 1:

- Selection highlights, hover states, focus rings → instant (pure client state)
- Trade draft composition → instant (draft lives in Zustand, sent to server on PROPOSE TRADE)
- Dice roll visual animation → starts immediately on button tap; result replaced by server value when it arrives (<300ms from edge)
- Settlement/road/city placement → server-authoritative, no optimistic render (integrity matters; race conditions possible). Revisit in Phase 2 with explicit rollback path.

### 1.7.1 Screen Wake Lock

Catan turns can run 3–5 minutes while other players negotiate; default screen-dim behavior will lock the phone, suspend JS, and drop the WebSocket. Keep the screen awake during an active game:

- On room join, call `navigator.wakeLock.request('screen')` (inside a user gesture — the join button handler).
- Listen for `visibilitychange` — when the tab comes back (`document.visibilityState === 'visible'`) re-request the lock (it's released on tab-out).
- Release the lock on leave/end-of-game.
- Gracefully no-op on unsupported browsers (Safari <16.4 — show a toast once: "Your phone may dim during long turns.").
- Expose as a setting (`settings.wakeLock`, default `true`) so users can disable if worried about battery.

```js
// client/src/hooks/useScreenWakeLock.js
export function useScreenWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel;
    const acquire = async () => {
      try { sentinel = await navigator.wakeLock.request('screen'); }
      catch (err) { console.warn('wakeLock failed', err); }
    };
    acquire();
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel?.released) acquire();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      sentinel?.release();
    };
  }, [active]);
}
```

### 1.8 Core UI primitives

[client/src/components/ui/](../../client/src/components/ui/):

- `Button.jsx` — primary/secondary/tertiary per `DESIGN.md` §5. Gradient primary, pill shape.
- `Card.jsx` — no-border, surface-hierarchy backgrounds only.
- `Chip.jsx` — resource indicator (surface-high bg, colored icon only).
- `ResourceHUD.jsx` — glassmorphic floating bar: `bg-surface/70 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-surface/96` (fallback for older Android GPUs).
- `BottomNav.jsx` — BOARD / TRADE / CARDS / STATUS tabs.
- `FactionStripe.jsx` — left-edge colored stripe on player cards.

Reference `images-inspiration/*/code.html` for DOM structure; rewrite in JSX.

### 1.9 Screens (Phase 1)

- [client/src/pages/Lobby.jsx](../../client/src/pages/Lobby.jsx) — from `multiplayer_lobby_var_1/screen.png`. Room code hero, copy-link, Game Settings card, Expedition Members list with faction stripes, READY UP pill.
- [client/src/pages/Board.jsx](../../client/src/pages/Board.jsx) — from `game_board_var_3_multiplayer/screen.png`. Players strip top, full-color hex board with number tokens + settlements + roads, action FAB row (settings/home/dice/building/rules), BottomNav.
- [client/src/pages/Trade.jsx](../../client/src/pages/Trade.jsx) — from `multiplayer_trade_var_1/screen.png`. Marketplace title, I Give / I Want chip grids, PROPOSE TRADE, Active Offers.
- `Cards.jsx`, `Status.jsx` — scaffold only; polished in Phase 2.

**Lazy load**: `Trade.jsx`, `Cards.jsx`, `Status.jsx` via `lazy()` + `<Suspense>` (Preact's built-in). Board + Lobby are in the critical path; others load on nav.

### 1.10 SVG board for touch

- Rewrite [client/src/components/HexBoard.jsx](../../client/src/components/HexBoard.jsx) with memoized sub-components: `HexTile`, `Vertex`, `Edge`.
- **Gesture frames use CSS `transform`, not `viewBox`.** Modifying `viewBox` on every gesture frame forces layout + re-rasterization of the whole SVG (frame-dropping on mid-tier Android). Instead:
  - A wrapping `<div>` (or `<g>`) carries `style={{ transform: 'translate(x, y) scale(s)', transformOrigin: '0 0', willChange: 'transform' }}` — GPU-accelerated.
  - Every stroked SVG primitive (`<circle>`, `<line>`, `<path>`) gets `vector-effect="non-scaling-stroke"` so zoom doesn't warp stroke widths.
  - `@use-gesture/react` updates the transform inside `requestAnimationFrame` only (via Zustand ephemeral state, not React props — avoids reconciliation during gesture).
  - On gesture end, optionally commit the transform back into `viewBox` to normalize DOM state; not required for correctness.
- Touch hit targets ≥44×44 CSS px. Vertex/edge interactions use transparent enlarged `<circle>` / `<rect>` over the visible element.
- All animations use `transform` + `opacity` only (no layout thrash → consistent 60fps on mid-tier Android).

### 1.11 Client ↔ PartyKit wiring

- Replace `socket.io-client` in [client/src/App.jsx](../../client/src/App.jsx) with `partysocket`:
  ```js
  const socket = new PartySocket({
    host: import.meta.env.VITE_PARTY_HOST,
    room: roomCode,
  });
  socket.addEventListener('message', e =>
    gameStore.getState().applyServerMessage(JSON.parse(e.data))
  );
  ```
- Reconnect logic: `partysocket` auto-reconnects with backoff; on reconnect, client rehydrates UI from IndexedDB `activeGame` snapshot *first*, then overwrites with server's authoritative state on the first post-reconnect message.
- Drop the existing 4-minute keepalive ping from `App.jsx` — PartyKit handles heartbeats.

### 1.12 Unified PartyKit deploy

[partykit.json](../../partykit.json) at repo root:

```json
{
  "$schema": "https://www.partykit.io/schema.json",
  "name": "clubcatan",
  "main": "party/server.js",
  "compatibilityDate": "2026-04-19",
  "serve": {
    "path": "./client/dist",
    "singlePageApp": true
  }
}
```

Note: the config key for static assets is **`serve`**, not `assets` (the latter is a marketing-site term that doesn't exist in the CLI schema as of partykit v0.0.115). Dev/deploy will error out with a Zod validation message if the wrong key is used.

Build + deploy:
```bash
cd client && npm run build && cd ..
npx partykit deploy
```

This ships to PartyKit's default subdomain (e.g. `clubcatan.<you>.partykit.dev`) — HTTPS and SSL automatic, share link is just that URL. Good enough for Phase 1.

Environment: `VITE_PARTY_HOST` set to the PartyKit subdomain and baked into the client build.

**Custom domain — deferred.** If/when you want a nicer share URL, Cloudflare DNS CNAME → PartyKit target, binding takes ~5 minutes. Not on the Phase 1 critical path.

## Phase 2 — Visual & UX polish

Own planning pass when Phase 1 is stable. Lighter detail here:

- Dark mode via `prefers-color-scheme` + Tailwind `dark:` variants.
- Microinteractions: dice roll animation, card flip for dev cards, subtle lift on settlement placement. CSS `@keyframes` first; Framer Motion (Preact-compatible via `framer-motion/dist/framer-motion.mjs`) only if needed.
- Haptics via `navigator.vibrate()` on own turn, trade accepted, dice roll.
- Optimistic moves with rollback — render settlement/road placement immediately, reconcile when server responds. Adds real complexity (rollback UI, conflict resolution) — only justified if Phase 1 measurements show >100ms perceived lag.
- Polish Cards + Status screens (mocks to be designed).
- Board Var 1 (abstract) and Var 2 (zoomed) as user-selectable view modes.
- Accessibility pass (focus rings, aria-labels, `prefers-reduced-motion` respect).

## Phase 3 — Niceties + CI/CD

- House-rule toggles for your friend group (longer games, custom dev card counts, map seed sharing).
- Friends list / recent opponents (local-only, no accounts).
- Sound effects (muted by default).
- Game replay from stored snapshots.
- **GitHub Actions CI/CD** (per your roadmap): lint + unit tests on PR; Lighthouse budget check (fail if mobile Performance <90); auto-deploy to PartyKit on merge to main.

## Performance — how we hit "A1 smooth"

| Need | Mechanism | Phase |
|---|---|---|
| Tiny JS bundle | Preact via compat alias — ~4KB vs ~40KB | 1 |
| Instant repeat loads | Workbox precache of all built assets; SW cache-first shell | 1 |
| Instant interactions | Zustand fine-grained subs + `mutative` identity preservation + `memo` on SVG primitives | 1 |
| Smooth 60fps pinch/zoom | CSS `transform` during gesture + `vector-effect="non-scaling-stroke"` on strokes | 1 |
| Smooth 60fps animations | `transform`/`opacity`-only; no layout thrash | 1 |
| Fast first paint | Manrope preload + `font-display: swap` + system fallback | 1 |
| Fast route changes | `lazy()` + `Suspense` on non-critical screens | 1 |
| Cached user data | IndexedDB via `idb` — profile, rooms, last snapshot | 1 |
| Fast reconnect | Rehydrate from `activeGame` snapshot, server override after | 1 |
| Screen stays awake mid-game | `navigator.wakeLock.request('screen')` + `visibilitychange` re-request | 1 |
| Live-only updates | PartyKit WebSocket; single persistent connection | 1 |
| **Near-instant wake after idle** | PartyKit Cloudflare edge; Durable Objects hibernate after ~10s idle, wake in <300ms | 1 |
| Same-POP client+server | Unified PartyKit deploy — client assets served from same edge as realtime | 1 |
| Low network overhead | JSON snapshots <10KB; no polling | 1 |
| iOS install UX | UA-sniffed "Add to Home Screen" hint (Safari has no `beforeinstallprompt`) | 1 |
| Instant perceived moves | Optimistic settlement/road placement with rollback | 2 |
| Tactile feedback | `navigator.vibrate()` on key events | 2 |
| Reduced repaint cost | GPU layer promotion via `will-change: transform` on animated surfaces | 2 |

## Known constraints (flagged, not blockers)

- **iOS Safari PWA eviction** — cached data may be purged after ~7 days of non-use. Server is source of truth; local cache is for speed, never correctness. App-shell precache survives because installed PWAs keep their cache separately from general storage.
- **iOS Safari has no `beforeinstallprompt`** — plan §1.5 handles this explicitly with a UA-sniffed Share→Add-to-Home-Screen hint. Not a bug once the fallback is wired.
- **Older Android backdrop-filter** — glassmorphic HUDs fall back to solid 96% surface via `@supports` check.
- **PartyKit Durable Object hibernation** — rooms go cold after ~10s idle; first message post-lull incurs ~100–300ms wake latency. Acceptable for a friend-group Catan game; not "zero cold start" in the strict sense. A keep-alive cron would defeat the free-tier economics, so we accept the trade-off.
- **PartyKit free-tier limits** — generous for ~6 concurrent players; monitor via `partykit` dashboard. Usage past free tier is Cloudflare Workers pricing, still pennies.
- **Wake Lock availability** — Chrome Android + Safari iOS 16.4+ support `navigator.wakeLock`. Older iOS shows a one-time toast; users on those versions keep tapping the screen as they do today.
- **Preact compat edge cases** — 98% of React code works unchanged. If we add a library that relies on React internals (e.g. Redux DevTools, React Spring internals), we handle case-by-case. Low probability given our dependency list.

## Critical files to modify / create

| Path | Action |
|---|---|
| `README.md`, `LICENSE` | Update — standalone project, credit upstream |
| `partykit.json` | **Create** — unified deploy config with static assets |
| `party/server.js` | **Create** — PartyKit room handler (~400 LOC) |
| `shared/gameLogic.js` | **Copy** from `shared/gameLogic.js` unchanged |
| `server/`, `render.yaml`, keepalive ping in `App.jsx` | **Delete** after PartyKit migration lands |
| `client/package.json` | Swap deps: remove `react`/`react-dom`/`socket.io-client`; add `preact`, `@preact/preset-vite`, `partysocket`, `zustand`, `mutative`, `idb`, `@fontsource-variable/manrope`, `@use-gesture/react`, `vite-plugin-pwa`, `tailwindcss`, etc. |
| `client/vite.config.js` | Add `@preact/preset-vite`, React→Preact aliases, `vite-plugin-pwa` |
| `client/tailwind.config.js`, `client/postcss.config.js` | **Create** |
| `client/public/manifest.webmanifest` | **Create** |
| `client/public/icons/` | **Create** — 192, 512, maskable |
| `client/index.html` | Add manifest link + Apple PWA meta |
| `client/src/index.css` | Tailwind directives + Manrope import |
| `client/src/App.jsx` | Rewire to `partysocket`; route Lobby / Board / Trade / Cards / Status; remove keepalive |
| `client/src/stores/gameStore.js` | **Create** — Zustand + mutative identity-preserving reducer |
| `client/src/lib/cache.js` | **Create** — IndexedDB wrapper |
| `client/src/hooks/useScreenWakeLock.js` | **Create** — screen wake lock with visibility re-request |
| `client/src/components/ui/*.jsx` | **Create** — Button, Card, Chip, ResourceHUD, BottomNav, FactionStripe |
| `client/src/components/PWAInstallHint.jsx` | **Create** — Chromium prompt + iOS Share-sheet fallback |
| `client/src/pages/Lobby.jsx` | **Create** per lobby var 1 mock |
| `client/src/pages/Board.jsx` | **Create** per board var 3 mock |
| `client/src/pages/Trade.jsx` | **Create** per trade var 1 mock |
| `client/src/pages/Cards.jsx`, `Status.jsx` | Scaffold |
| `client/src/components/HexBoard.jsx` | **Rewrite** — memoized, pinch/pan via CSS transform, `non-scaling-stroke`, ≥44px hit targets |

## Verification

Run end-to-end on real phones, not just simulators.

1. **Game logic unchanged** — `node test-*.js` against ported `shared/gameLogic.js` all pass.
2. **Multiplayer flow** — lobby on iPhone, join from Android via 6-letter code, start game, play a full turn (dice + build + trade). No desyncs.
3. **PWA install** — iPhone Safari → Share → Add to Home Screen produces icon with correct name + theme color; our in-app hint appears and dismisses. Android Chrome shows install prompt; installed app opens standalone.
4. **Default subdomain + SSL** — PartyKit URL (`clubcatan.<you>.partykit.dev`) resolves, serves over HTTPS, PWA installable from it. (Custom domain check only if bound.)
5. **Offline behavior** — installed PWA with airplane mode: app shell loads, "You're offline — reconnecting…" toast. Toggle back on, reconnects, resumes.
6. **Mobile layout** — no horizontal scroll at 375×667 (iPhone SE) and 360×800 (common Android). Touch targets ≥44×44 verified in Safari Web Inspector.
7. **Lighthouse mobile** — Performance ≥95, PWA 100, Accessibility ≥95, Best Practices ≥95. (Preact + precache should give us Performance 95+.)
8. **Bundle size check** — `npm run build` reports total gzipped JS <60KB for the critical path (Lobby + Board + core).
9. **Interaction latency** — first PartyKit message after idle: <300ms (DO wake). Tap → visual ack: <16ms (one frame).
10. **Cache hit on reload** — second load completes in <500ms on throttled 4G (DevTools).
11. **Reconnect speed** — kill WebSocket; board stays rendered from IndexedDB; reconnect + live state restored within 2s.
12. **Preact compat smoke** — every screen renders; no React-specific runtime warnings in console.
13. **Pinch/zoom 60fps** — iOS Safari + mid-tier Android Chrome, DevTools frame timeline shows no frame >16ms during continuous pinch; stroke widths stay visually constant.
14. **Screen stays on mid-turn** — 10-minute simulated turn: phone doesn't dim, WebSocket stays connected, no re-sync required.
15. **iOS install hint** — fresh iOS Safari with no PWA installed: Share-sheet hint appears; once installed, hint does not reappear.

## Revision notes

**2026-04-19 — external engineering review incorporated.** Five corrections:

1. **§1.10 pinch/pan** switched from `viewBox` to CSS `transform` + `vector-effect="non-scaling-stroke"` — `viewBox` mutation on 60Hz gestures causes layout thrash.
2. **§1.5 install hint** now explicitly handles iOS Safari (no `beforeinstallprompt`) with a UA-sniffed Share→Add-to-Home-Screen fallback.
3. **§1.7.1 Screen Wake Lock** added to Phase 1 — Catan turns are long enough that default screen dim drops the WebSocket.
4. **§1.7 state reducer** now wraps snapshot application in **`mutative`** so untouched branches preserve object identity; raw `set({ game: snapshot })` would defeat `React.memo` on every SVG child.
5. **"Zero cold starts"** restated as **"near-instant wake (<300ms) after idle"** to reflect Durable Object hibernation — accurate characterization, not a change in strategy.
