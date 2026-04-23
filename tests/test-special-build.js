// Test suite for canSpecialBuild in the shared game engine.
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

/**
 * Five-player table is the only configuration where special building applies
 * (it's a 5-6 player expansion rule). The 4th argument to createGame enables
 * it explicitly.
 */
function createTestGame() {
  const hostPlayer = { id: 'p1', name: 'Alice' };
  const game = GameLogic.createGame('game-123', hostPlayer, true, true);
  GameLogic.addPlayer(game, { id: 'p2', name: 'Bob' });
  GameLogic.addPlayer(game, { id: 'p3', name: 'Charlie' });
  GameLogic.addPlayer(game, { id: 'p4', name: 'Diana' });
  GameLogic.addPlayer(game, { id: 'p5', name: 'Eve' });
  return game;
}

function testCanSpecialBuild() {
  logSection('TESTING canSpecialBuild');

  log('\n--- Scenario: Special Building Phase is inactive ---', 'magenta');
  {
    const game = createTestGame();
    game.specialBuildingPhase = false;
    assert(GameLogic.canSpecialBuild(game, 'p1') === false, 'Returns false for p1 when phase is inactive');
    assert(GameLogic.canSpecialBuild(game, 'p2') === false, 'Returns false for p2 when phase is inactive');
  }

  log('\n--- Scenario: Special Building Phase is active ---', 'magenta');
  {
    const game = createTestGame();
    game.specialBuildingPhase = true;
    game.specialBuildIndex = 1; // Bob's turn
    assert(GameLogic.canSpecialBuild(game, 'p1') === false, 'Alice (index 0) cannot build when it is Bob\'s turn');
    assert(GameLogic.canSpecialBuild(game, 'p2') === true, 'Bob (index 1) can build when it is his turn');
    assert(GameLogic.canSpecialBuild(game, 'p3') === false, 'Charlie (index 2) cannot build when it is Bob\'s turn');
  }

  log('\n--- Scenario: Non-existent player ---', 'magenta');
  {
    const game = createTestGame();
    game.specialBuildingPhase = true;
    game.specialBuildIndex = 0;
    assert(GameLogic.canSpecialBuild(game, 'non-existent') === false, 'Returns false for non-existent player ID');
  }

  log('\n--- Scenario: Player ID is null / undefined ---', 'magenta');
  {
    const game = createTestGame();
    game.specialBuildingPhase = true;
    game.specialBuildIndex = 0;
    assert(GameLogic.canSpecialBuild(game, null) === false, 'Returns false for null player ID');
    assert(GameLogic.canSpecialBuild(game, undefined) === false, 'Returns false for undefined player ID');
  }
}

async function runTests() {
  try {
    testCanSpecialBuild();
  } catch (error) {
    log(`\nTest Error: ${error.message}`, 'red');
    console.error(error.stack);
  }

  console.log('\n' + '═'.repeat(70));
  log('  TEST SUMMARY', 'cyan');
  console.log('═'.repeat(70));
  log(`\n  ✓ Tests Passed: ${passed}`, 'green');
  log(`  ✗ Tests Failed: ${failed}`, failed > 0 ? 'red' : 'green');

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
