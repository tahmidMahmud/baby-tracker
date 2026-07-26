// Schedule engines: brackets, suggestions, personalization, forecasts.
// Run with TZ=America/New_York (see package.json) for deterministic local time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './load.mjs';

const { Schedules } = loadApp();
const local = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi);

test('bracket boundaries are exclusive at maxWeeks', () => {
  const tcb = Schedules.ENGINES.tcb;
  assert.equal(Schedules.bracketFor(tcb, 0).maxWeeks, 4);
  assert.equal(Schedules.bracketFor(tcb, 3.99).maxWeeks, 4);
  assert.equal(Schedules.bracketFor(tcb, 4).maxWeeks, 12);   // 4w rolls to the next bracket
  assert.equal(Schedules.bracketFor(tcb, 11.99).maxWeeks, 12);
  // ages past the table clamp to the last bracket instead of crashing
  assert.equal(Schedules.bracketFor(tcb, 500), tcb.brackets[tcb.brackets.length - 1]);
});

test('TCB uses published per-nap offsets where available', () => {
  // 18w (4mo): perNap [120,130,140,150] — nap 2 comes 130min after wake
  const wake = local(2026, 7, 20, 10, 0);
  const sug = Schedules.suggest('tcb', {
    ageWeeks: 18, lastWakeTime: wake, napsToday: 1,
    lastNapDurationMin: 60, recentWakeWindows: [], now: local(2026, 7, 20, 10, 30),
  });
  assert.equal(sug.isBedtime, false);
  assert.equal(+sug.suggestedTime, +wake + 130 * 60000);
  assert.equal(sug.targetWw, 130);
});

test('TCB ignores personalization; Huckleberry blends and clamps to bracket', () => {
  const wake = local(2026, 7, 20, 9, 0);
  const base = {
    ageWeeks: 18, lastWakeTime: wake, napsToday: 1,
    lastNapDurationMin: 90, now: local(2026, 7, 20, 9, 10),
  };
  const tcbA = Schedules.suggest('tcb', { ...base, recentWakeWindows: [] });
  const tcbB = Schedules.suggest('tcb', { ...base, recentWakeWindows: [30, 30, 30] });
  assert.equal(+tcbA.suggestedTime, +tcbB.suggestedTime);

  // HB 17-26w bracket is [90,150]; absurdly short observed windows must clamp to >= 90
  const hb = Schedules.suggest('huckleberry', { ...base, recentWakeWindows: [30, 30, 30] });
  assert.ok(hb.personalized);
  assert.ok(hb.targetWw >= 90 && hb.targetWw <= 150, `clamped, got ${hb.targetWw}`);
});

test('Huckleberry shortens the window after a short nap, never below bracket min', () => {
  const wake = local(2026, 7, 20, 9, 0);
  const base = {
    ageWeeks: 18, lastWakeTime: wake, napsToday: 1, recentWakeWindows: [],
    now: local(2026, 7, 20, 9, 10),
  };
  const normal = Schedules.suggest('huckleberry', { ...base, lastNapDurationMin: 90 });
  const short = Schedules.suggest('huckleberry', { ...base, lastNapDurationMin: 20 });
  assert.equal(normal.targetWw - short.targetWw, 15);
  const floor = Schedules.suggest('huckleberry', {
    ...base, lastNapDurationMin: 20, recentWakeWindows: [90, 90, 90, 90],
  });
  assert.ok(floor.targetWw >= 90);
});

test('a suggestion landing after the bedtime window becomes bedtime', () => {
  // last wake 7:00 PM, 18w: any wake window lands past the 8:30 PM bedtime end
  const sug = Schedules.suggest('tcb', {
    ageWeeks: 18, lastWakeTime: local(2026, 7, 20, 19, 0), napsToday: 2,
    lastNapDurationMin: 60, recentWakeWindows: [], now: local(2026, 7, 20, 19, 15),
  });
  assert.equal(sug.isBedtime, true);
});

test('nap-count exhaustion suggests bedtime', () => {
  const sug = Schedules.suggest('tcb', {
    ageWeeks: 40, lastWakeTime: local(2026, 7, 20, 15, 0), napsToday: 2, // 40w = 2-nap bracket
    lastNapDurationMin: 60, recentWakeWindows: [], now: local(2026, 7, 20, 15, 10),
  });
  assert.equal(sug.isBedtime, true);
});

test('forecast never schedules a nap in the past and always ends in bedtime', () => {
  const now = local(2026, 7, 20, 12, 0);
  for (const engine of ['tcb', 'huckleberry']) {
    const items = Schedules.forecast(engine, {
      ageWeeks: 18, lastWakeTime: local(2026, 7, 20, 8, 0), // wake long past
      napsToday: 1, recentWakeWindows: [], now,
    });
    assert.ok(items.length >= 1);
    for (const it of items) {
      if (it.type === 'nap') assert.ok(+it.start >= +now, `${engine} nap in past`);
    }
    assert.equal(items[items.length - 1].type, 'bed', `${engine} must end at bedtime`);
  }
});

test('forecast converts a too-late nap into bedtime, flexed at most 1h early', () => {
  // 18w bedtime anchor 19:00; last wake 15:30 → next window ~2h10m lands 17:40,
  // within 75min of 19:00 → becomes bedtime, clamped to >= 18:00
  const items = Schedules.forecast('tcb', {
    ageWeeks: 18, lastWakeTime: local(2026, 7, 20, 15, 30), napsToday: 2,
    recentWakeWindows: [], now: local(2026, 7, 20, 15, 31),
  });
  const bed = items.find(i => i.type === 'bed');
  assert.ok(bed, 'has bedtime');
  const bedH = bed.start.getHours() + bed.start.getMinutes() / 60;
  assert.ok(bedH >= 18 && bedH <= 19, `bed between 6pm and 7pm, got ${bedH}`);
});

test('forecast is bounded (no infinite loops for newborns with tiny windows)', () => {
  const items = Schedules.forecast('huckleberry', {
    ageWeeks: 1, lastWakeTime: local(2026, 7, 20, 6, 0), napsToday: 0,
    recentWakeWindows: [], now: local(2026, 7, 20, 6, 5),
  });
  assert.ok(items.length <= 7);
});

test('sourcesFor returns per-age primary links', () => {
  const s15 = Schedules.sourcesFor('tcb', 15);
  assert.ok(s15.some(s => s.url.includes('wake-windows')));
  const s32 = Schedules.sourcesFor('tcb', 32);
  assert.ok(s32.some(s => s.url.includes('3-to-2-nap-transition')));
  assert.ok(s32.length === 3);
  assert.equal(Schedules.sourcesFor('nope', 15).length, 0);
});

test('napLenFor falls back sanely past the table end', () => {
  assert.ok(Schedules.napLenFor(Schedules.ENGINES.tcb, 500) > 0);
  assert.ok(Schedules.napLenFor(Schedules.ENGINES.huckleberry, 0) === 45);
});
