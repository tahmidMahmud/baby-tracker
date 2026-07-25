/*
 * Sleep schedule engines: "Taking Cara Babies" and "Huckleberry-style".
 *
 * Numbers are from each brand's own published documentation, verified by
 * a multi-source research pass on 2026-07-24 (see docs/research.md for the
 * full tables, sources, and caveats). Where a brand publishes a range but
 * not a per-nap breakdown, per-nap values are interpolated within the
 * verified range (marked "approx" in docs/research.md).
 *
 * Engine contract:
 *   Schedules.suggest(engineId, opts) -> suggestion
 *   opts: { ageWeeks, lastWakeTime: Date|null, napsToday: number,
 *           lastNapDurationMin: number|null,
 *           recentWakeWindows: number[],   // observed WWs (min), last ~7 days
 *           now: Date }
 *
 * Bracket fields:
 *   maxWeeks  — exclusive upper bound
 *   ww        — [min,max] wake window in minutes (verified brand range)
 *   perNap    — optional explicit per-position windows in minutes
 *               (index 0 = wake→nap1; last = last nap→bedtime)
 *   napsMax   — nap slots before the engine suggests bedtime instead
 *   naps      — display string
 *   bedtime   — [startHour, endHour] (decimal hours, 24h clock)
 *   note      — shown under the suggestion
 */
