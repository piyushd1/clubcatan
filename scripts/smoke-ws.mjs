#!/usr/bin/env node
/**
 * End-to-end smoke test: create + join + start a room over the party dev WS.
 * Requires `npx partykit dev` running on port 1999.
 */
import { WebSocket } from 'ws';

const HOST = process.env.HOST || 'localhost:1999';
const ROOM = 'SMK' + Math.random().toString(36).slice(2, 5).toUpperCase();

function open(room) {
  const ws = new WebSocket(`ws://${HOST}/parties/main/${room}`);
  const queue = [];
  const waits = [];
  ws.on('message', (buf) => {
    const msg = JSON.parse(buf.toString());
    if (waits.length) waits.shift().resolve(msg);
    else queue.push(msg);
  });
  ws.next = (pred) =>
    new Promise((resolve) => {
      const tryResolve = () => {
        if (!pred) {
          if (queue.length) return resolve(queue.shift());
          return waits.push({ resolve: (m) => resolve(m) });
        }
        const idx = queue.findIndex(pred);
        if (idx >= 0) return resolve(queue.splice(idx, 1)[0]);
        waits.push({ resolve: (m) => (pred(m) ? resolve(m) : waits.unshift({ resolve })) });
      };
      tryResolve();
    });
  return new Promise((res, rej) => {
    ws.once('open', () => res(ws));
    ws.once('error', rej);
  });
}

async function call(ws, type, payload = {}) {
  const ackId = Math.random().toString(36).slice(2);
  ws.send(JSON.stringify({ type, ackId, payload }));
  while (true) {
    const msg = await ws.next();
    if (msg.type === '_ack' && msg.ackId === ackId) {
      if (!msg.ok) throw new Error(msg.error || 'call failed');
      return msg.result;
    }
  }
}

(async () => {
  console.log(`[smoke] room=${ROOM}`);

  const host = await open(ROOM);
  const create = await call(host, 'createGame', { playerName: 'Host' });
  console.log('[smoke] createGame', { gameCode: create.gameCode, players: create.gameState.players.length, phase: create.gameState.phase });
  if (create.gameCode !== ROOM) throw new Error(`gameCode drift: ${create.gameCode}`);

  const guest = await open(ROOM);
  const join = await call(guest, 'joinGame', { playerName: 'Guest' });
  console.log('[smoke] joinGame', { players: join.gameState.players.length });
  if (join.gameState.players.length !== 2) throw new Error('join did not grow roster');

  const start = await call(host, 'startGame');
  console.log('[smoke] startGame', { success: start.success, phase: start.phase ?? 'n/a' });

  host.close();
  guest.close();
  console.log('[smoke] OK');
  process.exit(0);
})().catch((err) => {
  console.error('[smoke] FAIL', err);
  process.exit(1);
});
