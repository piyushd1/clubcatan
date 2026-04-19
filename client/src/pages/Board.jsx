import { useCallback, useMemo, useState } from 'react';
import { useGameStore } from '../stores/gameStore';
import { BottomNav, Button, Card, Chip, ResourceHUD } from '../components/ui';
import { Icons } from '../components/ui/icons';
import { HexBoard } from '../components/board/HexBoard';

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
  const pushNotification = useGameStore((s) => s.pushNotification);
  const [activeTab, setActiveTab] = useState('board');

  // During setup the client does: tap vertex → server places settlement →
  // we remember the vKey → tap adjacent edge → server places road →
  // we auto-advanceSetup. `pendingSetupSettlement` tracks that mid-step.
  const [pendingSetupSettlement, setPendingSetupSettlement] = useState(null);

  const me = useMemo(
    () => game?.players?.find((p) => p.id === playerId) ?? null,
    [game, playerId]
  );
  const players = game?.players ?? [];
  const currentIndex = game?.currentPlayerIndex ?? 0;
  const isMyTurn = players[currentIndex]?.id === playerId;
  const phase = game?.phase ?? 'setup';
  const myIndex = players.findIndex((p) => p.id === playerId);

  const rollDice = async () => {
    try { await client?.call('rollDice'); }
    catch (err) { pushNotification(err.message || 'Roll failed'); }
  };

  const endTurn = async () => {
    try { await client?.call('endTurn'); }
    catch (err) { pushNotification(err.message || 'Could not end turn'); }
  };

  // -------- Vertex/edge handlers ------------------------------------------

  const onVertexClick = useCallback(
    async (vKey, vertex) => {
      if (!client || !isMyTurn) return;
      if (phase === 'setup') {
        if (pendingSetupSettlement) {
          pushNotification('Now place an adjacent road.');
          return;
        }
        try {
          await client.call('placeSettlement', { vertexKey: vKey });
          setPendingSetupSettlement(vKey);
        } catch (err) {
          pushNotification(err.message || 'Cannot place there');
        }
        return;
      }
      if (phase === 'playing') {
        // Tap my own settlement → try to upgrade to city.
        if (vertex.building === 'settlement' && vertex.owner === myIndex) {
          try { await client.call('upgradeToCity', { vertexKey: vKey }); }
          catch (err) { pushNotification(err.message || 'Cannot upgrade'); }
          return;
        }
        // Empty vertex → try to build a new settlement.
        if (!vertex.building) {
          try { await client.call('placeSettlement', { vertexKey: vKey }); }
          catch (err) { pushNotification(err.message || 'Cannot build'); }
        }
      }
    },
    [client, isMyTurn, phase, pendingSetupSettlement, myIndex, pushNotification]
  );

  const onEdgeClick = useCallback(
    async (eKey) => {
      if (!client || !isMyTurn) return;
      if (phase === 'setup') {
        if (!pendingSetupSettlement) {
          pushNotification('Place a settlement first.');
          return;
        }
        try {
          await client.call('placeRoad', {
            edgeKey: eKey,
            isSetup: true,
            lastSettlement: pendingSetupSettlement,
          });
          setPendingSetupSettlement(null);
          // Auto-advance setup turn — the server rotates to the next player.
          try { await client.call('advanceSetup'); }
          catch (err) { pushNotification(err.message || 'Could not advance'); }
        } catch (err) {
          pushNotification(err.message || 'Cannot place road there');
        }
        return;
      }
      if (phase === 'playing') {
        try { await client.call('placeRoad', { edgeKey: eKey }); }
        catch (err) { pushNotification(err.message || 'Cannot build road'); }
      }
    },
    [client, isMyTurn, phase, pendingSetupSettlement, pushNotification]
  );

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

      {/* Board canvas */}
      <section className="relative flex-1 px-2 py-2">
        {game?.hexes ? (
          <div className="mx-auto max-w-[640px]">
            <HexBoard
              game={game}
              playerId={playerId}
              onVertexClick={isMyTurn ? onVertexClick : undefined}
              onEdgeClick={isMyTurn ? onEdgeClick : undefined}
            />
          </div>
        ) : (
          <EmptyBoard />
        )}
      </section>

      {/* Turn indicator + action row */}
      <section className="relative z-20 px-4 pb-20">
        <Card tone="low" className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface/50">
            {phase === 'setup' ? 'Preparing for Settlement' : phase === 'finished' ? 'Expedition Ended' : 'Expedition in Progress'}
          </p>
          <p className="text-lg font-bold text-on-surface">
            {isMyTurn
              ? phase === 'setup'
                ? pendingSetupSettlement
                  ? 'Tap an adjacent edge to place your road'
                  : 'Tap a vertex to place your settlement'
                : 'Your move'
              : `${players[currentIndex]?.name ?? '…'} is planning`}
          </p>
          {lastRoll?.total ? (
            <p className="text-sm text-on-surface-variant">
              Last roll: <span className="font-extrabold text-primary">{lastRoll.total}</span>
            </p>
          ) : null}

          {isMyTurn && phase === 'playing' ? (
            <div className="flex w-full gap-2">
              <Button
                className="flex-1"
                icon={<Icons.Dice size={18} />}
                onClick={rollDice}
                disabled={!!game?.hasRolledThisTurn}
              >
                Roll
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                icon={<Icons.Check size={16} />}
                onClick={endTurn}
                disabled={!game?.hasRolledThisTurn}
              >
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

function EmptyBoard() {
  return (
    <Card tone="low" className="flex min-h-[280px] items-center justify-center text-center">
      <div>
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Icons.Grid size={24} />
        </div>
        <p className="text-sm text-on-surface-variant">Generating the isles…</p>
      </div>
    </Card>
  );
}

export default Board;
