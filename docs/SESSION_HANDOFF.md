# Dog Boarding App Sync - Session Handoff
**Date:** February 20, 2026 (evening session, ended ~5pm)
**Status:** REQ-108 (archive reconciliation) fully implemented and committed. DB is clean. Ready for next feature.

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
19. ✅ Planned REQ-108: Archive Reconciliation

### Session 4 (Feb 20, ~3–5pm) — committed `cf4f49a`
20. ✅ DB cleanup: deleted 13 non-boarding records (ADD Leo T/TH, switch day, back to N days)
    that the pre-filter was correctly skipping and would never self-clean
21. ✅ Verified `client_phone = '4753192977'` fully cleaned (count = 0)
22. ✅ Implemented REQ-108: Archive Reconciliation
    - New: `src/lib/scraper/reconcile.js` — 4 exported functions
    - Modified: `src/lib/scraper/sync.js` — seenExternalIds, reconcile call, appointmentsArchived
    - New: `src/__tests__/scraper/reconcile.test.js` — 20 tests
    - Updated: `src/__tests__/scraper/sync.test.js` — 1 new test (26 total)
    - Updated: `docs/REQUIREMENTS.md` — REQ-108 added
    - All 46 tests pass, 100% requirement coverage

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

### 1. ⚠️ Run DB migration before next sync
```sql
ALTER TABLE sync_logs ADD COLUMN appointments_archived INTEGER DEFAULT 0;
```
Without this, the first sync after REQ-108 will fail when trying to write `appointments_archived` to `sync_logs`.

### 2. Build date range UI in SyncSettings
Dates are still hardcoded in `useSyncSettings.js:159`. Need a date picker in `SyncSettings.jsx`.
- Default: "today" or "last 30 days"
- "Full sync" option (no date range)
- Until this is built, manually edit `useSyncSettings.js` to change the date range.

### 3. Investigate `status` extraction
Always returns `null`. `.appt-change-status` selector may need to handle `<i>` icon inside anchor:
`<a ...><i ...></i> Completed</a>` — try `$('.appt-change-status').text().trim()` or similar.

### 4. (Low priority) Pre-detail-fetch date filter
For boardings with parseable title dates, run `parseServiceTypeDates()` BEFORE fetching detail page.
If out of range, skip. Saves ~48s per 1-day sync.

---

## Known Data Issues

### Known null service_types in DB
These were out of range for the Feb 18–19 sync window and will self-correct when their date range is synced:
`C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe`

### Known amended bookings (will be archived by REQ-108)
These old external IDs were amended on the external site. Their source_url now serves the schedule page.
On next sync covering their date range, reconciliation will confirm and archive them:
| Old (to archive) | New (active) | Dog |
|---|---|---|
| C63QgS0U (2/20-24) | C63QgQz4 (2/20-25) | Captain Morgan |
| C63QgNGU (4/1-13) | C63QfyoF (4/2-13) | same dog |
| C63QgH5K (3/3-19) | C63QgNHs (3/4-19) | same dog |

---

## Architecture Quick Reference

```
src/lib/scraper/
├── config.js          ✅ 4 verified selectors: h1, .appt-change-status, .event-client, .event-pet
├── auth.js            ✅ Login + session management
│     authenticatedFetch() — routes through /api/sync-proxy (CORS); used by extraction + reconcile
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
├── reconcile.js       ✅ REQ-108 implemented (cf4f49a)
│     isAccessDeniedPage()          — detects schedule page served instead of appointment
│     findReconciliationCandidates() — DB query for unseen active records in window
│     archiveSyncAppointment()      — sets sync_status: 'archived'
│     reconcileArchivedAppointments() — main entry, called from sync.js after main loop
├── changeDetection.js ✅ service_type in HASH_FIELDS (2469d5a)
├── mapping.js         ✅ Maps to dogs/boardings/sync_appointments tables
├── sync.js            ✅ All fixes + REQ-108 (cf4f49a)
│     seenExternalIds Set populated at start of loop (before filters)
│     reconcileArchivedAppointments() called after main loop, own try/catch
│     result.appointmentsArchived + updateSyncLog appointments_archived
├── logger.js          ✅ File + console logging
└── changeDetection.js ✅ Content hash change detection

src/hooks/useSyncSettings.js
  ← triggerSync() calls runSync() with HARDCODED test dates (need UI — see TODO #2)
  ← Hardcoded: new Date(2026, 1, 18) / new Date(2026, 1, 19) at line ~159
  ← For full sync: remove startDate/endDate from the runSync call

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

### 9. Non-boarding records won't self-clean via sync
The pre-filter skips them before detail fetch → no upsert → they stay dirty forever.
Delete them manually with SQL filtered by service_type.

---

## If You Get a Stuck Sync

```sql
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';
```

---

## First Message for Next Session

> "Picking up from Feb 20 evening handoff. DB is clean, REQ-108 is fully implemented (commit cf4f49a).
>
> First: run the DB migration before any sync:
> `ALTER TABLE sync_logs ADD COLUMN appointments_archived INTEGER DEFAULT 0;`
>
> Then pick up with TODO #2: build a date range UI in SyncSettings.jsx so dates don't need to be hardcoded in useSyncSettings.js. See SESSION_HANDOFF.md for details."
