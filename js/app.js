/* Baby Tracker UI */
(() => {
  const view = document.getElementById('view');
  const sheet = document.getElementById('sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  let currentTab = 'home';
  let tickInterval = null;

  // ---------- helpers ----------
  const pad = n => String(n).padStart(2, '0');
  const fmtTime = d => {
    d = new Date(d);
    let h = d.getHours(), m = d.getMinutes();
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${pad(m)} ${ap}`;
  };
  const fmtDur = ms => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  };
  const fmtDurShort = min => {
    if (min == null) return '';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();

  function ageWeeks() {
    const s = Store.getSettings();
    if (!s.birthdate) return null;
    return (Date.now() - new Date(s.birthdate).getTime()) / (7 * 24 * 3600 * 1000);
  }
  function ageLabel() {
    const w = ageWeeks();
    if (w === null) return 'Set birthdate in Settings';
    if (w < 12) return `${Math.floor(w)}w ${Math.floor((w % 1) * 7)}d old`;
    const months = Math.floor(w / 4.345);
    return `${months}mo (${Math.floor(w)}w) old`;
  }
  function diapersVisible() {
    const s = Store.getSettings();
    if (s.showDiapers === 'on') return true;
    if (s.showDiapers === 'off') return false;
    const w = ageWeeks();
    return w === null || w < 4.5; // auto: first month
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- sheets ----------
  function openSheet(html) {
    sheet.innerHTML = html;
    sheet.classList.remove('hidden');
    backdrop.classList.remove('hidden');
  }
  function closeSheet() {
    sheet.classList.add('hidden');
    backdrop.classList.add('hidden');
    sheet.innerHTML = '';
  }
  backdrop.addEventListener('click', closeSheet);

  // ---------- home ----------
  async function renderHome() {
    const running = Store.getRunning();
    const settings = Store.getSettings();
    const events = await Store.getEvents();
    const now = new Date();

    // today's sleep events for suggestion inputs
    const todaySleeps = events.filter(e => e.type === 'sleep' && e.endedAt && sameDay(e.endedAt, now));
    const napsToday = todaySleeps.filter(e => e.details.kind === 'nap').length;
    const lastSleep = events.find(e => e.type === 'sleep' && e.endedAt);
    const lastWake = lastSleep ? new Date(lastSleep.endedAt) : null;
    const lastNapDur = lastSleep && lastSleep.details.kind === 'nap'
      ? (new Date(lastSleep.endedAt) - new Date(lastSleep.startedAt)) / 60000 : null;

    // Observed wake windows over the last 7 days: gap between the end of one
    // sleep and the start of the next (feeds the Huckleberry-style engine).
    const weekAgo = now.getTime() - 7 * 864e5;
    const sleepsAsc = events
      .filter(e => e.type === 'sleep' && e.endedAt && new Date(e.startedAt).getTime() > weekAgo)
      .sort((a, b) => new Date(a.startedAt) - new Date(b.startedAt));
    const recentWakeWindows = [];
    for (let i = 1; i < sleepsAsc.length; i++) {
      const gap = (new Date(sleepsAsc[i].startedAt) - new Date(sleepsAsc[i - 1].endedAt)) / 60000;
      if (gap >= 20 && gap <= 360) recentWakeWindows.push(gap);
    }

    let suggestionHtml = '';
    const w = ageWeeks();
    if (w !== null && !running.sleep) {
      const sug = Schedules.suggest(settings.engine, {
        ageWeeks: w, lastWakeTime: lastWake, napsToday,
        lastNapDurationMin: lastNapDur, recentWakeWindows, now,
      });
      const timeStr = sug.suggestedTime ? fmtTime(sug.suggestedTime) : '—';
      const label = sug.isBedtime ? 'Bedtime' : `Nap ${napsToday + 1}`;
      const C = (2 * Math.PI * 84).toFixed(1);
      const ringData = (sug.suggestedTime && lastWake)
        ? `data-start="${lastWake.toISOString()}" data-target="${sug.suggestedTime.toISOString()}"` : '';
      suggestionHtml = `
        <div class="card suggestion">
          <div class="engine-toggle">
            ${Schedules.engineList().map(e =>
              `<button data-engine="${e.id}" class="${settings.engine === e.id ? 'selected' : ''}">${esc(e.name)}</button>`).join('')}
          </div>
          <div class="hero-body">
            <div class="ring-wrap">
              <svg viewBox="0 0 200 200">
                <defs>
                  <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#c4b5fd"/>
                    <stop offset="55%" stop-color="#8b5cf6"/>
                    <stop offset="100%" stop-color="#5eead4"/>
                  </linearGradient>
                </defs>
                <circle class="ring-track" cx="100" cy="100" r="84"/>
                <circle class="ring-fill" cx="100" cy="100" r="84"
                  stroke-dasharray="${C}" stroke-dashoffset="${C}" ${ringData}/>
              </svg>
              <div class="ring-center">
                <div class="ring-label">${label}</div>
                <div class="big-time">${timeStr}</div>
                <div class="countdown" ${sug.suggestedTime ? `data-until="${sug.suggestedTime.toISOString()}"` : ''}></div>
              </div>
            </div>
          </div>
          <div class="engine-note">
            Wake window ${fmtDurShort(sug.windowMin)}–${fmtDurShort(sug.windowMax)} ·
            ${sug.napsExpected} naps/day · bedtime ${fmtTime(sug.bedtimeRange[0])}–${fmtTime(sug.bedtimeRange[1])}
          </div>
          ${sug.note ? `<div class="engine-note">${esc(sug.note)}</div>` : ''}
          ${sug.personalized ? `<div class="engine-note">${Icon('sparkle', 'ic-inline')} Personalized from your baby's logged wake windows</div>` : ''}
          ${!lastWake ? `<div class="engine-note">Log a sleep so I know the last wake-up.</div>` : ''}
        </div>`;
    } else if (w === null) {
      suggestionHtml = `<div class="card suggestion"><div>Set your baby's birthdate in Settings to get nap suggestions.</div></div>`;
    }

    const sleepBtn = running.sleep
      ? `<button class="action-btn running wide" id="btn-sleep">
           ${Icon(running.sleep.kind === 'night' ? 'nightMoon' : 'moon', 'ic-lg')}
           <span class="timer-display" data-since="${running.sleep.startedAt}">…</span>
           <span>Tap to end ${running.sleep.kind}</span>
         </button>`
      : `<button class="action-btn sleep wide" id="btn-sleep">${Icon('moon', 'ic-lg')}Start Sleep</button>`;

    const rf = running.feed;
    const feedBtn = rf
      ? (rf.paused
        ? `<button class="action-btn running feed-running" id="btn-feed">
             ${Icon('pause', 'ic-lg')}
             <span class="timer-display">${fmtDur((rf.baseSec || 0) * 1000)}</span>
             <span>Paused (${rf.side}) · tap for options</span>
           </button>`
        : `<button class="action-btn running feed-running" id="btn-feed">
             ${Icon('bottle', 'ic-lg')}
             <span class="timer-display" data-since="${rf.startedAt}" data-base="${rf.baseSec || 0}">…</span>
             <span>${rf.side === 'left' ? 'Left' : 'Right'} · tap for options</span>
           </button>`)
      : `<button class="action-btn feed" id="btn-feed">${Icon('bottle', 'ic-lg')}Feed</button>`;

    view.innerHTML = `
      <h1>Baby Tracker</h1>
      <div class="subtitle">${ageLabel()}</div>
      ${suggestionHtml}
      <div class="actions">
        ${sleepBtn}
        ${feedBtn}
        ${diapersVisible() ? `<button class="action-btn diaper" id="btn-diaper">${Icon('diaper', 'ic-lg')}Diaper</button>` : ''}
      </div>
      ${lastWake ? `<h2>Last events</h2>` : ''}
      ${events.slice(0, 3).map(eventRowHtml).join('')}
    `;

    view.querySelectorAll('[data-engine]').forEach(b =>
      b.addEventListener('click', () => { Store.setSettings({ engine: b.dataset.engine }); }));
    document.getElementById('btn-sleep')?.addEventListener('click', onSleepTap);
    document.getElementById('btn-feed')?.addEventListener('click', onFeedTap);
    document.getElementById('btn-diaper')?.addEventListener('click', openDiaperSheet);
    bindRowDeletes();
  }

  // ---------- sleep ----------
  function onSleepTap() {
    const running = Store.getRunning();
    if (!running.sleep) {
      const h = new Date().getHours();
      const kind = (h >= 18 || h < 6) ? 'night' : 'nap';
      Store.setRunning('sleep', { startedAt: new Date().toISOString(), kind });
    } else {
      const s = running.sleep;
      openSheet(`
        <h3>End ${s.kind}?</h3>
        <div class="choice-row">
          <button class="choice ${s.kind === 'nap' ? 'selected' : ''}" data-kind="nap">Nap</button>
          <button class="choice ${s.kind === 'night' ? 'selected' : ''}" data-kind="night">Night sleep</button>
        </div>
        <button class="btn" id="end-sleep">End sleep — ${fmtDur(Date.now() - new Date(s.startedAt))}</button>
        <button class="btn danger" id="cancel-sleep">Discard (started by accident)</button>
      `);
      let kind = s.kind;
      sheet.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
        kind = b.dataset.kind;
        sheet.querySelectorAll('[data-kind]').forEach(x => x.classList.toggle('selected', x === b));
      }));
      document.getElementById('end-sleep').addEventListener('click', async () => {
        await Store.addEvent({ type: 'sleep', startedAt: s.startedAt, endedAt: new Date().toISOString(), details: { kind } });
        Store.setRunning('sleep', null);
        closeSheet();
      });
      document.getElementById('cancel-sleep').addEventListener('click', () => {
        Store.setRunning('sleep', null);
        closeSheet();
      });
    }
  }

  // ---------- feed ----------
  function onFeedTap() {
    const running = Store.getRunning();
    if (!running.feed) {
      const oz = Store.getSettings().lastBottleOz || 4;
      openSheet(`
        <h3>Feed</h3>
        <div class="choice-row">
          <button class="choice" id="feed-left">${Icon('drop', 'ic-choice')}Left<span class="sub">start timer</span></button>
          <button class="choice" id="feed-right">${Icon('drop', 'ic-choice')}Right<span class="sub">start timer</span></button>
        </div>
        <div class="choice-row"><button class="choice" id="feed-bottle">${Icon('bottle', 'ic-choice')}Bottle</button></div>
        <div id="bottle-area" class="hidden">
          <div class="stepper">
            <button id="oz-minus">−</button>
            <div class="value"><span id="oz-val">${oz}</span> oz</div>
            <button id="oz-plus">+</button>
          </div>
          <button class="btn" id="save-bottle">Log bottle</button>
        </div>
      `);
      const startSide = side => {
        Store.setRunning('feed', {
          startedAt: new Date().toISOString(), side,
          leftSec: 0, rightSec: 0, baseSec: 0,
          firstStartedAt: new Date().toISOString(),
        });
        closeSheet();
      };
      document.getElementById('feed-left').addEventListener('click', () => startSide('left'));
      document.getElementById('feed-right').addEventListener('click', () => startSide('right'));
      document.getElementById('feed-bottle').addEventListener('click', () => {
        document.getElementById('bottle-area').classList.remove('hidden');
      });
      let ozVal = oz;
      const ozEl = () => document.getElementById('oz-val');
      document.getElementById('oz-minus').addEventListener('click', () => { ozVal = Math.max(0.5, ozVal - 0.5); ozEl().textContent = ozVal; });
      document.getElementById('oz-plus').addEventListener('click', () => { ozVal = Math.min(12, ozVal + 0.5); ozEl().textContent = ozVal; });
      document.getElementById('save-bottle').addEventListener('click', async () => {
        const nowIso = new Date().toISOString();
        await Store.addEvent({ type: 'feed', startedAt: nowIso, endedAt: nowIso, details: { method: 'bottle', oz: ozVal, seconds: null } });
        Store.setSettings({ lastBottleOz: ozVal });
        closeSheet();
      });
    } else {
      const f = running.feed;
      // While paused nothing is accruing; banked totals live in left/rightSec
      const curSideSec = f.paused ? 0 : Math.floor((Date.now() - new Date(f.startedAt)) / 1000);
      const otherSide = f.side === 'left' ? 'right' : 'left';
      const thisSideTotal = (f[f.side + 'Sec'] || 0) + curSideSec;
      openSheet(`
        <h3>Feeding — ${f.side} side${f.paused ? ' (paused)' : ''}</h3>
        <div class="subtitle">This side: ${fmtDur(thisSideTotal * 1000)}
          ${f[otherSide + 'Sec'] ? ` · ${otherSide}: ${fmtDur(f[otherSide + 'Sec'] * 1000)}` : ''}</div>
        <button class="btn secondary" id="pause-feed">${f.paused ? Icon('play', 'ic-inline') + ' Resume feed' : Icon('pause', 'ic-inline') + ' Pause (burp / clean-up)'}</button>
        <button class="btn secondary" id="switch-side">${Icon('swap', 'ic-inline')} Switch to ${otherSide}</button>
        <button class="btn" id="end-feed">End feed</button>
        <button class="btn danger" id="cancel-feed">Discard</button>
      `);
      document.getElementById('pause-feed').addEventListener('click', () => {
        if (f.paused) {
          Store.setRunning('feed', { ...f, paused: false, startedAt: new Date().toISOString() });
        } else {
          const upd = { ...f };
          upd[f.side + 'Sec'] = (upd[f.side + 'Sec'] || 0) + curSideSec;
          upd.baseSec = (upd.leftSec || 0) + (upd.rightSec || 0);
          upd.paused = true;
          upd.startedAt = null;
          Store.setRunning('feed', upd);
        }
        closeSheet();
      });
      document.getElementById('switch-side').addEventListener('click', () => {
        const upd = { ...f };
        upd[f.side + 'Sec'] = (upd[f.side + 'Sec'] || 0) + curSideSec;
        upd.side = otherSide;
        upd.startedAt = new Date().toISOString();
        upd.baseSec = (upd.leftSec || 0) + (upd.rightSec || 0);
        upd.paused = false; // switching sides implies the feed is going again
        Store.setRunning('feed', upd);
        closeSheet();
      });
      document.getElementById('end-feed').addEventListener('click', async () => {
        const leftSec = (f.leftSec || 0) + (f.side === 'left' ? curSideSec : 0);
        const rightSec = (f.rightSec || 0) + (f.side === 'right' ? curSideSec : 0);
        await Store.addEvent({
          type: 'feed',
          startedAt: f.firstStartedAt || f.startedAt,
          endedAt: new Date().toISOString(),
          details: { method: 'breast', leftSec, rightSec, oz: null },
        });
        Store.setRunning('feed', null);
        closeSheet();
      });
      document.getElementById('cancel-feed').addEventListener('click', () => {
        Store.setRunning('feed', null);
        closeSheet();
      });
    }
  }

  // ---------- diaper ----------
  function openDiaperSheet() {
    openSheet(`
      <h3>Diaper</h3>
      <div class="choice-row">
        <button class="choice" data-diaper="wet">${Icon('drop', 'ic-choice')}Wet</button>
        <button class="choice" data-diaper="dirty">${Icon('swirl', 'ic-choice')}Dirty</button>
        <button class="choice" data-diaper="both">${Icon('both', 'ic-choice')}Both</button>
      </div>
    `);
    sheet.querySelectorAll('[data-diaper]').forEach(b => b.addEventListener('click', async () => {
      const nowIso = new Date().toISOString();
      await Store.addEvent({ type: 'diaper', startedAt: nowIso, endedAt: nowIso, details: { kind: b.dataset.diaper } });
      closeSheet();
    }));
  }

  // ---------- history ----------
  function eventRowHtml(e) {
    let icon = 'moon', iconCls = 'ic-sleep', title = '', meta = fmtTime(e.startedAt);
    if (e.type === 'sleep') {
      icon = e.details.kind === 'night' ? 'nightMoon' : 'moon';
      const dur = e.endedAt ? fmtDurShort((new Date(e.endedAt) - new Date(e.startedAt)) / 60000) : 'ongoing';
      title = `${e.details.kind === 'night' ? 'Night sleep' : 'Nap'} · ${dur}`;
      meta = `${fmtTime(e.startedAt)} – ${e.endedAt ? fmtTime(e.endedAt) : '…'}`;
    } else if (e.type === 'feed') {
      icon = 'bottle'; iconCls = 'ic-feed';
      if (e.details.method === 'bottle') {
        title = `Bottle · ${e.details.oz} oz`;
      } else {
        icon = 'drop';
        const parts = [];
        if (e.details.leftSec) parts.push(`L ${Math.round(e.details.leftSec / 60)}m`);
        if (e.details.rightSec) parts.push(`R ${Math.round(e.details.rightSec / 60)}m`);
        title = `Nursed · ${parts.join(' + ') || '<1m'}`;
      }
    } else if (e.type === 'diaper') {
      icon = e.details.kind === 'wet' ? 'drop' : e.details.kind === 'both' ? 'both' : 'swirl';
      iconCls = 'ic-diaper';
      title = `Diaper · ${e.details.kind}`;
    }
    return `
      <div class="event-row" data-id="${e.id}">
        <span class="icon ${iconCls}">${Icon(icon)}</span>
        <div class="info"><div class="title">${title}</div><div class="meta">${meta}</div></div>
        <button class="del" data-del="${e.id}">✕</button>
      </div>`;
  }

  function bindRowDeletes() {
    view.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (confirm('Delete this entry?')) await Store.deleteEvent(b.dataset.del);
    }));
  }

  async function renderHistory() {
    const events = await Store.getEvents();
    if (!events.length) {
      view.innerHTML = `<h1>History</h1><div class="subtitle">Nothing logged yet.</div>`;
      return;
    }
    let html = `<h1>History</h1>`;
    let lastDay = '';
    for (const e of events) {
      const day = new Date(e.startedAt).toDateString();
      if (day !== lastDay) {
        lastDay = day;
        const today = new Date().toDateString();
        const yest = new Date(Date.now() - 864e5).toDateString();
        html += `<div class="day-header">${day === today ? 'Today' : day === yest ? 'Yesterday' : day}</div>`;
      }
      html += eventRowHtml(e);
    }
    view.innerHTML = html;
    bindRowDeletes();
  }

  // ---------- trends ----------
  async function renderStats() {
    const events = await Store.getEvents();
    Trends.render(view, events);
  }

  // ---------- settings ----------
  function syncCardHtml() {
    const s = Store.getSyncInfo();
    if (!s.enabled) {
      return `<div class="subtitle" style="margin-top:16px">
        Data is stored on this phone only. To sync with your partner, fill in
        js/config.js and run sql/setup.sql in Supabase (see README).
      </div>`;
    }
    const label = s.state === 'ok' ? `${Icon('check', 'ic-inline')} Synced${s.familyName ? ` — family “${esc(s.familyName)}”` : ''}`
      : s.state === 'syncing' ? `${Icon('sync', 'ic-inline')} Syncing…`
      : s.state === 'nokey' ? `${Icon('key', 'ic-inline')} Enter your family passphrase above, or create a new family`
      : s.state === 'badkey' ? `${Icon('warn', 'ic-inline')} That passphrase doesn't match any family — check for typos, or create a new family`
      : `${Icon('warn', 'ic-inline')} Sync error${s.pending ? ` — ${s.pending} change(s) queued` : ''}`;
    const showCreate = s.enabled && (s.state === 'nokey' || s.state === 'badkey');
    return `<div class="subtitle" style="margin-top:16px">
      Shared sync: ${label}${s.error ? `<br>${esc(s.error)}` : ''}
    </div>
    ${showCreate ? `<button class="btn secondary" id="create-family-btn">Create a new family</button>` : ''}`;
  }

  function openNewFamilySheet(key) {
    openSheet(`
      <h3>Your family is ready</h3>
      <div class="subtitle">This passphrase is the key to your family's data.
        Send it to your partner (privately) and enter it once on their phone
        in Settings. Save it somewhere safe — it can't be recovered.</div>
      <div class="card" style="text-align:center">
        <div style="font-size:1.15rem;font-weight:800;letter-spacing:0.02em;user-select:all" id="new-family-key">${esc(key)}</div>
      </div>
      <button class="btn" id="copy-family-key">Copy passphrase</button>
      <button class="btn secondary" id="close-family-sheet">Done</button>
    `);
    document.getElementById('copy-family-key').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(key);
        document.getElementById('copy-family-key').textContent = 'Copied ✓';
      } catch { /* clipboard may be blocked; text is selectable above */ }
    });
    document.getElementById('close-family-sheet').addEventListener('click', closeSheet);
  }

  function renderSettings() {
    const s = Store.getSettings();
    view.innerHTML = `
      <h1>Settings</h1>
      <div class="card">
        <label class="field">Baby's birthdate
          <input type="date" id="set-birthdate" value="${s.birthdate ? s.birthdate.slice(0, 10) : ''}">
        </label>
        <label class="field">Schedule engine
          <select id="set-engine">
            ${Schedules.engineList().map(e => `<option value="${e.id}" ${s.engine === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}
          </select>
        </label>
        <label class="field">Your name (shows who logged what)
          <input type="text" id="set-name" value="${esc(s.deviceName)}" placeholder="e.g. Dad">
        </label>
        <label class="field">Family passphrase (turns on shared sync; same on both phones)
          <input type="password" id="set-familykey" value="${esc(s.familyKey || '')}" placeholder="ask your partner or see setup notes" autocomplete="off">
        </label>
        <label class="field">Diaper tracking
          <select id="set-diapers">
            <option value="auto" ${s.showDiapers === 'auto' ? 'selected' : ''}>Auto (first month only)</option>
            <option value="on" ${s.showDiapers === 'on' ? 'selected' : ''}>Always on</option>
            <option value="off" ${s.showDiapers === 'off' ? 'selected' : ''}>Off</option>
          </select>
        </label>
      </div>
      <button class="btn secondary" id="export-btn">Export data (JSON)</button>
      ${syncCardHtml()}`;
    document.getElementById('set-birthdate').addEventListener('change', e => Store.setSettings({ birthdate: e.target.value }));
    document.getElementById('set-engine').addEventListener('change', e => Store.setSettings({ engine: e.target.value }));
    document.getElementById('set-name').addEventListener('change', e => Store.setSettings({ deviceName: e.target.value }));
    document.getElementById('set-familykey').addEventListener('change', e => {
      Store.setSettings({ familyKey: e.target.value.trim() });
      Store.syncNow();
    });
    document.getElementById('set-diapers').addEventListener('change', e => Store.setSettings({ showDiapers: e.target.value }));
    document.getElementById('create-family-btn')?.addEventListener('click', async e => {
      const btn = e.target;
      btn.disabled = true;
      btn.textContent = 'Creating…';
      try {
        const name = document.getElementById('set-name').value.trim();
        const key = await Store.createFamily(name ? `${name}'s family` : '');
        openNewFamilySheet(key);
      } catch (err) {
        alert('Could not create family: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Create a new family';
      }
    });
    document.getElementById('export-btn').addEventListener('click', async () => {
      const blob = new Blob([await Store.exportJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `baby-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    });
  }

  // ---------- render loop ----------
  const renderers = { home: renderHome, history: renderHistory, stats: renderStats, settings: renderSettings };

  // Scene director: sky palette follows the clock; moon rises during sleep
  function applyScene() {
    const h = new Date().getHours();
    const cls = h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
    document.body.classList.remove('dawn', 'day', 'dusk', 'night');
    document.body.classList.add(cls);
    document.body.classList.toggle('sleeping', !!Store.getRunning().sleep);
  }

  function tick() {
    document.querySelectorAll('.timer-display[data-since]').forEach(el => {
      const base = (parseInt(el.dataset.base, 10) || 0) * 1000;
      el.textContent = fmtDur(Date.now() - new Date(el.dataset.since).getTime() + base);
    });
    // Hero ring: fill = progress through the current wake window
    document.querySelectorAll('.ring-fill[data-target]').forEach(el => {
      const start = new Date(el.dataset.start).getTime();
      const end = new Date(el.dataset.target).getTime();
      const C = 2 * Math.PI * 84;
      // Target already passed (e.g. past bedtime) → window complete, ring full
      const pct = end <= start ? 1
        : Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
      el.style.strokeDashoffset = (C * (1 - pct)).toFixed(1);
    });
    document.querySelectorAll('.countdown[data-until]').forEach(el => {
      const diff = new Date(el.dataset.until).getTime() - Date.now();
      if (diff <= 0) {
        el.innerHTML = `time now ${Icon('sparkle', 'ic-inline')}`;
        el.classList.add('now');
      } else {
        const m = Math.ceil(diff / 60000);
        el.textContent = m >= 60 ? `in ${Math.floor(m / 60)}h ${m % 60}m` : `in ${m}m`;
        el.classList.remove('now');
      }
    });
  }

  async function render() {
    applyScene();
    await renderers[currentTab]();
    tick();
    clearInterval(tickInterval);
    tickInterval = setInterval(tick, 1000);
  }

  // Inject custom SVG icons into the static tab bar
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = Icon(el.dataset.icon); });

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    currentTab = t.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === t));
    render();
  }));

  Store.onChange(() => render());
  render();
})();
