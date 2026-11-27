/**
 * Boundary validation suite for party/validate.js.
 *
 * Every message type the server accepts has a validator; these tests pin the
 * accept/reject behaviour of each so a change to the wire contract shows up
 * here before it reaches a phone.
 */
import { validate, VALIDATORS, LIMITS, cleanText } from '../party/validate.js';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
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

const ok = (type, payload) => validate(type, payload);
const accepts = (type, payload, label) => {
  const r = ok(type, payload);
  assert(r.ok, `${label}${r.ok ? '' : ` (${r.error})`}`);
  return r.payload;
};
const rejects = (type, payload, label, expectedError) => {
  const r = ok(type, payload);
  const matches = !r.ok && (expectedError === undefined || r.error === expectedError);
  assert(matches, `${label} → ${r.ok ? 'ACCEPTED (bug)' : r.error}`);
};

const UUID = '6f4a2d1e-3b9c-4f8a-9e2d-1c3b5a7d9f01';

// ---------------------------------------------------------------------------

logSection('COVERAGE — every server handler has a validator');
{
  // Keep in sync with HANDLERS in party/server.js.
  const handlers = [
    'createGame', 'joinGame', 'joinAsSpectator', 'reconnect',
    'startGame', 'shuffleBoard', 'rollDice', 'discardCards', 'moveRobber',
    'placeSettlement', 'placeRoad', 'upgradeToCity', 'buyDevCard', 'playDevCard',
    'yearOfPlentyPick', 'bankTrade', 'proposeTrade', 'respondToTrade', 'cancelTrade',
    'endTurn', 'endSpecialBuild', 'getPlayersOnHex', 'chatMessage',
  ];
  for (const h of handlers) assert(typeof VALIDATORS[h] === 'function', `validator exists for ${h}`);
  rejects('advanceSetup', {}, 'removed advanceSetup type is unknown', 'Unknown message type: advanceSetup');
  rejects('hackTheGibson', {}, 'unknown type rejected', 'Unknown message type: hackTheGibson');
}

logSection('TEXT — names and chat');
{
  log('\n--- cleanText ---', 'magenta');
  assert(cleanText('  Alice   Bob ') === 'Alice Bob', 'collapses and trims whitespace');
  assert(cleanText('Al\u0000ice\u200b') === 'Alice', 'strips control and zero-width chars');
  assert(cleanText('Al\u202eice') === 'Alice', 'strips bidi override');
  assert(cleanText('Zoë 🎲') === 'Zoë 🎲', 'keeps unicode letters and emoji');

  log('\n--- createGame / joinGame names ---', 'magenta');
  const p = accepts('createGame', { playerName: '  Alice ' }, 'trimmed name accepted');
  assert(p.playerName === 'Alice' && p.isExtended === false && p.enableSpecialBuild === true, 'defaults applied');
  rejects('createGame', {}, 'missing name rejected', 'Name is required');
  rejects('createGame', { playerName: '   ' }, 'blank name rejected', 'Name is required');
  rejects('createGame', { playerName: 'x'.repeat(LIMITS.NAME_MAX + 1) }, 'over-long name rejected');
  rejects('createGame', { playerName: 'x'.repeat(5000) }, '5 KB name rejected');
  rejects('createGame', { playerName: 42 }, 'non-string name rejected', 'Name is required');
  accepts('joinGame', { playerName: 'x'.repeat(LIMITS.NAME_MAX) }, 'name at the limit accepted');
  rejects('createGame', { playerName: 'A', isExtended: 'yes' }, 'string isExtended rejected');
  accepts('createGame', { playerName: 'A', isExtended: true, enableSpecialBuild: false }, 'explicit booleans accepted');
  accepts('joinAsSpectator', { playerName: 'Sam' }, 'spectator name accepted');

  log('\n--- chat ---', 'magenta');
  accepts('chatMessage', { message: 'gg' }, 'short message accepted');
  rejects('chatMessage', { message: '' }, 'empty message rejected', 'Message is empty');
  rejects('chatMessage', { message: 'x'.repeat(LIMITS.CHAT_MAX + 1) }, 'over-long message rejected');
  rejects('chatMessage', {}, 'missing message rejected', 'Message is required');
}

