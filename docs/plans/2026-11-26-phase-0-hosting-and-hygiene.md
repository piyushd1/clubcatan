# ClubCatan Phase 0: Host, Fix, Clean — approved implementation plan

Workspace: /Users/piyushdv/Amazon/Non-work/Projects/clubcatan (clone of github.com/piyushd1/clubcatan, branch main, 67 commits).
Audit with full findings and line references: docs/audit/2026-11-26-audit.md (already written, uncommitted). Read it first.

## Ground rules for execution

1. Work task by task, in order. Each task ends with `npm test` green, `npm run build` green, and ONE local git commit with a clear message. Do NOT `git push`; the user pushes. From Task 4 onward every push to `main` deploys to production, so say so in the commit summary you hand back.
2. Before Task 2 (network-facing server code) and again before Task 4 (first deploy): load `skill::builder-security` and, if the arcc-mcp tools are available, run `search_arcc` on network exposure / public WebSocket endpoints, then follow what they say. The exposure is intentional: a link-shared party game with no accounts; the in-scope mitigations are server-side validation (Tasks 5–6), name/chat length caps, and strict key formats.
3. Never delete remote branches or close PRs without the user's explicit "go" in the conversation (Task 8). Never force-push. Never run `git reset --hard` or `git clean`.
4. When something in this plan conflicts with what the code actually does, trust the code and report the discrepancy in your task summary.
5. The user has `gh` (logged in) and a Cloudflare CLI `cf` installed. Use them for read-only checks and, after the user's go, for the Task 8 PR/branch cleanup.
6. Keep diffs minimal and in the repo's existing style (ESM, 2-space, JSX via preact/compat alias). No new features; only what is listed.

## USER ACTIONS (things only the user can do) — surface these clearly when you reach them

- After every task: review and `git push origin main` (or ask the agent to open a branch + PR if preferred).
- Task 4, before the first deploy:
  1. Cloudflare dashboard → My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers"; add permission `Zone → DNS → Edit` scoped to zone `piyushdev.com` (needed for the custom-domain record). Copy the token.
  2. Account ID: from the Workers & Pages overview page (or the agent can read it via `cf` read-only).
  3. GitHub → repo Settings → Secrets and variables → Actions: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; delete `PARTYKIT_LOGIN` and `PARTYKIT_TOKEN`.
  4. Review the security preflight summary the agent produces, then push to `main` to trigger the first production deploy.
- Task 8: say "go" for closing 126 PRs and deleting the bot branches; disable the Jules scheduled tasks (Bolt/Palette) in the Jules dashboard so they stop regenerating; confirm `debug` branch stays (default) or should be deleted.
- Task 9: the real-device playtest needs the user plus at least one friend, on one iPhone (Safari + installed PWA) and one Android (Chrome + installed PWA), against https://catan.piyushdev.com.

## Verified facts to rely on

