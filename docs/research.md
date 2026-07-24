# Sleep-schedule research: Taking Cara Babies vs. Huckleberry (0-12 months)

Research pass run 2026-07-24. 21 sources fetched, 97 claims extracted, top 25
adversarially verified (3 independent votes each): **25 confirmed, 0 refuted.**
All numbers come from each brand's own published documentation (first-party
blog/support pages) — this documents what each brand recommends; it is not
peer-reviewed clinical guidance.

## Taking Cara Babies (TCB)

### Wake windows (verified, brand's own table)

| Age | Wake window |
|---|---|
| 0-4 weeks | 30-60 min (a sibling page says 35-60) |
| 4-12 weeks | 60-90 min |
| 3-4 months | 75-120 min |
| 5-7 months | 2-3 hr |
| 7-10 months | 2.5-3.5 hr |
| 11-14 months | 3-4 hr |
| 14-24 months | 4-6 hr |

Windows are graduated: **shortest first thing in the morning, longest before
bedtime** (through 12 months).

### Nap counts & transitions (verified)

- 4→3 naps: **4-5 months** (3 naps is the target by ~5 months)
- 3→2 naps: **6.5-8 months** (2-nap wake windows span 2.5-4 hr, starting short)
- 2→1 nap: **13-18 months**
- Don't transition early: watch for readiness signs for 1-2 weeks first.

### Verified per-bracket schedule offsets

| Age | Naps | Offsets | Day sleep | Bedtime |
|---|---|---|---|---|
| 5-7 mo | 3 | Nap 1 ~2h after wake | 3-4 h | 7-8 pm |
| 7-10 mo | 2 | Nap 1 ~2.5-3h after wake; Nap 2 ~3h after Nap 1; bed ~3-3.5h after Nap 2 | 2.5-3.5 h | 7-8 pm |
| 12 mo | 2 | Nap 1 ~3h; Nap 2 ~3-3.5h; bed ~3.5-4h after Nap 2 | 2.5-3 h | 7-8 pm |

### Method (verified)

Deterministic **wake-window offsets from the last wake-up** + sleepy cues —
explicitly NOT by-the-clock for 0-12 months. Guardrails: night sleep (10-12h)
is prioritized over day sleep; **no single nap over 2h** on multi-nap
schedules (3h on one-nap); afternoon nap ends by 3-4pm at 12 months; bedtime
anchor 7-8pm but can flex as early as 6:00-6:30pm during nap transitions.
Clock-based scheduling only for one-nap toddlers 18mo+. Total sleep at 12
months: 13-15 h (10-12 night + 2.5-3 day).

## Huckleberry

### Wake windows (verified, brand's own guidance)

| Age | Wake window |
|---|---|
| 0-2 months | 30-90 min |
| 3 months | 1-2 hr |
| 4-5 months | 1.5-2.5 hr |
| 6 months | 2-3 hr |
| 7-9 months | 2.5-3.5 hr |
| 10-12 months | 3-4 hr (12-mo page narrows to 3.25-4 hr) |

### Nap counts & transitions (verified)

- 4-5 naps as newborn → **2 naps by end of first year**
- 3→2 transition typically **complete by 8-9 months**
- Transitions are **gated on demonstrated wake-window tolerance, not age
  alone**: e.g. at ~5 months, 4 naps while windows average 1.5-2.5h; move to
  3 naps once 2-3h is comfortable. (Key design difference from a pure age
  lookup.)

### Total daily sleep targets (verified)

| Age | Total sleep / 24h |
|---|---|
| Newborn | 16-17 h |
| 3-5 mo | 14.5-15 h (5 mo: 11-12 night + 2.5-3.5 day over 3-4 naps) |
| 6-8 mo | ≥ 14 h |
| 12 mo | ~13 h (11-12 night + 2-3 day) |

Framed as descriptive averages, not strict prescriptions.

### SweetSpot® method (verified behavior; internals proprietary)

Hybrid engine: **age-appropriate wake-window baselines, personalized by the
baby's own logged sleep data** to predict the next "tired but not overtired"
time. Users can override with custom wake windows. The exact algorithm is
unpublished (Plus/Premium feature), so our engine approximates the described
behavior: baseline blended with the median of the baby's observed wake
windows over the last 7 days, clamped to the age-appropriate range.

## Philosophical difference (how the app's toggle reflects it)

- **TCB engine** = deterministic table: age bracket → graduated wake-window
  offsets, night-sleep-first, nap caps, 7-8pm bedtime anchor.
- **Huckleberry-style engine** = same class of age baselines + per-child
  adaptation from logged history, and a short-nap adjustment.
- Both agree: **wake windows, not clock times, drive months 0-12**, and their
  numeric ranges overlap heavily near 12 months (~3-4h windows, 2 naps).

## Caveats (from the research pass)

- Minor internal inconsistencies inside each brand's own pages (TCB 30-60 vs
  35-60 min at 0-4wk; Huckleberry "by 8 months" vs "8-9 months"; 13 vs
  13.25h at 12mo). We encode ranges, not point values.
- Night-feed guidance was not covered by surviving claims for either brand.
- TCB bedtime (7-8pm) verified mainly for 5+ months; newborn bedtimes in the
  app are approximations.
- Huckleberry per-month bedtime ranges were only verified at 5 and 12 months.
- Both sites update content periodically; numbers fetched 2026-07-24.

## Primary sources

TCB: takingcarababies.com blogs — wake-windows-and-baby-sleep,
nap-schedules-5-months-to-24-months, newborn-sleep-schedule,
3-to-2-nap-transition, 4-to-3-nap-transition, 12-month-old-sleep-schedule.

Huckleberry: huckleberrycare.com blogs — first-year-of-sleep-expectations,
5-month-old / 12-month-old sleep schedule pages, 3-to-2-nap-transition,
nap-transitions, SweetSpot articles; huckleberry.zendesk.com SweetSpot
support docs.
