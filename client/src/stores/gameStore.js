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

export const useGameStore = create((set) => ({
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
  applyServerMessage: (msg) => set(asDraft((d) => {
    switch (msg.type) {
      case 'gameState':
        d.game = msg.state;
        return;

      case 'achievementChanged': {
        // Broadcast when longest road / largest army changes hands. Renders
        // as a self-dismissing toast so every player knows the VP shift.
        const kindLabel = msg.kind === 'longestRoad' ? 'Longest Road' : 'Largest Army';
        const newName = d.game?.players?.find((p) => p.id === msg.newHolderId)?.name;
        const prevName = d.game?.players?.find((p) => p.id === msg.previousHolderId)?.name;
        let message;
        if (newName && prevName) message = `${newName} took ${kindLabel} from ${prevName}`;
        else if (newName) message = `${newName} claims ${kindLabel}`;
        else if (prevName) message = `${prevName} lost ${kindLabel}`;
        else message = `${kindLabel} is contested`;
        const id = Date.now() + Math.random();
        d.notifications.push({ id, message });
        // Self-cleanup — the 4-second window matches pushNotification's default.
        setTimeout(() => {
          useGameStore.setState((s) =>
            mutate(s, (dd) => { dd.notifications = dd.notifications.filter((n) => n.id !== id); })
          );
        }, 4000);
        return;
      }

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
