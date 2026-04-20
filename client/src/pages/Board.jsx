import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../stores/gameStore';
import { BottomNav, Button, Card, Chip, FactionStripe, PlayerAvatar, ResourceHUD } from '../components/ui';
import { Icons, ResourceIcons } from '../components/ui/icons';
import { HexBoard } from '../components/board/HexBoard';
import { TerrainHexBadge } from '../components/board/TerrainSymbol';
import { isVertexOnEdge } from '../lib/hex-math';

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
  grain: 'Hay',
  ore: 'Ore',
};

// Compact 3-letter labels for the always-visible HUD — keeps all five resource
// chips on a 360px viewport without horizontal scrolling (#9).
const RESOURCE_SHORT = {
  brick: 'Bri',
  lumber: 'Wod',
  wool: 'Shp',
  grain: 'Hay',
  ore: 'Ore',
};
const FACTIONS = ['red', 'blue', 'gold', 'green'];

export function Board({ roomCode, playerId, client, onLeave, spectator = false }) {
  const game = useGameStore((s) => s.game);
  const lastRoll = useGameStore((s) => s.lastRoll);
  const pushNotification = useGameStore((s) => s.pushNotification);
  const pendingSteal = useGameStore((s) => s.pendingSteal);
  const clearPendingSteal = useGameStore((s) => s.clearPendingSteal);
  const [activeTab, setActiveTab] = useState('board');

  // Confirm Move (#7) — placements are PROVISIONAL on the client until Confirm.
  //
  //   Setup phase:  pendingSetup = { vertex: vKey, edge: eKey }
  //                 Taps update one or the other; Confirm fires
  //                 placeSettlement → placeRoad → advanceSetup.
  //   Main phase:   pendingBuild = { kind: 'settlement'|'city'|'road', key }
  //                 One pending build at a time. Confirm fires the matching
  //                 server call. Dev-card / trade / end-turn paths still
  //                 fire immediately — only placements are two-step.
  // pendingSetup holds the player's provisional setup placement. After the
  // settlement commits server-side (but before the road does), we flip
  // `settlementCommitted` so the user can't re-place the settlement while
  // they're still trying to land the road. Without this flag, a failed road
  // Confirm leaves the settlement on the server and the pending UI open,
  // which is how the user accidentally placed 4 settlements + 1 road.
  const [pendingSetup, setPendingSetup] = useState({
    vertex: null,
    edge: null,
    settlementCommitted: false,
  });
  const [pendingBuild, setPendingBuild] = useState(null);

  // Pre-validated at the client: during setup, the pending road must share a
  // physical vertex with the pending (or committed) settlement. Drives the
  // Confirm button's enabled state.
  const setupAdjacencyOk = useMemo(() => {
    const { vertex, edge } = pendingSetup;
    if (!vertex || !edge) return false;
    return isVertexOnEdge(vertex, edge);
  }, [pendingSetup]);

  // Steal chooser modal state: null | { hexKey, players: [{id,name,hasResources}] }
  const [stealChooser, setStealChooser] = useState(null);

  const me = useMemo(
    () => (spectator ? null : game?.players?.find((p) => p.id === playerId) ?? null),
    [game, playerId, spectator]
  );
  const players = game?.players ?? [];
  const currentIndex = game?.currentPlayerIndex ?? 0;
  const isMyTurn = !spectator && players[currentIndex]?.id === playerId;
  const phase = game?.phase ?? 'setup';
  const turnPhase = game?.turnPhase ?? 'roll';
  const myIndex = spectator ? -1 : players.findIndex((p) => p.id === playerId);

  // When a 7 is rolled, the server sets `discardingPlayers` for anyone with
  // >7 cards. If I'm in that list, open the discard dialog.
  const myDiscardInfo = useMemo(() => {
    const list = game?.discardingPlayers ?? [];
    return list.find((d) => d.playerIndex === myIndex) ?? null;
  }, [game, myIndex]);

  const isRobberTurn = phase === 'playing' && isMyTurn && turnPhase === 'robber';

  // Clear pending placements whenever turn ownership or phase flips so a
  // pending ghost doesn't leak into someone else's turn after end-turn.
  useEffect(() => {
    setPendingSetup({ vertex: null, edge: null, settlementCommitted: false });
    setPendingBuild(null);
  }, [phase, currentIndex, spectator]);

  // -------- Actions -------------------------------------------------------

  const rollDice = async () => {
    try { await client?.call('rollDice'); }
    catch (err) { pushNotification(err.message || 'Roll failed'); }
  };

  const endTurn = async () => {
    try { await client?.call('endTurn'); }
    catch (err) { pushNotification(err.message || 'Could not end turn'); }
  };

  const doMoveRobber = useCallback(
    async (hexKey, stealFromPlayerId) => {
      try {
        await client.call('moveRobber', { hexKey, stealFromPlayerId });
      } catch (err) {
        pushNotification(err.message || 'Cannot move robber there');
      }
    },
    [client, pushNotification]
  );

  const onHexClick = useCallback(
    async (hexKey) => {
      if (!isRobberTurn || !client) return;
      if (hexKey === game?.robber) {
        pushNotification('Must move the robber to a different hex.');
        return;
      }
      try {
        const { players: targetable } = await client.call('getPlayersOnHex', { hexKey });
        const stealable = (targetable ?? []).filter((p) => p.hasResources);
        if (stealable.length === 0) {
          await doMoveRobber(hexKey);
        } else if (stealable.length === 1) {
          await doMoveRobber(hexKey, stealable[0].id);
        } else {
          setStealChooser({ hexKey, players: stealable });
        }
      } catch (err) {
        pushNotification(err.message || 'Could not query hex');
      }
    },
    [client, game, isRobberTurn, doMoveRobber, pushNotification]
  );

  // Vertex/edge clicks only update pending state. Server calls happen on Confirm.
  const onVertexClick = useCallback(
    (vKey, vertex) => {
      if (!client || !isMyTurn) return;
      if (phase === 'setup') {
        // Once the settlement is locked in on the server, vertex taps become
        // no-ops — the user is in road-only mode.
        if (pendingSetup.settlementCommitted) return;
        // Toggle: tap same vertex again to clear; tap different to replace.
        setPendingSetup((prev) =>
          prev.vertex === vKey ? { ...prev, vertex: null } : { ...prev, vertex: vKey }
        );
        return;
      }
      if (phase !== 'playing') return;
      if (turnPhase === 'robber' || turnPhase === 'discard') return;
      // Main phase: own settlement → city upgrade; empty vertex → settlement.
      if (vertex?.building === 'settlement' && vertex.owner === myIndex) {
        setPendingBuild((prev) =>
          prev?.kind === 'city' && prev.key === vKey
            ? null
            : { kind: 'city', key: vKey }
        );
        return;
      }
      if (!vertex?.building) {
        setPendingBuild((prev) =>
          prev?.kind === 'settlement' && prev.key === vKey
            ? null
            : { kind: 'settlement', key: vKey }
        );
      }
    },
    [client, isMyTurn, phase, turnPhase, myIndex]
  );

  const onEdgeClick = useCallback(
    (eKey) => {
      if (!client || !isMyTurn) return;
      if (phase === 'setup') {
        setPendingSetup((prev) =>
          prev.edge === eKey ? { ...prev, edge: null } : { ...prev, edge: eKey }
        );
        return;
      }
      if (phase !== 'playing') return;
      if (turnPhase === 'robber' || turnPhase === 'discard') return;
      setPendingBuild((prev) =>
        prev?.kind === 'road' && prev.key === eKey ? null : { kind: 'road', key: eKey }
      );
    },
    [client, isMyTurn, phase, turnPhase]
  );

  // ---- Confirm + Reset ---------------------------------------------------

  const resetPending = useCallback(() => {
    // Reset only clears pending that hasn't committed. Once the settlement
    // is locked in, Reset keeps it (can't un-place) and just drops the
    // pending road — the user is still owed a road placement.
    setPendingSetup((prev) =>
      prev.settlementCommitted
        ? { ...prev, edge: null }
        : { vertex: null, edge: null, settlementCommitted: false }
    );
    setPendingBuild(null);
  }, []);

  const confirmPlacement = useCallback(async () => {
    if (!client) return;
    if (phase === 'setup') {
      const { vertex, edge, settlementCommitted } = pendingSetup;
      if (!edge) {
        pushNotification('Tap an adjacent edge for your road.');
        return;
      }

      // Settlement already placed on a prior failed Confirm — skip straight
      // to the road placement using the settlement's committed vertex.
      if (settlementCommitted) {
        if (!vertex) {
          pushNotification('Settlement is already placed. Tap an edge, then Confirm.');
          return;
        }
        if (!isVertexOnEdge(vertex, edge)) {
          pushNotification('Road must connect to your new settlement.');
          return;
        }
        try {
          await client.call('placeRoad', {
            edgeKey: edge,
            isSetup: true,
            lastSettlement: vertex,
          });
        } catch (err) {
          pushNotification(err.message || 'Cannot place road there');
          return;
        }
        setPendingSetup({ vertex: null, edge: null, settlementCommitted: false });
        try { await client.call('advanceSetup'); }
        catch (err) { pushNotification(err.message || 'Could not advance'); }
        return;
      }

      if (!vertex) {
        pushNotification('Tap a vertex for your settlement.');
        return;
      }
      if (!isVertexOnEdge(vertex, edge)) {
        pushNotification('Road must connect to your new settlement.');
        return;
      }

      // Two-step commit. If the settlement lands but the road fails, lock
      // the settlement in so the user can't accidentally place a second one
      // by tapping a different vertex.
      try {
        await client.call('placeSettlement', { vertexKey: vertex });
      } catch (err) {
        pushNotification(err.message || 'Cannot place settlement there');
        return;
      }
      try {
        await client.call('placeRoad', {
          edgeKey: edge,
          isSetup: true,
          lastSettlement: vertex,
        });
      } catch (err) {
        setPendingSetup({ vertex, edge: null, settlementCommitted: true });
        pushNotification(err.message || 'Road didn’t land — tap an adjacent edge.');
        return;
      }
      setPendingSetup({ vertex: null, edge: null, settlementCommitted: false });
      try { await client.call('advanceSetup'); }
      catch (err) { pushNotification(err.message || 'Could not advance'); }
      return;
    }
    if (phase === 'playing' && pendingBuild) {
      const { kind, key } = pendingBuild;
      try {
        if (kind === 'settlement') await client.call('placeSettlement', { vertexKey: key });
        else if (kind === 'city') await client.call('upgradeToCity', { vertexKey: key });
        else if (kind === 'road') await client.call('placeRoad', { edgeKey: key });
        setPendingBuild(null);
      } catch (err) {
        pushNotification(err.message || 'Cannot build');
      }
    }
  }, [client, phase, pendingSetup, pendingBuild, pushNotification]);

  // Composite object passed to HexBoard so it can draw ghost placements.
  const pendingForBoard = useMemo(() => {
    if (phase === 'setup') {
      // If the settlement's already committed, its real render lives in the
      // Building layer — skip the ghost so we don't draw it twice.
      return {
        vertex: pendingSetup.settlementCommitted ? null : pendingSetup.vertex,
        edge: pendingSetup.edge,
        vertexKind: 'settlement',
        ownerIndex: myIndex,
      };
    }
    if (pendingBuild) {
      if (pendingBuild.kind === 'road') {
        return { edge: pendingBuild.key, ownerIndex: myIndex };
      }
      return { vertex: pendingBuild.key, vertexKind: pendingBuild.kind, ownerIndex: myIndex };
    }
    return null;
  }, [phase, pendingSetup, pendingBuild, myIndex]);

  // Confirm/Reset row shows whenever the user is mid-placement. Setup has
  // an extra trigger: if the settlement committed but the road hasn't, we're
  // still "in a pending state" — the user owes a road.
  const hasPending = phase === 'setup'
    ? !!(pendingSetup.vertex || pendingSetup.edge || pendingSetup.settlementCommitted)
    : !!pendingBuild;

  const onStealPicked = async (playerIdOrNull) => {
    if (!stealChooser) return;
    const hexKey = stealChooser.hexKey;
    setStealChooser(null);
    await doMoveRobber(hexKey, playerIdOrNull);
  };

  const winner = phase === 'finished' ? players[game?.winner] : null;

  return (
    <main className="relative min-h-dvh bg-surface pb-[calc(88px+env(safe-area-inset-bottom))]" style={{ touchAction: 'pan-y' }}>
      {/* Sticky header — backdrop-blur moved to an inner span (iOS Safari
          routing bug on blur-filter containers could swallow touches). */}
      <header className="sticky top-0 z-30 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 bg-surface/96">
        <span aria-hidden="true" className="absolute inset-0 -z-10 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:hidden" />
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-label="Leave" onClick={onLeave} className="rounded-full p-2 text-primary hover:bg-surface-container">
            <Icons.ArrowLeft size={20} />
          </button>
          <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">{roomCode}</span>
          <SettingsMenu onLeave={onLeave} />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {players.map((p, i) => (
            <PlayerPip key={p.id} player={p} seat={i} isTurn={i === currentIndex} isYou={p.id === playerId} />
          ))}
        </div>

        {spectator ? (
          <div className="mt-3 rounded-full bg-primary/10 text-primary text-[11px] font-extrabold uppercase tracking-[0.2em] px-4 py-1.5 text-center">
            Spectating — read only
          </div>
        ) : null}
      </header>

      <section className="relative flex-1 px-2 py-2">
        {game?.hexes ? (
          <div className="mx-auto max-w-[640px]">
            <HexBoard
              game={game}
              playerId={playerId}
              pending={pendingForBoard}
              onVertexClick={isMyTurn && turnPhase !== 'robber' && turnPhase !== 'discard' ? onVertexClick : undefined}
              onEdgeClick={isMyTurn && turnPhase !== 'robber' && turnPhase !== 'discard' ? onEdgeClick : undefined}
              onHexClick={isRobberTurn ? onHexClick : undefined}
            />
          </div>
        ) : (
          <EmptyBoard />
        )}
      </section>

      <section className="relative z-20 px-4 pb-20">
        <TurnCard
          phase={phase}
          turnPhase={turnPhase}
          isMyTurn={isMyTurn}
          pendingSetup={pendingSetup}
          setupAdjacencyOk={setupAdjacencyOk}
          pendingBuild={pendingBuild}
          hasPending={hasPending}
          currentName={players[currentIndex]?.name}
          lastRoll={lastRoll}
          hasRolled={!!game?.hasRolledThisTurn}
          onRoll={rollDice}
          onEndTurn={endTurn}
          onConfirm={confirmPlacement}
          onReset={resetPending}
        />
      </section>

      {me ? (
        <ResourceHUD>
          {RESOURCE_ORDER.map((r) => (
            <HudResourceChip
              key={r}
              resource={r}
              count={me.resources?.[r] ?? 0}
            />
          ))}
        </ResourceHUD>
      ) : null}

      {activeTab === 'trade' ? (
        <TradePanel
          me={me}
          game={game}
          client={client}
          isMyTurn={isMyTurn}
          turnPhase={turnPhase}
          phase={phase}
          myIndex={myIndex}
          onClose={() => setActiveTab('board')}
          pushNotification={pushNotification}
        />
      ) : null}

      {game?.tradeOffer && game.tradeOffer.from !== myIndex ? (
        <IncomingTradeModal
          offer={game.tradeOffer}
          from={players[game.tradeOffer.from]}
          me={me}
          client={client}
          pushNotification={pushNotification}
        />
      ) : null}
      {activeTab === 'cards' ? (
        <DevCardPanel
          me={me}
          game={game}
          client={client}
          isMyTurn={isMyTurn}
          turnPhase={turnPhase}
          phase={phase}
          onClose={() => setActiveTab('board')}
          pushNotification={pushNotification}
        />
      ) : null}
      {activeTab === 'status' ? (
        <StatusPanel
          game={game}
          me={me}
          playerId={playerId}
          currentIndex={currentIndex}
          onClose={() => setActiveTab('board')}
        />
      ) : null}

      {isMyTurn && (game?.yearOfPlentyPicks ?? 0) > 0 ? (
        <YearOfPlentyPicker
          remaining={game.yearOfPlentyPicks}
          client={client}
          pushNotification={pushNotification}
        />
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

      {stealChooser ? (
        <ModalOverlay onClose={() => setStealChooser(null)}>
          <Card tone="surface" className="w-full max-w-sm flex flex-col gap-4">
            <h2 className="text-lg font-bold text-on-surface">Steal from whom?</h2>
            <p className="text-sm text-on-surface-variant">Pick a player on that hex.</p>
            <div className="flex flex-col gap-2">
              {stealChooser.players.map((p) => (
                <Button key={p.id} variant="secondary" onClick={() => onStealPicked(p.id)}>{p.name}</Button>
              ))}
              <Button variant="tertiary" onClick={() => onStealPicked(null)}>Steal nothing</Button>
            </div>
          </Card>
        </ModalOverlay>
      ) : null}

      {phase === 'finished' ? (
        <GameOverOverlay
          winner={winner}
          players={players}
          myPlayerId={playerId}
          onLeave={onLeave}
        />
      ) : null}

      {pendingSteal ? (
        <StealResultToast
          pending={pendingSteal}
          onDismiss={clearPendingSteal}
        />
      ) : null}

      {myDiscardInfo && me ? (
        <DiscardDialog
          required={myDiscardInfo.cardsToDiscard}
          resources={me.resources}
          onSubmit={async (picks) => {
            try { await client.call('discardCards', { resources: picks }); }
            catch (err) { pushNotification(err.message || 'Discard failed'); }
          }}
        />
      ) : null}
    </main>
  );
}

// ---------- Turn card ---------------------------------------------------

function TurnCard({
  phase,
  turnPhase,
  isMyTurn,
  pendingSetup,
  setupAdjacencyOk,
  pendingBuild,
  hasPending,
  currentName,
  lastRoll,
  hasRolled,
  onRoll,
  onEndTurn,
  onConfirm,
  onReset,
}) {
  const phaseLabel =
    phase === 'setup' ? 'Preparing for Settlement' :
    phase === 'finished' ? 'Expedition Ended' :
    'Expedition in Progress';

  const setupHasBoth = !!(pendingSetup?.vertex && pendingSetup?.edge);
  const committed = !!pendingSetup?.settlementCommitted;

  let status;
  let warning = null;
  if (!isMyTurn) status = `${currentName ?? '…'} is planning`;
  else if (phase === 'setup') {
    if (committed) {
      if (!pendingSetup?.edge) status = 'Settlement placed. Tap an adjacent edge, then Confirm.';
      else if (!setupAdjacencyOk) {
        status = 'Tap a different edge — it has to touch your settlement.';
        warning = 'Road must connect to the settlement you just placed.';
      } else status = 'Ready — tap Confirm to place the road.';
    }
    else if (setupHasBoth && !setupAdjacencyOk) {
      status = 'Move the road — it must touch your settlement';
      warning = 'Roads must share a corner with your new settlement.';
    }
    else if (setupHasBoth) status = 'Ready — tap Confirm to place both';
    else if (pendingSetup?.vertex) status = 'Tap an adjacent edge for your road';
    else if (pendingSetup?.edge) status = 'Tap a vertex for your settlement';
    else status = 'Tap a vertex and an edge — then Confirm';
  }
  else if (turnPhase === 'discard') status = 'Rolled a 7 — everyone with >7 cards must discard';
  else if (turnPhase === 'robber') status = 'Move the robber: tap a hex';
  else if (pendingBuild) {
    const label = pendingBuild.kind === 'road' ? 'road' : pendingBuild.kind === 'city' ? 'city' : 'settlement';
    status = `Tap Confirm to build the ${label}`;
  }
  else status = 'Your move';

  // Gate Confirm: in setup we require BOTH vertex and edge AND they must be
  // adjacent. In the committed-recovery case, the vertex is already fixed
  // server-side, so only the pending edge matters.
  const confirmDisabled = phase === 'setup'
    ? committed
      ? !(pendingSetup?.edge && setupAdjacencyOk)
      : !(setupHasBoth && setupAdjacencyOk)
    : false;

  return (
    <Card tone="low" className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface/50">{phaseLabel}</p>
      <p className="text-lg font-bold text-on-surface">{status}</p>
      {warning ? (
        <p className="text-xs font-semibold text-secondary">{warning}</p>
      ) : null}
      {lastRoll?.total ? (
        <p className="text-sm text-on-surface-variant">
          Last roll: <span className="font-extrabold text-primary">{lastRoll.total}</span>
        </p>
      ) : null}

      {/* Confirm + Reset appear whenever there's a pending placement (#7). */}
      {isMyTurn && hasPending ? (
        <div className="flex w-full gap-2">
          <Button
            className="flex-1"
            icon={<Icons.Check size={16} />}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            Confirm
          </Button>
          <Button className="flex-1" variant="secondary" onClick={onReset}>Reset</Button>
        </div>
      ) : null}

      {isMyTurn && phase === 'playing' && turnPhase === 'roll' && !hasPending ? (
        <Button className="w-full" icon={<Icons.Dice size={18} />} onClick={onRoll}>Roll the Dice</Button>
      ) : null}

      {isMyTurn && phase === 'playing' && turnPhase === 'main' && !hasPending ? (
        <Button className="w-full" variant="secondary" icon={<Icons.Check size={16} />} onClick={onEndTurn} disabled={!hasRolled}>
          End Turn
        </Button>
      ) : null}
    </Card>
  );
}

// ---------- Player pip + misc -------------------------------------------

// Compact HUD chip tuned to fit 5-across on a 360px viewport (#9 #10 concerns).
// Icon takes a resource tint, short 3-letter label, and bold count.
const HUD_TINTS = {
  brick: 'text-secondary',
  lumber: 'text-primary',
  wool: 'text-primary',
  grain: 'text-tertiary',
  ore: 'text-on-surface-variant',
};

function HudResourceChip({ resource, count }) {
  const Icon = ResourceIcons[resource];
  const tint = HUD_TINTS[resource] ?? 'text-on-surface';
  return (
    <span className="flex flex-1 min-w-0 items-center justify-center gap-1 rounded-full bg-surface-high px-1.5 py-1">
      <span className={`flex shrink-0 ${tint}`} aria-hidden="true">
        {Icon ? <Icon size={14} /> : null}
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface/70">{RESOURCE_SHORT[resource]}</span>
      <span className="text-sm font-extrabold text-on-surface">{count}</span>
    </span>
  );
}

// Compact player card on the top strip. Faction stripe + avatar + name + VP.
// Active turn lifts with a primary ring + subtle shadow. Longest-Road /
// Largest-Army pips surface when held so you can see at a glance who's
// coming for the win.
const FACTION_HEX = ['#9c4323', '#3b5f7a', '#a48a2e', '#154212', '#6b3b7a', '#2f7a73'];

function PlayerPip({ player, seat, isTurn, isYou }) {
  const factionColor = FACTION_HEX[seat] ?? FACTION_HEX[0];
  const vp = player.victoryPoints ?? 0;
  const connected = player.connected !== false;

  return (
    <div
      className={[
        'relative flex shrink-0 items-center gap-2.5 rounded-xl pl-1.5 pr-3 py-1.5 transition-all',
        isTurn
          ? 'bg-surface shadow-ambient ring-2 ring-primary'
          : 'bg-surface-high ring-1 ring-outline-variant/30',
      ].join(' ')}
      style={{ minWidth: 88 }}
    >
      {/* Faction stripe — 3px vertical bar pinned to the left edge */}
      <span
        aria-hidden="true"
        className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full"
        style={{ background: factionColor }}
      />

      <PlayerAvatar seat={seat} name={player.name} size={28} connected={connected} />

      <span className="flex flex-col leading-tight min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/55 truncate max-w-[64px]">
          {isYou ? 'You' : player.name}
        </span>
        <span className="flex items-baseline gap-1">
          <span className="text-sm font-extrabold text-on-surface">{vp}</span>
          <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface/50">VP</span>
        </span>
      </span>

      {player.hasLongestRoad || player.hasLargestArmy ? (
        <span className="flex flex-col items-center gap-0.5">
          {player.hasLongestRoad ? (
            <span
              title="Longest Road"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-on-primary text-[9px] font-extrabold"
            >LR</span>
          ) : null}
          {player.hasLargestArmy ? (
            <span
              title="Largest Army"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-on-secondary text-[9px] font-extrabold"
            >LA</span>
          ) : null}
        </span>
      ) : null}
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

// ---------- Settings dropdown ------------------------------------------

function SettingsMenu({ onLeave }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!e.target.closest?.('[data-settings-menu]')) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div data-settings-menu className="relative">
      <button
        type="button"
        aria-label="Settings"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full p-2 text-primary hover:bg-surface-container"
      >
        <Icons.Settings size={20} />
      </button>
      {open ? (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-surface-container shadow-ambient ring-1 ring-outline-variant/30 overflow-hidden">
          <button
            type="button"
            className="w-full text-left px-4 py-3 text-sm font-semibold text-on-surface hover:bg-surface-high"
            onClick={() => { setOpen(false); onLeave(); }}
          >
            Leave expedition
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Trade panel (bank + player-to-player) -----------------------

function TradePanel({ me, game, client, isMyTurn, turnPhase, phase, myIndex, onClose, pushNotification }) {
  const [giveResource, setGiveResource] = useState(null);
  const [getResource, setGetResource] = useState(null);
  const [busy, setBusy] = useState(false);

  const tradable = phase === 'playing' && isMyTurn && turnPhase === 'main';
  const ratios = game?.tradeRatios ?? {};
  const resources = me?.resources ?? {};
  const giveRatio = giveResource ? (ratios[giveResource] ?? 4) : null;

  const canSubmit =
    tradable &&
    giveResource &&
    getResource &&
    giveResource !== getResource &&
    (resources[giveResource] ?? 0) >= (giveRatio ?? 4);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await client.call('bankTrade', {
        giveResource,
        giveAmount: giveRatio,
        getResource,
      });
      setGiveResource(null);
      setGetResource(null);
      onClose();
    } catch (err) {
      pushNotification(err.message || 'Trade failed');
    } finally {
      setBusy(false);
    }
  };

  // Hard-split tabs so a Bank bundle can't accidentally broadcast to players (#1).
  const [mode, setMode] = useState('bank'); // 'bank' | 'players'

  // Reset the currently-active pane's in-progress state when the user flips tabs.
  const switchMode = (next) => {
    if (next === mode) return;
    if (next === 'bank') {
      setGiveResource(null);
      setGetResource(null);
    }
    setMode(next);
  };

  const disabledCopy = !tradable
    ? (phase !== 'playing'
        ? 'Trading opens after the setup phase.'
        : !isMyTurn
        ? 'You can only trade on your own turn.'
        : turnPhase === 'roll'
        ? 'Roll the dice first, then trade.'
        : 'Not a trading moment.')
    : null;

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-on-surface/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-2 mb-[calc(96px+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <Card
          tone="surface"
          className="flex flex-col gap-3 max-h-[min(calc(100dvh-88px-env(safe-area-inset-bottom)-96px),720px)] overflow-y-auto"
          padded={false}
        >
          {/* Sticky header inside the scrollable sheet */}
          <div className="sticky top-0 z-10 -mx-0 px-5 pt-5 pb-3 bg-surface rounded-t-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-on-surface">Marketplace</h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container"
              >
                <Icons.X size={18} />
              </button>
            </div>
            {/* Segmented tabs */}
            <div className="mt-3 inline-flex items-center rounded-full bg-surface-high p-0.5" role="tablist">
              <TabButton active={mode === 'bank'} onClick={() => switchMode('bank')} label="Bank" />
              <TabButton active={mode === 'players'} onClick={() => switchMode('players')} label="With Players" />
            </div>
          </div>

          <div className="px-5 pb-5 flex flex-col gap-4">
            {disabledCopy ? (
              <p className="text-sm text-on-surface-variant">{disabledCopy}</p>
            ) : null}

            {mode === 'bank' ? (
              <>
                <p className="text-xs text-on-surface-variant">
                  Trade with the bank. Ratio reflects the ports you sit on — 2:1 on a matching port, 3:1 on a generic, 4:1 otherwise.
                </p>
                <TradeRow
                  label="I give"
                  selected={giveResource}
                  onSelect={setGiveResource}
                  resources={resources}
                  ratios={ratios}
                  disabled={!tradable}
                />
                <TradeRow
                  label="I want"
                  selected={getResource}
                  onSelect={setGetResource}
                  disabled={!tradable}
                />
                {giveResource && getResource && giveResource !== getResource ? (
                  <div className="rounded-md bg-surface-low p-3 text-sm text-on-surface">
                    Trade <span className="font-bold text-primary">{giveRatio} {RESOURCE_LABELS[giveResource]}</span>{' '}
                    for <span className="font-bold text-primary">1 {RESOURCE_LABELS[getResource]}</span>
                    {(resources[giveResource] ?? 0) < giveRatio ? (
                      <span className="ml-2 text-secondary font-semibold">— need {giveRatio - (resources[giveResource] ?? 0)} more</span>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button variant="tertiary" onClick={onClose}>Cancel</Button>
                  <Button onClick={submit} disabled={!canSubmit || busy}>
                    {busy ? 'Trading…' : 'Complete Trade'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-on-surface-variant">
                  Offer a bundle to the expedition. Any player can accept or decline.
                </p>
                <PlayerTradeSection
                  me={me}
                  game={game}
                  client={client}
                  myIndex={myIndex}
                  tradable={tradable}
                  onClose={onClose}
                  pushNotification={pushNotification}
                />
              </>
            )}
          </div>
        </Card>
      </div>
    </div>,
    document.body
  );
}

// Small pill-tab component for the Marketplace's Bank / Players switch.
function TabButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'rounded-full px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider transition-colors',
        active ? 'bg-primary text-on-primary shadow-ambient' : 'text-on-surface-variant hover:text-on-surface',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

// ---------- Player trade builder ---------------------------------------

const EMPTY = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };

function PlayerTradeSection({ me, game, client, myIndex, tradable, onClose, pushNotification }) {
  const [offer, setOffer] = useState({ ...EMPTY });
  const [request, setRequest] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const myOffer = game?.tradeOffer?.from === myIndex ? game.tradeOffer : null;
  const resources = me?.resources ?? {};

  const adjust = (target, setTarget, resource, delta, max) => {
    setTarget((prev) => {
      const curr = prev[resource] ?? 0;
      const next = Math.max(0, curr + delta);
      if (max !== undefined && next > max) return prev;
      return { ...prev, [resource]: next };
    });
  };

  const totalOffer = RESOURCE_ORDER.reduce((s, r) => s + (offer[r] ?? 0), 0);
  const totalRequest = RESOURCE_ORDER.reduce((s, r) => s + (request[r] ?? 0), 0);
  const canPropose =
    tradable &&
    !myOffer &&
    totalOffer > 0 &&
    totalRequest > 0 &&
    RESOURCE_ORDER.every((r) => (resources[r] ?? 0) >= (offer[r] ?? 0));

  const propose = async () => {
    if (!canPropose) return;
    setBusy(true);
    try {
      // Strip zeros — server expects non-empty amounts only.
      const clean = (obj) =>
        Object.fromEntries(Object.entries(obj).filter(([, v]) => v > 0));
      await client.call('proposeTrade', { offer: clean(offer), request: clean(request) });
      setOffer({ ...EMPTY });
      setRequest({ ...EMPTY });
    } catch (err) {
      pushNotification(err.message || 'Could not propose');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try { await client.call('cancelTrade'); }
    catch (err) { pushNotification(err.message || 'Could not cancel'); }
    finally { setBusy(false); }
  };

  if (myOffer) {
    return (
      <div className="mt-3 rounded-md bg-surface-low p-3 flex flex-col gap-3">
        <div className="text-sm text-on-surface">
          <p className="font-bold">Your offer is on the table.</p>
          <p className="mt-1 text-on-surface-variant">
            You give {describeBundle(myOffer.offer)} · You want {describeBundle(myOffer.request)}
          </p>
        </div>
        <Button variant="secondary" onClick={cancel} disabled={busy}>Cancel Offer</Button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <BundleBuilder
        label="You give"
        bundle={offer}
        resources={resources}
        setBundle={setOffer}
        limit
        disabled={!tradable || busy}
      />
      <BundleBuilder
        label="You want"
        bundle={request}
        setBundle={setRequest}
        disabled={!tradable || busy}
      />
      <Button onClick={propose} disabled={!canPropose || busy}>
        {busy ? 'Proposing…' : 'Propose to Expedition'}
      </Button>
    </div>
  );
}

function BundleBuilder({ label, bundle, resources, setBundle, limit = false, disabled }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface/60 mb-2">{label}</p>
      <div className="flex flex-col gap-1.5">
        {RESOURCE_ORDER.map((r) => {
          const Icon = ResourceIcons[r];
          const tint = HUD_TINTS[r] ?? 'text-on-surface';
          const count = bundle[r] ?? 0;
          const have = resources?.[r];
          const max = limit && resources ? resources[r] : undefined;
          return (
            <div key={r} className="flex items-center justify-between rounded-md bg-surface p-2 px-3">
              <span className="flex items-center gap-2">
                <span className={`shrink-0 ${tint}`} aria-hidden="true">{Icon ? <Icon size={18} /> : null}</span>
                <span className="flex flex-col">
                  <span className="text-sm font-semibold text-on-surface">{RESOURCE_LABELS[r]}</span>
                  {have !== undefined ? <span className="text-[10px] text-on-surface-variant">have {have}</span> : null}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={disabled || count <= 0}
                  onClick={() => setBundle((p) => ({ ...p, [r]: Math.max(0, (p[r] ?? 0) - 1) }))}
                  className="h-7 w-7 rounded-full bg-surface-high text-on-surface font-bold disabled:opacity-30"
                  aria-label={`Less ${RESOURCE_LABELS[r]}`}
                >−</button>
                <span className="min-w-[1.5ch] text-center text-sm font-extrabold">{count}</span>
                <button
                  type="button"
                  disabled={disabled || (max !== undefined && count >= max)}
                  onClick={() => setBundle((p) => ({
                    ...p,
                    [r]: (max !== undefined ? Math.min(max, (p[r] ?? 0) + 1) : (p[r] ?? 0) + 1),
                  }))}
                  className="h-7 w-7 rounded-full bg-surface-high text-on-surface font-bold disabled:opacity-30"
                  aria-label={`More ${RESOURCE_LABELS[r]}`}
                >+</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function describeBundle(bundle) {
  const parts = RESOURCE_ORDER
    .filter((r) => (bundle?.[r] ?? 0) > 0)
    .map((r) => `${bundle[r]} ${RESOURCE_LABELS[r]}`);
  return parts.length ? parts.join(', ') : 'nothing';
}

// ---------- Incoming trade modal (renders for all non-proposers) --------

function IncomingTradeModal({ offer, from, me, client, pushNotification }) {
  const [busy, setBusy] = useState(false);
  const canAccept = RESOURCE_ORDER.every(
    (r) => (me?.resources?.[r] ?? 0) >= (offer.request?.[r] ?? 0)
  );
  const respond = async (accept) => {
    setBusy(true);
    try { await client.call('respondToTrade', { accept }); }
    catch (err) { pushNotification(err.message || 'Trade response failed'); }
    finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm px-4">
      <Card tone="surface" className="w-full max-w-sm flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface/50">Incoming Offer</p>
          <h2 className="text-lg font-bold text-on-surface mt-1">
            {from?.name ?? 'Someone'} proposes a trade
          </h2>
        </div>
        <div className="rounded-md bg-surface-low p-3 text-sm text-on-surface space-y-1">
          <p><span className="text-on-surface-variant">They give:</span> <span className="font-semibold">{describeBundle(offer.offer)}</span></p>
          <p><span className="text-on-surface-variant">They want:</span> <span className="font-semibold">{describeBundle(offer.request)}</span></p>
          {!canAccept ? (
            <p className="text-xs text-secondary font-semibold pt-1">You don't have what they're asking for.</p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => respond(false)}>Decline</Button>
          <Button disabled={busy || !canAccept} onClick={() => respond(true)}>Accept</Button>
        </div>
      </Card>
    </div>,
    document.body
  );
}

function TradeRow({ label, selected, onSelect, resources, ratios, disabled }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface/60 mb-2">{label}</p>
      <div className="grid grid-cols-5 gap-2">
        {RESOURCE_ORDER.map((r) => {
          const Icon = ResourceIcons[r];
          const active = selected === r;
          const count = resources?.[r];
          const ratio = ratios?.[r];
          return (
            <button
              key={r}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(active ? null : r)}
              className={[
                'flex flex-col items-center gap-0.5 rounded-md px-2 py-2 text-xs font-bold transition-all',
                active ? 'bg-primary text-on-primary shadow-ambient -translate-y-0.5' : 'bg-surface-high text-on-surface',
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-surface-highest',
              ].join(' ')}
            >
              <span aria-hidden="true" className={active ? 'text-on-primary' : HUD_TINTS[r] ?? ''}>
                {Icon ? <Icon size={18} /> : null}
              </span>
              <span className="uppercase tracking-wider">{RESOURCE_LABELS[r]}</span>
              {count !== undefined ? <span className="text-[10px] opacity-80">have {count}</span> : null}
              {ratio !== undefined ? <span className="text-[10px] opacity-80">{ratio}:1</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Dev card panel ---------------------------------------------

// Each dev card picks an accent terrain so its row's hex badge visually
// ties back to the board. `glyph` overrides the badge symbol when the
// terrain's default silhouette doesn't fit the card's theme.
const DEV_CARD_LABELS = {
  knight: {
    title: 'Knight',
    body: 'Move the robber. Three knights played claims Largest Army.',
    accentTerrain: 'mountains',
  },
  roadBuilding: {
    title: 'Road Building',
    body: 'Place two roads for free on your next two taps.',
    accentTerrain: 'forest',
  },
  yearOfPlenty: {
    title: 'Year of Plenty',
    body: 'Take any two resources from the bank.',
    accentTerrain: 'fields',
  },
  monopoly: {
    title: 'Monopoly',
    body: 'Choose a resource — every other player hands you all of theirs.',
    accentTerrain: 'hills',
  },
  victoryPoint: {
    title: 'Victory Point',
    body: 'Counted toward your score at the end of the game. Not played.',
    accentTerrain: 'pasture',
    // Override: pasture's sheep silhouette doesn't read "victory"; show a
    // trophy instead. The hex background still uses the pasture color so
    // VP cards read as sibling-of-pasture in the hand list.
    glyphIcon: 'Trophy',
  },
};

function countCards(list) {
  const map = {};
  for (const c of list ?? []) map[c] = (map[c] ?? 0) + 1;
  return map;
}

/**
 * Hex-shaped accent badge for a dev card row. Uses the card's accentTerrain
 * for the hex fill + terrain silhouette; if the card's meta specifies a
 * `glyphIcon` (e.g. Trophy for VP), we render that icon inside the hex
 * instead of the terrain's native silhouette.
 */
function DevCardBadge({ meta, size = 56 }) {
  if (!meta?.accentTerrain) return null;
  if (meta.glyphIcon && Icons[meta.glyphIcon]) {
    const Glyph = Icons[meta.glyphIcon];
    // Wrap the icon as an SVG group positioned to the center of the 24-unit
    // viewBox TerrainHexBadge uses, scaled so the glyph reads at badge size.
    return (
      <TerrainHexBadge
        terrain={meta.accentTerrain}
        size={size}
        glyph={
          <g transform="translate(6 6) scale(0.5)">
            {/* Glyph is rendered through the Icons catalog which produces a
                full <svg>. We read its path children by rendering it once
                and let CSS + opacity style the color. */}
            <Glyph size={24} />
          </g>
        }
      />
    );
  }
  return <TerrainHexBadge terrain={meta.accentTerrain} size={size} />;
}

function DevCardPanel({ me, game, client, isMyTurn, turnPhase, phase, onClose, pushNotification }) {
  const [busy, setBusy] = useState(false);
  const [monopolyPick, setMonopolyPick] = useState(null); // resource id mid-play
  const tradable = phase === 'playing' && isMyTurn && turnPhase === 'main';

  // me.developmentCards may be an array (mine) or a number (opponent view — n/a here).
  const owned = Array.isArray(me?.developmentCards) ? me.developmentCards : [];
  const bought = Array.isArray(me?.newDevCards) ? me.newDevCards : [];
  const ownedCounts = countCards(owned);
  const boughtCount = Array.isArray(bought) ? bought.length : (bought ?? 0);
  const deckLeft = game?.devCardDeck ?? 0;
  const alreadyPlayedThisTurn = !!game?.devCardPlayedThisTurn;

  const costOK = me?.resources &&
    me.resources.ore >= 1 &&
    me.resources.grain >= 1 &&
    me.resources.wool >= 1;
  const canBuy = tradable && costOK && deckLeft > 0;

  const buy = async () => {
    if (!canBuy) return;
    setBusy(true);
    try { await client.call('buyDevCard'); }
    catch (err) { pushNotification(err.message || 'Buy failed'); }
    finally { setBusy(false); }
  };

  const play = async (cardType, params) => {
    if (!tradable || alreadyPlayedThisTurn) return;
    setBusy(true);
    try {
      await client.call('playDevCard', { cardType, params });
      if (cardType === 'roadBuilding' || cardType === 'knight') onClose();
    } catch (err) {
      pushNotification(err.message || 'Play failed');
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-on-surface/40 backdrop-blur-sm pb-[calc(96px+env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <div className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <Card tone="surface" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-on-surface">Development Cards</h2>
              <p className="text-xs text-on-surface-variant">
                Costs <strong>1 Ore · 1 Hay · 1 Sheep</strong> per card. {deckLeft} left in the deck.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container"
            >
              <Icons.X size={18} />
            </button>
          </div>

          {!tradable ? (
            <p className="text-sm text-on-surface-variant">
              {phase !== 'playing' ? 'Development cards become available during the main phase.' :
               !isMyTurn ? 'You can only buy/play on your own turn.' :
               turnPhase === 'roll' ? 'Roll the dice first.' :
               'Not a main phase moment.'}
            </p>
          ) : null}

          <Button disabled={!canBuy || busy} onClick={buy}>
            {busy ? 'Working…' : `Buy a Development Card`}
          </Button>

          {alreadyPlayedThisTurn ? (
            <p className="text-xs text-secondary font-semibold">You've already played a dev card this turn.</p>
          ) : null}

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-on-surface/60 mb-2">
              In Your Hand ({owned.length + boughtCount})
            </h3>
            {owned.length === 0 && boughtCount === 0 ? (
              <p className="text-sm text-on-surface-variant">No cards yet. Buy one above when you can afford it.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(ownedCounts).map(([cardType, count]) => {
                  const meta = DEV_CARD_LABELS[cardType] ?? { title: cardType, body: '' };
                  const isPlayable = cardType !== 'victoryPoint' && tradable && !alreadyPlayedThisTurn;
                  return (
                    <div key={cardType} className="rounded-md bg-surface-low p-3 flex items-center gap-3">
                      <DevCardBadge meta={meta} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-on-surface">{meta.title} <span className="text-on-surface-variant font-normal">× {count}</span></p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{meta.body}</p>
                      </div>
                      {cardType === 'victoryPoint' ? null : (
                        <Button size="sm" disabled={!isPlayable || busy}
                          onClick={() => {
                            if (cardType === 'monopoly') setMonopolyPick('__open__');
                            else play(cardType);
                          }}
                        >Play</Button>
                      )}
                    </div>
                  );
                })}

                {/* Bought-this-turn cards — same hex badge treatment but with
                    a dashed/faded wrapper so you can see they're owed but
                    still locked until next turn. */}
                {Object.entries(countCards(bought)).map(([cardType, count]) => {
                  const meta = DEV_CARD_LABELS[cardType] ?? { title: cardType, body: '' };
                  return (
                    <div
                      key={`new-${cardType}`}
                      className="rounded-md bg-surface-low/60 p-3 flex items-center gap-3 opacity-70 ring-1 ring-outline-variant/40 ring-dashed"
                      style={{ borderStyle: 'dashed' }}
                    >
                      <DevCardBadge meta={meta} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-on-surface flex items-center gap-2 flex-wrap">
                          {meta.title}
                          <span className="text-on-surface-variant font-normal">× {count}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface-high px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                            Locked · next turn
                          </span>
                        </p>
                        <p className="text-xs text-on-surface-variant mt-0.5">{meta.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {monopolyPick === '__open__' ? (
        <ResourcePickerModal
          title="Monopoly — pick a resource"
          body="Every other player hands you all of that resource."
          onPick={async (resource) => {
            setMonopolyPick(null);
            await play('monopoly', { resource });
            onClose();
          }}
          onCancel={() => setMonopolyPick(null)}
        />
      ) : null}
    </div>,
    document.body
  );
}

// ---------- Year of Plenty picker (auto-opens) --------------------------

function YearOfPlentyPicker({ remaining, client, pushNotification }) {
  const [busy, setBusy] = useState(false);
  const pick = async (resource) => {
    setBusy(true);
    try { await client.call('yearOfPlentyPick', { resource }); }
    catch (err) { pushNotification(err.message || 'Pick failed'); }
    finally { setBusy(false); }
  };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm px-4">
      <Card tone="surface" className="w-full max-w-sm flex flex-col gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-surface/50">Year of Plenty</p>
          <h2 className="text-lg font-bold text-on-surface mt-1">Take {remaining} more from the bank</h2>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {RESOURCE_ORDER.map((r) => {
            const Icon = ResourceIcons[r];
            return (
              <button
                key={r}
                type="button"
                disabled={busy}
                onClick={() => pick(r)}
                className="flex flex-col items-center gap-1 rounded-md bg-surface-high px-2 py-3 text-xs font-bold text-on-surface hover:bg-surface-highest disabled:opacity-40"
              >
                <span aria-hidden="true" className={HUD_TINTS[r] ?? ''}>{Icon ? <Icon size={18} /> : null}</span>
                {RESOURCE_LABELS[r]}
              </button>
            );
          })}
        </div>
      </Card>
    </div>,
    document.body
  );
}

// ---------- Generic resource picker (Monopoly) --------------------------

function ResourcePickerModal({ title, body, onPick, onCancel }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/50 backdrop-blur-sm px-4">
      <Card tone="surface" className="w-full max-w-sm flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-on-surface">{title}</h2>
          <p className="text-sm text-on-surface-variant mt-1">{body}</p>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {RESOURCE_ORDER.map((r) => {
            const Icon = ResourceIcons[r];
            return (
              <button
                key={r}
                type="button"
                onClick={() => onPick(r)}
                className="flex flex-col items-center gap-1 rounded-md bg-surface-high px-2 py-3 text-xs font-bold text-on-surface hover:bg-surface-highest"
              >
                <span aria-hidden="true" className={HUD_TINTS[r] ?? ''}>{Icon ? <Icon size={18} /> : null}</span>
                {RESOURCE_LABELS[r]}
              </button>
            );
          })}
        </div>
        <Button variant="tertiary" onClick={onCancel}>Cancel</Button>
      </Card>
    </div>,
    document.body
  );
}

// ---------- Status panel (live scoreboard) -----------------------------
//
// Ranks every player by public victory points and surfaces the pieces they
// have left + the longest-road / largest-army badges. Sits on top of the
// live gameState, so scores update as settlements, cities, roads, knights,
// and dev-card VPs land — no polling, no refresh.

function StatusPanel({ game, me, playerId, currentIndex, onClose }) {
  const players = game?.players ?? [];
  const winner = game?.winner != null ? players[game.winner] : null;
  const victoryTarget = game?.victoryPointsToWin ?? 10;

  // Public VP is authoritative during the game. Hidden VP dev cards only
  // flip public once the game ends — getPlayerView masks them for others.
  const ranked = useMemo(
    () => players
      .map((p, seat) => ({ ...p, seat }))
      .sort((a, b) => (b.victoryPoints ?? 0) - (a.victoryPoints ?? 0)),
    [players]
  );

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-on-surface/40 backdrop-blur-sm pb-[calc(96px+env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <div className="w-full max-w-md mx-2" onClick={(e) => e.stopPropagation()}>
        <Card
          tone="surface"
          padded={false}
          className="flex flex-col max-h-[min(calc(100dvh-88px-env(safe-area-inset-bottom)-96px),720px)] overflow-y-auto"
        >
          <div className="sticky top-0 z-10 px-5 pt-5 pb-3 bg-surface">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-on-surface">Expedition Status</h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {winner
                    ? `${winner.name} won the expedition.`
                    : `First to ${victoryTarget} VP wins.`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container"
              >
                <Icons.X size={18} />
              </button>
            </div>
          </div>

          <div className="px-5 pb-5 flex flex-col gap-2">
            {ranked.map((p, rank) => (
              <PlayerScoreRow
                key={p.id}
                player={p}
                rank={rank}
                isMe={p.id === playerId}
                isCurrent={p.seat === currentIndex}
                victoryTarget={victoryTarget}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>,
    document.body
  );
}

function PlayerScoreRow({ player, rank, isMe, isCurrent, victoryTarget }) {
  const vp = player.victoryPoints ?? 0;
  const faction = FACTIONS[player.seat ?? 0] ?? 'red';
  const factionClass = {
    red: 'bg-faction-red',
    blue: 'bg-faction-blue',
    gold: 'bg-faction-gold',
    green: 'bg-faction-green',
  }[faction] ?? 'bg-outline';

  // Resource / dev-card counts differ in shape between self (object/array)
  // and opponents (number). Normalize to a number for display.
  const resourceCount = typeof player.resources === 'number'
    ? player.resources
    : Object.values(player.resources ?? {}).reduce((a, b) => a + b, 0);
  const devCardCount = Array.isArray(player.developmentCards)
    ? player.developmentCards.length
    : (player.developmentCards ?? 0);
  const newDevCount = Array.isArray(player.newDevCards)
    ? player.newDevCards.length
    : (player.newDevCards ?? 0);
  const totalDev = devCardCount + newDevCount;

  // Pieces LEFT in the supply (what the server sends). Derive "placed" to
  // give players a more intuitive read ("3/5 settlements built").
  const settlementsPlaced = 5 - (player.settlements ?? 5);
  const citiesPlaced = 4 - (player.cities ?? 4);
  const roadsPlaced = 15 - (player.roads ?? 15);

  return (
    <div
      className={[
        'relative overflow-hidden rounded-xl p-3 pl-5',
        isCurrent ? 'bg-surface-highest shadow-ambient' : 'bg-surface-low',
      ].join(' ')}
    >
      <FactionStripe faction={faction} />
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-on-primary ${factionClass}`}>
          {rank + 1}
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <p className="truncate text-base font-bold text-on-surface">{player.name}</p>
              {isMe ? <Badge tone="secondary">You</Badge> : null}
              {isCurrent ? <Badge>Turn</Badge> : null}
            </div>
            <div className="flex items-baseline gap-1 shrink-0">
              <span className="text-2xl font-extrabold text-primary">{vp}</span>
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface/60">/ {victoryTarget} VP</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            {player.hasLongestRoad ? <AchievementPill>Longest Road · +2</AchievementPill> : null}
            {player.hasLargestArmy ? <AchievementPill>Largest Army · +2</AchievementPill> : null}
          </div>

          <div className="grid grid-cols-5 gap-2 text-center text-[11px]">
            <Stat label="Settle" value={settlementsPlaced} max={5} />
            <Stat label="City" value={citiesPlaced} max={4} />
            <Stat label="Roads" value={roadsPlaced} max={15} />
            <Stat label="Knights" value={player.knightsPlayed ?? 0} />
            <Stat label="Cards" value={resourceCount} sub={totalDev ? `+${totalDev} dev` : undefined} />
          </div>
        </div>
      </div>
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

function AchievementPill({ children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary text-on-primary px-2 py-0.5">
      <Icons.Check size={10} />
      {children}
    </span>
  );
}

function Stat({ label, value, max, sub }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-surface px-1 py-1.5">
      <span className="text-base font-extrabold text-on-surface leading-none">
        {value}{max !== undefined ? <span className="text-[10px] font-normal text-on-surface-variant">/{max}</span> : null}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
      {sub ? <span className="text-[9px] text-on-surface-variant">{sub}</span> : null}
    </div>
  );
}

// ---------- Tab panels (stubs for remaining) ---------------------------

function TabPanel({ tab, onClose }) {
  const TITLES = {
    cards: { title: 'Development Cards', hint: 'Knight, road-building, monopoly and more. Phase 1.9.' },
  };
  const copy = TITLES[tab] ?? { title: tab, hint: 'Coming soon.' };
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-on-surface/40 backdrop-blur-sm pointer-events-auto pb-[calc(96px+env(safe-area-inset-bottom))]" onClick={onClose}>
      <div className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <Card tone="surface" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-on-surface">{copy.title}</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="rounded-full p-1.5 text-on-surface-variant hover:bg-surface-container"
            >
              <Icons.X size={18} />
            </button>
          </div>
          <p className="text-sm text-on-surface-variant">{copy.hint}</p>
        </Card>
      </div>
    </div>,
    document.body
  );
}

// ---------- Game-over overlay ------------------------------------------

// ---------- Steal result toast ----------------------------------------
// Shows exactly once per robber-move: self-dismisses after 4s, or on tap.

function StealResultToast({ pending, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [pending, onDismiss]);

  const resourceLabel = RESOURCE_LABELS[pending.resource] ?? pending.resource;
  const message = pending.variant === 'stole'
    ? `You stole 1 ${resourceLabel} from ${pending.otherPlayer}`
    : `${pending.otherPlayer} stole 1 ${resourceLabel} from you`;
  const tone = pending.variant === 'stole' ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary';

  return createPortal(
    <div
      className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+60px)] z-[65] flex justify-center px-4 pointer-events-none"
      onClick={onDismiss}
    >
      <div className={`pointer-events-auto rounded-full px-4 py-2 text-sm font-extrabold shadow-ambient ${tone}`}>
        {message}
      </div>
    </div>,
    document.body
  );
}

function GameOverOverlay({ winner, players, myPlayerId, onLeave }) {
  const ranked = useMemo(
    () => [...(players ?? [])].sort((a, b) => (b.victoryPoints ?? 0) - (a.victoryPoints ?? 0)),
    [players]
  );
  const iWon = winner?.id === myPlayerId;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/60 backdrop-blur-sm px-4">
      <Card tone="surface" className="w-full max-w-md flex flex-col gap-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-on-surface/50">Expedition Concluded</p>
        <h2 className="text-4xl font-extrabold tracking-display text-primary">
          {winner ? (iWon ? 'You Won' : `${winner.name} won`) : 'The game has ended'}
        </h2>
        <div className="flex flex-col gap-1 text-left">
          {ranked.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between rounded-md bg-surface-low px-3 py-2">
              <span className="flex items-center gap-3">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-on-primary ${
                  ['bg-faction-red','bg-faction-blue','bg-faction-gold','bg-faction-green'][i] ?? 'bg-outline'
                }`}>
                  {i + 1}
                </span>
                <span className="text-sm font-bold text-on-surface">{p.name}</span>
                {p.id === myPlayerId ? <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">you</span> : null}
              </span>
              <span className="text-sm font-extrabold text-primary">{p.victoryPoints ?? 0} VP</span>
            </div>
          ))}
        </div>
        <Button onClick={onLeave}>Back to Landing</Button>
      </Card>
    </div>,
    document.body
  );
}

// ---------- Modal overlay (steal chooser) ------------------------------

function ModalOverlay({ children, onClose }) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/45 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm">{children}</div>
    </div>,
    document.body
  );
}

// ---------- Discard dialog ---------------------------------------------

function DiscardDialog({ required, resources, onSubmit }) {
  const [picks, setPicks] = useState(() =>
    Object.fromEntries(RESOURCE_ORDER.map((r) => [r, 0]))
  );
  const total = RESOURCE_ORDER.reduce((sum, r) => sum + (picks[r] ?? 0), 0);
  const adjust = (r, delta) => {
    setPicks((prev) => {
      const curr = prev[r] ?? 0;
      const max = resources?.[r] ?? 0;
      const next = Math.max(0, Math.min(max, curr + delta));
      return { ...prev, [r]: next };
    });
  };
  const canSubmit = total === required;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/55 backdrop-blur-sm px-4">
      <Card tone="surface" className="w-full max-w-md flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-bold text-on-surface">You rolled into a 7</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Discard <span className="font-bold text-primary">{required}</span> cards. Tap + / − to pick.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {RESOURCE_ORDER.map((r) => {
            const Icon = ResourceIcons[r];
            return (
              <div key={r} className="flex items-center justify-between rounded-md bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className={HUD_TINTS[r] ?? ''}>{Icon ? <Icon size={20} /> : null}</span>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-on-surface">{RESOURCE_LABELS[r]}</span>
                    <span className="text-xs text-on-surface-variant">Have: {resources?.[r] ?? 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Less ${RESOURCE_LABELS[r]}`}
                    onClick={() => adjust(r, -1)}
                    className="h-9 w-9 rounded-full bg-surface-high text-on-surface font-bold"
                  >−</button>
                  <span className="min-w-[2ch] text-center text-base font-extrabold text-on-surface">{picks[r]}</span>
                  <button
                    type="button"
                    aria-label={`More ${RESOURCE_LABELS[r]}`}
                    onClick={() => adjust(r, +1)}
                    className="h-9 w-9 rounded-full bg-surface-high text-on-surface font-bold"
                  >+</button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-on-surface-variant">
            Picked <span className="font-bold text-on-surface">{total}</span> / {required}
          </span>
          <Button disabled={!canSubmit} onClick={() => onSubmit(picks)}>Confirm</Button>
        </div>
      </Card>
    </div>,
    document.body
  );
}

export default Board;
