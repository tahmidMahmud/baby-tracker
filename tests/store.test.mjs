// Store: local persistence, edit validation, and sync-layer behavior
// (offline queue, bad-passphrase guard) with a stubbed network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, makeLocalStorage } from './load.mjs';

const local = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi);

// ---------- local mode ----------

test('add / update / delete round-trips through local storage', async () => {
  const { Store } = loadApp();
  const e = await Store.addEvent({
    type: 'diaper', startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(), details: { kind: 'wet' },
  });
  assert.ok(e.id, 'gets an id');
  assert.equal((await Store.getEvents()).length, 1);

  await Store.updateEvent(e.id, { details: { kind: 'both' } });
  assert.equal((await Store.getEvents())[0].details.kind, 'both');

  await Store.deleteEvent(e.id);
  assert.equal((await Store.getEvents()).length, 0);
});

test('events sort newest-first and settings merge over defaults', async () => {
  const { Store } = loadApp();
  await Store.addEvent({ type: 'diaper', startedAt: '2026-07-20T10:00:00Z', endedAt: '2026-07-20T10:00:00Z', details: { kind: 'wet' } });
  await Store.addEvent({ type: 'diaper', startedAt: '2026-07-21T10:00:00Z', endedAt: '2026-07-21T10:00:00Z', details: { kind: 'dirty' } });
  const evts = await Store.getEvents();
  assert.equal(evts[0].details.kind, 'dirty');

  assert.equal(Store.getSettings().engine, 'tcb', 'default engine');
  Store.setSettings({ engine: 'huckleberry' });
  assert.equal(Store.getSettings().engine, 'huckleberry');
  assert.equal(Store.getSettings().showDiapers, 'auto', 'other defaults survive');
});

// ---------- edit validation ----------

test('validateEvent accepts sane edits', () => {
  const { Store } = loadApp();
  const now = local(2026, 7, 20, 12, 0);
  assert.equal(Store.validateEvent({
    type: 'sleep', startedAt: local(2026, 7, 20, 9, 0).toISOString(),
    endedAt: local(2026, 7, 20, 10, 0).toISOString(), details: { kind: 'nap' },
  }, now), null);
  assert.equal(Store.validateEvent({
    type: 'feed', startedAt: local(2026, 7, 20, 9, 0).toISOString(),
    endedAt: local(2026, 7, 20, 9, 20).toISOString(),
    details: { method: 'breast', leftSec: 600, rightSec: 0 },
  }, now), null);
  assert.equal(Store.validateEvent({
    type: 'feed', startedAt: local(2026, 7, 20, 9, 0).toISOString(),
    endedAt: local(2026, 7, 20, 9, 0).toISOString(),
    details: { method: 'bottle', oz: 4 },
  }, now), null);
});

