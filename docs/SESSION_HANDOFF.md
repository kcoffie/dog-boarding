# Dog Boarding App — Session Handoff (v4.1 live; v4.1.1 PR open)
**Last updated:** March 6, 2026 (v4.1.1 fully implemented, PR open, awaiting merge)

---

## Current State

- **v4.1.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **v4.1.0 GitHub Release tagged** — latest
- **PR #42** — `fix/dst-pdt-cron-times` — DST cron shift. **Merge before March 8.**
- **PR #43** — `fix/v4.1.1-image-polish` — all 5 changes implemented + stress-test fixes. **Ready to merge.**
- **738 tests, 46 files, 0 failures**

---

## IMMEDIATE NEXT ACTIONS (in order)

### 1. Merge PR #42 (DST cron times) — URGENT before March 8
No code review needed — 3-line change shifting GitHub Actions cron schedules from PST to PDT.

### 2. Merge PR #43 (v4.1.1 image polish) — ready now
All 5 planned changes implemented and stress-tested. See full change log below.

### 3. After both PRs merge
```bash
git checkout main && git fetch origin && git reset --hard origin/main
```
Tag `v4.1.1` GitHub Release:
```bash
# Write notes to temp file first (avoids shell quoting issues)
/usr/local/bin/gh release create v4.1.1 --title "v4.1.1 - Image Polish" --notes-file /tmp/release-v411.md
/usr/local/bin/gh release edit v4.1.0 --latest=false
```
Mark `v4.1.0` as `--latest=false`.

---

## v4.1.1 — What Was Implemented (PR #43)

All 5 planned changes plus 5 stress-test fixes from Lead Reviewer audit.

### Changes implemented

**Change 1: Live schedule refresh in `notify.js`**
`refreshDaytimeSchedule(supabase, date)` — new function called before `getPictureOfDay`.
- Loads cached session → sets it → fetches today's week page → parses → upserts
- Fully wrapped in outer try/catch (non-fatal contract enforced for all code paths)
- SESSION_EXPIRED: calls `clearSession` so next `cron-auth` re-authenticates (prevents poisoning 7am/8:30am sends)
- Large HTML + 0 events → warns about possible access-denied redirect page
- Returns `{ refreshed: boolean, rowCount: number }` for observability in response JSON

**Change 2: "As of" timestamp in image header**
- `queryAppointmentsByDate` now selects `updated_at`; computes `maxUpdatedAt` via numeric `.getTime()` comparison (not string comparison)
- `getPictureOfDay` returns `lastSyncedAt: string | null`
- `roster-image.js`: `formatTime(isoStr)` helper formats to `"7:03 AM"` in `America/Los_Angeles` TZ (explicit — Vercel Lambdas run UTC)
- Header: `"Thursday, March 6 (as of 7:03 AM)"` when live refresh ran; bare date when not

**Change 3: Remove boarders from image and hash**
- `buildLayout`, `computeImageHeight`, `COLORS` — boarders section removed
- `hashPicture` — `boarders` and `lastSyncedAt` both excluded (boarder changes / timestamp changes must not trigger resend)
- `queryBoarders` and `data.boarders` field kept in data struct for easy restoration
- Test: `'returns a different hash when boarders change'` inverted to confirm exclusion; new test for `lastSyncedAt` exclusion; `'sends for 8:30am'` fixture updated to use worker diff

**Change 4: HTML entity decode**
- `decodeEntities(str)` in `roster-image.js`, applied in `dogLabel()` — display-layer safety net for stale pre-PR#40 DB rows

**Change 5: AGYD brand colors**
- `headerBg: #4A773C`, `headerText: #FFFFFF`, `workerBg: #FFFFFF`, `workerBorder: #d0e8c2`, `workerName: #78A354`, `dogCount: #777777`, `unchanged: #333333`

### Stress-test fixes (from Lead Reviewer audit, same PR)
- `formatTime` timezone bug fixed: `timeZone: 'America/Los_Angeles'` added (was UTC)
- `refreshDaytimeSchedule` outer try/catch added
- SESSION_EXPIRED clearing added to refresh
- `maxUpdatedAt` string comparison → numeric `.getTime()`
- `[RosterImage] Header timestamp:` log added before `buildLayout`

