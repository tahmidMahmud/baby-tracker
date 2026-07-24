/*
 * Storage layer: local-first with optional Supabase sync.
 *
 * Local cache (localStorage) is always the source for rendering, so the app
 * works offline and renders instantly. When SUPABASE_CONFIG is filled in,
 * every write also lands in a pending-op queue that is flushed to Supabase,
 * and the cache is refreshed from the server on load / focus / a 60s timer.
 *
 * Event shape:
 *   { id, type: 'sleep'|'feed'|'diaper', startedAt: ISO, endedAt: ISO|null,
 *     details: object, createdBy: string }
 *   sleep.details  = { kind: 'nap'|'night' }
 *   feed.details   = { method: 'breast'|'bottle', oz, leftSec, rightSec }
 *   diaper.details = { kind: 'wet'|'dirty'|'both' }
 */
const Store = (() => {
  const EVENTS_KEY = 'baby.events.v1';
  const SETTINGS_KEY = 'baby.settings.v1';
  const RUNNING_KEY = 'baby.running.v1';
  const PENDING_KEY = 'baby.pending.v1';

  const listeners = [];
  let syncState = 'off'; // 'off' | 'ok' | 'syncing' | 'error'
  let lastSyncError = null;

  const cfg = (typeof SUPABASE_CONFIG !== 'undefined') ? SUPABASE_CONFIG : {};
  const sbEnabled = !!(cfg.url && cfg.anonKey);

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function save(key, val, silent) {
    localStorage.setItem(key, JSON.stringify(val));
    if (!silent) listeners.forEach(fn => fn());
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---- Supabase REST (PostgREST via fetch; no SDK needed) ----
  async function sbFetch(pathAndQuery, opts = {}) {
    // Modern sb_publishable_* keys go in `apikey` only; legacy anon keys
    // are JWTs and also work as a Bearer token.
    const auth = cfg.anonKey.startsWith('eyJ')
      ? { 'Authorization': `Bearer ${cfg.anonKey}` } : {};
    const res = await fetch(`${cfg.url}/rest/v1/${pathAndQuery}`, {
      ...opts,
      headers: {
        'apikey': cfg.anonKey,
        ...auth,
        // Passphrase is per-device (Settings), never shipped in the code
        'x-family-key': getSettings().familyKey || '',
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
    return res;
  }

  const evtToRow = e => ({
    id: e.id, type: e.type, started_at: e.startedAt, ended_at: e.endedAt,
    details: e.details, created_by: e.createdBy || '',
    updated_at: new Date().toISOString(),
  });
  const rowToEvt = r => ({
    id: r.id, type: r.type, startedAt: r.started_at, endedAt: r.ended_at,
    details: r.details || {}, createdBy: r.created_by || '',
  });

  // ---- Pending-op queue ----
  function enqueue(op) {
    const q = load(PENDING_KEY, []);
    q.push(op);
    save(PENDING_KEY, q, true);
  }

  let flushing = false;
  async function flush() {
    if (!sbEnabled || flushing || !getSettings().familyKey) return;
    flushing = true;
    try {
      let q = load(PENDING_KEY, []);
      while (q.length) {
        const op = q[0];
        if (op.op === 'upsert') {
          await sbFetch('events?on_conflict=id', {
            method: 'POST',
            headers: { 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify([evtToRow(op.evt)]),
          });
        } else if (op.op === 'delete') {
          await sbFetch(`events?id=eq.${encodeURIComponent(op.id)}`, { method: 'DELETE' });
        }
        q = load(PENDING_KEY, []);
        q.shift();
        save(PENDING_KEY, q, true);
      }
      syncState = 'ok';
      lastSyncError = null;
    } catch (err) {
      syncState = 'error';
      lastSyncError = String(err.message || err);
    } finally {
      flushing = false;
    }
  }

  async function pull() {
    if (!sbEnabled) return;
    // Without the passphrase the API politely returns empty rows — don't
    // let that wipe the local cache; surface "enter passphrase" instead.
    if (!getSettings().familyKey) {
      syncState = 'nokey';
      listeners.forEach(fn => fn());
      return;
    }
    syncState = 'syncing';
    try {
      await flush(); // push our pending writes first
      const res = await sbFetch('events?select=*&order=started_at.desc&limit=5000');
      const rows = await res.json();
      const serverEvents = rows.map(rowToEvt);
      // Keep local events that are still waiting to be pushed
      const q = load(PENDING_KEY, []);
      const pendingUpserts = q.filter(o => o.op === 'upsert').map(o => o.evt);
      const pendingDeletes = new Set(q.filter(o => o.op === 'delete').map(o => o.id));
      const byId = new Map(serverEvents.map(e => [e.id, e]));
      pendingUpserts.forEach(e => byId.set(e.id, e));
      pendingDeletes.forEach(id => byId.delete(id));
      save(EVENTS_KEY, [...byId.values()], true);
      syncState = 'ok';
      lastSyncError = null;
      listeners.forEach(fn => fn());
    } catch (err) {
      syncState = 'error';
      lastSyncError = String(err.message || err);
      listeners.forEach(fn => fn());
    }
  }

  if (sbEnabled) {
    syncState = 'syncing';
    pull();
    setInterval(pull, 60000);
    window.addEventListener('online', pull);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') pull();
    });
  }

  // ---- Events ----
  async function getEvents() {
    const evts = load(EVENTS_KEY, []);
    return evts.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  }

  async function addEvent(evt) {
    const evts = load(EVENTS_KEY, []);
    const full = { id: uid(), createdBy: getSettings().deviceName || 'parent', ...evt };
    evts.push(full);
    if (sbEnabled) enqueue({ op: 'upsert', evt: full });
    save(EVENTS_KEY, evts);
    if (sbEnabled) flush().then(() => listeners.forEach(fn => fn()));
    return full;
  }

  async function updateEvent(id, patch) {
    const evts = load(EVENTS_KEY, []);
    const i = evts.findIndex(e => e.id === id);
    if (i < 0) return;
    evts[i] = { ...evts[i], ...patch };
    if (sbEnabled) enqueue({ op: 'upsert', evt: evts[i] });
    save(EVENTS_KEY, evts);
    if (sbEnabled) flush().then(() => listeners.forEach(fn => fn()));
  }

  async function deleteEvent(id) {
    const evts = load(EVENTS_KEY, []).filter(e => e.id !== id);
    if (sbEnabled) enqueue({ op: 'delete', id });
    save(EVENTS_KEY, evts);
    if (sbEnabled) flush().then(() => listeners.forEach(fn => fn()));
  }

  // ---- Running timers (active sleep / feed session; device-local) ----
  function getRunning() { return load(RUNNING_KEY, {}); }
  function setRunning(kind, data) {
    const r = getRunning();
    if (data === null) delete r[kind];
    else r[kind] = data;
    save(RUNNING_KEY, r);
  }

  // ---- Settings (device-local) ----
  function getSettings() {
    return load(SETTINGS_KEY, {
      birthdate: null,
      engine: 'tcb',
      deviceName: '',
      showDiapers: 'auto',
      lastBottleOz: 4,
      familyKey: '',
    });
  }
  function setSettings(patch) {
    save(SETTINGS_KEY, { ...getSettings(), ...patch });
  }

  function getSyncInfo() {
    return {
      enabled: sbEnabled,
      state: syncState,
      pending: load(PENDING_KEY, []).length,
      error: lastSyncError,
    };
  }

  function onChange(fn) { listeners.push(fn); }

  async function exportJson() {
    return JSON.stringify({
      settings: getSettings(),
      events: load(EVENTS_KEY, []),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  return { getEvents, addEvent, updateEvent, deleteEvent,
           getRunning, setRunning, getSettings, setSettings,
           getSyncInfo, onChange, exportJson, syncNow: pull };
})();
