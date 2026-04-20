import { useMemo } from 'react';
import { useGameStore } from '../stores/gameStore';
import { Button, Card, FactionStripe, PlayerAvatar } from '../components/ui';
import { Icons } from '../components/ui/icons';

/**
 * In-room, pre-start screen. Matches the "Multiplayer Lobby Var 1" mock at a
 * structural level: room code hero, settings card, expedition members list,
 * start button (for host).
 *
 * The server controls who is in the room; we just render state + expose
 * actions. Host gets the "Start" button; everyone else gets "Waiting…"
 */
export function Lobby({ roomCode, playerId, onStart, onLeave, onCopy, busy }) {
  const game = useGameStore((s) => s.game);
  const players = game?.players ?? [];
  const host = players[0];
  const isHost = host?.id === playerId;
  const isExtended = game?.isExtended ?? false;
  const enableSpecialBuild = game?.enableSpecialBuild ?? false;
  const maxPlayers = isExtended ? 6 : 4;
  const canStart = isHost && players.length >= 2 && !busy;

  const expeditionMembers = useMemo(() => {
    const seats = Array.from({ length: maxPlayers }, (_, i) => players[i] ?? null);
    return seats;
  }, [players, maxPlayers]);

  return (
    <main className="min-h-dvh bg-surface pb-[env(safe-area-inset-bottom)]">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 pb-4 pt-[max(24px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onLeave}
          aria-label="Leave"
          className="rounded-full p-2 text-primary hover:bg-surface-container"
        >
          <Icons.ArrowLeft />
        </button>
        <span className="text-sm font-extrabold uppercase tracking-widest text-primary">
          Expedition {roomCode}
        </span>
        <div className="w-10" />
      </header>

      <div className="mx-auto flex max-w-xl flex-col gap-6 px-6 pb-10">
        {/* Room code hero */}
        <Card tone="low" className="relative flex flex-col gap-4">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-on-surface/60">
            Share to Invite
          </p>
          <h1 className="text-6xl font-extrabold tracking-display text-primary">{roomCode}</h1>
          <Button variant="secondary" icon={<Icons.Copy size={16} />} onClick={onCopy}>
            Copy Link
          </Button>
        </Card>

        {/* Settings summary */}
        <Card tone="surface" padded>
          <h2 className="mb-3 text-base font-bold text-on-surface">Expedition Charter</h2>
          <ul className="flex flex-col gap-2 text-sm">
            <SettingRow label="Map" value={isExtended ? '5-6 player extended' : 'Classic 3-4'} />
            <SettingRow label="Victory points" value={game?.victoryPointsToWin ?? 10} />
            <SettingRow label="Special build" value={enableSpecialBuild ? 'On' : 'Off'} />
          </ul>
        </Card>

        {/* Expedition members */}
        <section className="flex flex-col gap-3">
          <header className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-on-surface">Expedition Members</h2>
            <span className="text-sm text-on-surface/50">
              ({players.length}/{maxPlayers})
            </span>
          </header>

          <div className="flex flex-col gap-2">
            {expeditionMembers.map((p, i) =>
              p ? (
                <PlayerRow
                  key={p.id}
                  player={p}
                  seatIndex={i}
                  isYou={p.id === playerId}
                  isHost={i === 0}
                />
              ) : (
                <EmptySeat key={`empty-${i}`} index={i} />
              )
            )}
          </div>
        </section>

        {/* Action */}
        <div className="pt-2">
          {isHost ? (
            <Button
              size="lg"
              className="w-full"
              icon={<Icons.Play size={18} />}
              disabled={!canStart}
              onClick={onStart}
            >
              {players.length < 2 ? 'Waiting for a Friend' : 'Start Expedition'}
            </Button>
          ) : (
            <Card tone="low" className="text-center text-sm text-on-surface-variant">
              Waiting for the host to begin the expedition…
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

function SettingRow({ label, value }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface/60">{label}</span>
      <span className="text-sm font-semibold text-on-surface">{value}</span>
    </li>
  );
}

const FACTIONS = ['red', 'blue', 'gold', 'green'];

function PlayerRow({ player, seatIndex, isYou, isHost }) {
  // seatIndex comes from the player's position in game.players[] — the server
  // doesn't stamp a seatIndex on the player object, so we derive it here.
  const faction = FACTIONS[seatIndex ?? 0] ?? 'red';
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-low p-3 pl-5">
      <FactionStripe faction={faction} />
      <div className="flex items-center gap-3">
        {/* Shared avatar primitive — same visual language as the Board top
            strip so players see one identity across screens. */}
        <PlayerAvatar
          seat={seatIndex ?? 0}
          name={player.name}
          size={40}
          connected={player.connected !== false}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-bold text-on-surface">{player.name}</p>
            {isHost ? <Badge>Host</Badge> : null}
            {isYou ? <Badge tone="secondary">You</Badge> : null}
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface/50">
            Faction: {faction}
          </p>
        </div>
        <StatusBadge connected={player.connected !== false} />
      </div>
    </div>
  );
}

function EmptySeat({ index }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-low/50 p-3 pl-5 opacity-60">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-high text-on-surface/40">
        <Icons.UserPlus size={16} />
      </div>
      <p className="text-sm italic text-on-surface/50">Seat {index + 1} open — send the code</p>
    </div>
  );
}

function Badge({ children, tone = 'primary' }) {
  const cls = tone === 'primary'
    ? 'bg-primary/10 text-primary'
    : 'bg-secondary/15 text-secondary';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${cls}`}>
      {children}
    </span>
  );
}

function StatusBadge({ connected }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${
        connected ? 'bg-primary/5 text-primary' : 'bg-surface-container text-on-surface/50'
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-primary' : 'bg-on-surface/30'}`}
      />
      {connected ? 'Ready' : 'Away'}
    </span>
  );
}

export default Lobby;
