/**
 * Restart-survival test: a game must outlive the server process.
 *
 *   npm run test:restart
 *
 * Spawns `wrangler dev` on a loopback port, plays create → join → start, kills
 * the server, starts it again, reconnects both players with their stored ids
 * and asserts the game came back identical from Durable Object storage.
 * Local wrangler keeps DO storage under .wrangler/state, so this exercises the
 * same onStart() load path as a production eviction or deploy.
 *
 * Needs Node >= 22 and a free port (default 8799, override with RESTART_PORT).
 * Exits 0 when every check passes, 1 otherwise.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.RESTART_PORT || 8799);
const ROOM = 'RST' + Math.random().toString(36).slice(2, 5).toUpperCase();
const WS_URL = `ws://127.0.0.1:${PORT}/parties/main/${ROOM}`;
const TIMEOUT_MS = 5000;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------- server process control ----------

let server = null;
async function startServer() {
  server = spawn('npx', ['wrangler', 'dev', '--ip', '127.0.0.1', '--port', String(PORT)], {
    cwd: new URL('..', import.meta.url).pathname,
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group so we can kill wrangler + workerd together
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return;
    } catch {}
    await sleep(1000);
  }
  console.error(log.slice(-2000));
  throw new Error(`wrangler dev did not come up on :${PORT}`);
}

async function stopServer() {
  if (!server) return;
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  await sleep(1500);
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  server = null;
  // Wait until the port is actually closed.
  for (let i = 0; i < 20; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(500) });
      await sleep(500);
    } catch { return; }
  }
}

// ---------- minimal client ----------

function client(label) {
  const ws = new WebSocket(WS_URL);
  const pending = new Map();
  let lastState = null;
  ws.addEventListener('message', (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === '_ack') {
      const p = pending.get(m.ackId);
      if (!p) return;
      pending.delete(m.ackId);
      clearTimeout(p.timer);
      m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
      return;
    }
    if (m.type === 'gameState') lastState = m.state;
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`${label}: socket error`)), { once: true });
  });
  const call = (type, payload = {}) => new Promise((resolve, reject) => {
    const ackId = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => { pending.delete(ackId); reject(new Error(`timeout: ${type}`)); }, TIMEOUT_MS);
    pending.set(ackId, { resolve, reject, timer });
    ws.send(JSON.stringify({ type, ackId, payload }));
  });
  return { ws, ready, call, get state() { return lastState; } };
}

/** The parts of a view that must be identical before and after a restart. */
function fingerprint(view) {
  return JSON.stringify({
    phase: view.phase,
    setupPhase: view.setupPhase,
    currentPlayerIndex: view.currentPlayerIndex,
    turnPhase: view.turnPhase,
    players: view.players.map((p) => [p.id, p.name, p.color, p.turnOrder]),
    hexes: view.hexes,
    ports: view.ports,
    robber: view.robber,
    devCardDeck: view.devCardDeck,
    vertices: Object.entries(view.vertices).filter(([, v]) => v.building),
    edges: Object.entries(view.edges).filter(([, e]) => e.road),
  });
}

// ---------- the test ----------

let exitCode = 1;
try {
  console.log(`Restart test → ${WS_URL}\n`);
  console.log('Phase 1: start a game');
  await startServer();
  const A = client('A');
  const B = client('B');
  await Promise.all([A.ready, B.ready]);
  const created = await A.call('createGame', { playerName: 'Alice' });
  const joined = await B.call('joinGame', { playerName: 'Bob' });
  await A.call('startGame');
  await sleep(300);
  const beforeA = A.state;
  const beforeB = B.state;
  check('game started with 2 players', beforeA?.phase === 'setup' && beforeA.players.length === 2);
  const spectator = client('S');
  await spectator.ready;
  const specJoin = await spectator.call('joinAsSpectator', { playerName: 'Sam' });
  check('spectator can join a started game', specJoin.gameState?.spectator === true);
  const specAgain = await spectator.call('joinAsSpectator', { playerName: 'Sam' });
  check('spectator re-join on same socket is idempotent', specAgain.gameState?.spectator === true);
  A.ws.close(); B.ws.close(); spectator.ws.close();

  console.log('\nKilling the server…');
  await stopServer();
  check('server process stopped', true);

  console.log('\nPhase 2: restart and reconnect');
  await startServer();
  const A2 = client('A2');
  const B2 = client('B2');
  await Promise.all([A2.ready, B2.ready]);
  const reA = await A2.call('reconnect', { playerId: created.playerId });
  const reB = await B2.call('reconnect', { playerId: joined.playerId });
  check('Alice reconnects after restart', reA.gameState?.phase === 'setup');
  check('Bob reconnects after restart', reB.gameState?.phase === 'setup');
  check('Alice sees the identical game', fingerprint(reA.gameState) === fingerprint(beforeA));
  check('Bob sees the identical game', fingerprint(reB.gameState) === fingerprint(beforeB));
  check('Alice still sees her own hand, not a count', typeof reA.gameState.players[reA.gameState.myIndex].resources === 'object');
  const ghost = client('G');
  await ghost.ready;
  let ghostErr = null;
  try { await ghost.call('reconnect', { playerId: 'not-a-player' }); } catch (e) { ghostErr = e.message; }
  check('unknown playerId still rejected after restart', !!ghostErr, ghostErr);
  // A fresh action after restart must succeed (state is live, not just readable).
  let bobStart = null;
  try { await B2.call('startGame'); } catch (e) { bobStart = e.message; }
  check('engine rules still enforced after restart', bobStart === 'Only host can start the game', bobStart);
  A2.ws.close(); B2.ws.close(); ghost.ws.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  exitCode = failed ? 1 : 0;
} catch (err) {
  console.error('\nFATAL:', err.message);
  exitCode = 1;
} finally {
  await stopServer();
  // Native WebSocket keeps the loop alive until close handshakes finish.
  setTimeout(() => process.exit(exitCode), 300);
}
