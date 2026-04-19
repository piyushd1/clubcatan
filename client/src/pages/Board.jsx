import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

  // Setup flow — remember the vertex of the settlement we just placed so we
  // can feed it to placeRoad as lastSettlement and then advanceSetup.
  const [pendingSetupSettlement, setPendingSetupSettlement] = useState(null);

  // Steal chooser modal state: null | { hexKey, players: [{id,name,hasResources}] }
  const [stealChooser, setStealChooser] = useState(null);

  const me = useMemo(
    () => game?.players?.find((p) => p.id === playerId) ?? null,
    [game, playerId]
  );
  const players = game?.players ?? [];
  const currentIndex = game?.currentPlayerIndex ?? 0;
  const isMyTurn = players[currentIndex]?.id === playerId;
  const phase = game?.phase ?? 'setup';
  const turnPhase = game?.turnPhase ?? 'roll';
  const myIndex = players.findIndex((p) => p.id === playerId);

  // When a 7 is rolled, the server sets `discardingPlayers` for anyone with
  // >7 cards. If I'm in that list, open the discard dialog.
  const myDiscardInfo = useMemo(() => {
    const list = game?.discardingPlayers ?? [];
    return list.find((d) => d.playerIndex === myIndex) ?? null;
  }, [game, myIndex]);

  const isRobberTurn = phase === 'playing' && isMyTurn && turnPhase === 'robber';

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
      if (phase !== 'playing') return;
      if (turnPhase === 'robber' || turnPhase === 'discard') return;
      if (vertex.building === 'settlement' && vertex.owner === myIndex) {
        try { await client.call('upgradeToCity', { vertexKey: vKey }); }
        catch (err) { pushNotification(err.message || 'Cannot upgrade'); }
        return;
      }
      if (!vertex.building) {
        try { await client.call('placeSettlement', { vertexKey: vKey }); }
        catch (err) { pushNotification(err.message || 'Cannot build'); }
      }
    },
    [client, isMyTurn, phase, turnPhase, pendingSetupSettlement, myIndex, pushNotification]
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
          try { await client.call('advanceSetup'); }
          catch (err) { pushNotification(err.message || 'Could not advance'); }
        } catch (err) {
          pushNotification(err.message || 'Cannot place road there');
        }
        return;
      }
      if (phase !== 'playing') return;
      if (turnPhase === 'robber' || turnPhase === 'discard') return;
      try { await client.call('placeRoad', { edgeKey: eKey }); }
      catch (err) { pushNotification(err.message || 'Cannot build road'); }
    },
    [client, isMyTurn, phase, turnPhase, pendingSetupSettlement, pushNotification]
  );

  const onStealPicked = async (playerIdOrNull) => {
    if (!stealChooser) return;
    const hexKey = stealChooser.hexKey;
    setStealChooser(null);
    await doMoveRobber(hexKey, playerIdOrNull);
  };

  const winner = phase === 'finished' ? players[game?.winner] : null;

  return (
    <main className="relative flex min-h-dvh flex-col bg-surface pb-[calc(88px+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-surface/80 backdrop-blur-xl supports-[not(backdrop-filter:blur(0))]:bg-surface/96 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center justify-between gap-3">
          <button type="button" aria-label="Leave" onClick={onLeave} className="rounded-full p-2 text-primary hover:bg-surface-container">
            <Icons.ArrowLeft size={20} />
          </button>
          <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-primary">{roomCode}</span>
          <SettingsMenu onLeave={onLeave} />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
          {players.map((p, i) => (
            <PlayerPip key={p.id} player={p} faction={FACTIONS[i] ?? 'red'} isTurn={i === currentIndex} isYou={p.id === playerId} />
          ))}
        </div>
      </header>

      <section className="relative flex-1 px-2 py-2">
        {game?.hexes ? (
          <div className="mx-auto max-w-[640px]">
            <HexBoard
              game={game}
              playerId={playerId}
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
          pendingSetupSettlement={pendingSetupSettlement}
          currentName={players[currentIndex]?.name}
          lastRoll={lastRoll}
          hasRolled={!!game?.hasRolledThisTurn}
          onRoll={rollDice}
          onEndTurn={endTurn}
        />
      </section>

      {me ? (
        <ResourceHUD>
          {RESOURCE_ORDER.map((r) => (
            <Chip key={r} tint={RESOURCE_TINTS[r]} count={me.resources?.[r] ?? 0}>{RESOURCE_LABELS[r]}</Chip>
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
      {activeTab === 'status'
        ? <TabPanel tab={activeTab} onClose={() => setActiveTab('board')} />
        : null}

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

function TurnCard({ phase, turnPhase, isMyTurn, pendingSetupSettlement, currentName, lastRoll, hasRolled, onRoll, onEndTurn }) {
  const phaseLabel =
    phase === 'setup' ? 'Preparing for Settlement' :
    phase === 'finished' ? 'Expedition Ended' :
    'Expedition in Progress';

  let status;
  if (!isMyTurn) status = `${currentName ?? '…'} is planning`;
  else if (phase === 'setup') status = pendingSetupSettlement ? 'Tap an adjacent edge to place your road' : 'Tap a vertex to place your settlement';
  else if (turnPhase === 'discard') status = 'Rolled a 7 — everyone with >7 cards must discard';
  else if (turnPhase === 'robber') status = 'Move the robber: tap a hex';
  else status = 'Your move';

  return (
    <Card tone="low" className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
      <p className="text-xs font-bold uppercase tracking-wider text-on-surface/50">{phaseLabel}</p>
      <p className="text-lg font-bold text-on-surface">{status}</p>
      {lastRoll?.total ? (
        <p className="text-sm text-on-surface-variant">
          Last roll: <span className="font-extrabold text-primary">{lastRoll.total}</span>
        </p>
      ) : null}

      {isMyTurn && phase === 'playing' && turnPhase === 'roll' ? (
        <Button className="w-full" icon={<Icons.Dice size={18} />} onClick={onRoll}>Roll the Dice</Button>
      ) : null}

      {isMyTurn && phase === 'playing' && turnPhase === 'main' ? (
        <Button className="w-full" variant="secondary" icon={<Icons.Check size={16} />} onClick={onEndTurn} disabled={!hasRolled}>
          End Turn
        </Button>
      ) : null}
    </Card>
  );
}

// ---------- Player pip + misc -------------------------------------------

function PlayerPip({ player, faction, isTurn, isYou }) {
  const factionColor = {
    red: 'bg-faction-red',
    blue: 'bg-faction-blue',
    green: 'bg-faction-green',
    gold: 'bg-faction-gold',
  }[faction] ?? 'bg-outline';
  const initial = (player.name?.[0] ?? '?').toUpperCase();
  return (
    <div className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 ${isTurn ? 'bg-surface-highest shadow-ambient' : 'bg-surface-high'}`}>
      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-on-primary ${factionColor}`}>{initial}</span>
      <span className="flex flex-col leading-none">
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface/50">{isYou ? 'You' : player.name}</span>
        <span className="text-sm font-extrabold text-on-surface">{player.victoryPoints ?? 0} VP</span>
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

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-on-surface/40 backdrop-blur-sm pb-[calc(96px+env(safe-area-inset-bottom))]"
      onClick={onClose}
    >
      <div className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <Card tone="surface" className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-on-surface">Marketplace</h2>
              <p className="text-xs text-on-surface-variant">Bank trade — ratios reflect your ports.</p>
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
              {phase !== 'playing'
                ? 'Trading opens after the setup phase.'
                : !isMyTurn
                ? 'You can only trade on your own turn.'
                : turnPhase === 'roll'
                ? 'Roll the dice first, then trade.'
                : 'Not a trading moment.'}
            </p>
          ) : null}

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

          {/* Player-to-player section */}
          <div className="mt-4 border-t border-outline-variant/25 pt-4">
            <h3 className="text-base font-bold text-on-surface">Offer to the Expedition</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Propose a swap with any other player. They accept or decline.
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
          </div>
        </Card>
      </div>
    </div>,
    document.body
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
          const count = bundle[r] ?? 0;
          const have = resources?.[r];
          const max = limit && resources ? resources[r] : undefined;
          return (
            <div key={r} className="flex items-center justify-between rounded-md bg-surface p-2 px-3">
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-on-surface">{RESOURCE_LABELS[r]}</span>
                {have !== undefined ? <span className="text-[10px] text-on-surface-variant">have {have}</span> : null}
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

const DEV_CARD_LABELS = {
  knight: { title: 'Knight', body: 'Move the robber. If two players have three Knights, you claim Largest Army.' },
  roadBuilding: { title: 'Road Building', body: 'Place two roads for free on your next two taps.' },
  yearOfPlenty: { title: 'Year of Plenty', body: 'Take any two resources from the bank.' },
  monopoly: { title: 'Monopoly', body: 'Choose a resource — every other player hands you all of theirs.' },
  victoryPoint: { title: 'Victory Point', body: 'Counted toward your score at the end of the game. Not played.' },
};

function countCards(list) {
  const map = {};
  for (const c of list ?? []) map[c] = (map[c] ?? 0) + 1;
  return map;
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
                Costs <strong>1 ore · 1 wheat · 1 sheep</strong> per card. {deckLeft} left in the deck.
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
              In Your Hand ({owned.length})
            </h3>
            {owned.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No cards yet. Buy one above when you can afford it.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(ownedCounts).map(([cardType, count]) => {
                  const meta = DEV_CARD_LABELS[cardType] ?? { title: cardType, body: '' };
                  const isPlayable = cardType !== 'victoryPoint' && tradable && !alreadyPlayedThisTurn;
                  return (
                    <div key={cardType} className="rounded-md bg-surface-low p-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
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
                    </div>
                  );
                })}
              </div>
            )}

            {boughtCount > 0 ? (
              <p className="mt-3 text-xs text-on-surface-variant">
                {boughtCount} bought this turn — playable next turn.
              </p>
            ) : null}
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
          {RESOURCE_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              disabled={busy}
              onClick={() => pick(r)}
              className="flex flex-col items-center gap-0.5 rounded-md bg-surface-high px-2 py-3 text-xs font-bold text-on-surface hover:bg-surface-highest disabled:opacity-40"
            >
              {RESOURCE_LABELS[r]}
            </button>
          ))}
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
          {RESOURCE_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onPick(r)}
              className="flex flex-col items-center gap-0.5 rounded-md bg-surface-high px-2 py-3 text-xs font-bold text-on-surface hover:bg-surface-highest"
            >
              {RESOURCE_LABELS[r]}
            </button>
          ))}
        </div>
        <Button variant="tertiary" onClick={onCancel}>Cancel</Button>
      </Card>
    </div>,
    document.body
  );
}

// ---------- Tab panels (stubs for remaining) ---------------------------

function TabPanel({ tab, onClose }) {
  const TITLES = {
    cards: { title: 'Development Cards', hint: 'Knight, road-building, monopoly and more. Phase 1.9.' },
    status: { title: 'Expedition Status', hint: 'Scores, achievements, log. Phase 1.9.' },
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
          {RESOURCE_ORDER.map((r) => (
            <div key={r} className="flex items-center justify-between rounded-md bg-surface p-3">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-on-surface">{RESOURCE_LABELS[r]}</span>
                <span className="text-xs text-on-surface-variant">Have: {resources?.[r] ?? 0}</span>
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
          ))}
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
