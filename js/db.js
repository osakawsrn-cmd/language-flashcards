const DB_NAME = 'lang-learning-app';
const DB_VERSION = 1;

const STORES = {
  cards: 'cards',
  progress: 'progress',
  reviewLog: 'reviewLog',
  syncMeta: 'syncMeta'
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.cards)) {
        db.createObjectStore(STORES.cards, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.progress)) {
        db.createObjectStore(STORES.progress, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.reviewLog)) {
        const s = db.createObjectStore(STORES.reviewLog, { keyPath: 'id' });
        s.createIndex('by_date', 'date');
      }
      if (!db.objectStoreNames.contains(STORES.syncMeta)) {
        db.createObjectStore(STORES.syncMeta, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode) {
  return openDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(storeName, key) {
  const store = await tx(storeName, 'readonly');
  return reqToPromise(store.get(key));
}

async function dbGetAll(storeName) {
  const store = await tx(storeName, 'readonly');
  return reqToPromise(store.getAll());
}

async function dbPut(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.put(value));
}

async function dbClear(storeName) {
  const store = await tx(storeName, 'readwrite');
  return reqToPromise(store.clear());
}

export function newId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export function nowISO() {
  return new Date().toISOString();
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---- Cards (user-entered vocab/sentences, either lang) ----
export async function getCard(id) {
  return dbGet(STORES.cards, id);
}

/** Non-deleted cards only, unless includeDeleted is passed (used by sync merge). */
export async function getAllCards({ includeDeleted = false } = {}) {
  const all = await dbGetAll(STORES.cards);
  return includeDeleted ? all : all.filter((c) => !c.deleted);
}

export async function saveCard(card) {
  return dbPut(STORES.cards, card);
}

/** Soft delete: keeps a tombstone so the deletion propagates through sync
 * instead of the card reappearing when merged with a device that still has it. */
export async function deleteCard(id) {
  const card = await dbGet(STORES.cards, id);
  if (!card) return;
  await dbPut(STORES.cards, { ...card, deleted: true, updatedAt: nowISO() });
}

// ---- SRS progress (keyed by card id) ----
export async function getProgress(id) {
  return dbGet(STORES.progress, id);
}

export async function getAllProgress() {
  return dbGetAll(STORES.progress);
}

export async function saveProgress(item) {
  return dbPut(STORES.progress, { ...item, updatedAt: nowISO() });
}

// ---- Review log (for stats / streak) ----
export async function addReviewLog(entry) {
  return dbPut(STORES.reviewLog, {
    id: newId(),
    date: todayISO(),
    ...entry
  });
}

export async function getAllReviewLogs() {
  return dbGetAll(STORES.reviewLog);
}

// ---- Sync metadata (Google Drive file id, last synced time) ----
export async function getSyncMeta() {
  const rec = await dbGet(STORES.syncMeta, 'main');
  return rec ? rec.value : null;
}

export async function saveSyncMeta(meta) {
  return dbPut(STORES.syncMeta, { key: 'main', value: meta });
}

// ---- Bulk access for sync merge ----
export async function putCards(cards) {
  for (const c of cards) await dbPut(STORES.cards, c);
}

export async function putProgress(items) {
  for (const p of items) await dbPut(STORES.progress, p);
}

export async function putReviewLogs(logs) {
  for (const l of logs) await dbPut(STORES.reviewLog, l);
}

// ---- Reset everything (Settings > clear data) ----
export async function resetEverything() {
  await dbClear(STORES.cards);
  await dbClear(STORES.progress);
  await dbClear(STORES.reviewLog);
  await dbClear(STORES.syncMeta);
}