- Hosted PartyKit shut down 23 Oct 2026; `npx partykit deploy` no longer works. Successor: `partyserver` npm package + `wrangler`. Migration guide: https://docs.partykit.io/guides/migrate-to-partyserver/
- PartyServer API (from cloudflare/partykit README): `class X extends Server`; `static options = { hibernate: true }`; hooks `onStart()` (first start AND after hibernation wake), `onConnect(connection, ctx)`, `onMessage(connection, message)` (argument order swapped vs PartyKit), `onClose(connection, code, reason, wasClean)`, `onError`, `onRequest(request)`, `onAlarm()`; methods `broadcast(msg, excludeIds=[])`, `getConnections(tags=[])`, `getConnection(id)`; props `this.name` (room id), `this.ctx.storage` (DO storage, `get/put/delete/deleteAll/setAlarm`), `this.env`; per-connection `connection.setState(obj)` / `connection.state` (≤2 KB, survives hibernation). Router: `routePartykitRequest(request, env)` serves `/parties/:server/:room` where `:server` is the kebab-cased binding name — binding `Main` ↔ path `/parties/main/ROOM`, which is what the existing client already uses.
- Workers static assets + Worker: assets are matched first unless `run_worker_first` says otherwise. Use `assets: { directory: "./client/dist", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: ["/parties/*"] }` so WebSocket upgrades reach the Worker and everything else is served statically with SPA fallback.
- Custom domain: `routes: [{ pattern: "catan.piyushdev.com", custom_domain: true }]` in wrangler.jsonc. Zone `piyushdev.com` already exists in the user's Cloudflare account.
- Workers Free plan: SQLite-backed Durable Objects only; 100k DO requests/day, 13k GB-s/day, 100k row writes/day, 5M row reads/day, 5 GB. Each `ctx.storage.put` is a row write. Hibernating rooms are not billed for duration.
- Local toolchain: Node 24.19, npm 11.17. `npm ci` (root) + `npm ci --prefix client`, `npm run build` (Vite, ~1 s, 48 KB gz JS), `npm test` = `test:client` (client/test-room-code.js, client/test-hex-math.js) + `test:logic` (5 suites in tests/). All green at start.
- Protocol (keep byte-compatible): client→server `{ type, ackId?, payload }`; server→client `{ type:'_ack', ackId, ok, result|error }`, `{ type:'gameState', state }` (per-player view via `GameLogic.getPlayerView`), plus broadcast events. Handlers live in `HANDLERS` map in party/server.js (25 of them). Engine: shared/gameLogic.js (2,323 lines, exports createGame/addPlayer/startGame/shuffleBoard/rollDice/discardCards/moveRobber/canPlaceSettlement/placeSettlement/canPlaceRoad/placeRoad/upgradeToCity/buyDevCard/playDevCard/yearOfPlentyPick/bankTrade/proposeTrade/respondToTrade/cancelTrade/endTurn/endSpecialBuild/canSpecialBuild/advanceSetup/updateLongestRoad/getPlayerView/getVertexAdjacentHexes/getPlayersOnHex/getVertexEdges/getAdjacentVertices/areVerticesEqual/getEquivalentEdges + constants).
- Client host resolution today (client/src/lib/partykit-client.js DEFAULT_HOST): localhost/IPv4/.local → `${hostname}:1999`, else bare hostname (wss 443). Service worker rule in client/vite.config.js: NetworkOnly for `*.partykit.dev`.

## Confirmed engine authority holes (all reproduced; fix in Task 5, re-test in tests/test-server-authority.js)

1. `rollDice` lacks `phase === 'playing'` guard (rolls in lobby; a 7 puts lobby in `robber` phase).
2. `placeSettlement` has no turn/phase check (out-of-turn, unlimited free settlements in setup).
3. `placeRoad` trusts client `isSetup`/`lastSettlement` (free roads during main game).
4. `placeRoad` has no turn/phase check.
5. `discardCards` accepts negative amounts.
6. `proposeTrade` accepts negative offers; `respondToTrade` does not re-check offerer stock (negative balances).
7. `yearOfPlentyPick` does not validate resource key (NaN).
8. Monopoly does not validate `params.resource` (NaN, card consumed).
9. `moveRobber` steals from a player with no building on the hex.
10. No `phase === 'finished'` guard anywhere.
11. `advanceSetup` does not verify 1 settlement + 1 road were placed.
12. `playDevCard` has no `turnPhase` check (knight during discard/robber).
13. `bankTrade` does not validate `getResource` (NaN).
Rules bug: robber steal picks a random resource TYPE not a random CARD (9 wool + 1 ore → ore stolen ~50%, should be 10%).

## Dead code inventory (Task 1)

