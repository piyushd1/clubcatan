/**
 * PartyKit room ID is the Catan game code. We pick a 6-char uppercase code
 * from a 29-letter alphabet — easy to read aloud, no 0/O/1/I confusion.
 *
 * 29^6 = 594M codes; collision risk for a friend group is essentially zero.
 * The server rejects `createGame` in a room that already has a game, so any
 * collision falls back to "pick another."
 */
const ALPHABET = 'ABCDEFGHJKMNPQRTUVWXYZ2346789'; // 29 chars; drops 0/O/1/I/L/5/S

export function generateRoomCode(length = 6) {
  const buf = new Uint32Array(length);
  (globalThis.crypto || window.crypto).getRandomValues(buf);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  return out;
}

export function isValidRoomCode(code) {
  return typeof code === 'string' && /^[A-HJ-KM-NP-RT-Z2-46-9]{4,8}$/.test(code);
}
