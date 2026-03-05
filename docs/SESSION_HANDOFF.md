# Dog Boarding App — Session Handoff (v3.2 deployed + v4 planning)
**Last updated:** March 5, 2026 (v3.2 deployed, v4 planning started)

---

## Current State

- **v3.2 is LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- PR #37 merged, deployed, tested — stale title month fix working correctly
- Migration 017 applied in Supabase (`arrival_ampm`, `departure_ampm` columns exist)
- RLS enabled on `sync_queue` table in Supabase
- v3.3 Payroll Report deferred to a future version (not v3.3 — pick a new version number TBD)
- **No uncommitted code.** Clean working tree.

---

## IMMEDIATE NEXT ACTIONS

None. v3.2 is done. Next work is v4 planning and implementation.

---

## v4 — Daytime Activity Intelligence

### Goal
Ingest ALL daytime dog activities (Daycare + Playgroup) from the schedule page, not just boardings. First deliverable: a "picture of the day" message per worker showing who's in their group, who was added vs. yesterday, who was removed.

### Delivery phases
1. **v4.0** — Data ingestion: parse full schedule page, store all daytime appointments
2. **v4.1** — "Picture of the day" API: per-worker summary with day-over-day diff
3. **v4.2** — WhatsApp notifications: 4am PST daily, re-check 7am + 8:30am PST

---

### What the schedule page gives us (no detail fetches needed)

Each `.day-event <a>` element on the weekly grid (`/schedule/days-7/YYYY/M/D`) exposes:

