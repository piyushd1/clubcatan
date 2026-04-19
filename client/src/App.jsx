import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Landing } from './pages/Landing';
import { Lobby } from './pages/Lobby';
import { Board } from './pages/Board';
import PWAInstallHint from './components/PWAInstallHint';
import { useGameStore } from './stores/gameStore';
import { useRoom, leaveRoom } from './hooks/useRoom';
import { useScreenWakeLock } from './hooks/useScreenWakeLock';
import { generateRoomCode } from './lib/room-code';
import {
  getActiveGame,
  saveActiveGame,
  getProfile,
  saveProfile,
  upsertRecentRoom,
  clearActiveGame,
} from './lib/cache';
import './App.css';

const SESSION_KEY = 'clubcatan:session';

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(session) {
  if (!session) {
    localStorage.removeItem(SESSION_KEY);
    return;
  }
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
}

/**
 * Root of the ClubCatan client.
 *
 * Routing is state-driven (not URL-driven — PartyKit's single-room URL already
 * identifies the game). The three screens:
 *
 *   Landing  — no active room. User creates or joins.
 *   Lobby    — in a room, game.phase === 'waiting'.
 *   Board    — in a room, game.phase in { 'setup' | 'playing' | 'finished' }.
 *
 * Session (roomCode + playerId + name) persists in localStorage so a hard
 * reload auto-reconnects. The gameStore is rehydrated from IndexedDB
 * `activeGame` while the socket handshakes, then overwritten by the server's
 * authoritative view.
 */
