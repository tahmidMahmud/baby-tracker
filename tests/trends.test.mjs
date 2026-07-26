// Trends metrics + calendar edge cases: DST transitions and leap years.
// TZ=America/New_York (package.json) — DST 2026: spring-forward Mar 8,
// fall-back Nov 1. Leap day: 2028-02-29.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const { Trends } = loadApp();
const T = Trends._test;
const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const iso = d => d.toISOString();
const key = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const mkDays = (from, n) => Array.from({ length: n }, (_, i) => {
  const d = new Date(from);
  d.setDate(d.getDate() + i);
  d.setHours(0, 0, 0, 0);
  return d;
});

const sleep = (start, end, kind = 'night') => ({
  id: Math.random().toString(36).slice(2), type: 'sleep',
  startedAt: iso(start), endedAt: iso(end), details: { kind },
});

test('rangeDays walks calendar days across fall-back DST (no dup/skip)', () => {
  T.state.range = 'month';
  const days = T.rangeDays([], local(2026, 11, 15, 12)); // Nov 15 2026, spans Nov 1
  assert.equal(days.length, 30);
  const keys = days.map(key);
  assert.equal(new Set(keys).size, 30, 'every calendar day unique');
  assert.ok(keys.includes('2026-10-1'), 'includes Nov 1 (fall-back day)');
  assert.ok(keys.includes('2026-9-31'), 'includes Oct 31');
  // consecutive: each day is exactly one calendar day after the previous
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    prev.setDate(prev.getDate() + 1);
    assert.equal(key(prev), keys[i]);
  }
});

test('rangeDays walks calendar days across spring-forward DST', () => {
  T.state.range = 'week';
  const days = T.rangeDays([], local(2026, 3, 10, 12)); // Mar 10 2026, spans Mar 8
  assert.equal(days.length, 7);
  assert.equal(new Set(days.map(key)).size, 7);
  assert.ok(days.map(key).includes('2026-2-8'), 'includes Mar 8 (23h day)');
  // every generated day is exactly midnight local
  for (const d of days) assert.equal(d.getHours(), 0);
});

test('rangeDays spans leap day correctly', () => {
  T.state.range = 'week';
  const days = T.rangeDays([], local(2028, 3, 2, 12)); // Mar 2 2028
  const keys = days.map(key);
  assert.ok(keys.includes('2028-1-29'), 'includes Feb 29 2028');
  assert.equal(new Set(keys).size, 7);
});

test('night assignment: evening start owns the night; after-midnight joins previous', () => {
  assert.equal(T.nightOf(sleep(local(2026, 7, 20, 19, 30), local(2026, 7, 21, 3, 0))), '2026-6-20');
  assert.equal(T.nightOf(sleep(local(2026, 7, 21, 1, 0), local(2026, 7, 21, 6, 30))), '2026-6-20');
  assert.equal(T.nightOf(sleep(local(2026, 7, 21, 12, 1), local(2026, 7, 21, 13, 0))), '2026-6-21');
});

test('metrics: night hours are real elapsed time across fall-back (25h day)', () => {
  // 7:30 PM EDT Oct 31 → 7:00 AM EST Nov 1: 11.5h on the wall clock but
  // 12.5h really elapsed (clocks repeat the 1-2 AM hour)
  const st = local(2026, 10, 31, 19, 30);
  const en = local(2026, 11, 1, 7, 0);
  const elapsedH = (+en - +st) / 36e5;
  assert.equal(elapsedH, 12.5, 'sanity: EDT→EST adds an hour over the wall span');
  const days = mkDays(local(2026, 10, 28), 7);
  const m = T.metrics([sleep(st, en)], days);
  assert.ok(Math.abs(m.nightH['2026-9-31'] - 12.5) < 0.01, 'night credited with real elapsed hours, not wall span');
  assert.equal(m.nightSegs['2026-9-31'], 1);
});

test('metrics: spring-forward night loses an hour honestly (23h day)', () => {
  // 7:00 PM EST Mar 7 → 7:00 AM EDT Mar 8 = 12h wall clock, 11h elapsed
  const st = local(2026, 3, 7, 19, 0);
  const en = local(2026, 3, 8, 7, 0);
  assert.equal((+en - +st) / 36e5, 11);
  const m = T.metrics([sleep(st, en)], mkDays(local(2026, 3, 5), 7));
  assert.ok(Math.abs(m.nightH['2026-2-7'] - 11) < 0.01);
});