| Data | Source |
|---|---|
| Appointment external ID | `data-id` |
| Day-column date | `data-ts` (Unix ts, midnight of that day) |
| Actual check-in time | `data-start` (Unix ts) |
| Status | `data-status` (1=upcoming, 5=in-progress, 6=completed) |
| Recurring series ID | `data-series` (stable across same dog's recurring appts) |
| Worker ID | class `ew-{uid}` (0 = no worker = boardings) |
| Service category + type | classes `cat-{id}` `ser-{id}` |
| Title (free-form) | `.day-event-title` inner text |
| Display time | `.day-event-time` inner text |
| Client UID | `data-uid` on `.event-clients-pets` |
| Client name | `.event-client` inner text |
| Pet external IDs | `data-pet` on each `.event-pet-wrapper` |
| Pet names | `.event-pet` inner text |
| Multi-day span | classes `appt-before`, `appt-after`, `appt-all-day` |

### Workers (confirmed from HTML)
| Name | External UID |
|---|---|
| Charlie | 61023 |
| Kathalyn Dominguez | 208669 |
| Kentaro Cavey | 141407 |
| Max Posse | 174385 |
| Sierra Tagle | 189436 |
| Stephen Muro | 164375 |
| No worker set (boardings) | 0 |

### Service categories (confirmed)
| Category | cat-ID | service | ser-ID |
|---|---|---|---|
| Daycare | 5634 | Daycare Monthly | 10692 |
| Playgroup | 7431 | Playgroup Monthly | 15824 |
| Boarding | 5635 | Boarding (Nights) | 17357 |
| Boarding | 5635 | Boarding (Days) | 11778 |
| Boarding | 5635 | Boarding discounted (DC FT) | 22215 |
| Boarding | 5635 | Staff Boarding (nights) | 22387 |

### Title patterns observed
- `DC:FT` = Daycare full-time (every day)
- `DC M/T/W/TH` = Daycare specific days
- `PG FT` = Playgroup full-time
- `PG M/W/TH` = Playgroup specific days
- `ADD Leo T/TH` = Adding extra dog on Tue/Thu (title names the dog)
- `D/C FT OFF OFF` = Daycare FT with days off
- `Pick-Up 9AM-10AM` / `Pick-Up ( 9 am - 10 am )` = morning pickup slot (status=1, not yet checked in)

### Day-over-day diff logic (how to compute adds/removes)
`data-series` is stable for recurring appointments of the same dog with the same worker.
- For each worker: collect `Set<series_id>` for day N and day N-1
- Added = in N but not N-1
- Removed = in N-1 but not N
- No heuristics needed — this is exact.

---

### New DB tables needed

**`workers`**
```sql
CREATE TABLE workers (
  id SERIAL PRIMARY KEY,
  external_id INTEGER UNIQUE NOT NULL,  -- e.g. 61023
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`daytime_appointments`**
```sql
CREATE TABLE daytime_appointments (
  id SERIAL PRIMARY KEY,
  external_id TEXT NOT NULL,            -- data-id, e.g. "C63QgUnJ"
  series_id TEXT,                       -- data-series, e.g. "C63QgUl0"
  appointment_date DATE NOT NULL,       -- derived from data-ts
  worker_external_id INTEGER,           -- ew-{uid}; 0 = no worker
  service_category TEXT,               -- "DC", "PG", "Boarding"
  service_cat_id INTEGER,              -- e.g. 5634
  service_id INTEGER,                  -- e.g. 10692
  title TEXT,
  status INTEGER,                       -- 1, 5, 6
  start_ts BIGINT,                      -- data-start (Unix ts)
  day_ts BIGINT,                        -- data-ts (Unix ts)
  display_time TEXT,                   -- ".day-event-time" text
  client_uid INTEGER,
  client_name TEXT,
  pet_ids INTEGER[],                    -- array of data-pet values
  pet_names TEXT[],
  is_pickup BOOLEAN DEFAULT FALSE,      -- display_time contains "Pick-Up"
  is_multiday_start BOOLEAN DEFAULT FALSE,  -- has class appt-after
  is_multiday_end BOOLEAN DEFAULT FALSE,    -- has class appt-before
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(external_id, appointment_date) -- same appt can appear on multiple days
);
CREATE INDEX ON daytime_appointments(appointment_date, worker_external_id);
CREATE INDEX ON daytime_appointments(series_id);
```

---

### v4.0 Pre-Implementation Review (Staff Engineer sign-off)

**Decision Log — critical branching points and what to log at each:**

| Branching Point | Decision Data Logged |
|---|---|
| Week parse begins | Total `<a data-id>` blocks found in HTML |
| Per-event: date resolution | `external_id`, raw `data-ts`, resolved `appointment_date`; skip + warn if unparseable |
| Per-event: worker extraction | `external_id`, matched `ew-{uid}`; warn if uid not in `KNOWN_WORKERS` |
| Per-event: service classification | `external_id`, matched `cat-{id}`/`ser-{id}`, resolved `service_category`; warn if unknown cat |
| Per-event: pet extraction | Warn if zero pet IDs found on a non-boarding event |
| Upsert batch | Count in, count deduped, errors from Supabase |

**Pattern alignment:**
- Pure parse + separate persistence (same split as `forms.js`) — `parseDaytimeSchedulePage` is side-effect-free
- Flat output array per event; no nested structures
- Regex-only (no DOMParser) — Node.js cron safe; same rule as `forms.js`
- Named constants (`SERVICE_CATS`, `KNOWN_WORKERS`) at top of file — unknown IDs warn but never silently misclassify
- No deduplication inside the parser — `UNIQUE(external_id, appointment_date)` is the source of truth; deduplicate only in upsert helper before sending batch

**Anti-patterns explicitly avoided:**
- No DOMParser (this is cron-first, unlike `schedule.js`)
- No stateful class — module with exported functions
- No inline Supabase client construction
- No cross-page deduplication inside the parser (multi-day spans are intentionally one row per day)

**Implementation strategy:**
1. Define `SERVICE_CATS`, `KNOWN_WORKERS`, `PICKUP_RE` constants at top — drives classification + warning system
2. Three small private helpers: `attr(attrStr, name)`, `innerText(html, cls)`, `tsToDate(unixSeconds)`
3. `parseDaytimeSchedulePage(html)` — pure; outer loop matches all `<a data-id="...">` blocks, inner extraction per event
4. `upsertDaytimeAppointments(supabase, appointments)` — deduplicates batch by `(external_id, appointment_date)`, single bulk upsert
5. Wire into `cron-schedule.js` — same HTML already in hand, no new fetches; accumulate across pages, upsert after loop

**Implementation guidelines (Go signal):**
- Chain-of-thought comments on every function: intended behavior + error-handling strategy
- Structured logging: log input params at function entry; log "Decision Data" at every major gate (`data-ts missing → skip`, `unknown cat-id → warn but continue`)
- DRY: shared `attr()` and `innerText()` helpers used everywhere; no repeated attribute-extraction inline
- Testable: pure parse function can be unit-tested with a fixture HTML string, no mocking needed

---

### New scraper code needed

**`src/lib/scraper/daytimeSchedule.js`** (new file)
- `parseDaytimeSchedulePage(html, weekStartDate)` → array of appointment objects
  - Parse each `.cal-day` cell by `data-year/month/day`
  - Within each cell, parse each `.day-event` `<a>`
  - Extract all fields from the table above
  - Return flat array: `[{ external_id, series_id, appointment_date, worker_external_id, ... }]`
- `upsertDaytimeAppointments(appointments)` → upsert to Supabase `daytime_appointments`
- This runs from Node.js (cron) so must use regex, not DOMParser

**Update `api/cron-schedule.js`**
- After fetching each schedule page, also call `parseDaytimeSchedulePage`
- Upsert daytime appointments alongside boarding queue logic

---

### WhatsApp integration options
- **Twilio** (simplest, has Node SDK, free trial) — recommended starting point
- **Meta Cloud API** (official, free up to 1000 conversations/month)
- **Baileys** (unofficial, no account needed, but risky ToS)

Cron schedule for notifications (Vercel Hobby allows multiple crons):
- 4am PST = 12:00 UTC (or 11:00 UTC after DST change March 8)
- 7am PST = 15:00 UTC
- 8:30am PST = 16:30 UTC

Logic per notification:
1. Fetch today's daytime_appointments (grouped by worker)
2. Fetch yesterday's daytime_appointments (grouped by worker)
3. Compute diff
4. If 4am: always send
5. If 7am or 8:30am: only send if diff vs. last-sent snapshot is non-empty

---

### "Picture of the day" message format (per worker)
```
Thursday Mar 5 - UPDATED!

Charlie (1 dog)
  Bronwyn Cottrell

Kathalyn Dominguez (5 dogs)
  John McClane (Stevenson) + Chester (Petry) + Billy (Cirelli) + Buddy Peters (Doan) + "Waldo" (McComb)

[etc per worker...]

Boarders today: Benny, Millie, Bowie, Peanut, Annie, Tracy
```

Added/removed lines:
```
  + Frances Wiebe [NEW from yesterday]
  - Tasha See [NOT TODAY]
```

---

## Cron health (as of March 4, 2026)
- `schedule` — 00:18 UTC → queued 14, skipped 124, 1 page scanned, cursor to 2026-03-10
- `detail` — 00:27 UTC → idle (queue already empty)
- `auth` — 00:54 UTC → skipped (session still valid)

Check each session:
```sql
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;
```

---

## v3.2 What Was Done

### Deployed and working
- AM/PM capture from external site's `.event-time-scheduled` block
- `arrival_ampm` / `departure_ampm` columns on `boardings` (migration 017 applied)
- DogsPage shows "Mar 4, 2026 AM" when ampm present
- CalendarPage detail panel + print section show AM/PM
- SyncSettings dead UI removed (auto-sync toggle, interval, setup mode)
- PR #37 stale title month fix deployed and confirmed working

### Decisions locked in
- Rate fallback: `boarding.night_rate ?? dog.night_rate ?? 0`
- HASH_FIELDS: identity/structure only — pricing fields intentionally excluded
- Unchanged path: explicitly writes `appointment_total` + `pricing_line_items` when present
- Multi-pet: secondary external_id = `{appt_id}_p{index}`
- `sync_status = 'archived'` — `is_archived` does not exist
- `.maybeSingle()` for all existence checks. Never `.single()` for 0-row-valid queries
- Form matching: 7-day window `(arrival − 7 days)` to `(arrival day)` inclusive. No fallback.
- Form field regex: `id="(field_\d+)-wrapper"` — external site uses `-wrapper` suffix

---

## Useful SQL

```sql
-- Cron health
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;

-- Queue status
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;

-- Recent boardings
SELECT b.external_id, d.name, b.billed_amount, b.night_rate, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC LIMIT 20;

-- Stored forms
SELECT bf.boarding_id, d.name, bf.submission_id, bf.date_mismatch,
       bf.form_arrival_date, bf.form_departure_date, bf.fetched_at
FROM boarding_forms bf
JOIN boardings b ON bf.boarding_id = b.id
JOIN dogs d ON b.dog_id = d.id
ORDER BY bf.fetched_at DESC LIMIT 10;

-- If sync gets stuck
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';

-- Null FK before deleting a boarding
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id = (SELECT id FROM boardings WHERE external_id = 'REPLACE_ME');
DELETE FROM boardings WHERE external_id = 'REPLACE_ME';
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0 (Latest)
- Next release after v4.0 merges: tag `v4.0.0`

## Archive
- v3.0 full session log: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 full session log: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
- Earlier versions: `docs/archive/SESSION_HANDOFF_v2.{0-3}_final.md`
