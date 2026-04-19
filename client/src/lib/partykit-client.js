import PartySocket from 'partysocket';

/**
 * Thin wrapper around `partysocket` that matches the legacy Socket.io ergonomics
 * (a Promise-returning RPC alongside fire-and-forget broadcasts) while keeping
 * the JSON envelope protocol our server speaks:
 *
 *   Client -> { type, ackId?, payload }
 *   Server -> { type: '_ack', ackId, ok, result|error }       (for calls)
 *          -> { type: '<event>', ... }                         (broadcasts)
 *          -> { type: 'gameState', state }                     (per-player view)
 *
 * Everything except `_ack` fans out to listeners. Ack messages resolve the
 * matching call promise.
 *
 * `partysocket` auto-reconnects with backoff — we don't implement our own.
 */
const DEFAULT_HOST =
  import.meta.env.VITE_PARTY_HOST ??
  (typeof window !== 'undefined' ? `${window.location.hostname}:1999` : 'localhost:1999');

const CALL_TIMEOUT_MS = 8000;

let currentClient = null;

export function getClient() {
  return currentClient;
}

export function openRoom(roomCode, { host = DEFAULT_HOST } = {}) {
  // Close any prior room — we only keep one room open at a time.
  currentClient?.close();
  const client = createClient(roomCode, host);
  currentClient = client;
  return client;
}

export function closeRoom() {
  currentClient?.close();
  currentClient = null;
}

function createClient(roomCode, host) {
  const pending = new Map(); // ackId -> { resolve, reject, timer }
  const listeners = new Set();
  let opened = false;

  const socket = new PartySocket({
    host,
    room: roomCode,
  });

  const onOpen = () => { opened = true; };
  const onClose = () => { opened = false; };

  const onMessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); }
    catch { return; }

    if (msg.type === '_ack' && msg.ackId) {
      const entry = pending.get(msg.ackId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pending.delete(msg.ackId);
      if (msg.ok) entry.resolve(msg.result);
      else entry.reject(new Error(typeof msg.error === 'string' ? msg.error : 'Request failed'));
      return;
    }

    for (const fn of listeners) {
      try { fn(msg); }
      catch (err) { console.error('[partykit] listener threw', err); }
    }
  };

  socket.addEventListener('open', onOpen);
  socket.addEventListener('close', onClose);
  socket.addEventListener('message', onMessage);

  /** Fire-and-forget. Safe to call before the socket is fully open — partysocket queues. */
  function send(type, payload = {}) {
    socket.send(JSON.stringify({ type, payload }));
  }

  /** Promise-based RPC. Resolves with server's `result`, rejects with Error on failure/timeout. */
  function call(type, payload = {}) {
    const ackId = cryptoRandomId();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(ackId);
        reject(new Error(`Timed out waiting for ${type}`));
      }, CALL_TIMEOUT_MS);
      pending.set(ackId, { resolve, reject, timer });
      try {
        socket.send(JSON.stringify({ type, ackId, payload }));
      } catch (err) {
        clearTimeout(timer);
        pending.delete(ackId);
        reject(err);
      }
    });
  }

  function onAny(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function close() {
    socket.removeEventListener('open', onOpen);
    socket.removeEventListener('close', onClose);
    socket.removeEventListener('message', onMessage);
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Connection closed'));
    }
    pending.clear();
    listeners.clear();
    socket.close();
    if (currentClient && currentClient.roomCode === roomCode) currentClient = null;
  }

  return {
    roomCode,
    host,
    socket,
    get isOpen() { return opened; },
    send,
    call,
    onAny,
    close,
  };
}

/** Tiny UUID-ish id. `crypto.randomUUID` isn't in Safari <15.4; this is good enough. */
function cryptoRandomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}
