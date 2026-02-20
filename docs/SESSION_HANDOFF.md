# Dog Boarding App Sync - Session Handoff
**Date:** February 20, 2026 (evening session, ended ~1:30pm)
**Status:** Planning complete for REQ-108 (archive reconciliation). No code written yet. Ready to implement.

---

## What We Did

### Session 1 (Feb 19–20, ended ~1am) — committed `1242812`
1. ✅ Fixed date range URL — site ignores `?start=&end=`, now uses `/schedule/days-7/YYYY/M/D`
2. ✅ Added early-stop pagination — stops when all parseable dates exceed endDate
3. ✅ Removed incorrect startDate filter that dropped active long-stay boardings (Maverick)
4. ✅ Fixed `check_in_datetime` / `check_out_datetime` — Unix timestamps from `data-start_scheduled`/`data-end_scheduled`
5. ✅ Fixed `pet_name` "Unknown" collapse bug
6. ✅ Fixed `client_phone` returning business phone
7. ✅ Replaced placeholder CSS selectors with 4 verified ones
8. ✅ Rewrote `parseAppointmentPage` with 7 verified helpers
9. ✅ Fixed timezone bug — `new Date('2026-02-18')` parses as UTC midnight; fixed to `new Date(2026, 1, 18)`
10. ✅ Fixed early-stop never firing — filter null daycare times before checking "all beyond endDate"
11. ✅ Added date-overlap filter in `sync.js`
12. ✅ Added "Initial Evaluation" and "Busy" to skip lists

### Session 2 (Feb 20, ~9am–12:30pm) — committed `2469d5a`
13. ✅ Validated date-overlap filter — 8 out-of-range boardings skipped, 5 correct in-range boardings saved
14. ✅ Fixed `service_type: null` on "Boarding (Nights)" appointments — these pages have no `<h1>`;
    added `extractPageTitle()` helper to fall back to `<title>` tag
15. ✅ Fixed `check_in_datetime` off by 1 day (Feb 12 vs title "2/13-18") — `data-start_scheduled`
    is appointment creation time, not actual check-in. Flipped date priority: `parseServiceTypeDates()`
    from title is now PRIMARY; system timestamps are FALLBACK for appointments without dates in title
16. ✅ Fixed overlap filter boundary — changed `checkOut > startDate` to `checkOut >= startDate`
    (title-parsed checkout dates are midnight; old strict `>` incorrectly excluded them)
17. ✅ Fixed `service_type` in HASH_FIELDS — it was missing, so "Boarding (Nights)" records with
    null service_type showed as "unchanged" and never got updated. Adding it to HASH_FIELDS caused
    a one-time "updated" pass for all records, correctly writing service_type.
18. ✅ Validated all fixes via two sync runs + DB spot-checks

