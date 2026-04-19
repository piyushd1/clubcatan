import { openDB } from 'idb';

/**
 * IndexedDB cache for user-facing state that must survive reloads.
 * Server is authoritative for game state; this exists purely for speed
 * (instant rehydrate while the socket reconnects) and UX (recent rooms).
 *
 * Schema v1:
 *   profile      — keyPath 'id' (singleton id 'me')     { nickname, factionColor, lastSeen }
 *   recentRooms  — keyPath 'code', index 'joinedAt'     { code, joinedAt, host }
 *   activeGame   — keyPath 'roomCode'                   { roomCode, snapshot, updatedAt }
 *   settings     — keyPath 'id' (singleton id 'me')     { theme, haptics, storytellingVoice, wakeLock }
 */
const DB_NAME = 'clubcatan';
const DB_VERSION = 1;

let dbPromise;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('recentRooms')) {
          const store = db.createObjectStore('recentRooms', { keyPath: 'code' });
          store.createIndex('joinedAt', 'joinedAt');
        }
        if (!db.objectStoreNames.contains('activeGame')) {
          db.createObjectStore('activeGame', { keyPath: 'roomCode' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// ---- profile ---------------------------------------------------------------

export async function getProfile() {
  const db = await getDB();
  return (await db.get('profile', 'me')) ?? null;
}

export async function saveProfile(patch) {
  const db = await getDB();
  const prev = (await db.get('profile', 'me')) ?? { id: 'me' };
  const next = { ...prev, ...patch, id: 'me', lastSeen: Date.now() };
  await db.put('profile', next);
  return next;
}

// ---- recent rooms ----------------------------------------------------------

const RECENT_ROOM_CAP = 10;

export async function getRecentRooms() {
  const db = await getDB();
  const all = await db.getAllFromIndex('recentRooms', 'joinedAt');
  return all.reverse().slice(0, RECENT_ROOM_CAP);
}

export async function upsertRecentRoom({ code, host }) {
  const db = await getDB();
  const tx = db.transaction('recentRooms', 'readwrite');
  await tx.store.put({ code, host: host ?? null, joinedAt: Date.now() });
  // Trim anything past the cap.
  const all = await tx.store.index('joinedAt').getAll();
  const excess = all.length - RECENT_ROOM_CAP;
  if (excess > 0) {
    for (const row of all.slice(0, excess)) await tx.store.delete(row.code);
  }
  await tx.done;
}

export async function forgetRecentRoom(code) {
  const db = await getDB();
  await db.delete('recentRooms', code);
}

// ---- active game (for fast reconnect) --------------------------------------

export async function getActiveGame(roomCode) {
  const db = await getDB();
  return (await db.get('activeGame', roomCode)) ?? null;
}

export async function saveActiveGame(roomCode, snapshot) {
  const db = await getDB();
  await db.put('activeGame', { roomCode, snapshot, updatedAt: Date.now() });
}

export async function clearActiveGame(roomCode) {
  const db = await getDB();
  if (roomCode) {
    await db.delete('activeGame', roomCode);
  } else {
    await db.clear('activeGame');
  }
}

// ---- settings --------------------------------------------------------------

const DEFAULT_SETTINGS = {
  id: 'me',
  theme: 'system',
  haptics: true,
  storytellingVoice: true,
  wakeLock: true,
};

export async function getSettings() {
  const db = await getDB();
  const row = await db.get('settings', 'me');
  return { ...DEFAULT_SETTINGS, ...(row ?? {}) };
}

export async function saveSettings(patch) {
  const db = await getDB();
  const prev = (await db.get('settings', 'me')) ?? DEFAULT_SETTINGS;
  const next = { ...prev, ...patch, id: 'me' };
  await db.put('settings', next);
  return next;
}