test('validateEvent rejects the edge cases', () => {
  const { Store } = loadApp();
  const now = local(2026, 7, 20, 12, 0);
  const sleepAt = (s, e) => ({
    type: 'sleep', startedAt: s.toISOString(), endedAt: e.toISOString(), details: { kind: 'nap' },
  });
  // end before start
  assert.ok(Store.validateEvent(sleepAt(local(2026, 7, 20, 10), local(2026, 7, 20, 9)), now));
  // end equal to start
  assert.ok(Store.validateEvent(sleepAt(local(2026, 7, 20, 10), local(2026, 7, 20, 10)), now));
  // starts in the future
  assert.ok(Store.validateEvent(sleepAt(local(2026, 7, 21, 10), local(2026, 7, 21, 11)), now));
  // over 24h (probably a date typo)
  assert.ok(Store.validateEvent(sleepAt(local(2026, 7, 18, 10), local(2026, 7, 19, 11)), now));
  // garbage dates
  assert.ok(Store.validateEvent({ type: 'sleep', startedAt: 'invalid', endedAt: 'invalid', details: { kind: 'nap' } }, now));
  // bottle out of range
  assert.ok(Store.validateEvent({
    type: 'feed', startedAt: now.toISOString(), endedAt: now.toISOString(),
    details: { method: 'bottle', oz: 0 },
  }, now));
  assert.ok(Store.validateEvent({
    type: 'feed', startedAt: now.toISOString(), endedAt: now.toISOString(),
    details: { method: 'bottle', oz: 40 },
  }, now));
  // nursing: negative or all-zero
  assert.ok(Store.validateEvent({
    type: 'feed', startedAt: local(2026, 7, 20, 9).toISOString(), endedAt: local(2026, 7, 20, 9, 10).toISOString(),
    details: { method: 'breast', leftSec: -5, rightSec: 60 },
  }, now));
  assert.ok(Store.validateEvent({
    type: 'feed', startedAt: local(2026, 7, 20, 9).toISOString(), endedAt: local(2026, 7, 20, 9, 10).toISOString(),
    details: { method: 'breast', leftSec: 0, rightSec: 0 },
  }, now));
  // bad kinds
  assert.ok(Store.validateEvent({ type: 'diaper', startedAt: now.toISOString(), endedAt: now.toISOString(), details: { kind: 'soggy' } }, now));
  assert.ok(Store.validateEvent({ type: 'sleep', startedAt: local(2026, 7, 20, 9).toISOString(), endedAt: local(2026, 7, 20, 10).toISOString(), details: { kind: 'snooze' } }, now));
});

test('validateEvent accepts a DST-spanning night and a leap-day event', () => {
  const { Store } = loadApp();
  // fall-back night 2026: 13.5h elapsed, still < 24h
  assert.equal(Store.validateEvent({
    type: 'sleep', startedAt: local(2026, 10, 31, 19, 30).toISOString(),
    endedAt: local(2026, 11, 1, 7, 0).toISOString(), details: { kind: 'night' },
  }, local(2026, 11, 1, 8, 0)), null);
  // Feb 29 2028
  assert.equal(Store.validateEvent({
    type: 'sleep', startedAt: local(2028, 2, 29, 9, 0).toISOString(),
    endedAt: local(2028, 2, 29, 10, 0).toISOString(), details: { kind: 'nap' },
  }, local(2028, 2, 29, 11, 0)), null);
});

// ---------- sync layer (stubbed network) ----------

const CONFIG = { url: 'https://example.supabase.co', anonKey: 'sb_publishable_test' };

function netStub() {
  const calls = [];
  let failing = false;
  const rows = [];
  const fetch = async (url, opts = {}) => {
    calls.push({ url, method: opts.method || 'GET', body: opts.body, headers: opts.headers });
    if (failing) throw new Error('offline');
    if (url.includes('/families')) {
      const k = opts.headers['x-family-key'];
      const body = k === 'good-key' ? [{ id: 'fam1', name: 'Testers' }] : [];
      return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
    }
    if (url.includes('/events')) {
      const method = opts.method || 'GET';
      if (method === 'GET') {
        return { ok: true, json: async () => rows.slice(), text: async () => '[]' };
      }
      if (method === 'DELETE') {
        const m = url.match(/id=eq\.([^&]+)/);
        if (m) {
          const id = decodeURIComponent(m[1]);
          const i = rows.findIndex(r => r.id === id);
          if (i >= 0) rows.splice(i, 1);
        }
      }
      return { ok: true, json: async () => [], text: async () => '' };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'nf' };
  };
  return { fetch, calls, rows, setFailing: v => { failing = v; } };
}

test('wrong passphrase → badkey state and the local cache is preserved', async () => {
  const net = netStub();
  const storage = makeLocalStorage();
  const app = loadApp({ config: CONFIG, fetch: net.fetch, storage });
  const { Store } = app;
  await Store.addEvent({ type: 'diaper', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), details: { kind: 'wet' } });
  Store.setSettings({ familyKey: 'wrong-key' });
  await Store.syncNow();
  assert.equal(Store.getSyncInfo().state, 'badkey');
  assert.equal((await Store.getEvents()).length, 1, 'cache NOT wiped by empty server response');
});