### Session 3 (Feb 20, ~12:30–1:30pm) — planning only, no commits
19. ✅ Planned REQ-108: Archive Reconciliation (see full plan below)
20. ✅ Clarified full sync trigger (see TODO #1 below)

### Session 4 (Feb 20, evening)
21. ✅ Deleted 13 dirty non-boarding records (ADD Leo T/TH, switch day, back to N days) — pre-filter was correctly skipping them so they'd never self-clean
22. ✅ Verified client_phone '4753192977' fully cleaned (count = 0) — TODO #1 DONE
23. ✅ Implemented REQ-108: Archive Reconciliation
    - New: `src/lib/scraper/reconcile.js` (4 exported functions)
    - Modified: `sync.js` — seenExternalIds, reconcile call, appointmentsArchived in result/log
    - Added: REQ-108 to `docs/REQUIREMENTS.md`
    - New: `src/__tests__/scraper/reconcile.test.js` (20 tests)
    - Updated: `sync.test.js` (1 new test, 26 total)
    - All 46 tests pass
    - **PENDING: Run DB migration before first sync** (see below)

---

## Sync Performance

| Metric | Original | After all fixes |
|--------|----------|-----------------|
| Pages fetched | 10 | 3 |
| Appointments found | 495 | ~264 |
| Detail pages fetched | ~60 | ~5–6 |
| Total time | ~322s | ~118s |
| Maverick (2/13-23) included | ❌ | ✅ |
| Out-of-range boardings saved | ✅ (always) | ❌ (filtered) |
| service_type on Boarding (Nights) | ❌ null | ✅ correct |
| check_in off by 1 day | ❌ | ✅ fixed |

---

## Pending TODOs (priority order)

### ~~1. Run full sync to clean 13 dirty DB records~~ ✅ DONE
Dirty records cleaned. 13 non-boarding records deleted manually. Phone '4753192977' count = 0.

**How to run a full sync:**
In `useSyncSettings.js:159`, remove `startDate`/`endDate` from the `runSync` call:
```js
// Change this:
const result = await runSync({
  supabase,
  startDate: new Date(2026, 1, 18),
  endDate: new Date(2026, 1, 19),
  onProgress: ...
});

// To this:
const result = await runSync({
  supabase,
  onProgress: ...
});
```
Expect ~5 min / ~499 appointments. Revert after running (TODO #2 will replace with proper UI).

Verify after:
```sql
SELECT COUNT(*) FROM sync_appointments WHERE check_in_datetime IS NULL;
SELECT COUNT(*) FROM sync_appointments WHERE client_phone = '4753192977';
```

### 2. Build date range UI in SyncSettings (TODO #2 from before)
Dates are hardcoded in `useSyncSettings.js`. Need date picker in `SyncSettings.jsx`.
- Default: "last 30 days" or "today"
- "Full sync" option (no date range)

### 3. ~~Implement REQ-108: Archive Reconciliation~~ ✅ DONE — Run DB migration first
Run this SQL before the next sync (adds `appointments_archived` column to sync_logs):
```sql
ALTER TABLE sync_logs ADD COLUMN appointments_archived INTEGER DEFAULT 0;
```
Then restore `useSyncSettings.js` to use hardcoded dates (or build TODO #2 UI).

### 4. Investigate `status` extraction
Always returns `null`. `.appt-change-status` may need to handle `<i>` icon inside anchor:
`<a ...><i ...></i> Completed</a>`

### 5. (Low priority) Pre-detail-fetch date filter
For boardings with parseable title dates, run `parseServiceTypeDates()` BEFORE fetching detail page.
If out of range, skip the fetch. Saves ~48s per 1-day sync.

---

## REQ-108: Archive Reconciliation — Full Implementation Plan

### Problem
When an appointment is amended on the external site, a NEW appointment is created and the OLD one
disappears from the schedule page. The old record sits in our DB as `sync_status: 'active'` forever.

The old URL (e.g. `https://agirlandyourdog.com/schedule/a/C63QgS0U/1771581600`) returns the
`/schedule` page with a JS-rendered popup "You cannot view appointment" — not in page source.
Our scraper (no JS) receives the `/schedule` page HTML (no `data-start_scheduled`).

### Inaccessible page detection
Valid appointment pages always have `data-start_scheduled` on `#when-wrapper`.
Inaccessible URLs serve the schedule page HTML (no appointment content).

```js
function isAccessDeniedPage(html, response) {
  if (!response.ok) return true;
  const isLoginPage = html.includes('login') && html.includes('password');
  const isAppointmentPage = html.includes('data-start_scheduled');
  return !isLoginPage && !isAppointmentPage;
}
```

### Reconciliation approach
After the main sync loop:
1. Collect `seenExternalIds` — add each `external_id` RIGHT AFTER the URL match in sync.js
   (before any filter/fetch), so appointments that errored during processing are still "seen"
2. Query DB: active records overlapping the sync window NOT in `seenExternalIds`
   - `sync_status = 'active'`
   - `check_in_datetime < endDate` (we fetched the pages where it would appear)
   - `check_out_datetime >= startDate` (overlaps window)
   - For null startDate/endDate (full sync): query ALL active records not in seenIds
3. For each candidate: fetch `source_url` to confirm inaccessibility
4. If access-denied confirmed → mark `sync_status: 'archived'`
5. If URL loads fine → log **warn** ("not seen but accessible — possible sync bug"), do NOT archive
6. If fetch throws → log **error** with full details, do NOT archive

### Files to create/modify

**New file: `src/lib/scraper/reconcile.js`**
Exports:
- `reconcileArchivedAppointments(supabase, seenExternalIds, startDate, endDate)` — main entry
- `findReconciliationCandidates(supabase, seenExternalIds, startDate, endDate)` — exported for testing
- `isAccessDeniedPage(html, response)` — exported for testing
- `archiveSyncAppointment(supabase, externalId)` — exported for testing

**`src/lib/scraper/sync.js`** changes:
- Build `seenExternalIds` Set — populated right after URL match, before filters
- After main loop: call `reconcileArchivedAppointments()` in its own try/catch
- Add `appointmentsArchived: 0` to result object
- Add `appointments_archived` to `updateSyncLog` call

**DB migration needed:**
```sql
ALTER TABLE sync_logs ADD COLUMN appointments_archived INTEGER DEFAULT 0;
```

**`docs/REQUIREMENTS.md`** — add REQ-108

### Logging (all via syncLog/syncWarn/syncError)
| Point | Level | Content |
|-------|-------|---------|
| Reconciliation start | log | candidate count, sync window dates |
| Per candidate | log | external_id, source_url |
| Confirmed archived | log | external_id, HTTP status |
| URL loads fine | **warn** | external_id, URL — "NOT archiving" |
| Fetch throws | **error** | external_id, error.message, error.stack |
| DB query fails | **error** | full error — "reconciliation skipped" |
| Archive upsert fails | **error** | external_id + error — "continuing" |
| Summary | log | `{ archived, warnings, errors }` |

### Exception handling
| Scenario | Handling |
|----------|----------|
| DB query for candidates fails | catch → log full error → return `{archived:0, warnings:0, errors:1}` — don't throw |
| `source_url` fetch throws | catch → log message + stack → skip archive for this candidate |
| `source_url` returns valid page | log warn → don't archive |
| Archive upsert fails | catch → log external_id + error → continue to next |
| Entire reconciliation throws | outer catch in sync.js → log → sync continues as partial |

Rate limiting: respect `SCRAPER_CONFIG.delayBetweenRequests` between confirmation fetches.

### Tests: `src/__tests__/scraper/reconcile.test.js`
```
findReconciliationCandidates()
  ✓ returns active records overlapping window not in seenIds
  ✓ does NOT return records outside the window
  ✓ does NOT return records already in seenIds
  ✓ does NOT return records with sync_status != 'active'
  ✓ null startDate/endDate → returns all active records not in seenIds

isAccessDeniedPage()
  ✓ returns true for non-200 status
  ✓ returns true for 200 response with no data-start_scheduled (schedule page)
  ✓ returns false for valid appointment HTML (has data-start_scheduled)
  ✓ returns false for login page HTML (session expired, not inaccessible)

reconcileArchivedAppointments()
  ✓ archives candidate when source_url is access-denied
  ✓ logs warn and does NOT archive when source_url loads fine
  ✓ logs error and does NOT archive when source_url fetch throws
  ✓ logs error and returns zeros when DB query fails (does NOT throw)
  ✓ continues to next candidate after individual fetch error
  ✓ returns correct { archived, warnings, errors } counts
  ✓ respects rate limiting delay between fetches
```

Updates to `sync.test.js`:
```
  ✓ seenExternalIds populated from schedule page (before filters)
  ✓ appointmentsArchived in result after sync
  ✓ appointments_archived passed to updateSyncLog
  ✓ reconciliation error does NOT fail the overall sync
```

### Known examples of archived pairs
| Old (to archive) | New (active) | Dog |
|---|---|---|
| C63QgS0U (2/20-24) | C63QgQz4 (2/20-25) | Captain Morgan |
| C63QgNGU (4/1-13) | C63QfyoF (4/2-13) | same dog |
| C63QgH5K (3/3-19) | C63QgNHs (3/4-19) | same dog |

---

## Known Data Issues

### Dirty records (pre-fix, still present)
13 rows with NULL check_in or phone '4753192977'. Clean with full sync (TODO #1).

### Known null service_types still in DB
Out-of-range for Feb 18–19 sync, will self-correct when their date range is synced:
C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe

### Duplicate/amended bookings (expected behavior)
External site creates a new appointment when a booking is amended. Both records appear in DB.
Old record eventually disappears from schedule page → handled by REQ-108 reconciliation.

---

## Architecture Quick Reference

```
src/lib/scraper/
├── config.js          ✅ 4 verified selectors: h1, .appt-change-status, .event-client, .event-pet
├── auth.js            ✅ Login + session management
├── schedule.js        ✅ Schedule page parsing, pagination, early-stop
│     parseAppointmentStartDate()   — parses "Feb 13, AM" → Date (used for early-stop)
│     buildScheduleStartUrl()       — /schedule/days-7/YYYY/M/D format
│     fetchAllSchedulePages()       — paginates, early-stops on endDate
├── extraction.js      ✅ All fixes committed (2469d5a)
│     extractPageTitle()            — falls back to <title> tag when h1 absent
│     parseServiceTypeDates()       — PRIMARY source for check_in/out dates
│     extractScheduledTimestamps()  — FALLBACK: Unix timestamps from data-start/end_scheduled
│     extractByLabelContains()      — field-label/field-value pattern
│     extractEmailFromDataAttr()    — data-emails= attribute
│     extractPhoneFromMobileContact() — .mobile-contact[data-value]
│     extractAddressFromDataAttr()  — data-address= attribute
│     extractDuration()             — .scheduled-duration
│     extractAppointmentNotes()     — .notes-wrapper .note divs
├── reconcile.js       🆕 TO BUILD — REQ-108 archive reconciliation
│     reconcileArchivedAppointments() — main entry, called from sync.js
│     findReconciliationCandidates() — DB query for unseen active records
│     isAccessDeniedPage()          — detects schedule page served instead of appointment
│     archiveSyncAppointment()      — upserts sync_status: 'archived'
├── changeDetection.js ✅ service_type in HASH_FIELDS (2469d5a)
├── mapping.js         — Maps to dogs/boardings/sync_appointments tables
├── sync.js            ✅ All fixes committed (2469d5a) — needs seenExternalIds + reconcile call
├── logger.js          — File + console logging
└── changeDetection.js — Content hash change detection

src/hooks/useSyncSettings.js
  ← triggerSync() calls runSync() with HARDCODED test dates (need UI — see TODO #2)
  ← For full sync: remove startDate/endDate (see TODO #1)

src/components/SyncSettings.jsx ← Sync Now button, sync history display
```

---

## Key Lessons

### 1. `new Date('YYYY-MM-DD')` is UTC, not local time
```js
new Date('2026-02-18')  // ❌ UTC midnight = PST 4pm on Feb 17
new Date(2026, 1, 18)   // ✅ Local midnight on Feb 18
```

### 2. Early-stop must filter nulls before checking "all beyond"
```js
const parseableDates = appointments.map(a => parseAppointmentStartDate(a.time)).filter(Boolean);
parseableDates.length > 0 && parseableDates.every(d => d > endDate)
```

### 3. `data-start_scheduled` ≠ actual check-in date
Appointment creation time. Title is authoritative. Use `parseServiceTypeDates()` as primary.

### 4. Overlap filter boundary: use `>=` not `>` for checkout
Title-parsed checkout dates are midnight. Strict `>` incorrectly excludes them.

### 5. "Boarding (Nights)" pages have no `<h1>`
Fall back to `<title>` tag: strip ` | A Girl and Your Dog` suffix.

### 6. HASH_FIELDS determines what gets written on unchanged records
If a field is not in HASH_FIELDS, it will never be retroactively written. Add to HASH_FIELDS
to force a one-time hash mismatch and trigger a full update for affected records.

### 7. ESLint no-unused-vars blocks commits
Delete dead helpers before committing.

### 8. Inaccessible appointment detection (REQ-108)
Inaccessible URLs serve the `/schedule` page HTML (JS popup not in source).
Detect by absence of `data-start_scheduled` (unique to valid appointment pages).
Do NOT match popup text — it's not in the raw HTML.

---

## If You Get a Stuck Sync

```sql
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';
```

---

## First Message for Next Session

> "Picking up from Feb 20 evening handoff. Plan for REQ-108 (archive reconciliation) is fully documented in SESSION_HANDOFF.md. No code written yet.
>
> Start with TODO #1: run a full sync to clean 13 dirty DB records. In useSyncSettings.js, remove startDate/endDate from the runSync call, trigger the sync, verify with the SQL checks, then restore the hardcoded dates.
>
> Then implement REQ-108 per the plan in SESSION_HANDOFF.md: new reconcile.js, seenExternalIds in sync.js, DB migration for appointments_archived column, REQ-108 in REQUIREMENTS.md, tests in reconcile.test.js and sync.test.js."