function App() {
  const [session, setSession] = useState(loadSession);
  const [defaultName, setDefaultName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { client, status } = useRoom(session?.roomCode);
  const clientRef = useRef(null);
  useEffect(() => { clientRef.current = client; }, [client]);
  const game = useGameStore((s) => s.game);
  const setGame = useGameStore((s) => s.setGame);
  const notifications = useGameStore((s) => s.notifications);
  const pushNotification = useGameStore((s) => s.pushNotification);

  // Keep the screen awake while actively in a room.
  useScreenWakeLock(!!session?.roomCode);

  // First-run: rehydrate profile name (for the landing form) and any cached
  // snapshot for the last active room (makes reload feel instant).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const profile = await getProfile();
      if (cancelled) return;
      if (profile?.nickname) setDefaultName(profile.nickname);
      if (session?.roomCode) {
        const cached = await getActiveGame(session.roomCode);
        if (!cancelled && cached?.snapshot) setGame(cached.snapshot);
      }
    })();
    return () => { cancelled = true; };
    // Only run on mount — we only care about boot-time rehydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the socket opens, try to reconnect so the server binds our player id
  // to the new connection. Skips if we don't have a playerId yet (fresh
  // create/join flow — those use call('createGame')/call('joinGame') instead,
  // which implicitly bind the connection).
  //
  // We also dedupe per (client, playerId) — the effect re-fires whenever
  // `session` changes, and after a successful create/join the session updates
  // from {playerId: null} to {playerId: real}, which would otherwise trigger
  // a needless second reconnect on the same connection.
  const reconnectKeyRef = useRef(null);
  useEffect(() => {
    if (!client || status !== 'open') return;
    if (!session?.playerId) return;
    const key = `${client.roomCode}:${session.playerId}`;
    if (reconnectKeyRef.current === key) return;
    reconnectKeyRef.current = key;

    let cancelled = false;
    (async () => {
      try {
        const result = await client.call('reconnect', { playerId: session.playerId });
        if (cancelled) return;
        if (result?.gameState) setGame(result.gameState);
      } catch (err) {
        if (cancelled) return;
        // The most common reason is server recycled the room (DO hibernation
        // eviction, or dev-server restart). Either way, our session is stale.
        console.warn('[app] reconnect failed — clearing session', err?.message);
        await leaveRoom(session.roomCode);
        saveSession(null);
        setSession(null);
        pushNotification('Your expedition ended while you were away.');
      }
    })();
    return () => { cancelled = true; };
  }, [client, status, session, setGame, pushNotification]);

  const handleCreate = useCallback(async ({ playerName, isExtended, enableSpecialBuild }) => {
    setBusy(true);
    setError(null);
    try {
      const roomCode = generateRoomCode();
      await saveProfile({ nickname: playerName });
      // Open the room first — the createGame call needs an active socket.
      const nextSession = { roomCode, playerId: null, name: playerName };
      setSession(nextSession);
      saveSession(nextSession);
      // Wait for useRoom to bind a PartyKit client and open the socket.
      await waitFor(() => (clientRef.current?.isOpen ? clientRef.current : null));
      const c = clientRef.current;
      const result = await c.call('createGame', { playerName, isExtended, enableSpecialBuild });
      if (result?.gameState) setGame(result.gameState);
      const finalSession = { ...nextSession, playerId: result.playerId };
      setSession(finalSession);
      saveSession(finalSession);
      await saveActiveGame(roomCode, result.gameState);
      await upsertRecentRoom({ code: roomCode, host: playerName });
    } catch (err) {
      setError(err?.message || 'Could not create expedition');
      await leaveRoom();
      setSession(null);
      saveSession(null);
    } finally {
      setBusy(false);
    }
  }, [setGame]);

  // When a join is rejected because the game's already underway, we surface
  // a "Spectate instead?" prompt rather than bouncing back to Landing.
  const [spectatePrompt, setSpectatePrompt] = useState(null);

  const handleJoin = useCallback(async ({ roomCode, playerName }) => {
    setBusy(true);
    setError(null);
    try {
      await saveProfile({ nickname: playerName });
      const nextSession = { roomCode, playerId: null, name: playerName };
      setSession(nextSession);
      saveSession(nextSession);
      await waitFor(() => (clientRef.current?.isOpen ? clientRef.current : null));
      const c = clientRef.current;
      const result = await c.call('joinGame', { playerName });
      if (result?.gameState) setGame(result.gameState);
      const finalSession = { ...nextSession, playerId: result.playerId };
      setSession(finalSession);
      saveSession(finalSession);
      await saveActiveGame(roomCode, result.gameState);
      await upsertRecentRoom({ code: roomCode });
    } catch (err) {
      const msg = err?.message || 'Could not join expedition';
      if (msg.startsWith('already_started:')) {
        // Don't tear down the session yet — we still have the open socket.
        // Ask the user if they want to spectate; handleSpectate or Cancel
        // finalizes the flow.
        setSpectatePrompt({ roomCode, playerName });
      } else {
        setError(msg);
        await leaveRoom();
        setSession(null);
        saveSession(null);
      }
    } finally {
      setBusy(false);
    }
  }, [setGame]);

  const handleSpectate = useCallback(async () => {
    if (!spectatePrompt) return;
    const { roomCode, playerName } = spectatePrompt;
    setSpectatePrompt(null);
    setBusy(true);
    try {
      const c = clientRef.current;
      const result = await c.call('joinAsSpectator', { playerName });
      if (result?.gameState) setGame(result.gameState);
      const spectSession = { roomCode, playerId: null, name: playerName, spectator: true };
      setSession(spectSession);
      saveSession(spectSession);
    } catch (err) {
      setError(err?.message || 'Could not spectate');
      await leaveRoom();
      setSession(null);
      saveSession(null);
    } finally {
      setBusy(false);
    }
  }, [spectatePrompt, setGame]);

  const cancelSpectatePrompt = useCallback(async () => {
    setSpectatePrompt(null);
    await leaveRoom();
    setSession(null);
    saveSession(null);
  }, []);

  const handleLeave = useCallback(async () => {
    if (session?.roomCode) await clearActiveGame(session.roomCode);
    await leaveRoom(session?.roomCode);
    reconnectKeyRef.current = null;
    setSession(null);
    saveSession(null);
    useGameStore.getState().reset();
  }, [session]);

  const handleCopy = useCallback(async () => {
    if (!session?.roomCode) return;
    const url = `${window.location.origin}?room=${session.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      pushNotification('Link copied.');
    } catch {
      pushNotification(`Code: ${session.roomCode}`);
    }
  }, [session, pushNotification]);

  const handleStart = useCallback(async () => {
    if (!client) return;
    setBusy(true);
    try {
      await client.call('startGame');
    } catch (err) {
      pushNotification(err?.message || 'Could not start');
    } finally {
      setBusy(false);
    }
  }, [client, pushNotification]);

  // Pick up ?room=CODE from the URL on first load (shared link). Stored in
  // state so Landing can pre-fill Join mode. We leave the URL param alone —
  // clearing it would make the link un-recopyable mid-session.
  const [invitedCode, setInvitedCode] = useState(() => {
    try {
      return new URL(window.location.href).searchParams.get('room')?.toUpperCase() || null;
    } catch { return null; }
  });

  // Clear the invite once the user is in a room, so leaving the room doesn't
  // accidentally re-prefill the join form with the code they just left.
  useEffect(() => {
    if (session?.roomCode && invitedCode) {
      setInvitedCode(null);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }
  }, [session, invitedCode]);

  // ---- Render ----
  const phase = game?.phase;

  // Global overlays — render regardless of which screen is below.
  const overlays = (
    <>
      {spectatePrompt ? (
        <SpectatePrompt
          name={spectatePrompt.playerName}
          onSpectate={handleSpectate}
          onCancel={cancelSpectatePrompt}
          busy={busy}
        />
      ) : null}
      {createPortal(<PWAInstallHint />, document.body)}
      <NotificationsOverlay items={notifications} />
    </>
  );

  if (!session?.roomCode) {
    return (
      <>
        <Landing
          defaultName={defaultName}
          invitedCode={invitedCode}
          busy={busy}
          error={error}
          onCreate={handleCreate}
          onJoin={handleJoin}
        />
        {overlays}
      </>
    );
  }

  // While we have a session but haven't received the first gameState yet
  // (fresh create/join or a cold-DO reconnect), don't flash an empty Lobby
  // with "0 members." Explicit connecting card instead.
  if (!game) {
    return (
      <>
        <ConnectingCard code={session.roomCode} status={status} onLeave={handleLeave} />
        {overlays}
      </>
    );
  }

  // Spectators jump straight to the Board — they never see Lobby.
  const inLobby = phase === 'waiting' && !session.spectator;

  return (
    <>
      {inLobby ? (
        <Lobby
          roomCode={session.roomCode}
          playerId={session.playerId}
          busy={busy}
          onStart={handleStart}
          onLeave={handleLeave}
          onCopy={handleCopy}
        />
      ) : (
        <Board
          roomCode={session.roomCode}
          playerId={session.playerId}
          client={client}
          onLeave={handleLeave}
          spectator={!!session.spectator}
        />
      )}
      {overlays}
    </>
  );
}

function SpectatePrompt({ name, onSpectate, onCancel, busy }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm bg-surface rounded-xl p-6 shadow-ambient flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface/50">Expedition in Progress</p>
          <h2 className="text-xl font-bold text-on-surface mt-1">This game has already started.</h2>
          <p className="text-sm text-on-surface-variant mt-2">
            You can still watch. Spectators see the board and moves but can't take actions.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
          >Cancel</button>
          <button
            type="button"
            onClick={onSpectate}
            disabled={busy}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-extrabold text-on-primary shadow-ambient disabled:opacity-40"
          >{busy ? 'Joining…' : `Watch as ${name || 'spectator'}`}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ConnectingCard({ code, status, onLeave }) {
  const label =
    status === 'connecting' ? 'Connecting to the edge…' :
    status === 'open' ? 'Joining the expedition…' :
    status === 'closed' ? 'Reconnecting…' :
    'Connecting…';
  return (
    <main className="min-h-dvh bg-surface flex items-center justify-center px-6">
      <div className="max-w-sm w-full flex flex-col items-center gap-6 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface/50">Expedition {code}</p>
        <div className="flex items-center gap-3 text-on-surface-variant">
          <span className="inline-block h-3 w-3 rounded-full bg-primary animate-pulse" aria-hidden="true" />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <button
          type="button"
          onClick={onLeave}
          className="text-sm font-semibold text-on-surface-variant underline decoration-on-surface-variant/40 underline-offset-4 hover:decoration-on-surface-variant"
        >
          Cancel
        </button>
      </div>
    </main>
  );
}

function NotificationsOverlay({ items }) {
  if (!items?.length) return null;
  return createPortal(
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+12px)] z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {items.map((n) => (
        <div
          key={n.id}
          className="pointer-events-auto rounded-full bg-on-surface/90 px-4 py-2 text-sm font-semibold text-surface shadow-ambient backdrop-blur-sm"
        >
          {n.message}
        </div>
      ))}
    </div>,
    document.body
  );
}

/** Tiny polling helper — used to wait for the socket handshake right after we
 *  bind a roomCode to the session. Resolves with the value the predicate returns
 *  or rejects after `timeoutMs`. */
function waitFor(predicate, { timeoutMs = 5000, intervalMs = 50 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const v = predicate();
      if (v) return resolve(v);
      if (Date.now() - start > timeoutMs) return reject(new Error('Timed out'));
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

export default App;
