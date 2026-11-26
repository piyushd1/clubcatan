/**
 * Server-authority suite.
 *
 * The engine runs behind a public WebSocket and must not trust anything a
 * client sends: who is acting, which phase it claims to be in, or the shape of
 * its payload. Each scenario below was a confirmed hole in the 2026-11-26 audit
 * (docs/audit/2026-11-26-audit.md, finding C2) and must now be rejected with
 * the game left untouched.
 */
import * as GameLogic from '../shared/gameLogic.js';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

let passed = 0;
let failed = 0;

function log(msg, color = 'reset') {
  console.log(`${COLORS[color]}${msg}${COLORS.reset}`);
}

function assert(condition, message) {
  if (condition) {
    log(`  ✓ ${message}`, 'green');
    passed++;
  } else {
    log(`  ✗ ${message}`, 'red');
    failed++;
  }
}

function logSection(title) {
  console.log('\n' + '═'.repeat(70));
  log(`  ${title}`, 'cyan');
  console.log('═'.repeat(70));
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Three players in the lobby. */
function lobbyGame() {
  const game = GameLogic.createGame('ROOM', { id: 'A', name: 'Alice' });
  GameLogic.addPlayer(game, { id: 'B', name: 'Bob' });
  GameLogic.addPlayer(game, { id: 'C', name: 'Cara' });
  return game;
}

/** Started game in setup; players have been shuffled, so look them up by index. */
function setupGame() {
  const game = lobbyGame();
  GameLogic.startGame(game);
  return game;
}

const current = (game) => game.players[game.currentPlayerIndex];
const other = (game, offset = 1) => game.players[(game.currentPlayerIndex + offset) % game.players.length];
const total = (player) => Object.values(player.resources).reduce((a, b) => a + b, 0);
const snapshot = (game) => JSON.stringify(game);

/** A vertex where `playerId` could legally put a setup settlement. */
function freeSetupVertex(game, playerId) {
  return Object.keys(game.vertices).find((k) => GameLogic.canPlaceSettlement(game, playerId, k, true).valid);
}

/**
 * Jump straight to the main game by faking the setup outcome. Gives the
 * current player a settlement at `v` so road-connectivity checks have an anchor.
 */
function playingGame({ turnPhase = 'main' } = {}) {
  const game = setupGame();
  const me = current(game);
  const v = freeSetupVertex(game, me.id);
  game.vertices[v] = { building: 'settlement', owner: game.currentPlayerIndex };
  me.settlements--;
  me.victoryPoints++;
  game.phase = 'playing';
  game.setupTurn = null;
  game.turnPhase = turnPhase;
  game.hasRolledThisTurn = turnPhase !== 'roll';
  return { game, me, anchor: v };
}

/** Any hex key other than where the robber stands. */
const otherHex = (game) => Object.keys(game.hexes).find((k) => k !== game.robber);

// ---------------------------------------------------------------------------
// 1. Phase guards
// ---------------------------------------------------------------------------

function testPhaseGuards() {
  logSection('1. PHASE GUARDS — lobby and finished games accept no actions');

  log('\n--- Hole 1: rollDice in the lobby ---', 'magenta');
  {
    const game = lobbyGame();
    const before = snapshot(game);
    const r = GameLogic.rollDice(game, 'A');
    assert(!r.success, `rollDice rejected in waiting phase (${r.error})`);
    assert(snapshot(game) === before, 'lobby state untouched');
  }

  log('\n--- rollDice during setup ---', 'magenta');
  {
    const game = setupGame();
    const r = GameLogic.rollDice(game, current(game).id);
    assert(!r.success, `rollDice rejected during setup (${r.error})`);
    assert(game.turnPhase === 'roll' && game.diceRoll === null, 'no dice recorded');
  }

  log('\n--- startGame on an already-started game (would reshuffle seats mid-game) ---', 'magenta');
  {
    const game = setupGame();
    const order = game.players.map((p) => p.id).join(',');
    const r = GameLogic.startGame(game);
    assert(!r.success && r.error === 'Game already started', 'second startGame rejected');
    assert(game.players.map((p) => p.id).join(',') === order, 'seat order unchanged');
    assert(game.hostId === 'A', 'hostId is the creator regardless of seat shuffle');
  }

  log('\n--- Hole 10: every action rejected after the game is finished ---', 'magenta');
  {
    const { game, me, anchor } = playingGame();
    game.phase = 'finished';
    game.winner = me.id;
    const before = snapshot(game);
    const attempts = {
      rollDice: GameLogic.rollDice(game, me.id),
      placeSettlement: GameLogic.placeSettlement(game, me.id, freeSetupVertex(game, me.id)),
      placeRoad: GameLogic.placeRoad(game, me.id, GameLogic.getVertexEdges(anchor)[0]),
      upgradeToCity: GameLogic.upgradeToCity(game, me.id, anchor),
      buyDevCard: GameLogic.buyDevCard(game, me.id),
      playDevCard: GameLogic.playDevCard(game, me.id, 'knight'),
      yearOfPlentyPick: GameLogic.yearOfPlentyPick(game, me.id, 'ore'),
      bankTrade: GameLogic.bankTrade(game, me.id, 'brick', 4, 'ore'),
      proposeTrade: GameLogic.proposeTrade(game, me.id, { brick: 1 }, { ore: 1 }),
      respondToTrade: GameLogic.respondToTrade(game, other(game).id, true),
      cancelTrade: GameLogic.cancelTrade(game, me.id),
      endTurn: GameLogic.endTurn(game, me.id),
      moveRobber: GameLogic.moveRobber(game, me.id, otherHex(game)),
      discardCards: GameLogic.discardCards(game, me.id, {}),
      endSpecialBuild: GameLogic.endSpecialBuild(game, me.id),
    };
    for (const [name, r] of Object.entries(attempts)) {
      assert(!r.success && r.error === 'Game is over', `${name} rejected after finish`);
    }
    assert(snapshot(game) === before, 'finished game untouched');
  }
}

// ---------------------------------------------------------------------------
// 2. Turn ownership
// ---------------------------------------------------------------------------

function testTurnOwnership() {
  logSection('2. TURN OWNERSHIP — only the current player (or special builder) may build');

  log('\n--- Hole 2: out-of-turn settlement during setup ---', 'magenta');
  {
    const game = setupGame();
    const intruder = other(game);
    let placed = 0;
    for (const k of Object.keys(game.vertices)) {
      if (GameLogic.placeSettlement(game, intruder.id, k).success) placed++;
    }
    assert(placed === 0, 'non-current player placed zero settlements during setup');
    assert(intruder.victoryPoints === 0 && intruder.settlements === 5, 'intruder gained nothing');
  }

  log('\n--- Hole 2b: a second settlement in the same setup turn ---', 'magenta');
  {
    const game = setupGame();
    const me = current(game);
    const v1 = freeSetupVertex(game, me.id);
    assert(GameLogic.placeSettlement(game, me.id, v1).success, 'first setup settlement accepted');
    assert(game.setupTurn.settlement === v1, 'setupTurn records the settlement');
    const v2 = freeSetupVertex(game, me.id);
    const r = GameLogic.placeSettlement(game, me.id, v2);
    assert(!r.success, `second settlement in the same setup turn rejected (${r.error})`);
    assert(me.victoryPoints === 1, 'still exactly 1 VP');
  }

  log('\n--- Hole 2c: out-of-turn paid settlement in the main game ---', 'magenta');
  {
    const { game } = playingGame();
    const intruder = other(game);
    const iIdx = game.players.indexOf(intruder);
    const v = freeSetupVertex(game, intruder.id);
    // Give them a road into v so only the turn check can fail.
    game.edges[GameLogic.getVertexEdges(v)[0]] = { road: true, owner: iIdx };
    Object.assign(intruder.resources, { brick: 1, lumber: 1, wool: 1, grain: 1 });
    const r = GameLogic.placeSettlement(game, intruder.id, v);
    assert(!r.success && r.error === 'Cannot build now', 'out-of-turn settlement rejected');
    assert(total(intruder) === 4, 'resources not deducted');
  }

  log('\n--- Hole 4: out-of-turn / pre-roll road in the main game ---', 'magenta');
  {
    const { game } = playingGame({ turnPhase: 'roll' });
    const intruder = other(game);
    const iIdx = game.players.indexOf(intruder);
    const v = freeSetupVertex(game, intruder.id);
    game.vertices[v] = { building: 'settlement', owner: iIdx };
    Object.assign(intruder.resources, { brick: 1, lumber: 1 });
    const r1 = GameLogic.placeRoad(game, intruder.id, GameLogic.getVertexEdges(v)[0]);
    assert(!r1.success && r1.error === 'Cannot build now', 'out-of-turn road rejected');

    // Current player, but before rolling: also not allowed.
    const me = current(game);
    const mine = Object.entries(game.vertices).find(([, x]) => x.owner === game.currentPlayerIndex)[0];
    Object.assign(me.resources, { brick: 1, lumber: 1 });
    const r2 = GameLogic.placeRoad(game, me.id, GameLogic.getVertexEdges(mine)[0]);
    assert(!r2.success && r2.error === 'Cannot build now', 'own road before rolling rejected');
    assert(me.resources.brick === 1 && me.resources.lumber === 1, 'resources not deducted');
  }

  log('\n--- Hole 12: dev card during discard / robber phase ---', 'magenta');
  {
    for (const phase of ['discard', 'robber']) {
      const { game, me } = playingGame({ turnPhase: phase });
      me.developmentCards.push('knight');
      const r = GameLogic.playDevCard(game, me.id, 'knight');
      assert(!r.success && r.error === 'Cannot play a card now', `knight rejected during ${phase}`);
      assert(me.developmentCards.includes('knight'), 'card not consumed');
    }
    // Knight BEFORE rolling is legal Catan and must still work.
    const { game, me } = playingGame({ turnPhase: 'roll' });
    me.developmentCards.push('knight');
    const r = GameLogic.playDevCard(game, me.id, 'knight');
    assert(r.success && game.turnPhase === 'robber', 'knight before the roll still allowed');
  }
}

// ---------------------------------------------------------------------------
// 3. Setup integrity (holes 3 and 11)
// ---------------------------------------------------------------------------

function testSetupIntegrity() {
  logSection('3. SETUP INTEGRITY — server tracks the setup turn; no client flags');

  log('\n--- Hole 3: a "free" setup road during the main game ---', 'magenta');
  {
    const { game, me, anchor } = playingGame();
    const edge = GameLogic.getVertexEdges(anchor)[0];
    me.resources.brick = 0;
    me.resources.lumber = 0;
    // The old signature accepted (…, isSetup=true, lastSettlement); extra args
    // are now ignored and the engine derives phase itself.
    const r = GameLogic.placeRoad(game, me.id, edge, true, anchor);
    assert(!r.success && r.error === 'Not enough resources', 'unpaid road in main game rejected');
    assert(me.roads === 15, 'no road placed');
  }

  log('\n--- Hole 11: setup advances only after settlement + road ---', 'magenta');
  {
    const game = setupGame();
    const first = current(game);
    const firstIdx = game.currentPlayerIndex;
    const second = other(game);

    // Road before settlement: rejected.
    const anyEdge = Object.keys(game.edges)[0];
    const r0 = GameLogic.placeRoad(game, first.id, anyEdge);
    assert(!r0.success && r0.error === 'Place your settlement first', 'road before settlement rejected');

    const v = freeSetupVertex(game, first.id);
    assert(GameLogic.placeSettlement(game, first.id, v).success, 'settlement placed');
    assert(game.currentPlayerIndex === firstIdx, 'turn has NOT advanced after settlement alone');

    // Second player still cannot act.
    const r1 = GameLogic.placeSettlement(game, second.id, freeSetupVertex(game, second.id));
    assert(!r1.success && r1.error === 'Not your turn', 'next player blocked until road lands');

    // Road that does not touch the new settlement: rejected.
    const far = Object.keys(game.edges).find((e) => !GameLogic.getVertexEdges(v).some((ve) => e === ve));
    const r2 = GameLogic.placeRoad(game, first.id, far);
    assert(!r2.success && r2.error === 'Road must connect to your new settlement', 'disconnected setup road rejected');

    // Correct road: accepted, and the turn advances automatically.
    const edge = GameLogic.getVertexEdges(v).find((e) => game.edges[e]);
    const r3 = GameLogic.placeRoad(game, first.id, edge);
    assert(r3.success, 'connected setup road accepted');
    assert(game.currentPlayerIndex !== firstIdx, 'turn advanced to the next player automatically');
    assert(game.setupTurn.settlement === null && game.setupTurn.road === null, 'fresh setupTurn for next player');

    // Previous player is now locked out.
    const r4 = GameLogic.placeRoad(game, first.id, GameLogic.getVertexEdges(v).find((e) => game.edges[e] && !game.edges[e].road));
    assert(!r4.success && r4.error === 'Not your turn', 'previous player cannot place a second road');
  }

  log('\n--- Full snake-order setup finishes in playing/roll with setupTurn cleared ---', 'magenta');
  {
    const game = setupGame();
    let turns = 0;
    while (game.phase === 'setup' && turns < 20) {
      const me = current(game);
      const v = freeSetupVertex(game, me.id);
      GameLogic.placeSettlement(game, me.id, v);
      const e = GameLogic.getVertexEdges(v).find((k) => game.edges[k] && !game.edges[k].road);
      GameLogic.placeRoad(game, me.id, e);
      turns++;
    }
    assert(turns === 6, `3 players × 2 rounds = 6 setup turns (got ${turns})`);
    assert(game.phase === 'playing' && game.turnPhase === 'roll', 'game is in playing/roll');
    assert(game.setupTurn === null, 'setupTurn cleared after setup');
    assert(game.players.every((p) => p.settlements === 3 && p.roads === 13), 'everyone has 2 settlements + 2 roads');
    assert(game.players.every((p) => total(p) > 0), 'second settlement paid out starting resources');
  }
}

// ---------------------------------------------------------------------------
// 4. Payload validation (holes 5, 6, 7, 8, 13)
// ---------------------------------------------------------------------------

function testPayloadValidation() {
  logSection('4. PAYLOAD VALIDATION — negative amounts and unknown keys');

  log('\n--- Hole 5: negative discard ---', 'magenta');
  {
    const { game, me } = playingGame({ turnPhase: 'discard' });
    me.resources = { brick: 8, lumber: 0, wool: 0, grain: 0, ore: 0 };
    game.discardingPlayers = [{ playerIndex: game.currentPlayerIndex, cardsToDiscard: 4 }];
    const r = GameLogic.discardCards(game, me.id, { brick: 5, lumber: -1 });
    assert(!r.success && r.error === 'Invalid amount for lumber', 'negative discard rejected');
    assert(me.resources.lumber === 0 && me.resources.brick === 8, 'hand untouched');
    const r2 = GameLogic.discardCards(game, me.id, { brick: 2, gold: 2 });
    assert(!r2.success && r2.error === 'Invalid resource: gold', 'unknown key in discard rejected');
    const r3 = GameLogic.discardCards(game, me.id, { brick: 4 });
    assert(r3.success && me.resources.brick === 4, 'valid discard still works');
  }

  log('\n--- discardCards outside the discard phase ---', 'magenta');
  {
    const { game, me } = playingGame();
    game.discardingPlayers = [{ playerIndex: game.currentPlayerIndex, cardsToDiscard: 1 }];
    me.resources.brick = 2;
    const r = GameLogic.discardCards(game, me.id, { brick: 1 });
    assert(!r.success && r.error === 'No discard in progress', 'discard rejected when turnPhase is not discard');
  }

  log('\n--- Hole 6a: negative trade offer ---', 'magenta');
  {
    const { game, me } = playingGame();
    const victim = other(game);
    victim.resources.ore = 1;
    const r = GameLogic.proposeTrade(game, me.id, { brick: -3 }, { ore: 1 });
    assert(!r.success && r.error === 'Invalid amount for brick', 'negative offer rejected');
    assert(game.tradeOffer === null, 'no offer recorded');
    const r2 = GameLogic.proposeTrade(game, me.id, {}, {});
    assert(!r2.success, `empty trade rejected (${r2.error})`);
    const r3 = GameLogic.proposeTrade(game, me.id, { brick: 1 }, { gold: 1 });
    assert(!r3.success && r3.error === 'Invalid resource: gold', 'unknown key in request rejected');
  }

  log('\n--- Hole 6b: accept after the offerer spent the goods ---', 'magenta');
  {
    const { game, me } = playingGame();
    const partner = other(game);
    // The anchor settlement may sit on a port; ask the engine for the ratio.
    const ratio = GameLogic.getTradeRatio(game, game.currentPlayerIndex, 'brick');
    me.resources.brick = ratio;
    partner.resources.ore = 1;
    assert(GameLogic.proposeTrade(game, me.id, { brick: ratio }, { ore: 1 }).success, `offer ${ratio} brick for 1 ore`);
    assert(GameLogic.bankTrade(game, me.id, 'brick', ratio, 'wool').success, 'offerer spends the brick at the bank');
    const r = GameLogic.respondToTrade(game, partner.id, true);
    assert(!r.success && r.error === 'Offer no longer valid', 'stale accept rejected');
    assert(me.resources.brick === 0 && partner.resources.ore === 1, 'nobody went negative, nothing moved');
    assert(game.tradeOffer === null, 'stale offer cleared');
  }

  log('\n--- Hole 7: Year of Plenty with a bogus resource ---', 'magenta');
  {
    const { game, me } = playingGame();
    game.yearOfPlentyPicks = 2;
    const r = GameLogic.yearOfPlentyPick(game, me.id, 'gold');
    assert(!r.success && r.error === 'Invalid resource: gold', 'bogus pick rejected');
    assert(!('gold' in me.resources) && !Number.isNaN(total(me)), 'resource map not polluted');
    assert(game.yearOfPlentyPicks === 2, 'pick not consumed');
    assert(GameLogic.yearOfPlentyPick(game, me.id, 'ore').success && me.resources.ore === 1, 'valid pick works');
  }

  log('\n--- Hole 8: Monopoly with a bogus resource keeps the card ---', 'magenta');
  {
    const { game, me } = playingGame();
    me.developmentCards.push('monopoly');
    const r = GameLogic.playDevCard(game, me.id, 'monopoly', { resource: 'gold' });
    assert(!r.success && r.error === 'Must specify a valid resource', 'bogus monopoly rejected');
    assert(me.developmentCards.includes('monopoly'), 'card NOT consumed');
    assert(!game.devCardPlayedThisTurn, 'turn flag untouched');
    const r2 = GameLogic.playDevCard(game, me.id, 'monopoly', {});
    assert(!r2.success, 'monopoly with no resource rejected');
    other(game).resources.ore = 3;
    assert(GameLogic.playDevCard(game, me.id, 'monopoly', { resource: 'ore' }).success && me.resources.ore === 3, 'valid monopoly works');
  }

  log('\n--- Hole 13: bank trade with bogus resources ---', 'magenta');
  {
    const { game, me } = playingGame();
    const ratio = GameLogic.getTradeRatio(game, game.currentPlayerIndex, 'brick');
    me.resources.brick = ratio;
    const r = GameLogic.bankTrade(game, me.id, 'brick', ratio, 'gold');
    assert(!r.success && r.error === 'Invalid resource', 'bogus getResource rejected');
    assert(!('gold' in me.resources) && me.resources.brick === ratio, 'nothing changed');
    const r2 = GameLogic.bankTrade(game, me.id, 'brick', -ratio, 'ore');
    assert(!r2.success && r2.error === 'Invalid amount', 'negative give amount rejected');
    const r3 = GameLogic.bankTrade(game, me.id, 'brick', ratio, 'brick');
    assert(!r3.success, 'same-resource trade rejected');
    assert(GameLogic.bankTrade(game, me.id, 'brick', ratio, 'ore').success && me.resources.ore === 1, `valid ${ratio}:1 works`);
  }
}

// ---------------------------------------------------------------------------
// 5. Robber (hole 9 + per-card steal)
// ---------------------------------------------------------------------------

function testRobber() {
  logSection('5. ROBBER — steal only from players on the hex, one random card');

  log('\n--- Hole 9: steal from a player with no building on the hex ---', 'magenta');
  {
    const { game, me } = playingGame({ turnPhase: 'robber' });
    const victim = other(game);
    victim.resources.ore = 1;
    const target = otherHex(game);
    const before = game.robber;
    const r = GameLogic.moveRobber(game, me.id, target, victim.id);
    assert(!r.success && r.error === 'That player has no building on this hex', 'steal rejected');
    assert(game.robber === before, 'robber did not move on a rejected steal');
    assert(victim.resources.ore === 1 && me.resources.ore === 0, 'nothing stolen');
  }

  log('\n--- Steal from yourself / unknown player ---', 'magenta');
  {
    const { game, me } = playingGame({ turnPhase: 'robber' });
    const r = GameLogic.moveRobber(game, me.id, otherHex(game), me.id);
    assert(!r.success && r.error === 'Invalid steal target', 'self-steal rejected');
    const r2 = GameLogic.moveRobber(game, me.id, otherHex(game), 'ghost');
    assert(!r2.success && r2.error === 'Invalid steal target', 'unknown victim rejected');
  }

  log('\n--- Legitimate steal from a player on the hex ---', 'magenta');
  {
    const { game, me } = playingGame({ turnPhase: 'robber' });
    const victim = other(game);
    const vIdx = game.players.indexOf(victim);
    const target = otherHex(game);
    const hex = game.hexes[target];
    game.vertices[`v_${hex.q}_${hex.r}_0`] = { building: 'settlement', owner: vIdx };
    victim.resources.wool = 2;
    const r = GameLogic.moveRobber(game, me.id, target, victim.id);
    assert(r.success && r.stolenInfo?.resource === 'wool', 'steal succeeds against a player on the hex');
    assert(victim.resources.wool === 1 && me.resources.wool === 1, 'one card moved');
    assert(game.turnPhase === 'main', 'turn continues after robber (had rolled)');
  }

  log('\n--- Per-card steal distribution (victim: 9 wool + 1 ore, 4000 trials) ---', 'magenta');
  {
    const N = 4000;
    let ore = 0;
    for (let i = 0; i < N; i++) {
      const { game, me } = playingGame({ turnPhase: 'robber' });
      const victim = other(game);
      const vIdx = game.players.indexOf(victim);
      const target = otherHex(game);
      const hex = game.hexes[target];
      game.vertices[`v_${hex.q}_${hex.r}_0`] = { building: 'settlement', owner: vIdx };
      victim.resources = { brick: 0, lumber: 0, wool: 9, grain: 0, ore: 1 };
      const r = GameLogic.moveRobber(game, me.id, target, victim.id);
      if (r.stolenInfo?.resource === 'ore') ore++;
    }
    const pct = (100 * ore) / N;
    assert(Math.abs(pct - 10) <= 3, `ore stolen ${pct.toFixed(1)}% of the time (rules: 10%, tolerance ±3)`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
  testPhaseGuards();
  testTurnOwnership();
  testSetupIntegrity();
  testPayloadValidation();
  testRobber();
} catch (err) {
  log(`\nTest error: ${err.stack}`, 'red');
  failed++;
}

console.log('\n' + '═'.repeat(70));
log('  TEST SUMMARY', 'cyan');
console.log('═'.repeat(70));
log(`\n  ✓ Tests Passed: ${passed}`, 'green');
log(`  ✗ Tests Failed: ${failed}`, failed > 0 ? 'red' : 'green');
console.log('');
process.exit(failed > 0 ? 1 : 0);