---

## v4.1.1 — Senior Staff Engineer Pre-Implementation Review

*(Recorded before coding began; archived with this version.)*

### Decision Log Logic
Five changes, four require explicit log points.

**Change 1 — `refreshDaytimeSchedule` in `notify.js`:** Log at every external branch: session missing (warn, return), HTML fetch (byte count), parse (row count), upsert (upserted/error count), any thrown error (message + "continuing with stale DB data"). Function returns `{ refreshed: boolean, rowCount: number }` so the outer handler can include it in the JSON response for observability.

**Change 2 — `lastSyncedAt` threading:** Add `max(updated_at)` to the existing today-row log line. Log the formatted time in `roster-image.js` before render. Log null case ("data may be from midnight cron").

**Changes 3, 4, 5** — no new branching; Change 3 gets a single comment in `hashPicture` noting boarders are intentionally excluded.

### Pattern Alignment
- **Graceful degradation** (Change 1) — `refreshDaytimeSchedule` catches all errors internally, never throws into the handler. Mirrors `queryBoarders` and `queryWorkers`.
- **Data threading, not re-querying** (Change 2) — `max(updated_at)` comes from the same query already fetching today's rows. No second DB round-trip.
- **Dependency injection** (Change 1) — `supabase` and `date` are passed in; no module-level singletons.
- **Anti-patterns avoided:** no exporting `fetchScheduleHtml` from `cron-schedule.js`; no removing `queryBoarders`/`boarders` from data struct; `lastSyncedAt` excluded from `hashPicture` (timestamp must not trigger resend).

### Implementation Order
1. Changes 3, 4, 5 (zero-logic risk) — boarders removal, entity decode, color swap. Full suite green before touching logic.
2. Change 2 — `lastSyncedAt` threading through `queryAppointmentsByDate` → `getPictureOfDay` → `roster-image.js` header.
3. Change 1 — `refreshDaytimeSchedule` in `notify.js`.

### Security Surface Area
- All tables (`daytime_appointments`, `workers`, `cron_health`) accessed via `SUPABASE_SERVICE_ROLE_KEY` — RLS bypassed, no policy changes needed.
- No new env vars introduced by v4.1.1. All secrets already set in Vercel + GitHub Actions.
- Change 1 refresh URL built from `BASE_URL` (env var) + `new Date()` components — no user-input injection vector.
- Change 2 `lastSyncedAt`: ISO string from Supabase, formatted server-side into PNG — no XSS surface.
- Change 4 `decodeEntities`: server-side PNG rendering only, no HTML output — no XSS surface.
- Pre-existing note (not in scope): `notify.js` host-header construction for `imageUrl` uses `x-forwarded-host`. On Vercel this is infrastructure-set; flagged for future hardening.

---

## Open PRs

| PR | Branch | Status | Action |
|---|---|---|---|
| #42 | `fix/dst-pdt-cron-times` | Open | Merge before March 8 |

---

## After v4.1.1 merges

- Reset local main: `git checkout main && git fetch origin && git reset --hard origin/main`
- Tag v4.1.1 GitHub Release (see step 3 in IMMEDIATE NEXT ACTIONS above)
- Mark `v4.1.0` as `--latest=false`
- Archive this SESSION_HANDOFF as `docs/archive/SESSION_HANDOFF_v4.1.1_final.md`

---

## v4.2 Backlog (next after v4.1.1)

- Add second test number, then production group chat
- DST-aware scheduling (or a single cron that computes its own send window by checking wall-clock time)
- Move from Twilio sandbox to registered WhatsApp Business sender

## v4.3 Backlog

- On-demand daytime ingest via "Sync Now" button

---

## v4.1 Architecture — What Was Built

### Files added in v4.1