Unreferenced (verified by import grep): client/src/components/{ActionPanel,CardReveal,Chat,Confetti,DevCardModal,DiceDisplay,DiscardModal,GameBoard,HexBoard,InfoPopup,Lobby,PlayerPanel,ResourceCards,RulesModal,TradeModal}.jsx and their .css (6,916 lines). Also client/src/App.css (legacy; verify no class referenced in App.jsx — it uses Tailwind only), render.yaml, client/vercel.json, client/static.json, client/public/_redirects. Unused dep: @use-gesture/react. Dead store state in client/src/stores/gameStore.js: incomingTrade, tradeOffers, draftTrade, selection, dismissIncomingTrade, setDraftTrade, clearDraftTrade, setSelection, selectHexes (reads game.board.hexes which does not exist), and the tradeProposed/tradeCancelled cases that only feed incomingTrade — grep for consumers before removing each. KEEP: client/src/components/PWAInstallHint.jsx, components/board/*, components/ui/*, components/landing/*.

---

## Task 1: Remove dead code and fork leftovers
Objective: shrink the surface before touching anything else.
Steps: delete the files listed in the inventory; remove @use-gesture/react from client/package.json and re-run `npm install --prefix client` so the lockfile updates; remove dead store state after grepping; save this plan verbatim to docs/plans/2026-11-26-phase-0-hosting-and-hygiene.md; commit docs/audit/2026-11-26-audit.md alongside.
Tests: `npm test` green; `npm run build` green; gzipped JS ≤ 48 KB (should be identical).
Demo: `npx partykit dev` still boots and a two-tab create/join/start works as before. `git diff --stat` ≈ 7k lines removed.
Commit: "Phase 0.1: remove dead legacy components, fork leftovers, unused deps; add audit + plan".

## Task 2: Port the server to PartyServer and run it locally with wrangler
Objective: replace the PartyKit runtime with PartyServer on Workers, preserving the wire protocol so client and tests are untouched.
Steps:
- Root: `npm i partyserver`, `npm i -D wrangler`, `npm uninstall partykit`.
- Rewrite party/server.js: `import { Server, routePartykitRequest } from 'partyserver'`; `export class ClubCatanServer extends Server { static options = { hibernate: true }; ... }`; `onMessage(connection, message)`; `this.room.broadcast(...)` → `this.broadcast(...)`; `this.room.getConnection(id)` → `this.getConnection(id)`; `this.room.id` → `this.name`. Keep HANDLERS and all event names/payloads identical. (In this task the three Maps may stay in memory; Task 3 replaces them.) Default export: `{ async fetch(request, env) { return (await routePartykitRequest(request, env)) || env.ASSETS.fetch(request); } }`.
- Create wrangler.jsonc: name "clubcatan", main "party/server.js", compatibility_date "2026-11-26", durable_objects.bindings [{ name: "Main", class_name: "ClubCatanServer" }], migrations [{ tag: "v1", new_sqlite_classes: ["ClubCatanServer"] }], assets as in verified facts, routes [{ pattern: "catan.piyushdev.com", custom_domain: true }], observability enabled. Delete partykit.json.
- Client: partykit-client.js DEFAULT_HOST → if VITE_PARTY_HOST set use it; else if `window.location.port === '5173'` use `localhost:8787`; else `window.location.host`. vite.config.js runtimeCaching → `urlPattern: ({ url }) => url.pathname.startsWith('/parties/')`, handler NetworkOnly. Update client/public? nothing else.
- Root package.json scripts: "dev": "npm run build && wrangler dev", "dev:client": unchanged, remove "dev:party" and "deploy", add "test:smoke": "node tests/smoke-ws.mjs", "check:wrangler": "wrangler deploy --dry-run --outdir .wrangler/dry-run". Add `.wrangler/` and `.dev.vars` to .gitignore.
- Add tests/smoke-ws.mjs (Node ≥22 native WebSocket, default URL ws://localhost:8787/parties/main/<random room>, overridable via SMOKE_URL): two clients; createGame; joinGame; non-host startGame rejected ("Only host can start the game"); host startGame ok; unknown type rejected; garbage JSON tolerated; exits 0/1 with a summary. (Out-of-turn placement assertion is added in Task 5 once it is actually rejected.)
Tests: `npm test`; `npm run check:wrangler`; with `npm run dev` running, `npm run test:smoke` passes.
Demo: open http://localhost:8787 on laptop and phone (same Wi-Fi, use the LAN IP wrangler prints with `--ip 0.0.0.0` if needed), create on one, join on the other.
Commit: "Phase 0.2: migrate server to PartyServer + wrangler; add WS smoke test".

## Task 3: Persist game state and survive hibernation and restarts
Objective: a game survives DO eviction, hibernation and a mid-game deploy.
Steps:
- `async onStart() { this.game = (await this.ctx.storage.get('game')) ?? null; }`
- Add `async persist()` → `ctx.storage.put({ game: this.game, lastActivity: Date.now() })` and `ctx.storage.setAlarm(Date.now() + 24*60*60*1000)`; call it after every handler whose engine result is `success` (createGame, joinGame, startGame, shuffleBoard, rollDice, discardCards, moveRobber, placeSettlement, placeRoad, upgradeToCity, buyDevCard, playDevCard, yearOfPlentyPick, bankTrade, proposeTrade, respondToTrade, cancelTrade, advanceSetup, endTurn, endSpecialBuild). Make handlers async where needed; ack after persist.
- `async onAlarm()`: `const last = await ctx.storage.get('lastActivity')`; if `Date.now() - last > 7 days` → `ctx.storage.deleteAll()` (room becomes empty, code reusable); else reschedule 24 h.
- Replace playerByConn/connByPlayer/spectatorsByConn Maps with `connection.setState({ role:'player', playerId })` or `{ role:'spectator', name }`. Helpers: `playerIdOf(conn) = conn.state?.role==='player' ? conn.state.playerId : null`; `connectionForPlayer(id)` iterates `this.getConnections()`; `broadcastGameState()` iterates connections and sends player view or spectator view by state. `onClose` reads `connection.state`. `reconnect` clears state on any other connection holding the same playerId.
- Spectator reload (audit M9): keep `joinAsSpectator` idempotent for a reconnecting spectator; client App.jsx: if `session.spectator` and no `playerId`, on socket open call `joinAsSpectator({ playerName: session.name })` instead of `reconnect`.
Tests: extend tests/smoke-ws.mjs with a `--restart` mode or a separate `tests/smoke-restart.mjs` that: starts a game, writes playerIds to a temp file, then (driven by an npm script that kills and restarts `wrangler dev`) reconnects and asserts phase/players/vertices equal the pre-restart snapshot. Unit test the pure view-picker helper if extracted (tests/test-server-helpers.js).
Demo: two phones in a game; stop and restart `wrangler dev`; both reconnect to the same board without "Your expedition ended while you were away."
Commit: "Phase 0.3: persist game to DO storage, hibernation-safe connection state, 7-day room TTL, spectator reload".

## Task 4: Deploy pipeline and first production deploy
Objective: https://catan.piyushdev.com serves the game; every push to main redeploys.
USER ACTIONS first (see top): API token, Account ID, GitHub secrets. Agent may use `cf` read-only to fetch Account ID and confirm the piyushdev.com zone.
Steps (agent):
- Security preflight per ground rule 2; write a short summary (what is exposed, why, mitigations in Tasks 5–6) into the task report for the user to review.
- .github/workflows/ci.yml: Node 22; `npm ci` root + client; `npm run build`; `npm test` (both suites); `npm run check:wrangler`.
- .github/workflows/deploy.yml: on push to main; same steps; then `cloudflare/wrangler-action@v3` with `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`, `command: deploy`; keep concurrency group `partykit-deploy` renamed `cloudflare-deploy`, cancel-in-progress false. Remove PARTYKIT env.
- README interim note of the new URL (full rewrite in Task 8).
Tests: CI green on the branch (dry-run validates config). After the user pushes to main: Deploy job green; `curl -I https://catan.piyushdev.com` → 200; `SMOKE_URL=wss://catan.piyushdev.com/parties/main/SMOKE99 npm run test:smoke` passes; `cf`/dashboard shows the Worker, DO namespace, and custom domain.
Demo: create a game on a phone at https://catan.piyushdev.com, join from a second phone via the copied link, start, place a settlement.
Commit: "Phase 0.4: GitHub Actions CI + wrangler deploy to catan.piyushdev.com".

## Task 5: Close the engine's authority holes
Objective: the engine rejects every out-of-turn, out-of-phase or malformed action regardless of what the client sends.
Steps in shared/gameLogic.js:
- `RESOURCE_KEYS = Object.values(RESOURCES)`; helpers `isResourceKey(k)`, `isNonNegInt(n)`, `assertActive(game)` (phase ∈ {setup, playing}), `isCurrentPlayer(game, playerId)`.
- rollDice: phase must be 'playing'. moveRobber, discardCards, placeSettlement, placeRoad, upgradeToCity, buyDevCard, playDevCard, yearOfPlentyPick, bankTrade, proposeTrade, respondToTrade, cancelTrade, endTurn, endSpecialBuild: `assertActive`.
- placeSettlement / placeRoad: in setup → acting player must be `currentPlayerIndex`; in playing → `canPlayerBuildNow` (main phase on own turn, or own special-build slot) — except free roads from Road Building which already require own turn via freeRoads>0 and currentPlayer check.
- Setup tracking: `game.setupTurn = { settlement: null, road: null }` created in startGame and reset on each advance. Setup placeSettlement: reject if `setupTurn.settlement` already set; store vKey. Setup placeRoad: require `setupTurn.settlement` set and edge touches it (reuse existing `areVerticesEqual` check with `getEdgeVertices`); after success, auto-advance (move the body of `advanceSetup` into an internal `advanceSetupInternal(game)` and call it). Remove the `isSetup`/`lastSettlement` parameters from the public `placeRoad`/`canPlaceRoad` signature (derive `isSetup = game.phase === 'setup'`). Remove exported `advanceSetup`. Include `setupTurn` in `getPlayerView` output (it is already spread via `...game`).
- playDevCard: require `turnPhase` ∈ {'roll','main'} and (for knight) not during discard; Monopoly: `isResourceKey(params.resource)` else error, card NOT consumed on error (validate before splice).
- yearOfPlentyPick, bankTrade (both give and get), discardCards, proposeTrade (offer and request), respondToTrade: validate keys with `isResourceKey` and amounts with `isNonNegInt`; reject unknown keys; proposeTrade requires at least one resource total > 0 across offer+request; respondToTrade re-checks offerer still has the offered resources before executing (else return error 'Offer no longer valid' and clear tradeOffer).
- moveRobber: if `stealFromPlayerId` given, victim index must be in `getPlayersOnHex(game, hexKey, currentPlayerIndex)`, else error. Steal a uniformly random CARD: build an array of resource names repeated by count, pick one with secureRandom.
- checkWinner already sets phase 'finished'; `assertActive` enforces hole 10.
Tests: new tests/test-server-authority.js (same style as tests/test-game.js: own tiny assert helper, colored output, exit code) covering all 13 holes + per-card steal distribution (4,000 trials, ore ≈10% ±3) + setup auto-advance (second player cannot act until first player's road lands; first player cannot place a second settlement). Add to `test:logic`. Update tests/test-full-game.js and others for removed `advanceSetup`/`isSetup` args. All suites green.
Demo: `node tests/test-server-authority.js` shows every probe rejected.
Commit: "Phase 0.5: enforce turn/phase ownership, server-side setup tracking, resource validation, per-card robber steal".

## Task 6: Validate payloads at the server boundary and update the client contract
Objective: the server never passes untrusted shapes into the engine; client stops sending what the server now derives.
Steps:
- party/validate.js: per-message validators returning `{ ok, error }`: names (string, trimmed, 1–24 chars, control chars stripped), chat (≤300 chars), hexKey `^-?\d+,-?\d+$`, vertexKey `^v_-?\d+_-?\d+_[0-5]$`, edgeKey `^e_-?\d+_-?\d+_[0-5]$`, resource maps `{key ∈ RESOURCE_KEYS: int 0..50}`, booleans, cardType ∈ DEV_CARDS values, `accept` boolean. In `onMessage`, run the validator for the type before the handler; on failure ack `ok:false` with the error and return.
- Remove `advanceSetup` handler; placeRoad handler reads only `edgeKey`.
- Client client/src/pages/Board.jsx: remove `isSetup`/`lastSettlement` from `placeRoad` calls; remove `advanceSetup` call; replace local `settlementCommitted` with `game.setupTurn?.settlement` from gameState (ghost rendering and Confirm button logic read it); setup flow becomes: tap vertex → Confirm → placeSettlement; tap edge → Confirm → placeRoad (server advances). Keep two-step Confirm UX. Keep `isVertexOnEdge` client pre-check.
Tests: tests/test-validate.js (accept/reject per validator); smoke-ws.mjs gains malformed-payload cases (negative discard, bogus resource key, 5 KB name, out-of-turn placeSettlement) asserting `ok:false` and unchanged state. All green.
Demo: in browser DevTools, `window.__cc = client` (dev-only hook) then `client.call('placeRoad', { edgeKey:'e_0_0_0', isSetup:true })` in main game is rejected; mid-setup reload still shows "tap an edge for your road".
Commit: "Phase 0.6: payload validation at the server boundary; client uses server setupTurn".

## Task 7: Fix the client bugs that break a normal game
Steps in client/src:
- pages/Board.jsx: winner lookup `players.find(p => p.id === game.winner)` at both sites (≈lines 339 and 1476).
- FACTIONS → 6 entries in pages/Board.jsx and pages/Lobby.jsx: ['red','blue','gold','green','purple','teal']; tailwind.config.js faction.purple '#6b3b7a', faction.teal '#2f7a73' (match HexBoard FACTION_COLORS); GameOverOverlay rank badge colours extended to 6.
- Trade dialog: hide when `game.tradeOffer.responses?.[playerId] === 'decline'`.
- stores/gameStore.js diceRolled: store `{ total, die1, die2, playerId }` from `msg.roll` (server sends die1/die2); no new dice UI.
- achievementChanged: route through `pushNotification` instead of the inline setTimeout/setState.
Tests: client/test-ui-helpers.js for extracted pure helpers (`findWinner(players, winnerId)`, `factionForSeat(i)`, `shouldShowTradeDialog(tradeOffer, myIndex, playerId)`); add to `test:client`. All green.
Demo: finish a local 2-player game → "You Won"/"Bob won" with ranked list; 6-player lobby shows six distinct colours matching board pieces; declined trade stays closed.
Commit: "Phase 0.7: fix winner display, 6 faction colours, declined-trade dialog, dice data".

## Task 8: Repo hygiene, PRs, branches and docs
USER ACTIONS: say "go" for PR/branch cleanup; disable Jules scheduled tasks; confirm `debug` branch stays (default) or goes.
Steps (after go): `gh pr list -R piyushd1/clubcatan -s open -L 200 --json number` → close each with comment "Closing: superseded by Phase 0 cleanup (see docs/audit/2026-11-26-audit.md). Bot PRs targeted dead legacy files or a looser parser." Delete remote branches matching bolt-*, bolt/*, palette-*, palette/*, jules-*, perf-*, consolidate-*, feature/a11y-*, security-fix-*, testing-improvement-*, ecc-tools/* (list them first, show the user, then delete). Leave `debug` unless told otherwise.
Docs: rewrite README.md (live URL https://catan.piyushdev.com, repo layout with shared/gameLogic.js and tests/, local dev `npm ci && npm ci --prefix client && npm run dev`, tests `npm test`, deploy = push to main via GitHub Actions + wrangler, remove DEBUG.md link and partykit instructions, keep credits/disclaimer); LICENSE: keep Viral Doshi 2024 line, add "Copyright (c) 2026 Piyush Dev (ClubCatan additions)"; .gitignore: drop `.partykit/`, ensure `.wrangler/` and `.dev.vars`.
Tests: `npm test` green; follow the README from a fresh `git clone` into a temp dir and confirm the commands work.
Demo: GitHub shows 0 open PRs and only main (+debug); README quick-start works on a fresh clone.
Commit: "Phase 0.8: README/LICENSE/gitignore for the Cloudflare era".

## Task 9: Functional verification on real phones and v1.0.0 tag
USER ACTION: playtest with a friend on iPhone + Android.
Steps: write docs/verification/2026-11-phase-0.md with the checklist below and record PASS/FAIL per item; fix any failure in this task; then tag `v1.0.0` on main (user pushes the tag).
Checklist against https://catan.piyushdev.com: create/join via link; 3-player lobby; full setup round (both snake directions); roll; build road/settlement/city; 4:1 and port trades; player trade accept/decline/cancel; roll a 7 with discard and steal; buy and play each dev card (knight before and after roll, road building, year of plenty, monopoly, VP hidden then revealed at end); longest road and largest army handoff toasts; win screen names the winner; spectator join and reload; lock phone 2 minutes then unlock (wake lock, reconnect); airplane mode 30 s then back; a trivial commit pushed to main during a live game (game continues after deploy); 5–6 player extended board renders and Special Building Phase cycles; iOS Add-to-Home-Screen hint and Android install prompt; installed PWA launches standalone.
Tests: all suites green; `SMOKE_URL=wss://catan.piyushdev.com/... npm run test:smoke` passes.
Commit: "Phase 0.9: verification record; v1.0.0".

## Out of scope (Phases 1–4, separate planning)
Bank limits, balanced board option, dice faces UI, disconnect indicator, turn timer/AFK skip, host controls, chat UI, 44 px tap targets + pinch/zoom, identity-preserving snapshot merge, Lighthouse budgets, Mobbin-referenced visual redesign, dark mode, haptics.

## When done
Update the repo memory "clubcatan-audit-2026-11-facts" with: live URL, PartyServer/wrangler stack, what was fixed, and the v1.0.0 baseline.
