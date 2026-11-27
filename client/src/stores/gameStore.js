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
  pendingSteal: null,
  notifications: [],
};

const asDraft = (recipe) => (state) => mutate(state, recipe);

export const useGameStore = create((set, get) => ({
  ...initial,

  reset: () => set(() => ({ ...initial })),

  setGame: (snapshot) => set(asDraft((d) => { d.game = snapshot; })),

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

  clearPendingSteal: () => set(asDraft((d) => { d.pendingSteal = null; })),

  /**
   * Single entry point for every server message. Keep the switch exhaustive so
   * new server events show up as "unknown message type" warnings, not silent drops.
   */
  applyServerMessage: (msg) => {
    // Toasts are side effects (they schedule their own removal), so they go
    // through pushNotification after the state update rather than inside it.
    if (msg.type === 'achievementChanged') {
      get().pushNotification(achievementMessage(get().game, msg));
      return;
    }
    if (msg.type === 'error') {
      get().pushNotification(msg.message || 'Unknown error');
      return;
    }
    set(asDraft((d) => {
      switch (msg.type) {
        case 'gameState':
          d.game = msg.state;
          return;
        case 'diceRolled':
          // Server sends { roll: { die1, die2, total }, playerId }.
          d.lastRoll = {
            total: msg.roll?.total ?? null,
            die1: msg.roll?.die1 ?? null,
            die2: msg.roll?.die2 ?? null,
            playerId: msg.playerId,
          };
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

        case 'chatMessage':
          d.chatMessages.push(msg);
          if (d.chatMessages.length > 200) d.chatMessages.splice(0, d.chatMessages.length - 200);
          return;

        // Events handled purely via the gameState tick that accompanies them.
        // Trade events included: the Board reads `game.tradeOffer` directly.
        case 'playerJoined':
        case 'playerDisconnected':
        case 'playerReconnected':
        case 'gameStarted':
        case 'boardShuffled':
        case 'settlementPlaced':
        case 'roadPlaced':
        case 'cityBuilt':
        case 'devCardPlayed':
        case 'tradeProposed':
        case 'tradeAccepted':
        case 'tradeDeclined':
        case 'tradeCancelled':
        case 'specialBuildingPhaseStarted':
        case 'specialBuildingPhaseEnded':
        case 'specialBuildNext':
        case 'turnEnded':
          return;

        default:
          if (import.meta.env.DEV) {
            console.warn('[gameStore] unhandled server message type:', msg.type, msg);
          }
      }
    }));
  },
}));

/**
 * Toast text for a longest-road / largest-army handoff. Pure, so it can be
 * unit-tested; `game` may be null before the first snapshot.
 */
export function achievementMessage(game, msg) {
  const kindLabel = msg.kind === 'longestRoad' ? 'Longest Road' : 'Largest Army';
  const nameOf = (id) => game?.players?.find((p) => p.id === id)?.name;
  const newName = nameOf(msg.newHolderId);
  const prevName = nameOf(msg.previousHolderId);
  if (newName && prevName) return `${newName} took ${kindLabel} from ${prevName}`;
  if (newName) return `${newName} claims ${kindLabel}`;
  if (prevName) return `${prevName} lost ${kindLabel}`;
  return `${kindLabel} is contested`;
}