logSection('KEYS — hex, vertex, edge, player ids');
{
  accepts('moveRobber', { hexKey: '0,0' }, 'hex 0,0');
  accepts('moveRobber', { hexKey: '-2,3' }, 'negative hex coords');
  rejects('moveRobber', { hexKey: 'h_0_0' }, 'old h_ hex format rejected', 'Invalid hex');
  rejects('moveRobber', { hexKey: '0,0,0' }, 'three-part hex rejected', 'Invalid hex');
  rejects('moveRobber', { hexKey: '100,0' }, 'absurd coordinate rejected', 'Invalid hex');
  rejects('moveRobber', {}, 'missing hex rejected', 'Invalid hex');

  accepts('placeSettlement', { vertexKey: 'v_0_-2_5' }, 'vertex key');
  rejects('placeSettlement', { vertexKey: 'v_0_0_6' }, 'direction 6 rejected', 'Invalid vertex');
  rejects('placeSettlement', { vertexKey: 'e_0_0_0' }, 'edge key where vertex expected', 'Invalid vertex');
  rejects('placeSettlement', { vertexKey: 'v_0_0_0; DROP' }, 'trailing garbage rejected', 'Invalid vertex');

  accepts('placeRoad', { edgeKey: 'e_-3_3_0' }, 'edge key');
  const road = accepts('placeRoad', { edgeKey: 'e_0_0_1', isSetup: true, lastSettlement: 'v_0_0_0' }, 'legacy isSetup args tolerated');
  assert(!('isSetup' in road) && !('lastSettlement' in road), 'legacy isSetup/lastSettlement stripped');
  rejects('placeRoad', { edgeKey: 'v_0_0_0' }, 'vertex key where edge expected', 'Invalid edge');
  accepts('upgradeToCity', { vertexKey: 'v_1_1_2' }, 'city vertex key');
  accepts('getPlayersOnHex', { hexKey: '1,-1' }, 'query hex key');

  accepts('reconnect', { playerId: UUID }, 'uuid player id');
  rejects('reconnect', { playerId: 'nope' }, 'non-uuid player id rejected');
  rejects('reconnect', {}, 'missing player id rejected');
  const mv = accepts('moveRobber', { hexKey: '0,0', stealFromPlayerId: null }, 'null steal target accepted');
  assert(mv.stealFromPlayerId === undefined, 'null steal target normalised to undefined');
  accepts('moveRobber', { hexKey: '0,0', stealFromPlayerId: UUID }, 'uuid steal target accepted');
  rejects('moveRobber', { hexKey: '0,0', stealFromPlayerId: 'ghost' }, 'bogus steal target rejected');
}

