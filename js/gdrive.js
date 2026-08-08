// Cross-device sync via the user's own Google Drive (appDataFolder, hidden from their normal Drive UI).
// Uses Google Identity Services (loaded from index.html) for OAuth — no backend involved,
// the JSON blob and the token both live only between the browser and Google's servers.

import * as db from './db.js';

const CLIENT_ID_KEY = 'langapp_google_client_id';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SYNC_FILENAME = 'sync.json';
const API_BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

let tokenClient = null;
let accessToken = null;
let accessTokenExpiry = 0;
let syncTimer = null;

export function getClientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || '';
}

export function setClientId(id) {
  localStorage.setItem(CLIENT_ID_KEY, id.trim());
  tokenClient = null;
}

export function clearClientId() {
  localStorage.removeItem(CLIENT_ID_KEY);
  tokenClient = null;
  disconnect();
}

export function hasClientId() {
  return !!getClientId();
}

export function gisReady() {
  return !!(window.google && window.google.accounts && window.google.accounts.oauth2);
}

export function isConnected() {
  return !!accessToken && Date.now() < accessTokenExpiry;
}

function ensureTokenClient() {
  const clientId = getClientId();
  if (!clientId) throw Object.assign(new Error('missing_client_id'), { code: 'missing_client_id' });
  if (!gisReady()) throw Object.assign(new Error('gis_not_loaded'), { code: 'gis_not_loaded' });
  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: () => {} // overridden per-request below
    });
  }
  return tokenClient;
}

function requestToken({ interactive }) {
  return new Promise((resolve, reject) => {
    let client;
    try {
      client = ensureTokenClient();
    } catch (err) {
      reject(err);
      return;
    }
    client.callback = (resp) => {
      if (resp.error) {
        reject(Object.assign(new Error(resp.error), { code: resp.error }));
        return;
      }
      accessToken = resp.access_token;
      accessTokenExpiry = Date.now() + (resp.expires_in ? resp.expires_in * 1000 : 3500 * 1000);
      resolve(accessToken);
    };
    try {
      client.requestAccessToken({ prompt: interactive ? 'consent' : '' });
    } catch (err) {
      reject(err);
    }
  });
}

async function getValidToken({ interactive = false } = {}) {
  if (accessToken && Date.now() < accessTokenExpiry - 60000) return accessToken;
  return requestToken({ interactive });
}

/** Interactive connect, meant to run from a click handler (user gesture required for the consent popup). */
export async function connect() {
  return requestToken({ interactive: true });
}

/** Best-effort silent reconnect on app startup; resolves false instead of throwing when it can't. */
export async function trySilentConnect() {
  if (!hasClientId()) return false;
  try {
    await requestToken({ interactive: false });
    return true;
  } catch (err) {
    return false;
  }
}

export function disconnect() {
  if (accessToken && window.google?.accounts?.oauth2?.revoke) {
    google.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  accessTokenExpiry = 0;
}

async function apiFetch(url, options, token) {
  const res = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw Object.assign(new Error(`drive_api_error_${res.status}`), { code: 'drive_api_error', status: res.status, detail: text });
  }
  return res;
}

async function findSyncFileId(token) {
  const url = `${API_BASE}/files?spaces=appDataFolder&q=${encodeURIComponent(`name='${SYNC_FILENAME}'`)}&fields=files(id,name)`;
  const res = await apiFetch(url, {}, token);
  const data = await res.json();
  return data.files && data.files[0] ? data.files[0].id : null;
}

async function createSyncFile(token, content) {
  const metadata = { name: SYNC_FILENAME, parents: ['appDataFolder'] };
  const boundary = 'langapp_' + Math.random().toString(16).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(content)}\r\n` +
    `--${boundary}--`;
  const res = await apiFetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  }, token);
  const data = await res.json();
  return data.id;
}

async function downloadSyncFile(token, fileId) {
  const res = await apiFetch(`${API_BASE}/files/${fileId}?alt=media`, {}, token);
  return res.json();
}

async function updateSyncFile(token, fileId, content) {
  await apiFetch(`${UPLOAD_BASE}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content)
  }, token);
}

/** Last-write-wins merge keyed by id, comparing updatedAt (ISO strings sort correctly as text). */
function mergeById(localList, remoteList) {
  const map = new Map();
  for (const item of localList || []) map.set(item.id, item);
  for (const item of remoteList || []) {
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt || '') > (existing.updatedAt || '')) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

/** reviewLog entries are append-only (immutable once created) — just union by id. */
function mergeLogs(localList, remoteList) {
  const map = new Map();
  for (const item of localList || []) map.set(item.id, item);
  for (const item of remoteList || []) if (!map.has(item.id)) map.set(item.id, item);
  return [...map.values()];
}

/**
 * Pull remote state, merge with local (last-write-wins), write the merge back to
 * both IndexedDB and Drive so both sides converge. Local writes always happen first
 * elsewhere (db.js) — this function never needs to run for the app to work offline.
 */
export async function sync({ interactive = false } = {}) {
  const token = await getValidToken({ interactive });

  const meta = await db.getSyncMeta();
  let fileId = meta?.fileId || null;
  if (!fileId) fileId = await findSyncFileId(token);

  let remote = { cards: [], progress: [], reviewLog: [] };
  if (fileId) {
    try {
      remote = await downloadSyncFile(token, fileId);
    } catch (err) {
      // Corrupt or unreadable remote file: proceed as if it were empty rather than blocking sync.
    }
  }

  const [localCards, localProgress, localLogs] = await Promise.all([
    db.getAllCards({ includeDeleted: true }),
    db.getAllProgress(),
    db.getAllReviewLogs()
  ]);

  const mergedCards = mergeById(localCards, remote.cards);
  const mergedProgress = mergeById(localProgress, remote.progress);
  const mergedLogs = mergeLogs(localLogs, remote.reviewLog);

  await db.putCards(mergedCards);
  await db.putProgress(mergedProgress);
  await db.putReviewLogs(mergedLogs);

  const payload = {
    version: 1,
    exportedAt: db.nowISO(),
    cards: mergedCards,
    progress: mergedProgress,
    reviewLog: mergedLogs
  };

  if (!fileId) {
    fileId = await createSyncFile(token, payload);
  } else {
    await updateSyncFile(token, fileId, payload);
  }

  const syncedAt = db.nowISO();
  await db.saveSyncMeta({ fileId, lastSyncedAt: syncedAt });

  return { cardCount: mergedCards.filter((c) => !c.deleted).length, syncedAt };
}

/** Debounced background sync — call after any local write. Silently no-ops if not connected. */
export function scheduleBackgroundSync(delayMs = 3000) {
  if (!hasClientId() || !isConnected()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    sync({ interactive: false }).catch(() => {});
  }, delayMs);
}

export const ERROR_MESSAGES = {
  missing_client_id: '尚未設定 Google OAuth Client ID，請先在下方填入。',
  gis_not_loaded: 'Google 登入元件尚未載入，請檢查網路連線後重新整理頁面。',
  popup_closed_by_user: '登入視窗被關閉，請重新嘗試。',
  access_denied: '未授權存取 Google 雲端硬碟，同步功能將無法使用。',
  drive_api_error: 'Google 雲端硬碟發生錯誤，請稍後再試。'
};

export function errorMessage(err) {
  const code = err?.code || err?.message;
  return ERROR_MESSAGES[code] || `同步失敗：${err?.message || '未知錯誤'}`;
}
