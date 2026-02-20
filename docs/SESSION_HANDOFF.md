# Dog Boarding App Sync - Session Handoff
**Date:** February 20, 2026 (morning session, ended ~11am)
**Status:** Sync working, date filtering validated. Two bugs fixed (uncommitted). Ready to run sync to verify fixes, then clean dirty DB records.

---

## What We Did

### Session 1 (Feb 19–20, ended ~1am)
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
13. ✅ Committed — commit `1242812`

### Session 2 (Feb 20, ~9am–11am)
14. ✅ Ran sync (Feb 18–19) — validated date-overlap filter works correctly
    - 3 pages fetched, 258 total, 253 skipped (non-boarding)
    - 5 in-range boardings saved: 2/13-18, 2/13-23 (Maverick), 2/15-21, Boarding (Nights) 2/17-20, 2/17-18
    - 8 out-of-range boardings correctly skipped
    - Time: 125s
15. ✅ Spot-checked DB — dirty records (NULL check_in, phone 4753192977) being cleaned up by syncs
16. ✅ Fixed `service_type: null` on "Boarding (Nights)" appointments — these pages have no `<h1>`;
    added `extractPageTitle()` helper to fall back to `<title>` tag
17. ✅ Fixed `check_in_datetime` off by 1 day (Feb 12 vs title "2/13-18") — `data-start_scheduled`
    is appointment creation time, not actual check-in. Flipped date priority: `parseServiceTypeDates()`
    from title is now PRIMARY; system timestamps are FALLBACK for appointments without dates in title
18. ✅ Fixed overlap filter boundary — changed `checkOut > startDate` to `checkOut >= startDate`
    (title-parsed checkout dates are midnight; old strict `>` incorrectly excluded them)
19. ⚠️ Fixes 16–18 are **NOT YET COMMITTED** — run sync to validate first, then commit

---

## Sync Performance

| Metric | Original | After S1 fixes |
|--------|----------|----------------|
| Pages fetched | 10 | 3 |
| Appointments found | 495 | 258 |
| Detail pages fetched | ~60 | ~13 |
| Total time | ~322s | ~125s |
| Maverick (2/13-23) included | ❌ | ✅ |
| Out-of-range boardings saved | ✅ (always) | ❌ (filtered) |

---

## Pending TODOs (priority order)

### 1. ✅ Validate date-overlap filter (DONE Feb 20 morning)
All 8 out-of-range boardings skipped, 5 correct in-range boardings saved.

### 2. Run sync to validate Session 2 fixes (NEXT UP)
Fixes to `extraction.js` and `sync.js` are **uncommitted**. Re-run sync (Feb 18–19) and verify:
- `service_type` is now `"Boarding (Nights)"` (not null) for C63QgRCN and similar
- `check_in_datetime` for C63QgNGP (2/13-18) is now **Feb 13** (not Feb 12)
- "2/13-18" boarding still passes the overlap filter with Feb 18 startDate (boundary fix)
- Overlap filter still correctly excludes out-of-range boardings

Then commit.

### 3. Clean up dirty DB records
Records from before all fixes have bad data. From spot-check Feb 20:
- All recently-synced records show `previous_data` with `client_phone: "4753192977"`, `check_in_datetime: null`
  — meaning the fixes are being applied on each sync. Records ARE getting cleaned up as they're re-synced.
- `C63QgPJz` (Bronwyn / Initial Evaluation) was manually deleted from DB ✅
- Remaining question: do any records still have NULL check_in? Run:
```sql
SELECT COUNT(*) FROM sync_appointments WHERE check_in_datetime IS NULL;
SELECT COUNT(*) FROM sync_appointments WHERE client_phone = '4753192977';
```
If many remain, consider running a full sync (no date filter) to clean all at once (~5 min).

### 4. ✅ Verify extraction quality (DONE Feb 20 — spot-check results)
- `check_in_datetime` / `check_out_datetime` — populated ✅ (off-by-one-day bug now fixed)
- `client_email` — populated ✅
- `client_phone` — real client phone ✅
- `client_address` — populated ✅
- `pet_name` — correct ✅
- `mapped_boarding_id` — non-null ✅
- `service_type` — null on "Boarding (Nights)" ❌ — **FIXED (uncommitted)**
- Duplicate sync_appointments for same dog/period — confirmed expected behavior (amended bookings on external site)

### 5. Build date range UI in SyncSettings
Right now the date range is hardcoded in `useSyncSettings.js`:
```js
startDate: new Date(2026, 1, 18), // hardcoded test dates
endDate: new Date(2026, 1, 19),
```
Need a date picker UI in `SyncSettings.jsx` so the business owner can choose the range before syncing.
- Default: "last 30 days" or "today"
- Should support "full sync" option (no date range)

### 6. Archive inaccessible records
**Problem:** When the external site no longer allows viewing a record (e.g. C63QgS0U — cancelled/replaced booking),
the detail page returns a "you cannot view this record" error. Currently the sync has no way to detect this —
the record just stays `sync_status: active` forever with stale data.