logSection('RESOURCES — maps, keys, amounts');
{
  log('\n--- discardCards ---', 'magenta');
  const d = accepts('discardCards', { resources: { brick: 2, ore: 0, wool: 1 } }, 'valid discard map');
  assert(JSON.stringify(d.resources) === '{"brick":2,"wool":1}', 'zero entries dropped');
  rejects('discardCards', { resources: { brick: -1 } }, 'negative amount rejected');
  rejects('discardCards', { resources: { brick: 1.5 } }, 'fractional amount rejected');
  rejects('discardCards', { resources: { brick: '2' } }, 'string amount rejected');
  rejects('discardCards', { resources: { gold: 1 } }, 'unknown resource rejected', 'Invalid resource');
  rejects('discardCards', { resources: { brick: LIMITS.RESOURCE_MAX + 1 } }, 'amount over cap rejected');
  rejects('discardCards', { resources: [1, 2] }, 'array instead of map rejected', 'Invalid resources');
  rejects('discardCards', {}, 'missing map rejected', 'Invalid resources');
  const smuggled = accepts('discardCards', { resources: { __proto__: { brick: 1 } } }, 'prototype smuggling is shape-valid (engine then rejects the count)');
  assert(Object.keys(smuggled.resources).length === 0, 'inherited keys are not copied into the sanitised map');

  log('\n--- proposeTrade ---', 'magenta');
  accepts('proposeTrade', { offer: { brick: 1 }, request: { ore: 1 } }, 'valid trade');
  rejects('proposeTrade', { offer: { brick: -3 }, request: { ore: 1 } }, 'negative offer rejected');
  rejects('proposeTrade', { offer: { brick: 1 }, request: { gold: 1 } }, 'unknown key in request rejected', 'Invalid resource');
  rejects('proposeTrade', { offer: { brick: 1 } }, 'missing request rejected', 'Invalid request');

  log('\n--- bankTrade ---', 'magenta');
  accepts('bankTrade', { giveResource: 'brick', giveAmount: 4, getResource: 'ore' }, 'valid bank trade');
  rejects('bankTrade', { giveResource: 'brick', giveAmount: -4, getResource: 'ore' }, 'negative give rejected');
  rejects('bankTrade', { giveResource: 'brick', giveAmount: 4, getResource: 'gold' }, 'unknown get rejected', 'Invalid resource');
  rejects('bankTrade', { giveResource: 'brick', giveAmount: '4', getResource: 'ore' }, 'string amount rejected');

  log('\n--- yearOfPlentyPick / respondToTrade ---', 'magenta');
  accepts('yearOfPlentyPick', { resource: 'grain' }, 'valid pick');
  rejects('yearOfPlentyPick', { resource: 'gold' }, 'bogus pick rejected', 'Invalid resource');
  accepts('respondToTrade', { accept: false }, 'boolean accept');
  rejects('respondToTrade', { accept: 'yes' }, 'string accept rejected');
  rejects('respondToTrade', {}, 'missing accept rejected');
}

logSection('DEV CARDS');
{
  const k = accepts('playDevCard', { cardType: 'knight' }, 'knight');
  assert(JSON.stringify(k.params) === '{}', 'knight carries no params');
  accepts('playDevCard', { cardType: 'roadBuilding', params: { resource: 'gold' } }, 'irrelevant params ignored for roadBuilding');
  const m = accepts('playDevCard', { cardType: 'monopoly', params: { resource: 'ore' } }, 'monopoly with resource');
  assert(m.params.resource === 'ore', 'monopoly resource passed through');
  rejects('playDevCard', { cardType: 'monopoly', params: { resource: 'gold' } }, 'monopoly with bogus resource rejected', 'Invalid resource');
  rejects('playDevCard', { cardType: 'monopoly' }, 'monopoly without resource rejected', 'Invalid resource');
  accepts('playDevCard', { cardType: 'victoryPoint' }, 'VP card is a valid type here (the engine refuses to play it)');
  rejects('playDevCard', { cardType: 'wizard' }, 'unknown card rejected', 'Invalid card');
}

logSection('NO-PAYLOAD TYPES tolerate junk');
{
  for (const t of ['startGame', 'shuffleBoard', 'rollDice', 'endTurn', 'endSpecialBuild', 'buyDevCard', 'cancelTrade']) {
    const r = ok(t, { anything: 'goes', nested: { deep: [1, 2, 3] } });
    assert(r.ok && Object.keys(r.payload).length === 0, `${t} ignores junk payload`);
  }
  assert(ok('rollDice', undefined).ok, 'undefined payload accepted for no-payload type');
  assert(ok('rollDice', 'string').ok, 'non-object payload coerced for no-payload type');
  rejects('placeRoad', 'e_0_0_0', 'non-object payload for a typed message rejected', 'Invalid edge');
}

console.log('\n' + '═'.repeat(70));
log('  TEST SUMMARY', 'cyan');
console.log('═'.repeat(70));
log(`\n  ✓ Tests Passed: ${passed}`, 'green');
log(`  ✗ Tests Failed: ${failed}`, failed > 0 ? 'red' : 'green');
console.log('');
process.exit(failed > 0 ? 1 : 0);
