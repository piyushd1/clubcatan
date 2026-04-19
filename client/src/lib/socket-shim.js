/**
 * TEMPORARY shim for socket.io-client during the migration to PartyKit.
 *
 * Phase 1.3 removed `socket.io-client` from dependencies. Phase 1.11 will
 * replace all call sites with Zustand actions backed by `partysocket`.
 *
 * Until then, this stub keeps legacy code (App.jsx, GameBoard.jsx, modals)
 * compilable and renders a clear runtime warning if called. Delete this file
 * when Phase 1.11 lands.
 */
export function io() {
  if (typeof window !== 'undefined') {
    console.warn(
      '[socket-shim] Legacy socket.io API called — real transport lands in Phase 1.11 (partysocket).'
    );
  }
  const handlers = new Map();
  return {
    on(event, cb) {
      handlers.set(event, cb);
    },
    off(event) {
      handlers.delete(event);
    },
    emit(_event, _payload, cb) {
      if (typeof cb === 'function') cb({ success: false, error: 'socket not wired yet' });
    },
    disconnect() {},
    connected: false,
  };
}
