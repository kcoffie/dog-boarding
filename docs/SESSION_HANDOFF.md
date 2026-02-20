# Dog Boarding App Sync - Session Handoff
**Date:** February 19, 2026 (late night)
**Status:** Tasks 1–6 complete. Ready to run a validation sync and fix remaining extraction gaps.

---

## What We Did This Session

1. ✅ Fixed date range URL filtering (Task 1) — site ignores `?start=&end=`, now uses `/schedule/days-7/YYYY/M/D`
2. ✅ Added post-fetch date filter (Task 2) — early-stop and pre-`startDate` removal in `fetchAllSchedulePages()`
3. ✅ Extended boarding filter (Task 3) — added `ADD`, `switch day`, `back to N days` to skip list
4. ✅ Reviewed 32 existing DB records and found critical data bugs (Task 4)
5. ✅ Fixed `check_in_datetime` / `check_out_datetime` always null — parse from `service_type` string (Task 5)
6. ✅ Fixed pet_name "Unknown" collapse bug — use schedule-page `petName` as fallback (Task 6)
7. ✅ Fixed wrong phone number — removed global regex fallback that matched business's own phone

---

## What the DB Showed (before fixes)

32 sync_appointments had these bugs — all now fixed in code, but the existing records in DB are still dirty:
- `check_in_datetime` / `check_out_datetime` — always NULL
- `mapped_boarding_id` — always NULL (because dates were null, boarding couldn't be created)
- `client_phone` — "4753192977" for every record (business's own phone from site header)
- `pet_name` — null for most records (→ all mapped to the same "Unknown" dog entity)

**Decision needed**: delete the 32 dirty records and re-sync, or leave them and let the next sync update in place.

---

## Filter Clarifications (from business owner)

| Title | Verdict |
|-------|---------|
| `"ADD Leo T/TH"` | ❌ Skip — dog added to recurring daycare, not boarding |
| `"Brinkley switch day"` | ❌ Skip — daycare day swap |
| `"mav back to 4 days"` | ❌ Skip — daycare schedule change note |
| `"B/O Pepper 2/9PM-17"` | ✅ Keep — confirmed boarding (8 nights, Feb 9–17); "B/O" meaning still unclear |
| `"Boarding (Nights)"` | ✅ Keep |
| `"2/13-18"` etc. | ✅ Keep — date-range format = boarding |

---

## What Should Happen on the Next Sync

Run with `startDate: new Date('2026-02-19')` and `endDate: new Date('2026-02-19')` and verify:

1. **Only 1–2 pages fetched** instead of 10 (check logs — should jump straight to Feb 19 week)
2. **`check_in_datetime` populated** — e.g., "2026-02-13T00:00:00.000Z" from service_type "2/13-18"
3. **`check_out_datetime` populated** — same
4. **`mapped_boarding_id` non-null** — boarding record created using those dates
5. **`pet_name` populated** — e.g., "Pepper Konrad" from schedule page, not null
6. **`client_phone` null** — no more business phone on every row
7. **"ADD Leo T/TH" not saved** — skipped by pre-filter

---

## Remaining Known Issues

### Detail page CSS selectors are still guesses
`config.js` has placeholder selectors (`.service-type`, `.client-name`, `.check-in`, etc.) that don't match the real HTML. Most fields extracted from the detail page are null.

**What's broken**: `client_name`, `status`, `assigned_staff`, `client_email_primary`, `client_address`, `pet_breed`, `pet_medications`, structured note fields (`access_instructions`, `special_notes`, `drop_off_instructions`).

**What's working**: `service_type` (the date-range title), `pet_name` (via schedule-page fallback).

**To fix**: Need the actual HTML source of a detail page. Open a URL like `https://agirlandyourdog.com/schedule/a/C63QgOnQ/1770652800` in a browser → View Source → share the HTML. Then update selectors in `src/lib/scraper/config.js`.

### access_instructions / special_notes extract labels not values
`"Home or Apartment"`, `"Allergies"` — the regex is matching the label element instead of the adjacent value. Will be fixed when we see real HTML.

---

## Current State of the Codebase

| Feature | Status |
|---------|--------|
| Authentication | ✅ Working |
| Schedule page parsing | ✅ Working |
| Boarding pre-filter (DC/PG/ADD/switch/back-to) | ✅ Working |
| Post-fetch date filter | ✅ Working |
| Date range URL (days-7 format) | ✅ Fixed |
| check_in/check_out from service_type | ✅ Fixed |
| pet_name fallback from schedule page | ✅ Fixed |
| client_phone — no header bleed | ✅ Fixed |
| Detail page CSS selectors | ❌ Guesses — need real HTML |
| Structured note fields | ❌ Extracting labels not values |
| DB records from before fixes | ⚠️ 32 dirty records need cleanup decision |
| Migration 011 | ✅ Applied |
| Sync history UI | ✅ Built |

---

## Architecture Quick Reference

```
src/lib/scraper/
├── config.js          # CSS selectors — PLACEHOLDERS, need real HTML to fix
├── auth.js            # Login, session — WORKING
├── schedule.js        # Schedule page parsing — WORKING
│     parseAppointmentStartDate()   new: parses "Feb 13, AM" → Date
│     buildScheduleStartUrl()       new: /schedule/days-7/YYYY/M/D format
├── extraction.js      # Detail page parsing
│     parseServiceTypeDates()       new: parses "2/13-18" → {checkIn, checkOut}
│     extractPhoneFromSelector()    renamed: no global regex fallback
├── mapping.js         # Maps to dogs/boardings/sync_appointments
├── sync.js            # Main orchestration — pre/post filter here
│     pet_name/client_name fallback from schedule page (line ~392)
├── batchSync.js       # Batch processing + checkpoints
├── logger.js          # File + console logging
├── changeDetection.js # Content hash change detection
└── deletionDetection.js # Tracks missing appointments

src/hooks/useSyncSettings.js  ← runSync() called here with startDate/endDate
src/components/SyncSettings.jsx ← Sync Now button
```

---

## If You Get a Stuck Sync

```sql
UPDATE sync_logs SET status = 'aborted', completed_at = NOW() WHERE status = 'running';
```

---

## First Message for Next Session

> "Picking up from Feb 19 late-night handoff. Tasks 1–6 are done. I want to run a 1-day validation sync to verify check_in/check_out are now populated and pet_name is working. Then we'll look at the detail page HTML to fix the CSS selectors."
