/*
 * Trends view — pattern grid (days x 24h) + single-series trend charts.
 *
 * Chart palette (validated for CVD + contrast on the dark surface):
 *   sleep #8b5cf6 · feed #0d9488 · diaper #d97706
 * Marks follow the house dataviz specs: bars <= 24px with rounded data-ends,
 * 2px lines, hairline solid gridlines, one filter row scoping everything,
 * tap-tooltips that enhance (History tab is the always-available table view).
 */
const Trends = (() => {
  const C = { sleep: '#8b5cf6', feed: '#0d9488', diaper: '#d97706' };
  const W = 340; // logical SVG width; rendered at 100%

  const state = { range: 'week', show: { sleep: true, feed: true, diaper: true } };

  // ---------- date helpers ----------
  const DAY = 864e5;
  const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const key = d => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
  const shortDate = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const h1 = n => (Math.round(n * 10) / 10).toString();

  function rangeDays(events) {
    const today = sod(new Date());
    let n = state.range === 'day' ? 1 : state.range === 'week' ? 7 : state.range === 'month' ? 30 : 0;
    if (!n) { // all time
      const first = events.length ? sod(new Date(Math.min(...events.map(e => +new Date(e.startedAt))))) : today;
      n = Math.max(7, Math.round((+today - +first) / DAY) + 1);
    }
    const days = [];
    for (let i = n - 1; i >= 0; i--) days.push(new Date(+today - i * DAY));
    return days;
  }

  // ---------- metric builders ----------
  // A night "belongs to" the evening it started: sleeps starting after noon
  // count for that date; starts after midnight count for the previous date.
  const nightOf = e => {
    const s = new Date(e.startedAt);
    return key(s.getHours() >= 12 ? s : new Date(+s - DAY));
  };

  function metrics(events, days) {
    const keys = days.map(key), kset = new Set(keys);
    const m = {
      // null = no night recorded for that date (e.g. tonight hasn't happened);
      // distinct from a genuine 0 so averages skip missing nights
      nightH: Object.fromEntries(keys.map(k => [k, null])),
      nightSegs: Object.fromEntries(keys.map(k => [k, 0])),
      naps: Object.fromEntries(keys.map(k => [k, 0])),
      feeds: Object.fromEntries(keys.map(k => [k, 0])),
      nurseMin: Object.fromEntries(keys.map(k => [k, []])),
      oz: Object.fromEntries(keys.map(k => [k, []])),
      diapers: Object.fromEntries(keys.map(k => [k, 0])),
      longest: 0,
    };
    for (const e of events) {
      const k = key(new Date(e.startedAt));
      if (e.type === 'sleep' && e.endedAt) {
        const durH = (new Date(e.endedAt) - new Date(e.startedAt)) / 36e5;
        if (e.details.kind === 'night') {
          const nk = nightOf(e);
          if (nk in m.nightH) {
            m.nightH[nk] = (m.nightH[nk] || 0) + durH;
            m.nightSegs[nk] += 1;
            m.longest = Math.max(m.longest, durH);
          }
        } else if (kset.has(k)) m.naps[k] += 1;
      } else if (e.type === 'feed' && kset.has(k)) {
        m.feeds[k] += 1;
        if (e.details.method === 'bottle' && e.details.oz) m.oz[k].push(e.details.oz);
        else {
          const min = ((e.details.leftSec || 0) + (e.details.rightSec || 0)) / 60;
          if (min > 0) m.nurseMin[k].push(min);
        }
      } else if (e.type === 'diaper' && kset.has(k)) m.diapers[k] += 1;
    }
    return m;
  }

  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const avgOf = (obj, keys) => avg(keys.map(k => obj[k]).filter(v => v !== null && !isNaN(v)));

  // ---------- svg pieces ----------
  function grid(x0, y0, x1, ys) {
    return ys.map(y => `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`).join('');
  }
  const axisText = (x, y, t, anchor = 'middle') =>
    `<text x="${x}" y="${y}" fill="rgba(214,218,255,0.42)" font-size="8.5" text-anchor="${anchor}" style="font-variant-numeric:tabular-nums">${t}</text>`;

  // ---------- pattern grid (days x 24h) ----------
  function patternGrid(events, days) {
    const AX = 26, PT = 14, PB = 16, plotH = 208;
    const n = days.length;
    const slot = n > 45 ? 9 : (W - AX - 4) / n;
    const svgW = n > 45 ? AX + 4 + slot * n : W;
    const barW = Math.min(24, Math.max(4, slot - 2));
    const H = PT + plotH + PB;
    const y = h => PT + (h / 24) * plotH;
    const dx = i => AX + 2 + i * slot + (slot - barW) / 2;

    let s = '';
    // night band wash (19:00 → 07:00) — guides the eye to the night rows
    s += `<rect x="${AX}" y="${y(19)}" width="${svgW - AX - 2}" height="${y(24) - y(19)}" fill="rgba(139,92,246,0.06)"/>`;
    s += `<rect x="${AX}" y="${y(0)}" width="${svgW - AX - 2}" height="${y(7) - y(0)}" fill="rgba(139,92,246,0.06)"/>`;
    s += grid(AX, 0, svgW - 2, [0, 6, 12, 18, 24].map(y));
    [['12a', 0], ['6a', 6], ['12p', 12], ['6p', 18], ['12a', 24]].forEach(([t, h]) =>
      s += axisText(AX - 4, y(h) + 3, t, 'end'));

    const dayIdx = Object.fromEntries(days.map((d, i) => [key(d), i]));

    // sleep blocks, clipped per-day (a night spanning midnight paints 2 columns)
    if (state.show.sleep) for (const e of events) {
      if (e.type !== 'sleep' || !e.endedAt) continue;
      const st = new Date(e.startedAt), en = new Date(e.endedAt);
      for (let d = sod(st); d <= en; d = new Date(+d + DAY)) {
        const i = dayIdx[key(d)];
        if (i === undefined) continue;
        const from = Math.max(+st, +d), to = Math.min(+en, +d + DAY);
        if (to <= from) continue;
        const yy = y((from - +d) / 36e5), hh = Math.max(2, y((to - from) / 36e5) - PT);
        s += `<rect x="${dx(i)}" y="${yy.toFixed(1)}" width="${barW}" height="${hh.toFixed(1)}" rx="${Math.min(3, barW / 2)}" fill="${C.sleep}" opacity="${e.details.kind === 'night' ? 0.95 : 0.65}"/>`;
      }
    }
    // feed + diaper instants as dots
    const dot = (e, color) => {
      const t = new Date(e.startedAt), i = dayIdx[key(t)];
      if (i === undefined) return '';
      const r = slot >= 20 ? 3.5 : 2.4;
      return `<circle cx="${(dx(i) + barW / 2).toFixed(1)}" cy="${y(t.getHours() + t.getMinutes() / 60).toFixed(1)}" r="${r}" fill="${color}" stroke="rgba(10,13,38,0.9)" stroke-width="1.5"/>`;
    };
    if (state.show.feed) for (const e of events) if (e.type === 'feed') s += dot(e, C.feed);
    if (state.show.diaper) for (const e of events) if (e.type === 'diaper') s += dot(e, C.diaper);

    // x labels: first/last + every ~5th for month, weekday letters for week
    days.forEach((d, i) => {
      const show = n <= 7 || i === 0 || i === n - 1 || (n <= 45 && i % 5 === 0) || (n > 45 && i % 10 === 0);
      if (show) s += axisText(dx(i) + barW / 2, H - 4, n <= 7 ? 'SMTWTFS'[d.getDay()] : d.getDate());
    });
    // per-day transparent hit targets (>= full column) for the tooltip
    days.forEach((d, i) => {
      s += `<rect x="${AX + 2 + i * slot}" y="0" width="${slot}" height="${H}" fill="transparent" data-day="${key(d)}" data-date="${shortDate(d)}"/>`;
    });

    const inner = `<svg viewBox="0 0 ${svgW} ${H}" width="${n > 45 ? svgW * (100 / W) + '%' : '100%'}" style="display:block">${s}</svg>`;
    return n > 45 ? `<div style="overflow-x:auto">${inner}</div>` : inner;
  }

  // ---------- day lanes (single-day range) ----------
  function dayLanes(events, day) {
    const AX = 6, H = 128, laneY = { sleep: 22, feed: 66, diaper: 98 };
    const x = h => AX + (h / 24) * (W - AX - 6);
    let s = grid(AX, 0, AX, []) ;
    [0, 6, 12, 18, 24].forEach(h => {
      s += `<line x1="${x(h)}" y1="10" x2="${x(h)}" y2="${H - 14}" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>`;
      s += axisText(x(h), H - 3, ['12a', '6a', '12p', '6p', '12a'][h / 6]);
    });
    const d0 = +sod(day), d1 = d0 + DAY;
    if (state.show.sleep) for (const e of events) {
      if (e.type !== 'sleep' || !e.endedAt) continue;
      const from = Math.max(+new Date(e.startedAt), d0), to = Math.min(+new Date(e.endedAt), d1);
      if (to <= from) continue;
      s += `<rect x="${x((from - d0) / 36e5).toFixed(1)}" y="${laneY.sleep}" width="${Math.max(2, x((to - from) / 36e5) - AX).toFixed(1)}" height="18" rx="3" fill="${C.sleep}" opacity="${e.details.kind === 'night' ? 0.95 : 0.65}"/>`;
    }
    const dots = (type, color, yy) => {
      for (const e of events) {
        if (e.type !== type) continue;
        const t = +new Date(e.startedAt);
        if (t < d0 || t >= d1) continue;
        s += `<circle cx="${x((t - d0) / 36e5).toFixed(1)}" cy="${yy}" r="4" fill="${color}" stroke="rgba(10,13,38,0.9)" stroke-width="2"/>`;
      }
    };
    if (state.show.feed) dots('feed', C.feed, laneY.feed + 8);
    if (state.show.diaper) dots('diaper', C.diaper, laneY.diaper + 8);
    const lane = (t, yy) => axisText(AX, yy - 4, t, 'start');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
      ${s}${state.show.sleep ? lane('SLEEP', laneY.sleep) : ''}
      ${state.show.feed ? lane('FEEDS', laneY.feed + 4) : ''}
      ${state.show.diaper ? lane('DIAPERS', laneY.diaper + 4) : ''}</svg>`;
  }

  // ---------- single-series trend chart ----------
  function trendChart({ title, color, days, values, unit, kind }) {
    const pts = days.map((d, i) => ({ d, v: values[i] })).filter(p => p.v !== null && !isNaN(p.v));
    if (pts.length < 2 && kind === 'line') return '';
    if (!pts.some(p => p.v > 0) && kind === 'bar') return '';
    const AX = 22, PT = 10, PB = 14, plotH = 74, H = PT + plotH + PB;
    const max = Math.max(1, ...days.map((d, i) => values[i] || 0));
    const nice = max <= 2 ? 2 : max <= 5 ? 5 : max <= 10 ? 10 : max <= 16 ? 16 : Math.ceil(max / 5) * 5;
    const xx = i => AX + 4 + (days.length === 1 ? 0 : (i / (days.length - 1)) * (W - AX - 26));
    const yy = v => PT + (1 - v / nice) * plotH;
    let s = grid(AX, 0, W - 4, [yy(0), yy(nice / 2), yy(nice)]);
    s += axisText(AX - 4, yy(0) + 3, '0', 'end') + axisText(AX - 4, yy(nice) + 3, nice, 'end');
    s += axisText(xx(0), H - 2, shortDate(days[0]), 'start') + axisText(xx(days.length - 1), H - 2, shortDate(days[days.length - 1]), 'end');

    if (kind === 'bar') {
      const slot = (W - AX - 26) / Math.max(1, days.length - 1);
      const bw = Math.min(24, Math.max(3, slot - 2));
      days.forEach((d, i) => {
        const v = values[i];
        if (v === null || isNaN(v) || v <= 0) return;
        s += `<rect x="${(xx(i) - bw / 2).toFixed(1)}" y="${yy(v).toFixed(1)}" width="${bw}" height="${(yy(0) - yy(v)).toFixed(1)}" rx="2" fill="${color}"/>`;
      });
    } else {
      const path = pts.map((p, j) => `${j ? 'L' : 'M'}${xx(days.indexOf(p.d)).toFixed(1)} ${yy(p.v).toFixed(1)}`).join(' ');
      const areaPath = `${path} L${xx(days.indexOf(pts[pts.length - 1].d)).toFixed(1)} ${yy(0)} L${xx(days.indexOf(pts[0].d)).toFixed(1)} ${yy(0)} Z`;
      s += `<path d="${areaPath}" fill="${color}" opacity="0.1"/>`;
      s += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
      const last = pts[pts.length - 1];
      s += `<circle cx="${xx(days.indexOf(last.d)).toFixed(1)}" cy="${yy(last.v).toFixed(1)}" r="4" fill="${color}" stroke="rgba(10,13,38,0.9)" stroke-width="2"/>`;
    }
    // end label: last value only (selective direct labeling)
    const lastV = pts.length ? pts[pts.length - 1].v : null;
    if (lastV !== null) {
      const lx = Math.min(W - 6, xx(days.indexOf(pts[pts.length - 1].d)) + 6);
      s += `<text x="${lx}" y="${Math.max(10, yy(lastV) - 7)}" fill="rgba(242,241,255,0.9)" font-size="10" font-weight="700" text-anchor="end">${h1(lastV)}${unit}</text>`;
    }
    // per-day hit targets
    days.forEach((d, i) => {
      const slot = (W - AX - 26) / Math.max(1, days.length - 1);
      s += `<rect x="${(xx(i) - slot / 2).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent" data-day="${key(d)}" data-date="${shortDate(d)}"/>`;
    });
    return `<div class="chart-card">
      <div class="chart-title">${title}</div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${s}</svg>
    </div>`;
  }

  // ---------- stat tiles ----------
  function tile(label, value, delta, goodWhenUp) {
    let d = '';
    if (delta !== null && !isNaN(delta) && Math.abs(delta) >= 0.05) {
      const up = delta > 0;
      const good = up === goodWhenUp;
      d = `<div class="tile-delta ${good ? 'good' : 'bad'}">${up ? '▲' : '▼'} ${h1(Math.abs(delta))} vs prior</div>`;
    }
    return `<div class="stat"><div class="num">${value}</div><div class="lbl">${label}</div>${d}</div>`;
  }

  function tiles(events, days) {
    const m = metrics(events, days);
    const keys = days.map(key);
    // previous equal-length period for deltas
    let pm = null, pkeys = [];
    if (state.range !== 'all') {
      const prevDays = days.map(d => new Date(+d - days.length * DAY));
      pkeys = prevDays.map(key);
      pm = metrics(events, prevDays);
    }
    let html = '';
    if (state.show.sleep) {
      const nh = avgOf(m.nightH, keys), pnh = pm ? avgOf(pm.nightH, pkeys) : null;
      const wk = avg(keys.filter(k => m.nightSegs[k] > 0).map(k => m.nightSegs[k] - 1));
      const pwk = pm ? avg(pkeys.filter(k => pm.nightSegs[k] > 0).map(k => pm.nightSegs[k] - 1)) : null;
      html += tile('Night sleep /night', nh ? h1(nh) + 'h' : '—', nh !== null && pnh !== null ? nh - pnh : null, true);
      html += tile('Night wakings', wk !== null ? h1(wk) : '—', wk !== null && pwk !== null ? wk - pwk : null, false);
      html += tile('Longest stretch', m.longest ? h1(m.longest) + 'h' : '—', pm ? m.longest - pm.longest : null, true);
      html += tile('Naps /day', h1(avgOf(m.naps, keys) || 0), null, true);
    }
    if (state.show.feed) {
      const fd = avgOf(m.feeds, keys), pfd = pm ? avgOf(pm.feeds, pkeys) : null;
      html += tile('Feeds /day', fd ? h1(fd) : '—', fd !== null && pfd !== null ? fd - pfd : null, true);
      const nm = avg(keys.flatMap(k => m.nurseMin[k]));
      const pnm = pm ? avg(pkeys.flatMap(k => pm.nurseMin[k])) : null;
      if (nm !== null) html += tile('Nursing min /session', h1(nm), pnm !== null ? nm - pnm : null, false);
      const oz = avg(keys.flatMap(k => m.oz[k]));
      const poz = pm ? avg(pkeys.flatMap(k => pm.oz[k])) : null;
      if (oz !== null) html += tile('Oz /bottle', h1(oz), poz !== null ? oz - poz : null, true);
    }
    if (state.show.diaper) {
      const dd = avgOf(m.diapers, keys), pdd = pm ? avgOf(pm.diapers, pkeys) : null;
      html += tile('Diapers /day', dd ? h1(dd) : '—', dd !== null && pdd !== null ? dd - pdd : null, true);
    }
    return `<div class="stat-grid">${html}</div>`;
  }

  // ---------- tooltip ----------
  function daySummaryLines(events, dayK) {
    const lines = [];
    const evs = events.filter(e => key(new Date(e.startedAt)) === dayK ||
      (e.type === 'sleep' && e.endedAt && key(new Date(e.endedAt)) === dayK));
    const sleeps = evs.filter(e => e.type === 'sleep' && e.endedAt);
    if (state.show.sleep && sleeps.length) {
      const tot = sleeps.reduce((t, e) => t + (new Date(e.endedAt) - new Date(e.startedAt)) / 36e5, 0);
      lines.push(['sleep', `Sleep ${h1(tot)}h · ${sleeps.filter(e => e.details.kind === 'nap').length} naps`]);
    }
    const feeds = evs.filter(e => e.type === 'feed');
    if (state.show.feed && feeds.length) {
      const oz = feeds.reduce((t, e) => t + (e.details.oz || 0), 0);
      const min = feeds.reduce((t, e) => t + ((e.details.leftSec || 0) + (e.details.rightSec || 0)) / 60, 0);
      lines.push(['feed', `Feeds ${feeds.length}${min ? ` · ${Math.round(min)}m nursed` : ''}${oz ? ` · ${h1(oz)}oz` : ''}`]);
    }
    const dp = evs.filter(e => e.type === 'diaper');
    if (state.show.diaper && dp.length) lines.push(['diaper', `Diapers ${dp.length}`]);
    return lines;
  }

  // ---------- main render ----------
  function render(root, events) {
    const days = rangeDays(events);
    const finished = events.filter(e => e.endedAt || e.type === 'diaper');
    const active = k => state.show[k] ? 'on' : '';
    const rangeBtn = (id, lbl) =>
      `<button data-range="${id}" class="${state.range === id ? 'selected' : ''}">${lbl}</button>`;

    const m = metrics(finished, days);
    const nightVals = days.map(d => m.nightH[key(d)] || null);
    const wakeVals = days.map(d => m.nightSegs[key(d)] ? Math.max(0, m.nightSegs[key(d)] - 1) : null);
    const nurseVals = days.map(d => avg(m.nurseMin[key(d)]));
    const ozVals = days.map(d => avg(m.oz[key(d)]));

    root.innerHTML = `
      <h1>Trends</h1>
      <div class="filter-row">
        <div class="engine-toggle range-toggle">
          ${rangeBtn('day', 'Day')}${rangeBtn('week', 'Week')}${rangeBtn('month', 'Month')}${rangeBtn('all', 'All')}
        </div>
        <div class="chip-row">
          <button class="chip chip-sleep ${active('sleep')}" data-chip="sleep"><span class="swatch"></span>Sleep</button>
          <button class="chip chip-feed ${active('feed')}" data-chip="feed"><span class="swatch"></span>Feeds</button>
          <button class="chip chip-diaper ${active('diaper')}" data-chip="diaper"><span class="swatch"></span>Diapers</button>
        </div>
      </div>
      ${finished.length === 0 ? '<div class="subtitle">Nothing logged yet — charts appear as you track.</div>' : `
      ${tiles(finished, days)}
      <div class="chart-card">
        <div class="chart-title">${state.range === 'day' ? 'Today' : 'Sleep pattern'} <span class="chart-sub">${state.range === 'day' ? '' : 'each column is a day · midnight → midnight'}</span></div>
        ${state.range === 'day' ? dayLanes(finished, days[0]) : patternGrid(finished, days)}
      </div>
      ${state.range === 'day' ? '' : `
        ${state.show.sleep ? trendChart({ title: 'Night sleep (hours)', color: C.sleep, days, values: nightVals, unit: 'h', kind: 'line' }) : ''}
        ${state.show.sleep ? trendChart({ title: 'Night wakings', color: C.sleep, days, values: wakeVals, unit: '', kind: 'bar' }) : ''}
        ${state.show.feed ? trendChart({ title: 'Nursing minutes per session', color: C.feed, days, values: nurseVals, unit: 'm', kind: 'line' }) : ''}
        ${state.show.feed ? trendChart({ title: 'Ounces per bottle', color: C.feed, days, values: ozVals, unit: 'oz', kind: 'line' }) : ''}
      `}`}
      <div id="trend-tip" class="trend-tip hidden"></div>
    `;

    root.querySelectorAll('[data-range]').forEach(b => b.addEventListener('click', () => {
      state.range = b.dataset.range; render(root, events);
    }));
    root.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
      state.show[b.dataset.chip] = !state.show[b.dataset.chip]; render(root, events);
    }));

    // tap-tooltip: per-day hit targets (enhances; History tab is the table view)
    const tip = root.querySelector('#trend-tip');
    root.addEventListener('pointerdown', ev => {
      const t = ev.target.closest('[data-day]');
      if (!t) { tip.classList.add('hidden'); return; }
      tip.textContent = '';
      const head = document.createElement('div');
      head.className = 'tip-date';
      head.textContent = t.dataset.date;
      tip.appendChild(head);
      const lines = daySummaryLines(finished, t.dataset.day);
      if (!lines.length) {
        const row = document.createElement('div');
        row.textContent = 'No entries';
        tip.appendChild(row);
      }
      for (const [k, text] of lines) {
        const row = document.createElement('div');
        row.className = 'tip-row';
        const sw = document.createElement('span');
        sw.className = 'tip-key';
        sw.style.background = C[k];
        row.appendChild(sw);
        row.appendChild(document.createTextNode(text));
        tip.appendChild(row);
      }
      tip.classList.remove('hidden');
      const rect = root.getBoundingClientRect();
      tip.style.left = Math.max(8, Math.min(ev.clientX - rect.left - 80, rect.width - 176)) + 'px';
      tip.style.top = (ev.clientY - rect.top + 14) + 'px';
    });
  }

  return { render };
})();
