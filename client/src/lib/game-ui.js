/**
 * Pure helpers shared by the game screens. No React, no DOM — so they can be
 * unit-tested with plain Node (see client/test-ui-helpers.js).
 */

/**
 * Six seat colours, in seat order. Must match FACTION_COLORS in
 * components/board/HexBoard.jsx and the `faction.*` palette in
 * tailwind.config.js so pips, cards and board pieces agree for 5–6 players.
 */
export const FACTIONS = ['red', 'blue', 'gold', 'green', 'purple', 'teal'];

/**
 * Tailwind background classes per faction. Spelled out as literals (not
 * template strings) so Tailwind's content scanner keeps them in the CSS.
 */
export const FACTION_BG = {
  red: 'bg-faction-red',
  blue: 'bg-faction-blue',
  gold: 'bg-faction-gold',
  green: 'bg-faction-green',
  purple: 'bg-faction-purple',
  teal: 'bg-faction-teal',
};

/** Faction name for a seat index; wraps rather than falling back to red. */
export function factionForSeat(seat) {
  const n = Number.isInteger(seat) && seat >= 0 ? seat : 0;
  return FACTIONS[n % FACTIONS.length];
}

/** Tailwind bg class for a seat index. */
export function factionBgForSeat(seat) {
  return FACTION_BG[factionForSeat(seat)];
}

/**
 * The winning player object, or null. `game.winner` is the winner's player
 * ID (a UUID), not an index — indexing `players[winner]` silently yields
 * undefined, which is why the game-over screen never named anyone.
 */
export function findWinner(players, winnerId) {
  if (!winnerId || !Array.isArray(players)) return null;
  return players.find((p) => p.id === winnerId) ?? null;
}

/**
 * Should this player see the incoming-trade dialog?
 *   - there must be an offer
 *   - it must not be their own
 *   - they must not have already declined it (the offer stays open for the
 *     others until everyone declines or the offerer cancels)
 */
export function shouldShowTradeDialog(tradeOffer, myIndex, playerId) {
  if (!tradeOffer) return false;
  if (myIndex < 0 || tradeOffer.from === myIndex) return false;
  if (playerId && tradeOffer.responses?.[playerId] === 'decline') return false;
  return true;
}