**What to build:**
- In `fetchAppointmentDetails`: detect non-200 response OR HTML containing "you cannot view this record"
  and throw a specific error type (e.g. `AppointmentInaccessibleError`)
- In `sync.js` processing loop: catch that error type and upsert the record with `sync_status: 'archived'`
  instead of failing the whole sync
- The inaccessible record's existing data should be preserved — just mark it archived

**Known example:** C63QgS0U (Captain Morgan "2/20-24") — was replaced by C63QgQz4 ("2/20-25").
Both are mapped to the same boarding. C63QgS0U should be archived.

### 7. Investigate remaining extraction gaps
Fields to verify after next sync run:
- `access_instructions` — spot-checked, appears correct ("Ke" for Gulliver is accurate real data)
- `special_notes` — appears correct in spot-check
- `pet_breed` — appeared correct in spot-check
- `pet_food_allergies` / `pet_health_mobility` / `pet_medications` — appeared correct in spot-check
- `status` — always `null` — `.appt-change-status` selector extracts text inside anchor tag;
  may need to check if the regex handles the `<i>` icon inside: `<a ...><i ...></i> Completed</a>`

### 8. (Low priority) Pre-detail-fetch date filter to reduce sync time
For boardings with parseable dates in the title (e.g. "3/3-19"), run `parseServiceTypeDates()` BEFORE
fetching the detail page. If definitely out of range, skip the fetch.
- Would save ~6 detail fetches (~48s) per 1-day sync
- "Boarding (Nights)" still requires fetch (no dates in title)
- Expected improvement: ~125s → ~60s

---

## Known Data Issues

