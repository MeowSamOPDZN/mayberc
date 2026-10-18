// localStorage persistence for Maybe Real City (demo: everything stays in the browser).
// Falls back to in-memory storage when localStorage is unavailable (e.g. Node tests).
const PREFIX = 'mayberc_';

const mem = new Map();
const hasLS = (() => {
  try { return typeof localStorage !== 'undefined' && localStorage !== null; }
  catch { return false; }
})();

function read(key, fallback) {
  try {
    const raw = hasLS ? localStorage.getItem(PREFIX + key) : (mem.has(PREFIX + key) ? mem.get(PREFIX + key) : null);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch { return fallback; }
}

function write(key, value) {
  const raw = JSON.stringify(value);
  try {
    if (hasLS) localStorage.setItem(PREFIX + key, raw);
    else mem.set(PREFIX + key, raw);
  } catch { /* storage full or blocked: keep going without persistence */ }
}

function remove(key) {
  try {
    if (hasLS) localStorage.removeItem(PREFIX + key);
    else mem.delete(PREFIX + key);
  } catch { /* ignore */ }
}

function buildClaimIndex(claims) {
  const idx = {};
  for (const c of claims) {
    if (c && c.handle) idx[String(c.handle).toLowerCase()] = c.plotId;
  }
  return idx;
}

export const store = {
  // claims: [{ plotId, handle, created, flag, tier, body, roof }]
  get claims() { return read('claims', []); },
  set claims(v) {
    write('claims', v);
    write('claimsmap', buildClaimIndex(v)); // mayberc_claims: { handleLower: plotId }
  },
  // quick handle -> plotId lookup (kept in sync by the claims setter)
  get claimIndex() { return read('claimsmap', buildClaimIndex(read('claims', []))); },

  // identity: { handle, plotId, joinedAt } | null — the visitor's own claimed home
  get identity() { return read('identity', null); },
  set identity(v) { write('identity', v); },

  get coins() { return read('coins', 100); }, // visitors start with a 100-coin welcome grant
  set coins(v) { write('coins', v); },

  // quests: { date: 'YYYY-MM-DD', done: {id:true}, progress: { neighbor: n, corners: [ids] } }
  get quests() { return read('quests', null); },
  set quests(v) { write('quests', v); },

  // settings: { gfx: 'auto'|'high'|'low', cine: bool }
  get settings() { return read('settings', { gfx: 'auto', cine: true }); },
  set settings(v) { write('settings', v); },

  clearAll() {
    for (const k of ['claims', 'claimsmap', 'identity', 'coins', 'quests', 'settings']) remove(k);
  },
};

export function todayStamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