test('valid passphrase pulls server rows and resolves the family name', async () => {
  const net = netStub();
  net.rows.push({ id: 'srv1', type: 'diaper', started_at: '2026-07-20T10:00:00Z', ended_at: '2026-07-20T10:00:00Z', details: { kind: 'wet' }, created_by: 'Mom' });
  const app = loadApp({ config: CONFIG, fetch: net.fetch });
  const { Store } = app;
  Store.setSettings({ familyKey: 'good-key' });
  await Store.syncNow();
  const info = Store.getSyncInfo();
  assert.equal(info.state, 'ok');
  assert.equal(info.familyName, 'Testers');
  const evts = await Store.getEvents();
  assert.equal(evts.length, 1);
  assert.equal(evts[0].createdBy, 'Mom', 'row mapped from snake_case');
});

test('no passphrase → nokey state and no network traffic for events', async () => {
  const net = netStub();
  const { Store } = loadApp({ config: CONFIG, fetch: net.fetch });
  await Store.syncNow();
  assert.equal(Store.getSyncInfo().state, 'nokey');
  assert.ok(!net.calls.some(c => c.url.includes('/events')), 'events endpoint untouched');
});

test('offline writes queue and drain when the network returns', async () => {
  const net = netStub();
  const { Store } = loadApp({ config: CONFIG, fetch: net.fetch });
  Store.setSettings({ familyKey: 'good-key' });

  net.setFailing(true);
  await Store.addEvent({ type: 'diaper', startedAt: new Date().toISOString(), endedAt: new Date().toISOString(), details: { kind: 'wet' } });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(Store.getSyncInfo().pending, 1, 'op queued while offline');
  assert.equal((await Store.getEvents()).length, 1, 'local write landed instantly');

  net.setFailing(false);
  await Store.syncNow();
  assert.equal(Store.getSyncInfo().pending, 0, 'queue drained');
  const upsert = net.calls.find(c => c.method === 'POST' && c.url.includes('/events'));
  assert.ok(upsert, 'upsert reached the server');
  assert.ok(!('family_id' in JSON.parse(upsert.body)[0]), 'family_id is stamped server-side, never sent');
});

test('pending deletes hide server rows until the delete lands', async () => {
  const net = netStub();
  net.rows.push({ id: 'srv1', type: 'diaper', started_at: '2026-07-20T10:00:00Z', ended_at: '2026-07-20T10:00:00Z', details: { kind: 'wet' }, created_by: '' });
  const { Store } = loadApp({ config: CONFIG, fetch: net.fetch });
  Store.setSettings({ familyKey: 'good-key' });
  await Store.syncNow();
  assert.equal((await Store.getEvents()).length, 1);

  net.setFailing(true);
  await Store.deleteEvent('srv1');
  await new Promise(r => setTimeout(r, 20));
  net.setFailing(false);
  // pull again: server still has the row; the queued delete must keep hiding it
  net.calls.length = 0;
  // flush will delete first (queue drains before the GET merge)
  await Store.syncNow();
  const evts = await Store.getEvents();
  assert.ok(net.calls.some(c => c.method === 'DELETE'), 'delete sent');
  assert.equal(evts.filter(e => e.id === 'srv1').length, 0);
});

test('createFamily posts a sha256 hash, never the passphrase', async () => {
  const net = netStub();
  const { Store } = loadApp({ config: CONFIG, fetch: net.fetch });
  const key = await Store.createFamily('Demo');
  assert.ok(key.length >= 16, 'generated a long passphrase');
  const post = net.calls.find(c => c.method === 'POST' && c.url.includes('/families'));
  assert.ok(post);
  const row = JSON.parse(post.body)[0];
  assert.equal(row.key_hash.length, 64, 'sha256 hex');
  assert.ok(!post.body.includes(key), 'plaintext passphrase never sent in the body');
  assert.equal(Store.getSettings().familyKey, key, 'key saved locally');
});
