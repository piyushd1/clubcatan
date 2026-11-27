/**
 * Payload validation at the server boundary.
 *
 * Every client message is checked here before its handler runs, so the engine
 * only ever sees well-formed shapes: bounded strings, strict key formats,
 * resource maps with known keys and small non-negative integers. The engine
 * still re-validates what it needs (it is the last line of defence); this
 * layer exists so garbage never reaches it and error messages stay specific.
 *
 * Each validator takes the raw payload and returns a sanitised payload, or
 * throws a ValidationError. Unknown message types are rejected before
 * reaching here (see onMessage), and types with no payload accept anything.
 */

import { DEV_CARDS, RESOURCE_KEYS } from '../shared/gameLogic.js';

export class ValidationError extends Error {}

const fail = (msg) => { throw new ValidationError(msg); };

// ---------- primitives ----------

export const LIMITS = Object.freeze({
  NAME_MAX: 24,
  CHAT_MAX: 300,
  RESOURCE_MAX: 50, // no single trade/discard needs more; bank has 19 of each
});

/** Strip control characters (incl. zero-width/bidi) and collapse whitespace. */
export function cleanText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function name(value) {
  if (typeof value !== 'string') fail('Name is required');
  const v = cleanText(value);
  if (v.length === 0) fail('Name is required');
  if (v.length > LIMITS.NAME_MAX) fail(`Name must be at most ${LIMITS.NAME_MAX} characters`);
  return v;
}

export function chat(value) {
  if (typeof value !== 'string') fail('Message is required');
  const v = cleanText(value);
  if (v.length === 0) fail('Message is empty');
  if (v.length > LIMITS.CHAT_MAX) fail(`Message must be at most ${LIMITS.CHAT_MAX} characters`);
  return v;
}

export function bool(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be true or false`);
  return value;
}

export function optionalBool(value, label, fallback) {
  return value === undefined ? fallback : bool(value, label);
}

const HEX_RE = /^-?\d{1,2},-?\d{1,2}$/;
const VERTEX_RE = /^v_-?\d{1,2}_-?\d{1,2}_[0-5]$/;
const EDGE_RE = /^e_-?\d{1,2}_-?\d{1,2}_[0-5]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hexKey(value) {
  if (typeof value !== 'string' || !HEX_RE.test(value)) fail('Invalid hex');
  return value;
}

export function vertexKey(value) {
  if (typeof value !== 'string' || !VERTEX_RE.test(value)) fail('Invalid vertex');
  return value;
}

export function edgeKey(value) {
  if (typeof value !== 'string' || !EDGE_RE.test(value)) fail('Invalid edge');
  return value;
}

export function playerId(value, label = 'Player') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) fail(`${label} id is invalid`);
  return value;
}

export function optionalPlayerId(value, label) {
  if (value === undefined || value === null || value === '') return undefined;
  return playerId(value, label);
}

export function resourceKey(value) {
  if (typeof value !== 'string' || !RESOURCE_KEYS.includes(value)) fail('Invalid resource');
  return value;
}

export function amount(value, label = 'Amount') {
  if (!Number.isInteger(value) || value < 0 || value > LIMITS.RESOURCE_MAX) {
    fail(`${label} must be a whole number between 0 and ${LIMITS.RESOURCE_MAX}`);
  }
  return value;
}

/**
 * `{ brick: 2, ore: 1 }` → same shape, only known keys, amounts 0..MAX.
 * Zero entries are dropped so downstream sums and "has at least one" checks
 * are simple.
 */
export function resourceMap(value, label = 'resources') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Invalid ${label}`);
  const out = {};
  for (const [key, n] of Object.entries(value)) {
    resourceKey(key);
    const a = amount(n, `${label}.${key}`);
    if (a > 0) out[key] = a;
  }
  return out;
}

export function cardType(value) {
  if (typeof value !== 'string' || !Object.values(DEV_CARDS).includes(value)) fail('Invalid card');
  return value;
}

// ---------- per-message validators ----------

const DEV_CARD_VALUES = Object.values(DEV_CARDS);

/** Message types that take no payload. Anything sent is ignored. */
const NO_PAYLOAD = (_p) => ({});

export const VALIDATORS = {
  // lobby
  createGame: (p) => ({
    playerName: name(p.playerName),
    isExtended: optionalBool(p.isExtended, 'isExtended', false),
    enableSpecialBuild: optionalBool(p.enableSpecialBuild, 'enableSpecialBuild', true),
  }),
  joinGame: (p) => ({ playerName: name(p.playerName) }),
  joinAsSpectator: (p) => ({ playerName: name(p.playerName) }),
  reconnect: (p) => ({ playerId: playerId(p.playerId) }),

  // game flow
  startGame: NO_PAYLOAD,
  shuffleBoard: NO_PAYLOAD,
  rollDice: NO_PAYLOAD,
  endTurn: NO_PAYLOAD,
  endSpecialBuild: NO_PAYLOAD,
  buyDevCard: NO_PAYLOAD,
  cancelTrade: NO_PAYLOAD,

  // turn actions
  discardCards: (p) => ({ resources: resourceMap(p.resources, 'resources') }),
  moveRobber: (p) => ({
    hexKey: hexKey(p.hexKey),
    stealFromPlayerId: optionalPlayerId(p.stealFromPlayerId, 'Victim'),
  }),
  placeSettlement: (p) => ({ vertexKey: vertexKey(p.vertexKey) }),
  placeRoad: (p) => ({ edgeKey: edgeKey(p.edgeKey) }),
  upgradeToCity: (p) => ({ vertexKey: vertexKey(p.vertexKey) }),
  playDevCard: (p) => {
    const type = cardType(p.cardType);
    const params = {};
    if (type === DEV_CARDS.MONOPOLY) params.resource = resourceKey(p.params?.resource);
    return { cardType: type, params };
  },
  yearOfPlentyPick: (p) => ({ resource: resourceKey(p.resource) }),

  // trading
  bankTrade: (p) => ({
    giveResource: resourceKey(p.giveResource),
    giveAmount: amount(p.giveAmount, 'Give amount'),
    getResource: resourceKey(p.getResource),
  }),
  proposeTrade: (p) => ({
    offer: resourceMap(p.offer, 'offer'),
    request: resourceMap(p.request, 'request'),
  }),
  respondToTrade: (p) => ({ accept: bool(p.accept, 'accept') }),

  // queries / chat
  getPlayersOnHex: (p) => ({ hexKey: hexKey(p.hexKey) }),
  chatMessage: (p) => ({ message: chat(p.message) }),
};

/**
 * Validate `payload` for `type`. Returns `{ ok: true, payload }` with the
 * sanitised payload, or `{ ok: false, error }`. Unknown types are an error
 * here too, so a typo in VALIDATORS can never let a handler run unchecked.
 */
export function validate(type, payload) {
  const v = VALIDATORS[type];
  if (!v) return { ok: false, error: `Unknown message type: ${type}` };
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  try {
    return { ok: true, payload: v(p) };
  } catch (err) {
    if (err instanceof ValidationError) return { ok: false, error: err.message };
    throw err;
  }
}

export { DEV_CARD_VALUES };
