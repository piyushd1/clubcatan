/**
 * Unit tests for the pure UI helpers in client/src/lib/game-ui.js.
 * Run: node client/test-ui-helpers.js
 */
import {
  FACTIONS,
  FACTION_BG,
  factionForSeat,
  factionBgForSeat,
  findWinner,
  shouldShowTradeDialog,
} from './src/lib/game-ui.js';

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.log(`  ✗ ${msg}`); }
}

console.log('\nfactionForSeat / factionBgForSeat');
assert(FACTIONS.length === 6, 'six factions defined');
assert(FACTIONS.every((f) => FACTION_BG[f]?.startsWith('bg-faction-')), 'every faction has a Tailwind bg class');
assert(factionForSeat(0) === 'red' && factionForSeat(3) === 'green', 'first four seats keep their original colours');
assert(factionForSeat(4) === 'purple' && factionForSeat(5) === 'teal', 'seats 5 and 6 get distinct colours (not red)');
assert(factionForSeat(4) !== factionForSeat(0), 'seat 5 is no longer a duplicate of seat 1');
assert(factionForSeat(undefined) === 'red' && factionForSeat(-1) === 'red' && factionForSeat('x') === 'red', 'bad seat falls back to the first faction');
assert(factionForSeat(6) === 'red', 'seats beyond six wrap instead of crashing');
assert(factionBgForSeat(5) === 'bg-faction-teal', 'bg class for seat 6');

console.log('\nfindWinner');
const players = [
  { id: 'uuid-a', name: 'Alice', victoryPoints: 10 },
  { id: 'uuid-b', name: 'Bob', victoryPoints: 7 },
];
assert(findWinner(players, 'uuid-b')?.name === 'Bob', 'finds the winner by id');
assert(findWinner(players, 'uuid-a')?.name === 'Alice', 'finds the host too');
assert(findWinner(players, null) === null, 'null winner id → null');
assert(findWinner(players, undefined) === null, 'undefined winner id → null');
assert(findWinner(players, 'uuid-zzz') === null, 'unknown id → null');
assert(findWinner(null, 'uuid-a') === null, 'no players → null');
assert(players[players.findIndex((p) => p.id === 'uuid-b')] !== players['uuid-b'], 'regression: indexing players[uuid] is undefined (the old bug)');

console.log('\nshouldShowTradeDialog');
const offer = { from: 0, offer: { brick: 1 }, request: { ore: 1 }, responses: {} };
assert(shouldShowTradeDialog(offer, 1, 'uuid-b') === true, 'other player sees a fresh offer');
assert(shouldShowTradeDialog(offer, 0, 'uuid-a') === false, 'offerer does not see their own offer');
assert(shouldShowTradeDialog(null, 1, 'uuid-b') === false, 'no offer → hidden');
assert(shouldShowTradeDialog(offer, -1, null) === false, 'spectator (myIndex -1) never sees it');
const declined = { ...offer, responses: { 'uuid-b': 'decline' } };
assert(shouldShowTradeDialog(declined, 1, 'uuid-b') === false, 'player who declined no longer sees it');
assert(shouldShowTradeDialog(declined, 2, 'uuid-c') === true, 'other players still see it after one decline');
assert(shouldShowTradeDialog({ ...offer, responses: undefined }, 1, 'uuid-b') === true, 'missing responses map is tolerated');

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