### Duplicate/amended bookings (expected, not a bug)
The external site creates new appointments when bookings are amended. Both the old and new records
appear on the schedule page and both get synced. They map to the same boarding in our DB.
- C63QgS0U (2/20-24) + C63QgQz4 (2/20-25) → same dog, same boarding
- C63QgNGU (4/1-13) + C63QfyoF (4/2-13) → same dog, same boarding
- C63QgH5K (3/3-19) + C63QgNHs (3/4-19) → same dog, same boarding
Old records may become inaccessible (see TODO #6).

### check_in date vs title date discrepancy (explained)
`data-start_scheduled` on the external site is the appointment CREATION time, not the actual check-in.
Example: "2/13-18" boarding has `data-start_scheduled` = Feb 12 10am UTC (created Feb 12),
but actual check-in was Feb 13 11:45am per notes. Title dates are authoritative.
**Fixed in Session 2**: `parseServiceTypeDates()` from title is now primary source.

---

## Known Filter Patterns (verified by business owner)

### Non-boarding (skip — don't fetch detail page)
| Pattern | Example | Reason |
|---------|---------|--------|
| `DC:*` / `D/C *` / `DC *` | "DC:FT", "D/C M/T/W/TH" | Daycare |
| `PG:*` / `P/G *` / `PG *` | "PG FT", "P/G MTWTH" | Pack group |
| `ADD [name] [days]` | "ADD Leo T/TH" | Daycare add-on |
| `* switch day` | "Brinkley switch day" | Daycare day swap |
| `back to N days` | "mav back to 4 days" | Daycare schedule change |
| `Initial Eval*` | "Initial Evaluation" | One-time eval meeting |
| `Busy` (bare, exact) | "Busy" | Schedule block / internal note |

### Boarding (process these)
| Pattern | Example |
|---------|---------|
| `M/D-D` | "2/13-18", "2/14-15am" |
| `M/D-D (Day)` | "2/13-23 (Mon)" |
| `B/O [name] M/D[AM/PM]-D` | "B/O Pepper 2/9PM-17" |
| `Boarding (Nights)` | no dates in title — use system timestamps for check_in/out |

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
├── extraction.js      ✅ Updated in Session 2 (UNCOMMITTED)
│     extractPageTitle()            — NEW: falls back to <title> tag when h1 absent
│     parseServiceTypeDates()       — PRIMARY source for check_in/out dates (title is authoritative)
│     extractScheduledTimestamps()  — FALLBACK: Unix timestamps from data-start/end_scheduled
│     extractByLabelContains()      — field-label/field-value pattern
│     extractEmailFromDataAttr()    — data-emails= attribute
│     extractPhoneFromMobileContact() — .mobile-contact[data-value]
│     extractAddressFromDataAttr()  — data-address= attribute
│     extractDuration()             — .scheduled-duration
│     extractAppointmentNotes()     — .notes-wrapper .note divs
├── mapping.js         — Maps to dogs/boardings/sync_appointments tables
├── sync.js            ✅ Updated in Session 2 (UNCOMMITTED)
│     Pre-filter (title)            — skips DC/PG/ADD/switch/back-to/Initial Eval/Busy
│     Post-filter (service_type)    — catches ambiguous titles like "Busy"
│     Date-overlap filter           — checkIn < endDate && checkOut >= startDate
│     pet_name/client_name fallback — uses schedule-page data when detail page returns null
├── logger.js          — File + console logging
└── changeDetection.js — Content hash change detection

src/hooks/useSyncSettings.js
  ← triggerSync() calls runSync() with HARDCODED test dates (need UI — see TODO #5)
  ← startDate: new Date(2026, 1, 18)  ← MUST use local Date constructor, not string
  ← endDate: new Date(2026, 1, 19)

src/components/SyncSettings.jsx ← Sync Now button, sync history display
```

---

## Key Lessons

### 1. `new Date('YYYY-MM-DD')` is UTC, not local time
```js
new Date('2026-02-18')  // ❌ UTC midnight = PST 4pm on Feb 17 → fetches wrong week
new Date(2026, 1, 18)   // ✅ Local midnight on Feb 18
```

### 2. Early-stop must filter nulls before checking "all beyond"
```js
// ❌ BROKEN: null times cause every() to return false
appointments.every(a => parseAppointmentStartDate(a.time) > endDate)

// ✅ FIXED: filter nulls first
const parseableDates = appointments.map(a => parseAppointmentStartDate(a.time)).filter(Boolean);
parseableDates.length > 0 && parseableDates.every(d => d > endDate)
```

### 3. `data-start_scheduled` ≠ actual check-in date
The external site's system timestamp is the appointment creation time. The title (e.g. "2/13-18")
is the actual boarding date range per the business owner. Always use `parseServiceTypeDates()` as
primary; fall back to system timestamps only when the title has no date pattern ("Boarding (Nights)").

### 4. Overlap filter boundary: use `>=` not `>` for checkout
Title-parsed checkout dates are midnight (local). With strict `>`, a booking ending at midnight
on `startDate` is incorrectly excluded. Use `checkOut >= startDate`.

### 5. "Boarding (Nights)" pages have no `<h1>`
The appointment title only appears in `<title>`, `#services-wrapper` anchor, and pricing section.
Use `<title>` tag as fallback: strip ` | A Girl and Your Dog` suffix.

### 6. ESLint no-unused-vars blocks commits
Dead helpers from rewrites fail the pre-commit hook. Delete before committing.

---

## External Site HTML Patterns (verified Feb 19–20, 2026)

### Appointment detail page — appointments with date title (e.g. C63QgKsK "2/13-23 (Mon)")
- **Service type**: `<h1>2/13-23 (Mon)</h1>` inside `<div class="content-header">`
- **Timestamps**: `<div id="when-wrapper" data-start_scheduled="1770976800" data-end_scheduled="1772013600">`
- **Client email**: `data-emails= "foo@bar.com"` (note: space before quote)
- **Client phone**: `<a class="mobile-contact" data-value="+14156065390">`
- **Client address**: `data-address="333 Precita Ave, San Francisco, CA, 94110"`
- **Field-label/value**: `<div class="field-label">Breed</div><div class="field-value">Labrador</div>`
- **Notes**: `<div class="notes-wrapper"><div class="note">text</div></div>`
- **Duration**: `<span class="scheduled-duration">(Scheduled: 10 d)</span>` — pattern is inconsistent ("d", "nights", etc.)

### "Boarding (Nights)" appointments (e.g. C63QgRCN — Gulliver Chen)
- **NO `<h1>`** — title is ONLY in `<title>Boarding (Nights) | A Girl and Your Dog</title>`
- **Service type** extracted via `extractPageTitle()` fallback
- **check_in/out** — no dates in title → uses system timestamps from `#when-wrapper`

---

## DB Schema Quick Reference

```sql
-- Key tables
dogs              -- id, name, breed, is_active, owner_name, owner_email, owner_phone
boardings         -- id, dog_id, check_in, check_out, notes, status
sync_appointments -- id, external_id, service_type, check_in_datetime, check_out_datetime,
                  --   pet_name, client_name, client_email, client_phone, client_address,
                  --   pet_breed, pet_medications, access_instructions, special_notes,
                  --   mapped_dog_id, mapped_boarding_id, sync_status, content_hash
sync_logs         -- id, status, started_at, completed_at, appointments_found, ...
sync_settings     -- id, enabled, interval_minutes, last_sync_at, last_sync_status
```

---

## If You Get a Stuck Sync

```sql
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';
```

---

## First Message for Next Session

> "Picking up from Feb 20 morning handoff. There are uncommitted fixes in `extraction.js` and `sync.js` (Session 2 items 16–18). Start by running the sync (Feb 18–19 dates still hardcoded in `useSyncSettings.js`) and verify: (1) `service_type` is now 'Boarding (Nights)' for C63QgRCN (not null), (2) `check_in_datetime` for C63QgNGP is Feb 13 not Feb 12, (3) the 2/13-18 boarding still passes the overlap filter with startDate Feb 18. If all looks good, commit. Then assess dirty records — run the SQL in TODO #3 to see how many remain, and decide whether to run a full sync to clean them."