const Schedules = (() => {

  // ---- Taking Cara Babies: fixed graduated wake windows, 7-8pm anchor ----
  // WW table verified: 0-4wk 30-60m · 4-12wk 60-90m · 3-4mo 75-120m ·
  // 5-7mo 2-3h · 7-10mo 2.5-3.5h · 11-14mo 3-4h. Transitions: 4→3 @ 4-5mo,
  // 3→2 @ 6.5-8mo, 2→1 @ 13-18mo. Bedtime 7-8pm verified for 5mo+.
  const TCB = {
    id: 'tcb',
    name: 'Taking Cara Babies',
    brackets: [
      { maxWeeks: 4,  ww: [30, 60],   naps: '4-5+', napsMax: 5, bedtime: [21, 23],
        note: 'Newborn: follow sleepy cues; late bedtime is normal.' },
      { maxWeeks: 12, ww: [60, 90],   naps: '4-5',  napsMax: 5, bedtime: [20, 22],
        note: 'Windows lengthen through the day.' },
      { maxWeeks: 17, ww: [75, 120],  naps: '4',    napsMax: 4, bedtime: [19.5, 21],
        note: '4→3 nap transition typically at 4-5 months.' },
      { maxWeeks: 22, ww: [120, 150], perNap: [120, 130, 140, 150], naps: '3-4', napsMax: 4, bedtime: [19, 20],
        note: '3-nap phase: ~2h first window, ~2.5h before bed.' },
      { maxWeeks: 28, ww: [120, 180], perNap: [120, 150, 170, 180], naps: '3', napsMax: 3, bedtime: [19, 20],
        note: 'Day sleep goal 3-4h; cap any single nap at 2h.' },
      { maxWeeks: 35, ww: [150, 210], perNap: [150, 180, 200], naps: '2-3', napsMax: 3, bedtime: [19, 20],
        note: '3→2 nap transition typically at 6.5-8 months.' },
      { maxWeeks: 44, ww: [150, 210], perNap: [165, 180, 200], naps: '2', napsMax: 2, bedtime: [19, 20],
        note: '2 naps: ~2.5-3h to nap 1, ~3h between, ~3-3.5h to bed.' },
      { maxWeeks: 61, ww: [180, 240], perNap: [180, 200, 225], naps: '2', napsMax: 2, bedtime: [19, 20],
        note: 'Afternoon nap should end by 3-4pm. 2→1 at 13-18 months.' },
    ],
    adaptive: false,
    napCapMin: 120, // TCB: no single nap over 2h on multi-nap schedules
  };

  // ---- Huckleberry-style: age baselines + per-child adaptation ----
  // WW table verified: 0-2mo 30-90m · 3mo 1-2h · 4-5mo 1.5-2.5h · 6mo 2-3h ·
  // 7-9mo 2.5-3.5h · 10-12mo 3-4h (12mo: 3.25-4h). Naps 4-5 → 2 by 12mo;
  // 3→2 complete ~8-9mo, gated on wake-window tolerance not age alone.
  // SweetSpot itself is proprietary; this engine mimics its described
  // behavior: age-appropriate baseline blended with the baby's own logs.
  const HB = {
    id: 'huckleberry',
    name: 'Huckleberry-style',
    brackets: [
      { maxWeeks: 9,  ww: [30, 90],   naps: '4-5',  napsMax: 5, bedtime: [20, 22],
        note: 'Newborn: 30-90m windows, total sleep 16-17h/day.' },
      { maxWeeks: 17, ww: [60, 120],  naps: '4-5',  napsMax: 5, bedtime: [19.5, 21],
        note: '' },
      { maxWeeks: 26, ww: [90, 150],  naps: '3-4',  napsMax: 4, bedtime: [19, 20.5],
        note: '4 naps while windows are 1.5-2.5h; 3 naps once 2-3h is comfortable.' },
      { maxWeeks: 30, ww: [120, 180], naps: '3',    napsMax: 3, bedtime: [19, 20.5],
        note: '' },
      { maxWeeks: 39, ww: [150, 210], naps: '2-3',  napsMax: 3, bedtime: [19, 20],
        note: '3→2 nap transition usually complete by 8-9 months.' },
      { maxWeeks: 44, ww: [150, 210], naps: '2',    napsMax: 2, bedtime: [19, 20],
        note: '' },
      { maxWeeks: 61, ww: [180, 240], naps: '2',    napsMax: 2, bedtime: [19, 20],
        note: '~13h total sleep: 11-12h night + 2-3h day.' },
    ],
    adaptive: true,
    napCapMin: null,
  };

  const ENGINES = { tcb: TCB, huckleberry: HB };

  // Primary sources backing each bracket (verified 2026-07-24)
  const SRC = {
    tcbWW: ['Wake windows chart', 'https://www.takingcarababies.com/blogs/sleep-basics/wake-windows-and-baby-sleep'],
    tcbNewborn: ['Newborn schedule', 'https://www.takingcarababies.com/blogs/sleep-schedules/newborn-sleep-schedule'],
    tcb43: ['4→3 nap transition', 'https://www.takingcarababies.com/blogs/naps/4-to-3-nap-transition'],
    tcbNaps: ['Nap schedules 5-24 mo', 'https://www.takingcarababies.com/blogs/sleep-schedules/nap-schedules-5-months-to-24-months'],
    tcb32: ['3→2 nap transition', 'https://www.takingcarababies.com/blogs/naps/3-to-2-nap-transition'],
    tcb12: ['12-month schedule', 'https://www.takingcarababies.com/blogs/sleep-schedules/12-month-old-sleep-schedule'],
    hbYear: ['First-year sleep guide', 'https://huckleberrycare.com/blog/first-year-of-sleep-expectations'],
    hb5: ['5-month schedule', 'https://huckleberrycare.com/blog/5-month-old-sleep-schedule-and-development'],
    hb32: ['3→2 nap transition', 'https://huckleberrycare.com/blog/3-to-2-nap-transition'],
    hb12: ['12-month schedule', 'https://huckleberrycare.com/blog/12-month-old-sleep-schedule-and-development'],
    hbTrans: ['Nap transitions', 'https://huckleberrycare.com/blog/nap-transitions-when-they-occur-and-how-to-handle-them'],
  };
  // per-bracket source keys, same order as each engine's brackets array
  TCB.srcs = [
    ['tcbWW', 'tcbNewborn'], ['tcbWW', 'tcbNewborn'], ['tcbWW'],
    ['tcbWW', 'tcb43'], ['tcbWW', 'tcbNaps'], ['tcbWW', 'tcbNaps', 'tcb32'],
    ['tcbWW', 'tcbNaps'], ['tcbWW', 'tcbNaps', 'tcb12'],
  ];
  HB.srcs = [
    ['hbYear'], ['hbYear'], ['hbYear', 'hb5'], ['hbYear'],
    ['hbYear', 'hb32', 'hbTrans'], ['hbYear', 'hbTrans'], ['hbYear', 'hb12'],
  ];

  function sourcesFor(engineId, ageWeeks) {
    const engine = ENGINES[engineId];
    if (!engine || !engine.srcs) return [];
    let i = engine.brackets.findIndex(b => ageWeeks < b.maxWeeks);
    if (i < 0) i = engine.brackets.length - 1;
    return (engine.srcs[i] || []).map(k => ({ label: SRC[k][0], url: SRC[k][1] }));
  }

  // Typical nap length (minutes) by bracket index — used only for forecasting.
  // Derived from each brand's day-sleep goals (e.g. TCB 5-7mo: 3-4h over 3
  // naps ≈ 70m/nap); newborn naps assumed shorter.
  TCB.napLens = [45, 50, 60, 60, 70, 75, 75, 80];
  HB.napLens = [45, 50, 60, 65, 70, 75, 80];

  function bracketFor(engine, ageWeeks) {
    const b = engine.brackets.find(b => ageWeeks < b.maxWeeks);
    return b || engine.brackets[engine.brackets.length - 1];
  }

  function napLenFor(engine, ageWeeks) {
    const i = engine.brackets.findIndex(b => ageWeeks < b.maxWeeks);
    const lens = engine.napLens || [];
    return lens[i >= 0 ? i : lens.length - 1] || 60;
  }

  /**
   * Simulate the rest of today: remaining naps (with assumed lengths) until
   * bedtime. Returns [{type:'nap', start, end, n} ..., {type:'bed', start}].
   */
  function forecast(engineId, opts) {
    const engine = ENGINES[engineId] || TCB;
    const { ageWeeks, now } = opts;
    const napLen = napLenFor(engine, ageWeeks);
    const out = [];
    let wake = opts.lastWakeTime || now;
    let naps = opts.napsToday;
    for (let i = 0; i < 7; i++) {
      const sug = suggest(engineId, {
        ageWeeks, lastWakeTime: wake, napsToday: naps,
        lastNapDurationMin: null,
        recentWakeWindows: opts.recentWakeWindows || [],
        now,
      });
      if (!sug.suggestedTime) break;
      let start = sug.suggestedTime;
      if (+start < +now) start = new Date(now); // no naps in the past
      if (sug.isBedtime) { out.push({ type: 'bed', start }); break; }
      // A nap that would start within ~75min of the bedtime anchor becomes
      // bedtime instead (both methods pull bedtime earlier over a late nap)
      const btStart = sug.bedtimeRange[0];
      if (+start >= +btStart - 75 * 60000) {
        // flex bedtime earlier, but never more than 1h before the anchor
        const bed = Math.min(+btStart, Math.max(+start, +btStart - 60 * 60000));
        out.push({ type: 'bed', start: new Date(bed) });
        break;
      }
      const end = new Date(+start + napLen * 60000);
      out.push({ type: 'nap', start, end, n: naps + 1 });
      wake = end;
      naps += 1;
    }
    return out;
  }

  function median(arr) {
    if (!arr || !arr.length) return null;
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function suggest(engineId, opts) {
    const engine = ENGINES[engineId] || TCB;
    const { ageWeeks, lastWakeTime, napsToday, lastNapDurationMin,
            recentWakeWindows, now } = opts;
    const br = bracketFor(engine, ageWeeks);
    const [wwMin, wwMax] = br.ww;

    let targetWw;
    if (br.perNap) {
      // Explicit per-position windows (TCB publishes these for 2-3 nap ages)
      const idx = Math.min(napsToday, br.perNap.length - 1);
      targetWw = br.perNap[idx];
    } else {
      // Graduated: shortest window first thing, longest before bed
      // (both brands document this pattern through 12 months)
      const frac = br.napsMax <= 1 ? 0.5 : Math.min(1, napsToday / (br.napsMax - 1));
      targetWw = wwMin + (wwMax - wwMin) * frac;
    }

    // Huckleberry-style personalization: blend the age baseline with the
    // baby's own observed wake windows (SweetSpot's described behavior:
    // "sleep logs + age-appropriate recommendations").
    let personalized = false;
    if (engine.adaptive && recentWakeWindows && recentWakeWindows.length >= 3) {
      const own = median(recentWakeWindows);
      if (own !== null) {
        targetWw = Math.min(wwMax, Math.max(wwMin, (targetWw + own) / 2));
        personalized = true;
      }
    }

    // Short previous nap → earlier next sleep (tired-but-not-overtired)
    if (engine.adaptive && lastNapDurationMin !== null && lastNapDurationMin < 45) {
      targetWw = Math.max(wwMin, targetWw - 15);
    }

    const isBedtimeNext = napsToday >= br.napsMax;
    let suggestedTime = null;
    if (lastWakeTime) {
      suggestedTime = new Date(lastWakeTime.getTime() + targetWw * 60000);
    }

    const bt = new Date(now);
    bt.setHours(Math.floor(br.bedtime[0]), Math.round((br.bedtime[0] % 1) * 60), 0, 0);
    const btEnd = new Date(now);
    btEnd.setHours(Math.floor(br.bedtime[1]), Math.round((br.bedtime[1] % 1) * 60), 0, 0);

    const treatAsBedtime = isBedtimeNext || (suggestedTime && suggestedTime > btEnd);

    return {
      engineName: engine.name,
      isBedtime: treatAsBedtime,
      // TCB: bedtime may flex earlier (to ~6-6:30pm) when the last nap ends
      // early — so if the wake-window math lands before the 7pm anchor,
      // show the earlier time rather than clamping to the anchor.
      suggestedTime: treatAsBedtime ? (suggestedTime && suggestedTime < bt ? suggestedTime : bt) : suggestedTime,
      windowMin: wwMin,
      windowMax: wwMax,
      targetWw: Math.round(targetWw),
      personalized,
      napsExpected: br.naps,
      napCapMin: engine.napCapMin,
      bedtimeRange: [bt, btEnd],
      note: br.note,
    };
  }

  function engineList() {
    return Object.values(ENGINES).map(e => ({ id: e.id, name: e.name }));
  }

  return { suggest, forecast, napLenFor, sourcesFor, engineList, bracketFor, ENGINES };
})();