test('metrics: days without a recorded night are null, not zero', () => {
  const days = mkDays(local(2026, 7, 18), 3);
  const m = T.metrics([sleep(local(2026, 7, 18, 19, 0), local(2026, 7, 19, 6, 0))], days);
  assert.ok(m.nightH['2026-6-18'] > 0);
  assert.equal(m.nightH['2026-6-19'], null, 'missing night is null');
  assert.equal(m.nightH['2026-6-20'], null);
});

test('metrics: wakings = night segments minus one, per night', () => {
  const days = mkDays(local(2026, 7, 18), 2);
  const segs = [
    sleep(local(2026, 7, 18, 19, 0), local(2026, 7, 18, 23, 0)),
    sleep(local(2026, 7, 18, 23, 20), local(2026, 7, 19, 3, 0)),
    sleep(local(2026, 7, 19, 3, 30), local(2026, 7, 19, 6, 30)),
  ];
  const m = T.metrics(segs, days);
  assert.equal(m.nightSegs['2026-6-18'], 3); // 2 wakings
  const totalH = segs.reduce((t, e) => t + (new Date(e.endedAt) - new Date(e.startedAt)) / 36e5, 0);
  assert.ok(Math.abs(m.nightH['2026-6-18'] - totalH) < 0.01);
});

test('metrics: feeds split into nursing minutes and bottle ounces per day', () => {
  const days = mkDays(local(2026, 7, 20), 1);
  const feed = (h, details) => ({
    id: 'f' + h, type: 'feed',
    startedAt: iso(local(2026, 7, 20, h)), endedAt: iso(local(2026, 7, 20, h)),
    details,
  });
  const m = T.metrics([
    feed(9, { method: 'breast', leftSec: 600, rightSec: 300, oz: null }),
    feed(12, { method: 'breast', leftSec: 300, rightSec: 300, oz: null }),
    feed(20, { method: 'bottle', oz: 4.5 }),
  ], days);
  assert.equal(m.feeds['2026-6-20'], 3);
  // spread: vm-realm arrays fail deepStrictEqual's prototype check
  assert.deepEqual([...m.nurseMin['2026-6-20']], [15, 10]);
  assert.deepEqual([...m.oz['2026-6-20']], [4.5]);
});

test('metrics on leap day bucket to Feb 29, not Feb 28 or Mar 1', () => {
  const days = mkDays(local(2028, 2, 28), 3); // Feb 28, Feb 29, Mar 1 2028
  assert.equal(days[1].getDate(), 29, 'sanity: 2028 is a leap year');
  const m = T.metrics([
    sleep(local(2028, 2, 29, 9, 0), local(2028, 2, 29, 10, 0), 'nap'),
    sleep(local(2028, 2, 29, 19, 0), local(2028, 3, 1, 6, 0)),
  ], days);
  assert.equal(m.naps['2028-1-29'], 1);
  assert.equal(m.naps['2028-1-28'], 0);
  assert.equal(m.nightH['2028-1-29'], 11);
  assert.equal(m.nightH['2028-2-1'], null, 'after-midnight portion belongs to Feb 29 night');
});

test('wallHours pins clipped boundaries and reads wall clock inside a day', () => {
  const day = local(2026, 11, 1); // fall-back day
  const dayEnd = local(2026, 11, 2);
  assert.equal(T.wallHours(local(2026, 10, 31, 23), day, dayEnd), 0, 'clips to day start');
  assert.equal(T.wallHours(local(2026, 11, 2, 1), day, dayEnd), 24, 'clips to day end');
  // 7:00 AM EST on the 25h day reads as hour 7 (wall clock), not 8 (epoch/3.6e6)
  assert.equal(T.wallHours(local(2026, 11, 1, 7, 0), day, dayEnd), 7);
  const epochHours = (+local(2026, 11, 1, 7, 0) - +day) / 36e5;
  assert.equal(epochHours, 8, 'sanity: epoch math would have said 8');
});
