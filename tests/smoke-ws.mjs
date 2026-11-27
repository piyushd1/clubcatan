/**
 * End-to-end WebSocket smoke test against a running server.
 *
 *   npm run dev            # terminal 1: wrangler dev on :8787
 *   npm run test:smoke     # terminal 2
 *
 * Or against production:
 *   SMOKE_URL=wss://catan.piyushdev.com/parties/main/SMOKE99 npm run test:smoke
 *
 * Needs Node >= 22 (native WebSocket). Exits 0 when every check passes, 1 otherwise.
 * Uses a random room so repeated runs never collide with a stale game.
 */

const ROOM = 'SMK' + Math.random().toString(36).slice(2, 5).toUpperCase();
const URL_ = process.env.SMOKE_URL || `ws://127.0.0.1:8787/parties/main/${ROOM}`;
const TIMEOUT_MS = 5000;

let passed = 0;
let failed = 0;
const check = (name, ok, detail = '') => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const bail = (msg) => {
  console.error(`\nFATAL: ${msg}`);
  process.exit(1);
};

function client(label) {
  const ws = new WebSocket(URL_);
  const pending = new Map();
  const events = [];
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
    events.push(m.type);
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`${label}: socket error connecting to ${URL_}`)), { once: true });
  });
  const call = (type, payload = {}) => new Promise((resolve, reject) => {
    const ackId = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => { pending.delete(ackId); reject(new Error(`timeout: ${type}`)); }, TIMEOUT_MS);
    pending.set(ackId, { resolve, reject, timer });
    ws.send(JSON.stringify({ type, ackId, payload }));
  });
  return { label, ws, ready, call, events, get state() { return lastState; } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rejects = async (promise) => {
  try { await promise; return null; } catch (e) { return e.message; }
};

console.log(`Smoke test → ${URL_}\n`);

const A = client('A');
const B = client('B');
try {
  await Promise.all([A.ready, B.ready]);
} catch (e) {
  bail(e.message);
}
check('both sockets open', true);

// Lobby flow
const created = await A.call('createGame', { playerName: 'Alice' }).catch((e) => bail(`createGame: ${e.message}`));
check('createGame returns playerId + waiting game', !!created.playerId && created.gameState?.phase === 'waiting');
check('createGame echoes room code', created.gameCode === URL_.split('/').pop(), created.gameCode);

const dupe = await rejects(A.call('createGame', { playerName: 'Alice2' }));
check('second createGame in same room rejected', !!dupe, dupe);

const joined = await B.call('joinGame', { playerName: 'Bob' }).catch((e) => bail(`joinGame: ${e.message}`));
check('joinGame returns 2 players', joined.gameState?.players?.length === 2);
await sleep(200);
check('A received playerJoined broadcast', A.events.includes('playerJoined'));
check('A received gameState after join', A.events.includes('gameState'));

const nonHost = await rejects(B.call('startGame'));
check('non-host startGame rejected', nonHost === 'Only host can start the game', nonHost);

const started = await A.call('startGame').catch((e) => bail(`startGame: ${e.message}`));
check('host startGame ok with turnOrder', Array.isArray(started.turnOrder) && started.turnOrder.length === 2);
await sleep(200);
check('B received gameStarted', B.events.includes('gameStarted'));
check('B gameState phase is setup', B.state?.phase === 'setup');

// Reconnect binds the same player to a new socket
const C = client('C');
await C.ready.catch((e) => bail(e.message));
const re = await C.call('reconnect', { playerId: created.playerId }).catch((e) => bail(`reconnect: ${e.message}`));
check('reconnect with known playerId returns gameState', re.gameState?.phase === 'setup');
const badRe = await rejects(C.call('reconnect', { playerId: 'nope' }));
check('reconnect with unknown playerId rejected', !!badRe, badRe);

// Robustness. Note: C now holds Alice's seat (reconnect unbound A's socket by
// design), so host-only actions go through C.
const unknown = await rejects(A.call('hackTheGibson'));
check('unknown message type rejected', unknown?.startsWith('Unknown message type'), unknown);
const staleSeat = await rejects(A.call('startGame'));
check('superseded socket can no longer act for the player', staleSeat === 'Not in a game', staleSeat);
const restart = await rejects(C.call('startGame'));
check('host cannot restart a started game', restart === 'Game already started', restart);
const live = re.gameState;
const intruder = live.players[live.currentPlayerIndex].id === created.playerId ? B : C;
const intrude = await rejects(intruder.call('placeSettlement', { vertexKey: Object.keys(live.vertices)[0] }));
check('out-of-turn setup placement rejected over the wire', intrude === 'Not your turn', intrude);
// Boundary validation (party/validate.js) — malformed payloads are rejected
// before the engine sees them, and the game state is unchanged afterwards.
const stateBefore = JSON.stringify((await C.call('reconnect', { playerId: created.playerId })).gameState);
const mal = {
  'negative discard': await rejects(C.call('discardCards', { resources: { brick: -1 } })),
  'bogus resource key': await rejects(C.call('yearOfPlentyPick', { resource: 'gold' })),
  '5 KB name': await rejects(B.call('joinGame', { playerName: 'x'.repeat(5000) })),
  'malformed vertex key': await rejects(C.call('placeSettlement', { vertexKey: 'v_0_0_9' })),
  'string accept': await rejects(B.call('respondToTrade', { accept: 'yes' })),
};
for (const [label, err] of Object.entries(mal)) check(`${label} rejected`, !!err, err);
const stateAfter = JSON.stringify((await C.call('reconnect', { playerId: created.playerId })).gameState);
check('game state unchanged after malformed payloads', stateBefore === stateAfter);

A.ws.send('not json');
await sleep(200);
check('garbage JSON tolerated (socket still open)', A.ws.readyState === WebSocket.OPEN);
check('garbage JSON produced error event', A.events.includes('error'));

console.log(`\n${passed} passed, ${failed} failed`);
for (const c of [A, B, C]) c.ws.close();
// Native WebSocket keeps the event loop alive until close handshakes finish;
// don't wait on that for a test runner.
setTimeout(() => process.exit(failed ? 1 : 0), 300);
