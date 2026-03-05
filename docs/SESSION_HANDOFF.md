# Dog Boarding App — Session Handoff (v3.2)
**Last updated:** March 5, 2026 (v3.2 — stale title bug fix)
**Status:** v3.2 committed at `4bfc212`. **One manual step required before deploying — see below.**

---

## Current State

- **692 tests pass** (all 692 — 4 additional tests added this session).
- **`main`** local is at `4bfc212`, ahead of `origin/main` (`a8abb6e`). Not yet pushed.
- **Live URL:** [qboarding.vercel.app](https://qboarding.vercel.app) (still running v3.1)

## IMMEDIATE NEXT ACTIONS (do these first)

1. **Apply migration 017 in Supabase SQL editor** (before pushing — sync will fail silently if columns don't exist):
   ```sql
   ALTER TABLE boardings
     ADD COLUMN IF NOT EXISTS arrival_ampm TEXT,
     ADD COLUMN IF NOT EXISTS departure_ampm TEXT;
   ```
2. **Push to deploy:** `git push origin main`
3. **Verify deployment:** trigger a Sync Now for a boarding with a known check-in (e.g., C63QgUhM). Confirm `boardings` table has `arrival_ampm='AM'`, `departure_ampm='PM'`. DogsPage should show `Mar 4, 2026 AM` instead of `Mar 4, 2026 12:00 AM`.

## Cron health (as of March 4, 2026)

Crons ran overnight at their scheduled UTC times (UTC midnight = 4pm PST day prior):
- `schedule` — 00:18 UTC → queued 14, skipped 124, 1 page scanned, cursor to 2026-03-10
- `detail` — 00:27 UTC → idle (queue already empty)
- `auth` — 00:54 UTC → skipped (session still valid)

Check each session:
```sql
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;
```

---

## v3.1 What Was Done (March 4, 2026 — sessions 1–3)

### Housekeeping (session 3) ✅
- PR #34 confirmed merged (CI fully green)
- Local `main` fast-forwarded to match `origin/main`
- "Restrict force pushes" re-enabled in GitHub Rulesets
- RLS enabled on `sync_queue` in Supabase
- `Co-Authored-By: Claude` stripped from all commit messages (all branches + tags) via `git filter-branch --tag-name-filter cat` + force-push

### Git history rewrite (session 1) ✅
All 218 commits rewritten to use `kcoffie@gmail.com` (was `kcoffie@directcommerce.com`, no longer valid). Force-pushed to all branches (main, fix/v3.1-code-hardening, uat, develop) and tags. Local git config updated: `git config user.email "kcoffie@gmail.com"`.

### Tests: 697/697 passing ✅
Fixed 9 pre-existing test failures + 2 CI-only failures:

1. **BoardingMatrix sorting tests** (`src/components/BoardingMatrix.test.jsx`): Added mocks for `useBoardingForms`, `EmployeeDropdown`, `BoardingFormModal`. Fixed `getDogNamesInOrder` helper: dog name is in `<button>`, not `spans[1]`.
2. **DateNavigator DST test**: `Math.floor` → `Math.round` (fixes flakiness near DST boundary).
3. **CsvImport.test.jsx** (CI-only fail): Replaced stale `useLocalStorage` mock with `DataContext` mock — test was written before Supabase migration and still used localStorage mock; `DataProvider` imported supabase at module load time without env vars.
4. **DogsPage.pastBoardings.test.jsx** (CI-only fail): Added `vi.mock('../../hooks/useBoardingForms', ...)` — DataContext was mocked but `DogsPage` also imports `useBoardingForms` directly → supabase import chain.

### Code fixes in PR `fix/v3.1-code-hardening` ✅
- **sync.js**: drain loop cap (`MAX_DRAIN = 20`) — prevents runaway drain in browser sync
- **forms.js**: date validation in `parseMMDDYYYYtoISO` — reject month > 12 or day > 31
- **BoardingFormModal.jsx**: popup blocker alert — was silently failing; now `alert()`s if `window.open()` returns null

### Lint: all 21 errors/warnings fixed ✅
Fixed across 16 files (unused imports, unused vars, eslint-disable comments for known-acceptable patterns).

### README updated ✅
Added live URL, boarding forms feature description, updated project structure, removed version references.

### Supabase: enable RLS on sync_queue ⚠️ PENDING
```sql
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
```
Safe — table only accessed by service role (crons + sync proxy), which bypasses RLS. No policies needed.

---

## Bug Fix (March 5, 2026) — Stale title month causes wrong-month date parsing

**Symptom:** Appointment `C63QgT8L` (Annie & Tracy, Michael Tam, March 5–7) was skipped as "out-of-range" during a March sync. Client had entered title `"2/5-7"` (originally a Feb booking, or a typo), which `parseServiceTypeDates` parsed as Feb 5–7. System timestamps correctly said March 5–7 but were only used as a fallback when the title had *no* parseable dates at all.

**Fix in `extraction.js` (`parseAppointmentPage`):** After parsing title dates, cross-validate against the `data-start_scheduled` system timestamp. If a reasonable timestamp (within ±2 years of now) differs from the title date by >20 days, the title month is stale/wrong → use the system timestamps instead. Far-future/bogus timestamps (e.g. `9999999999`) are ignored.

**Test added:** `falls back to system timestamps when title month is stale/wrong (>20 day gap)` in `extraction.test.js`.

---

## v3.2 What Was Done (March 4, 2026)

### AM/PM capture & display ✅
- `extraction.js`: added `extractCheckInOutAmPm(html)` — grabs `event-time-scheduled` block, collects `.time-label` spans → `{ checkInAmPm, checkOutAmPm }`. Added `check_in_ampm` / `check_out_ampm` to `parseAppointmentPage` return.
- `supabase/migrations/017_add_ampm_columns.sql`: adds `arrival_ampm TEXT`, `departure_ampm TEXT` to `boardings` table. **Apply manually in Supabase SQL editor before syncing.**
- `mapping.js`: `mapToBoarding` includes `arrival_ampm`/`departure_ampm`. `upsertBoarding` writes them on update.
- `useBoardings.js`: transform includes `arrivalAmPm`/`departureAmPm`.
- `DogsPage.jsx`: `formatDateWithAmPm(dt, ampm)` helper — shows `Mar 4, 2026 AM` when ampm present, falls back to `formatDateTime`. Applied to desktop table + mobile cards.
- `CalendarPage.jsx`: `calendarBookings` useMemo includes `arrival_ampm`/`departure_ampm`. Detail panel: arriving shows `AM →`, departing shows `→ PM`. PrintSection shows ampm in arriving/departing/staying rows.

### SyncSettings cleanup ✅
- Removed dead UI: "Automatic Sync" toggle, "Sync Interval" select, "Setup Mode" toggle + info banner + confirmation dialog.
- `useSyncSettings.js`: removed `toggleEnabled`, `setInterval`, `toggleSetupMode` functions and `updateSyncSettings` import.
- `SyncSettings.test.jsx` + `useSyncSettings.test.js`: updated to not reference removed functions.

---

## v3.2 Next Steps / Backlog

### v3.3 Payroll Report (planned design — ready to implement)
New section at bottom of `PayrollPage.jsx`. New component `src/components/PayrollReport.jsx`.

Layout:
```
Payroll Report: Mar 4 – Apr 3, 2026                    [Print]

Employee       | Mar 4 | Mar 5 | ... | Apr 3 | Total
---------------|-------|-------|-----|-------|-------
Alex           |  2/$80|  3/$120| ...| 1/$40 | $840
Jordan         |   —   |  1/$40 | ...| 2/$80 | $520
```
- Each cell: `{numDogs} dog(s) / ${net_amount}` (employee's take, not gross)
- Cell bg: light green if date is in `getPaidDatesForEmployee()`
- Total column: sum of all net amounts for that employee
- Print: `window.print()` + `@media print` CSS

Data per cell:
- `getNightAssignment(dateStr)` → which employee worked that night
- Dogs overnight that night: `boardings.filter(b => isOvernight(b, dateStr))`
- Net per dog: `dog.nightRate * getNetPercentageForDate(dateStr) / 100`
- Paid check: `getPaidDatesForEmployee(employeeId).has(dateStr)`

### Longer-term
- Fix status field extraction (always null — `.appt-change-status` needs `textContent` on `<a><i>`)
- **Low priority:** Store datetimes in PST (America/Los_Angeles) instead of UTC

---

## v3.0 Summary (what was built)

- **REQ-500:** Pet ID extraction → `external_pet_id` on dogs table
- **REQ-501:** Forms scraping pipeline (`forms.js`) — fetch, parse, match, store boarding intake forms
- **REQ-502:** Date discrepancy detection (`date_mismatch` flag on `boarding_forms`)
- **REQ-503:** Boarding Form Modal — priority fields, date mismatch alert, print, source URL link
- **REQ-504:** Missing form indicator — red/amber/indigo/slate dog name links in matrix
- **REQ-505:** Forms scraper logging
- **REQ-506:** Modal centering fix via React portal
- **REQ-507:** Dog link three-state color coding
- **REQ-508:** Source URL link + conditional Print button

Key fixes in v3.0:
- `.single()` → `.maybeSingle()` everywhere (killed 406 console errors)
- Sync Now drains all pending form queue items (not just appointments)
- Form field regex: `id="(field_\d+)-wrapper"` (not bare field ID)
- Form matching: strict 7-day submission window, no fallback to stale forms
- Print: isolated `_blank` window (avoids blank output from full-page print)
- Re-enqueue: `boarding_forms` is source of truth; reset done→pending when form not yet stored

See full session log: `docs/archive/SESSION_HANDOFF_v3.0_final.md`

---

## Decisions Locked In

- **Rate fallback:** `boarding.night_rate ?? dog.night_rate ?? 0`
- **HASH_FIELDS:** identity/structure only — pricing fields intentionally excluded
- **Unchanged path:** explicitly writes `appointment_total` + `pricing_line_items` when present
- **Multi-pet:** secondary external_id = `{appt_id}_p{index}`
- **sync_status column:** `sync_status = 'archived'` — `is_archived` does not exist
- **`.maybeSingle()` vs `.single()`:** All existence-check find* queries use `.maybeSingle()`. Never `.single()` for existence checks.
- **Form matching:** 7-day window `(arrival − 7 days)` to `(arrival day)` inclusive. No fallback.
- **Form re-enqueue:** `boarding_forms` is source of truth. `resetIfDone: true` allows re-processing previously-done queue items when form not yet stored.
- **VITE_SYNC_PROXY_TOKEN:** intentionally VITE_-prefixed (browser readable); different from `CRON_SECRET`
- **cron-detail:** 1 queue item per invocation (Hobby plan). "Sync Now" drains all pending form items.
- **Form field regex:** `id="(field_\d+)-wrapper"` — external site uses `-wrapper` suffix
- **historicalSync.js:** kept — useful for full data rebuild, not dead code

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

## Archive

- v3.0 full session log: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 full session log: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
- Earlier versions: `docs/archive/SESSION_HANDOFF_v2.{0-3}_final.md`
