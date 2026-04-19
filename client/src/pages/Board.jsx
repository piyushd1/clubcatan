import { useMemo, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { BottomNav, Button, Card, Chip, ResourceHUD } from '../components/ui';
import { Icons } from '../components/ui/icons';

/**
 * Board page scaffold.
 *
 * Phase 1.9: shell is here — top players strip, action FABs, BottomNav, HUD.
 * Phase 1.10: the `<BoardCanvas>` placeholder gets replaced by the gesture-
 * driven SVG hex board. Everything else is already wired to the Zustand store.
 */
const RESOURCE_ORDER = ['brick', 'lumber', 'wool', 'grain', 'ore'];
const RESOURCE_TINTS = {
  brick: 'secondary',
  lumber: 'primary',
  wool: 'primary',
  grain: 'tertiary',
  ore: 'neutral',
};
const RESOURCE_LABELS = {
  brick: 'Brick',
  lumber: 'Wood',
  wool: 'Sheep',
  grain: 'Wheat',
  ore: 'Ore',
};
const FACTIONS = ['red', 'blue', 'gold', 'green'];

export function Board({ roomCode, playerId, client, onLeave }) {
  const game = useGameStore((s) => s.game);
  const lastRoll = useGameStore((s) => s.lastRoll);
  const [activeTab, setActiveTab] = useState('board');

  const me = useMemo(
    () => game?.players?.find((p) => p.id === playerId) ?? null,
    [game, playerId]
  );
  const players = game?.players ?? [];
  const currentIndex = game?.currentPlayerIndex ?? 0;
  const isMyTurn = players[currentIndex]?.id === playerId;
  const phase = game?.phase ?? 'setup';

  const rollDice = async () => {
    try { await client?.call('rollDice'); }
    catch (err) { console.warn('rollDice failed', err); }
  };

  const endTurn = async () => {
    try { await client?.call('endTurn'); }
    catch (err) { console.warn('endTurn failed', err); }
  };

  return (
    <main className="relative flex min-h-dvh flex-col bg-surface pb-[calc(88px+env(safe-area-inset-bottom))]">
      {/* Players strip */}
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-surface/96 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            aria-label="Leave"
            onClick={onLeave}
            className="rounded-full p-2 text-primary hover:bg-surface-container"
          >
            <Icons.ArrowLeft size={20} />
          </button>
          <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">
            {roomCode}
          </span>
          <button
            type="button"
            aria-label="Settings"
            className="rounded-full p-2 text-primary hover:bg-surface-container"
          >
            <Icons.Settings size={20} />
          </button>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {players.map((p, i) => (
            <PlayerPip
              key={p.id}
              player={p}
              faction={FACTIONS[i] ?? 'red'}
              isTurn={i === currentIndex}
              isYou={p.id === playerId}
            />
          ))}
        </div>
      </header>

      {/* Board canvas placeholder */}
      <section className="relative flex-1 px-4 py-4">
        <BoardCanvas game={game} />
      </section>

      {/* Turn indicator + action row */}
      <section className="relative z-20 px-4 pb-20">
        <Card tone="low" className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface/50">
            {phase === 'setup' ? 'Preparing for Settlement' : phase === 'ended' ? 'Expedition Ended' : 'Expedition in Progress'}
          </p>
          <p className="text-lg font-bold text-on-surface">
            {isMyTurn ? 'Your move' : `${players[currentIndex]?.name ?? '…'} is planning`}
          </p>
          {lastRoll?.total ? (
            <p className="text-sm text-on-surface-variant">
              Last roll: <span className="font-extrabold text-primary">{lastRoll.total}</span>
            </p>
          ) : null}

          {isMyTurn && phase !== 'setup' ? (
            <div className="flex w-full gap-2">
              <Button className="flex-1" icon={<Icons.Dice size={18} />} onClick={rollDice} disabled={!!lastRoll && lastRoll?.playerId === playerId}>
                Roll
              </Button>
              <Button className="flex-1" variant="secondary" icon={<Icons.Check size={16} />} onClick={endTurn}>
                End Turn
              </Button>
            </div>
          ) : null}
        </Card>
      </section>

      {/* Resource HUD */}
      {me ? (
        <ResourceHUD>
          {RESOURCE_ORDER.map((r) => (
            <Chip key={r} tint={RESOURCE_TINTS[r]} count={me.resources?.[r] ?? 0}>
              {RESOURCE_LABELS[r]}
            </Chip>
          ))}
        </ResourceHUD>
      ) : null}

      <BottomNav
        active={activeTab}
        onSelect={setActiveTab}
        tabs={[
          { id: 'board', label: 'Board', icon: <Icons.Grid size={18} /> },
          { id: 'trade', label: 'Trade', icon: <Icons.Swap size={18} /> },
          { id: 'cards', label: 'Cards', icon: <Icons.Cards size={18} /> },
          { id: 'status', label: 'Status', icon: <Icons.People size={18} /> },
        ]}
      />
    </main>
  );
}

function PlayerPip({ player, faction, isTurn, isYou }) {
  const factionColor = {
    red: 'bg-faction-red',
    blue: 'bg-faction-blue',
    green: 'bg-faction-green',
    gold: 'bg-faction-gold',
  }[faction] ?? 'bg-outline';
  const initial = (player.name?.[0] ?? '?').toUpperCase();
  return (
    <div
      className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 ${
        isTurn ? 'bg-surface-highest shadow-ambient' : 'bg-surface-high'
      }`}
    >
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-on-primary ${factionColor}`}>
        {initial}
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/50">
          {isYou ? 'You' : player.name}
        </span>
        <span className="text-sm font-extrabold text-on-surface">
          {player.victoryPoints ?? 0} VP
        </span>
      </span>
    </div>
  );
}

function BoardCanvas({ game }) {
  return (
    <Card tone="low" className="flex min-h-[300px] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Icons.Grid size={28} />
        </div>
        <p className="text-sm font-bold uppercase tracking-wider text-on-surface/60">Hex Board</p>
        <p className="mt-1 text-xs text-on-surface-variant">
          {game?.board?.hexes?.length ?? 0} hexes · {game?.players?.length ?? 0} players
        </p>
        <p className="mt-2 text-xs text-on-surface/40">The tactile board lands in Phase 1.10</p>
      </div>
    </Card>
  );
}

export default Board;
