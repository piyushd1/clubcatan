import { useEffect, useRef, useState } from 'react';
import { openRoom, closeRoom } from '../lib/partykit-client';
import { useGameStore } from '../stores/gameStore';
import { saveActiveGame, clearActiveGame } from '../lib/cache';

/**
 * Owns the PartyKit connection for the current room and pipes every server
 * message into the Zustand store's `applyServerMessage` reducer.
 *
 * Returns the live `client` so components can issue RPC calls (`client.call`)
 * or send fire-and-forget broadcasts (`client.send`).
 *
 * Also persists every `gameState` snapshot to IndexedDB so a hard reload can
 * rehydrate the board instantly while the socket reconnects (the server then
 * overwrites local state with its authoritative view).
 */
export function useRoom(roomCode) {
  const [client, setClient] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'connecting' | 'open' | 'closed'
  const apply = useGameStore((s) => s.applyServerMessage);
  const resetStore = useGameStore((s) => s.reset);
  const lastSnapshotRef = useRef(null);

  useEffect(() => {
    if (!roomCode) return undefined;

    setStatus('connecting');
    resetStore();
    const c = openRoom(roomCode);
    setClient(c);

    const onOpen = () => setStatus('open');
    const onClose = () => setStatus('closed');
    c.socket.addEventListener('open', onOpen);
    c.socket.addEventListener('close', onClose);

    const unsubscribe = c.onAny(async (msg) => {
      apply(msg);
      if (msg.type === 'gameState' && msg.state) {
        lastSnapshotRef.current = msg.state;
        try { await saveActiveGame(roomCode, msg.state); }
        catch (err) { /* IndexedDB eviction / quota — ignore, server is authoritative */ }
      }
    });

    return () => {
      unsubscribe();
      c.socket.removeEventListener('open', onOpen);
      c.socket.removeEventListener('close', onClose);
      closeRoom();
      setClient(null);
      setStatus('idle');
    };
  }, [roomCode, apply, resetStore]);

  return { client, status };
}

/** Utility — call from a "leave game" handler. */
export async function leaveRoom(roomCode) {
  closeRoom();
  if (roomCode) {
    try { await clearActiveGame(roomCode); } catch {}
  }
}
