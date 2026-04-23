import { generateRoomCode, isValidRoomCode } from '../client/src/lib/room-code.js';
import crypto from 'crypto';

// Setup crypto for node environment since it requires globalThis.crypto or window.crypto
if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto;
}

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'cyan');
  console.log('='.repeat(60));
}

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    log(`✓ ${message}`, 'green');
    testsPassed++;
  } else {
    log(`✗ ${message}`, 'red');
    testsFailed++;
  }
  return condition;
}

logSection('TESTING ROOM CODE GENERATOR');

// Test 1: generateRoomCode
log('\nTesting generateRoomCode:');
const defaultCode = generateRoomCode();
assert(typeof defaultCode === 'string', 'Returns a string');
assert(defaultCode.length === 6, 'Default length is 6');
assert(/^[A-Z2-9]+$/.test(defaultCode), 'Contains only uppercase letters and numbers');

const longCode = generateRoomCode(10);
assert(longCode.length === 10, 'Respects custom length');

// Test 2: isValidRoomCode
log('\nTesting isValidRoomCode:');
assert(isValidRoomCode('ABCDEF'), 'Validates 6-char alphabetical code');
assert(isValidRoomCode('234567'), 'Validates 6-char numerical code');
assert(isValidRoomCode('A2B3C4'), 'Validates 6-char alphanumeric code');
assert(isValidRoomCode('ABCD'), 'Validates minimum 4 chars');
assert(isValidRoomCode('ABCDEFGH'), 'Validates maximum 8 chars');

assert(!isValidRoomCode('ABC'), 'Rejects less than 4 chars');
assert(!isValidRoomCode('ABCDEFGHI'), 'Rejects more than 8 chars');
assert(!isValidRoomCode('abcdef'), 'Rejects lowercase letters');
assert(!isValidRoomCode('ABC01'), 'Rejects forbidden chars (0, 1)');
assert(!isValidRoomCode('ABCOI'), 'Rejects forbidden chars (O, I)');
assert(!isValidRoomCode('ABC!@#'), 'Rejects special characters');
assert(!isValidRoomCode(123456), 'Rejects non-string input');
assert(!isValidRoomCode(null), 'Rejects null');

logSection('TEST SUMMARY');
log(`\n  ✓ Tests Passed: ${testsPassed}`, 'green');
if (testsFailed > 0) {
  log(`  ✗ Tests Failed: ${testsFailed}`, 'red');
}
log(`\n  Pass Rate: ${(testsPassed / (testsPassed + testsFailed) * 100).toFixed(1)}%\n`, testsFailed === 0 ? 'green' : 'yellow');

process.exit(testsFailed > 0 ? 1 : 0);
