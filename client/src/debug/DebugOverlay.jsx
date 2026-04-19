/**
 * Debug overlay — debug-branch only.
 *
 * Shift+D toggles a floating panel that mirrors:
 *  - current session / roomCode / playerId
 *  - WebSocket open/closed state
 *  - the last 30 server messages received (raw JSON, trimmed)
 *  - quick action links (leave, clear storage, dump state to console)
 *
 * The overlay is an import of this component AND a hook wired in App.jsx
 * (behind `if (import.meta.env.DEV)`). Both never ship in a main-branch
 * build because they don't exist on main.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../stores/gameStore';
import { getClient } from '../lib/partykit-client';

const MAX_MESSAGES = 30;

/** Ring buffer of recent server → client messages, kept outside React. */
const messageLog = [];
const subscribers = new Set();

export function recordIncomingMessage(msg) {
  messageLog.push({ t: Date.now(), msg });
  if (messageLog.length > MAX_MESSAGES) messageLog.splice(0, messageLog.length - MAX_MESSAGES);
  subscribers.forEach((fn) => { try { fn(); } catch {} });
}

function useMessageLog() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    subscribers.add(fn);
    return () => { subscribers.delete(fn); };
  }, []);
  return messageLog;
}

export default function DebugOverlay({ session, wsStatus }) {
  const [open, setOpen] = useState(false);
  const game = useGameStore((s) => s.game);
  const lastRoll = useGameStore((s) => s.lastRoll);
  const messages = useMessageLog();

  useEffect(() => {
    const onKey = (e) => {
      if (e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!open) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          bottom: 12,
          right: 12,
          zIndex: 99999,
          fontSize: 10,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          color: '#9cb',
          background: 'rgba(0,0,0,0.55)',
          padding: '4px 8px',
          borderRadius: 6,
          pointerEvents: 'none',
        }}
      >
        Shift+D · debug
      </div>,
      document.body
    );
  }

  const client = getClient();
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 12,
        zIndex: 99999,
        background: 'rgba(10,10,10,0.94)',
        color: '#d8e6dc',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: 12,
        borderRadius: 8,
        padding: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <strong style={{ color: '#9ce0a7' }}>ClubCatan debug</strong>
        <button
          onClick={() => setOpen(false)}
          style={{ background: 'transparent', color: '#d8e6dc', border: '1px solid #334', padding: '2px 10px', borderRadius: 4 }}
        >close</button>
      </div>

      <Section title="session">
        <pre style={preStyle}>{JSON.stringify(session, null, 2)}</pre>
      </Section>

      <Section title="ws">
        <pre style={preStyle}>
          {JSON.stringify({ status: wsStatus, host: client?.host, room: client?.roomCode, isOpen: client?.isOpen }, null, 2)}
        </pre>
      </Section>

      <Section title={`game.players (${game?.players?.length ?? 0})`}>
        <pre style={preStyle}>
          {game?.players?.map((p) => `${p.id.slice(0, 8)}  ${p.name}  vp=${p.victoryPoints}`).join('\n') || '—'}
        </pre>
      </Section>

      <Section title={`lastRoll / phase`}>
        <pre style={preStyle}>
          phase={game?.phase} turnPhase={game?.turnPhase} currentPlayerIndex={game?.currentPlayerIndex}{'\n'}
          lastRoll={JSON.stringify(lastRoll)}
        </pre>
      </Section>

      <Section title={`recent server msgs (${messages.length})`}>
        <pre style={{ ...preStyle, maxHeight: 180, overflow: 'auto' }}>
          {messages.map((e, i) => `${new Date(e.t).toISOString().slice(11, 19)}  ${e.msg.type}  ${summarize(e.msg)}`).join('\n') || '—'}
        </pre>
      </Section>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Action label="dump to console" onClick={() => { console.log('[debug] store', useGameStore.getState()); console.log('[debug] messages', messageLog); }} />
        <Action label="clear storage" onClick={() => { localStorage.clear(); indexedDB.deleteDatabase?.('clubcatan'); }} />
        <Action label="reload (skip SW)" onClick={async () => {
          if (navigator.serviceWorker) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
          }
          location.reload();
        }} />
      </div>
    </div>,
    document.body
  );
}

const preStyle = {
  background: 'rgba(0,0,0,0.4)',
  padding: 8,
  borderRadius: 4,
  whiteSpace: 'pre-wrap',
  margin: 0,
  color: '#d8e6dc',
};

function Section({ title, children }) {
  return (
    <div>
      <div style={{ color: '#9ce0a7', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function Action({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ background: '#1a3a1a', color: '#9ce0a7', border: '1px solid #334', padding: '4px 10px', borderRadius: 4, fontFamily: 'inherit', fontSize: 11 }}
    >
      {label}
    </button>
  );
}

function summarize(msg) {
  if (msg.type === 'gameState') return `players=${msg.state?.players?.length} phase=${msg.state?.phase}`;
  if (msg.type === 'diceRolled') return `roll=${msg.roll?.total}`;
  if (msg.type === 'chatMessage') return `${msg.playerName}: ${msg.message?.slice(0, 24)}`;
  return '';
}
