import { create } from 'zustand';
import { create as mutate } from 'mutative';

/**
 * Per-player game view from the server (authoritative).
 * Null until the first `gameState` message arrives.
 * Shape matches what party/server.js sends via getPlayerView() + broadcastGameState().
 *
 * The identity trick: server snapshots replace the whole tree, but mutative only
 * rewrites the branches we assign to. Untouched refs (players[0], hexes, etc.)
 * stay identical across frames, so React.memo on SVG children actually works.
 */
const initial = {
  game: null,
  lastRoll: null,
  chatMessages: [],
  incomingTrade: null,
  tradeOffers: [],
  pendingSteal: null,
  draftTrade: { give: {}, want: {} },
  selection: null,
  notifications: [],
};

const asDraft = (recipe) => (state) => mutate(state, recipe);

export const useGameStore = create((set, get) => ({
  ...initial,

  reset: () => set(() => ({ ...initial })),

  setGame: (snapshot) => set(asDraft((d) => { d.game = snapshot; })),

  setSelection: (selection) => set(asDraft((d) => { d.selection = selection; })),

  setDraftTrade: (next) => set(asDraft((d) => {
    d.draftTrade = typeof next === 'function' ? next(d.draftTrade) : next;
  })),

  clearDraftTrade: () => set(asDraft((d) => {
    d.draftTrade = { give: {}, want: {} };
  })),

  pushNotification: (message) => {
    const id = Date.now() + Math.random();
    set(asDraft((d) => {
      d.notifications.push({ id, message });
    }));
    setTimeout(() => {
      set(asDraft((d) => {
        d.notifications = d.notifications.filter((n) => n.id !== id);
      }));
    }, 4000);
  },

  dismissIncomingTrade: () => set(asDraft((d) => { d.incomingTrade = null; })),

  clearPendingSteal: () => set(asDraft((d) => { d.pendingSteal = null; })),

  /**
   * Single entry point for every server message. Keep the switch exhaustive so
   * new server events show up as "unknown message type" warnings, not silent drops.
   */
  applyServerMessage: (msg) => set(asDraft((d) => {
    switch (msg.type) {
      case 'gameState':
        d.game = msg.state;
        return;

      case 'diceRolled':
        d.lastRoll = { total: msg.roll?.total ?? null, dice: msg.roll?.dice ?? null, playerId: msg.playerId };
        return;

      case 'resourcesDistributed':
        // Bookkeeping only; the authoritative totals land in the next gameState.
        return;

      case 'resourcesReceived':
        // Personal notification — the gameState tick will carry the exact counts.
        return;

      case 'robberMoved':
        // Handled via gameState tick.
        return;

      case 'stealResult':
        d.pendingSteal = { variant: msg.variant, resource: msg.resource, otherPlayer: msg.otherPlayer };
        return;

      case 'tradeProposed':
        d.incomingTrade = { from: msg.from, offer: msg.offer, request: msg.request };
        return;

      case 'tradeCancelled':
        d.incomingTrade = null;
        return;

      case 'chatMessage':
        d.chatMessages.push(msg);
        if (d.chatMessages.length > 200) d.chatMessages.splice(0, d.chatMessages.length - 200);
        return;

      // Events handled purely via the gameState tick that accompanies them.
      case 'playerJoined':
      case 'playerDisconnected':
      case 'playerReconnected':
      case 'gameStarted':
      case 'boardShuffled':
      case 'settlementPlaced':
      case 'roadPlaced':
      case 'cityBuilt':
      case 'devCardPlayed':
      case 'specialBuildingPhaseStarted':
      case 'specialBuildingPhaseEnded':
      case 'specialBuildNext':
      case 'turnEnded':
        return;

      case 'error':
        d.notifications.push({ id: Date.now() + Math.random(), message: msg.message || 'Unknown error' });
        return;

      default:
        if (import.meta.env.DEV) {
          console.warn('[gameStore] unhandled server message type:', msg.type, msg);
        }
    }
  })),
}));

/** Selector helpers — co-located so components don't drift into their own copies. */
export const selectGame = (s) => s.game;
export const selectPlayers = (s) => s.game?.players ?? [];
export const selectMe = (playerId) => (s) => s.game?.players?.find((p) => p.id === playerId) ?? null;
export const selectPhase = (s) => s.game?.phase ?? null;
export const selectCurrentTurn = (s) => s.game?.currentPlayerIndex ?? null;
export const selectHexes = (s) => s.game?.board?.hexes ?? [];
