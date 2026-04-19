# ClubCatan — debug branch

`main` is production-clean: no debug overlays, no `scripts/`, no diagnostic
tooling. This branch (`debug`) holds everything we use to investigate bugs.

## What lives here

| Path | Purpose |
|---|---|
| `client/src/debug/DebugOverlay.jsx` | Floating overlay, toggle with **Shift+D**. Shows session, WS state, recent server messages, and quick actions (dump to console, clear storage, reload skipping the SW). |
| `scripts/smoke-ws.mjs` | End-to-end WebSocket probe. Creates + joins + starts a room against a running server. Runs against local dev by default, override with `HOST=<domain> node scripts/smoke-ws.mjs`. |
| `.claude/launch.json` | Config for the Claude preview server — starts `partykit dev` on port 1999. |

## Fix workflow

The rule: **fixes land on `main` cleanly.** Use this branch only to diagnose,
never to keep the fix.

```
# 1. Pull latest main into debug (so you start from shipping state)
git checkout debug
git merge main

# 2. Reproduce the bug locally with tooling available
#    - Shift+D in the browser opens the overlay
#    - node scripts/smoke-ws.mjs runs the protocol probe
#    - HOST=clubcatan.<user>.partykit.dev node scripts/smoke-ws.mjs
#      runs the probe against production

# 3. Diagnose → identify the minimal fix. Don't land it on debug yet.

# 4. Switch to main and implement the fix there (without any debug cruft)
git checkout main
# ...edit, test with a plain `npm run build`...
git commit -am "Fix <thing>"

# 5. Merge main back into debug so debug stays ahead of main
git checkout debug
git merge main

# 6. Deploy main to prod
git checkout main
npx partykit deploy
```

## If you add new debug tooling

Keep it scoped to this branch:

- New files go under `client/src/debug/` or `scripts/`.
- Don't touch production-path files unless you're also happy shipping that
  change on main. Small taps are OK (e.g. the `onAny` recorder in `App.jsx`
  on this branch — it's one line).
- When in doubt, create a new debug-only module and re-import it only here.

## Why not dev-only build flags?

`if (import.meta.env.DEV) …` gets us most of the way (tree-shaken out in
prod builds), but it still clutters production code paths and confuses a
reader looking at main. A separate branch keeps main readable by anyone
arriving fresh.