| File | Purpose |
|---|---|
| `src/lib/pictureOfDay.js` | Data layer: `getPictureOfDay`, `hashPicture`, `shouldSendNotification`, `parseDateParam` |
| `api/roster-image.js` | Token-gated endpoint → queries DB, renders PNG via satori+resvg |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper: `createTwilioClient`, `sendRosterImage`, `getRecipients` |
| `api/notify.js` | Orchestrator: validates `window`+`token`, gates send via hash, calls Twilio |
| `src/__tests__/pictureOfDay.test.js` | 22 unit tests for data layer (mock Supabase, no real DB) |
| `.github/workflows/notify-4am.yml` | Fires 11:00 UTC (4am PDT after PR #42) |
| `.github/workflows/notify-7am.yml` | Fires 14:00 UTC (7am PDT after PR #42) |
| `.github/workflows/notify-830am.yml` | Fires 15:30 UTC (8:30am PDT after PR #42) |
| `api/_fonts/inter-400.ttf` | Bundled Inter Regular for satori |
| `api/_fonts/inter-700.ttf` | Bundled Inter Bold for satori |

### Packages added in v4.1
- `satori@0.25.0` — element tree → SVG
- `@resvg/resvg-js@2.6.2` — SVG → PNG (native Node.js bindings)
- `twilio@5.12.2` — WhatsApp delivery

### API surface
```
GET /api/roster-image?date=YYYY-MM-DD&token=SECRET  → PNG
GET /api/notify?window=4am|7am|8:30am&token=SECRET[&date=YYYY-MM-DD]  → JSON
```

### Send gate logic (notify.js, current — pre-v4.1.1)
1. `window=4am` → always send; stores hash in `cron_health` after send
2. `window=7am|8:30am` → reads `cron_health.result` for `cron_name='notify'`; if `lastDate` matches today and `lastHash` matches current hash → skip; otherwise send + update hash
3. If `lastDate` is yesterday → treat as no baseline (first send of new day)

### No DB migrations in v4.1
All data from existing `daytime_appointments` + `workers` tables.
Change-detection hash stored in `cron_health.result` under `cron_name='notify'`.

---

## v4 — Daytime Activity Intelligence

### Workers
| Name | External UID |
|---|---|
| Charlie | 61023 |
| Kathalyn Dominguez | 208669 |
| Kentaro Cavey | 141407 |
| Max Posse | 174385 |
| Sierra Tagle | 189436 |
| Stephen Muro | 164375 |
| No worker / boardings | 0 |

### Service categories
| Category | cat-ID | ser-ID |
|---|---|---|
| Daycare | 5634 | 10692 |
| Playgroup | 7431 | 15824 |
| Boarding | 5635 | 17357, 11778, 22215, 22387 |

---

## Cron health (as of March 5, 2026)
- `schedule` — 00:18 UTC → queued 14, skipped 124, 1 page scanned
- `detail` — 00:27 UTC → idle
- `auth` — 00:54 UTC → skipped (session still valid)

Check each session:
```sql
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;
-- Notify state:
SELECT result FROM cron_health WHERE cron_name = 'notify';
-- Last daytime sync time:
SELECT MAX(updated_at) FROM daytime_appointments WHERE appointment_date = CURRENT_DATE;
```

---

## v3.2 Decisions Locked In
- Rate fallback: `boarding.night_rate ?? dog.night_rate ?? 0`
- HASH_FIELDS: identity/structure only — pricing excluded
- `.maybeSingle()` everywhere a 0-row result is valid; never `.single()` for existence checks
- Form matching: 7-day window `(arrival − 7 days)` to `(arrival day)` inclusive
- Form field regex: `id="(field_\d+)-wrapper"` — external site uses `-wrapper` suffix
- `sync_status = 'archived'` — `is_archived` column does NOT exist

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

-- Notify state (last image sent)
SELECT result FROM cron_health WHERE cron_name = 'notify';

-- Last time daytime data was refreshed
SELECT MAX(updated_at) FROM daytime_appointments WHERE appointment_date = CURRENT_DATE;

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
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, **v4.1.0 (Latest)**
- Next: `v4.1.1` after image polish PR merges

## Archive
- v4.0 full session log: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 full session log: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 full session log: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
