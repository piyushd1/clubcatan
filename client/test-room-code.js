import { generateRoomCode, isValidRoomCode } from './src/lib/room-code.js';

function logSuccess(msg) { console.log(`\x1b[32m✅ ${msg}\x1b[0m`); }
function logError(msg) { console.error(`\x1b[31m❌ ${msg}\x1b[0m`); }
function logInfo(msg) { console.log(`\x1b[36mℹ️ ${msg}\x1b[0m`); }
function logSection(msg) { console.log(`\n\x1b[35m=== ${msg} ===\x1b[0m`); }

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    logSuccess(message);
    passed++;
  } else {
    logError(message);
    failed++;
  }
}

async function runTests() {
  logSection('1. generateRoomCode');

  const code1 = generateRoomCode();
  assert(typeof code1 === 'string', 'Generated code should be a string');
  assert(code1.length === 6, 'Generated code should be 6 characters long by default');

  const code2 = generateRoomCode(8);
  assert(code2.length === 8, 'Generated code should be 8 characters long when specified');

  // Check that the generated code only contains characters from the valid alphabet
  const alphabetRegex = /^[A-HJ-KM-NP-RT-Z2-46-9]+$/;
  assert(alphabetRegex.test(code1), 'Generated code should only contain characters from the valid alphabet');

  // Test randomness (very loosely)
  const code3 = generateRoomCode();
  assert(code1 !== code3, 'Two generated codes should generally not be identical');

  logSection('2. isValidRoomCode');

  // Valid codes
  assert(isValidRoomCode('ABCDEF'), 'ABCDEF should be valid');
  assert(isValidRoomCode('234678'), '234678 should be valid (no 5)');
  assert(isValidRoomCode('ABCD'), '4 character code should be valid');
  assert(isValidRoomCode('ABCDEFGH'), '8 character code should be valid');

  // Characters specifically included/excluded
  assert(isValidRoomCode('MNPQRT'), 'Codes containing M, N, P, Q, R, T should be valid');
  assert(!isValidRoomCode('ABCDE0'), 'Codes containing 0 should be invalid');
  assert(!isValidRoomCode('ABCDEO'), 'Codes containing O should be invalid');
  assert(!isValidRoomCode('ABCDE1'), 'Codes containing 1 should be invalid');
  assert(!isValidRoomCode('ABCDEI'), 'Codes containing I should be invalid');
  assert(!isValidRoomCode('ABCDEL'), 'Codes containing L should be invalid');
  assert(!isValidRoomCode('ABCDE5'), 'Codes containing 5 should be invalid');
  assert(!isValidRoomCode('ABCDES'), 'Codes containing S should be invalid');

  // Invalid lengths
  assert(!isValidRoomCode('ABC'), 'Codes less than 4 chars should be invalid');
  assert(!isValidRoomCode('ABCDEFGHI'), 'Codes more than 8 chars should be invalid');

  // Invalid formatting
  assert(!isValidRoomCode('abcdef'), 'Lowercase codes should be invalid');
  assert(!isValidRoomCode('ABC-DEF'), 'Codes with special characters should be invalid');
  assert(!isValidRoomCode('ABC DEF'), 'Codes with spaces should be invalid');

  // Invalid types
  assert(!isValidRoomCode(null), 'null should be invalid');
  assert(!isValidRoomCode(undefined), 'undefined should be invalid');
  assert(!isValidRoomCode(123456), 'numbers should be invalid');
  assert(!isValidRoomCode({}), 'objects should be invalid');
  assert(!isValidRoomCode(['A','B','C','D','E','F']), 'arrays should be invalid');

  logSection('TEST SUMMARY');

  console.log(`\nTests Passed: ${passed}`);
  if (failed > 0) {
    console.log(`Tests Failed: ${failed}`);
    process.exit(1);
  } else {
    console.log('All tests passed!');
  }
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
