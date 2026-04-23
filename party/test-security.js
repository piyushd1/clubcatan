import * as GameLogic from './gameLogic.js';
import crypto from 'crypto';

// In Node.js environment, we might need to mock or ensure crypto is available
// if it's not already on globalThis. But for Node 19+, it should be there.
// If it's not, we might need to add it for the tests.

if (!globalThis.crypto) {
    globalThis.crypto = crypto;
}

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function assert(condition, message) {
  if (condition) {
    log(`✓ ${message}`, 'green');
  } else {
    log(`✗ ${message}`, 'red');
    process.exit(1);
  }
}

async function testSecureRandom() {
    log('\nTesting Secure Randomness Implementation', 'cyan');

    const hostPlayer = { id: 'host', name: 'Host' };
    const game = GameLogic.createGame('test', hostPlayer);

    // We can't directly call secureRandom as it's not exported.
    // But we can call functions that use it.

    log('1. Testing dice rolls stay within range 1-6', 'magenta');
    for (let i = 0; i < 1000; i++) {
        game.turnPhase = 'roll';
        const result = GameLogic.rollDice(game, hostPlayer.id);
        assert(result.success, 'Dice roll successful');
        assert(result.roll.die1 >= 1 && result.roll.die1 <= 6, 'Die 1 in range');
        assert(result.roll.die2 >= 1 && result.roll.die2 <= 6, 'Die 2 in range');

        // Reset for next roll
        game.turnPhase = 'roll';
    }

    log('2. Testing board shuffling', 'magenta');
    const initialHexes = JSON.stringify(game.hexes);
    GameLogic.shuffleBoard(game);
    const shuffledHexes = JSON.stringify(game.hexes);
    // Note: there's a tiny chance it shuffles to the same state, but highly unlikely
    assert(initialHexes !== shuffledHexes, 'Board changed after shuffle');

    log('3. Testing stealing', 'magenta');
    const victim = { id: 'victim', name: 'Victim' };
    GameLogic.addPlayer(game, victim);
    game.players[1].resources = { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 1 };

    game.turnPhase = 'robber';
    // Move robber to a hex where victim has a building
    // For simplicity, just call moveRobber
    const hexKey = Object.keys(game.hexes)[0] === game.robber ? Object.keys(game.hexes)[1] : Object.keys(game.hexes)[0];

    const stolenResources = new Set();
    for(let i = 0; i < 100; i++) {
        // Reset resources
        game.players[0].resources = { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 };
        game.players[1].resources = { brick: 1, lumber: 1, wool: 1, grain: 1, ore: 1 };
        game.robber = '99,99'; // dummy
        game.turnPhase = 'robber';

        const result = GameLogic.moveRobber(game, hostPlayer.id, hexKey, victim.id);
        assert(result.success, 'Steal successful');
        if (result.stolenInfo) {
            stolenResources.add(result.stolenInfo.resource);
        }
    }
    assert(stolenResources.size > 1, 'Stealing is producing different resources');

    log('\nAll security verification tests passed!', 'green');
}

testSecureRandom().catch(err => {
    console.error(err);
    process.exit(1);
});
