# Dog Boarding App — Session Handoff (v3.0)
**Last updated:** March 3, 2026 (night — form matching: 7-day window filter)
**Status:** v3.0 DEPLOYED. Commits from late-night session pushed. New fix needs push.

---

## Current State

- **697 tests, 688 pass.** 9 pre-existing failures: 1 DST-flaky in `DateNavigator.test.jsx` + 8 in `BoardingMatrix.test.jsx` (sorting UI) — all unrelated to sync work.
- **v3.0 fully deployed.** Migration 016 applied, code pushed to Vercel and live.
- **REQ-506–508 complete.** Modal centering via portal, 3-state link colors, source URL link + conditional print all implemented.
- **1 new fix not yet pushed** — see Next Steps.

## What Was Done This Session (March 3, 2026 — night)

### Fix: Form matching now uses 7-day submission window

**Bug:** `findFormForBoarding` used a "submitted on or before arrival date" filter with a fallback to the most recent form regardless of age. For a repeat client with an old form (e.g., Mochi Hill: Jan 23–27 form matched to a Mar 6–14 boarding), the old form was incorrectly associated.

**Fix:** Replaced the filter + fallback with a strict 7-day window:
- Qualifies if `submittedDate` falls within `(arrival − 7 days)` to `(arrival day inclusive)`
- Submissions with no parseable date → excluded (can't evaluate window)
- No fallback — if nothing is in the window → `findFormForBoarding` returns null
- `fetchAndStoreBoardingForm` when null returned (but submissions exist) → returns without storing, so the job is re-enqueued on the next sync and we wait for the client to submit
- Forms in the window with mismatched dates → stored with `date_mismatch = true` (client typo, but right boarding)

File: `src/lib/scraper/forms.js`

**Tests updated** (`src/__tests__/scraper/forms.test.js`): 4 tests updated to reflect new no-fallback behavior; 3 new tests added (exactly-7-days boundary, 8-days-outside, multiple-in-window). 28/28 forms tests pass.

**After deploying:** Delete stale `boarding_forms` rows that were matched under the old logic:
```sql
-- Find and remove wrongly-matched forms (date_mismatch = true AND dates far off)
-- Then run Sync Now — jobs will re-enqueue, wait for client to submit
DELETE FROM boarding_forms WHERE boarding_id = '398a55ad-2111-4751-b98e-c7a5462798bf';
```

---

## Next Steps

### 1. Push to deploy ← START HERE

All previous late-night commits are pushed. One new commit needs push:
```
fix: form matching uses 7-day submission window, no fallback to old forms
```
Run `git push`. Vercel auto-deploys from main.

### 2. Clean up stale form rows + re-sync

After pushing, delete any `boarding_forms` rows that were matched under the old logic (especially `date_mismatch = true` rows where form dates are months off):
```sql
-- Find candidates (form dates don't even come close to boarding dates)
SELECT bf.boarding_id, d.name, bf.form_arrival_date, bf.form_departure_date,
       b.arrival_datetime::date, b.departure_datetime::date
FROM boarding_forms bf
JOIN boardings b ON bf.boarding_id = b.id
JOIN dogs d ON b.dog_id = d.id
WHERE bf.date_mismatch = true
ORDER BY bf.fetched_at DESC;
```
Delete the bad rows, then run "Sync Now" — jobs will re-enqueue and wait for clients to submit.

### 3. Test form re-fetch

After pushing, run "Sync Now" in Settings. For any boarding where a form was previously looked up but not found (queue status `done`, no `boarding_forms` row), it should now be reset to `pending` and re-fetched. Check:

```sql
-- Should see done→pending resets for boardings without forms
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;

-- Verify new forms came in
SELECT bf.boarding_id, d.name, jsonb_array_length(bf.form_data->'priorityFields') AS priority_count, bf.fetched_at
FROM boarding_forms bf
JOIN boardings b ON bf.boarding_id = b.id
JOIN dogs d ON b.dog_id = d.id
ORDER BY bf.fetched_at DESC LIMIT 10;
```

---

## What Was Done This Session (March 3, 2026 — night)

### REQ-506: Modal centering fix via portal ✅

`BoardingFormModal.jsx`: added `createPortal` import, wrapped entire returned JSX in
`createPortal(…, document.body)`. Escapes the `overflow-x: auto` stacking context on the
matrix so the modal centers correctly in the viewport regardless of scroll position.

### REQ-507: Dog link three-state color coding ✅

Added `getFormLinkColor(relevantBoarding, formData)` and `getFormLinkTitle(...)` module-level
helpers in `BoardingMatrix.jsx`. Updated all 5 spots:
- `BoardingMatrix.jsx`: desktop row, mobile overnight, mobile day-only (removed `noForm`/`nf` consts)
- `DogsPage.jsx`: desktop table, mobile card (removed `noForm` const)

New states: **red** (upcoming boarding, no form), **amber** (form exists, zero priorityFields),
**indigo** (form exists with priorityFields), **slate** (no upcoming boarding).

### REQ-508: Source URL link + conditional Print in modal ✅

`BoardingFormModal.jsx`: footer now has a left group containing:
- `{formData?.submission_url && <a ...>View on site →</a>}` — `print:hidden`, `target="_blank"`, `rel="noopener noreferrer"`
- `{hasContent && <button>Print</button>}` — only shown when `priorityFields` or `otherFields` is non-empty

### Tests ✅

- `src/__tests__/components/BoardingFormModal.test.jsx` — 10 tests (submission_url link + Print conditional)
- `src/__tests__/components/BoardingMatrix.test.jsx` — 4 tests (3-state color coding)
All 14 new tests pass. Total: 686/695.

---

## What Was Done This Session (March 3, 2026 — evening)

### 1. Fixed form field parsing regex (critical bug)

**Bug:** `parseFormDetailPage` in `forms.js` used `id="(field_\d+)"` to find field elements, but the actual external site HTML uses `id="field_184366-wrapper"` (with `-wrapper` suffix). The regex stopped matching at the hyphen, so **zero fields were ever extracted** — all `boarding_forms` rows stored `form_data: { allFields: [], priorityFields: [], otherFields: [] }`.

**Fix:** Changed one line in `parseFormDetailPage`:
```js
// Before
const fieldMarkerRe = /id="(field_\d+)"/gi;
// After
const fieldMarkerRe = /id="(field_\d+)-wrapper"/gi;
```

**Test fixture updated** to match real HTML (`id="field_184366-wrapper"`) — all 26 forms tests pass.

**boarding_forms table cleared** (`DELETE FROM boarding_forms`) so rows will be re-fetched correctly after deploy. Run "Sync Now" in Settings to drain the form queue immediately.

### 2. Added date-matching and parse diagnostic logging

Added verbose logs to `forms.js` to make future debugging visible in Vercel function logs:
- `findFormForBoarding`: logs boarding arrival date + per-submission pass/fail verdict
- `fetchAndStoreBoardingForm`: logs boarding arrival/departure dates after load, and after `parseFormDetailPage` logs field count + extracted form dates + warns if zero fields parsed

Files changed: `src/lib/scraper/forms.js`, `src/__tests__/scraper/forms.test.js`

---

## What Was Done This Session (March 3, 2026 — afternoon)

### 1. Deployed v3.0 to production

- Migration 016 applied (external_pet_id on dogs, type/meta on sync_queue, boarding_forms table)
- Pushed all v3.0 commits to Vercel; app is live
- Confirmed: no 406 console errors, form queue drained, boarding form modal functional
- Logged three UI polish requirements (REQ-506–508) — see Remaining Backlog

---

## What Was Done This Session (March 3, 2026 — morning)

### 1. Fixed 406 console errors — `.single()` → `.maybeSingle()`

Supabase JS `.single()` logs HTTP 406 to the browser console whenever a query returns 0 rows, even if the code catches PGRST116. Switched all existence-check queries to `.maybeSingle()` (returns `{ data: null, error: null }` for 0 rows — no console error).

Files changed:
- **`src/lib/scraper/syncQueue.js`**: `enqueue` (existence check), `dequeueOne`, `markFailed`
- **`src/lib/scraper/mapping.js`**: all five `find*` functions — `findDogByExternalId`, `findDogByName`, `findBoardingByExternalId`, `findBoardingByDogAndDates`, `findSyncAppointmentByExternalId`
- **`src/__tests__/scraper/syncQueue.test.js`**: added `maybeSingle()` to mock builder
- **`src/__tests__/scraper/mapping.test.js`**: added `maybeSingle()` to mock query builder

### 2. Sync Now drains the entire form queue

Previously, form fetch jobs (`type='form'` in `sync_queue`) were only processed by `cron-detail` — one per day on the Hobby plan. After hitting "Sync Now", users had to wait days to get all forms fetched.

Now, `runSync()` in `sync.js` drains all pending form queue items immediately after reconciliation. Each item calls `fetchAndStoreBoardingForm`, reports progress via `onProgress({ stage: 'draining_queue', processed })`, and marks done/failed. The drain is wrapped in its own try/catch — form failures don't affect the main sync status.

Files changed:
- **`src/lib/scraper/sync.js`**: new imports (`fetchAndStoreBoardingForm`, `dequeueOne`, `markDone`, `markFailed`), `formsProcessed`/`formsFailed` added to result, drain loop after reconciliation block
- **`src/lib/scraper/syncQueue.js`**: `dequeueOne` now accepts optional `{ type }` filter so the drain loop can request only `type='form'` items

> **Check first thing each session:** Did overnight crons run?
> `SELECT cron_name, last_ran_at, status, result FROM cron_health ORDER BY cron_name;`
> Or check the Cron Health card on the Settings page.
> To drain the sync queue quickly: use "Sync Now" in Settings (drains all form jobs automatically).

---

## v3.0 What Was Built

### REQ-500: Pet ID extraction + external_pet_id on dogs ✅

- `src/lib/scraper/schedule.js` — `parseSchedulePage` now extracts `petIds: string[]` from `event-pet-wrapper[data-pet]` attributes in schedule HTML
- `api/cron-schedule.js` — regex-based petIds extraction (Node.js-safe); passes `meta: { external_pet_id }` when enqueueing appointments
- `src/lib/scraper/syncQueue.js` — `enqueue()` accepts `type` and `meta` parameters; stores them in DB
- `src/lib/scraper/mapping.js` — `mapAndSaveAppointment` accepts `externalPetId` option; writes `external_pet_id` to dogs on all update paths
- `supabase/migrations/016_add_boarding_forms.sql` — adds `external_pet_id TEXT` + index to `dogs`; adds `type`/`meta` to `sync_queue`; creates `boarding_forms` table

### REQ-501: Forms scraping pipeline ✅

- `src/lib/scraper/forms.js` (NEW) — full pipeline:
  - `parseFormsListPage(html)` — regex-based, extracts form 7913 submissions with IDs + dates; deduplicates
  - `parseFormDetailPage(html)` — extracts all field label/value pairs via `id="field_\d+"` marker + 600-char forward window; parses arrival/departure date fields
  - `parseMMDDYYYYtoISO(str)` — M/D/YYYY → YYYY-MM-DD
  - `findFormForBoarding(submissions, boarding)` — most recent submission on/before arrival; fallback to most recent overall; null if empty
  - `fetchAndStoreBoardingForm(supabase, boardingId, externalPetId, dogName)` — full fetch + parse + upsert pipeline
- `src/lib/scraper/mapping.js` — after boarding upsert, enqueues `type='form'` job for upcoming boardings with a known `externalPetId`
- `api/cron-detail.js` — routes `type='form'` items to `fetchAndStoreBoardingForm`; passes `externalPetId` from `item.meta` to appointment path

### REQ-502: Date discrepancy detection ✅

- `date_mismatch BOOLEAN` stored in `boarding_forms` table
- Computed in `fetchAndStoreBoardingForm`: `form_arrival_date ≠ boarding arrival ISO` OR `form_departure_date ≠ boarding departure ISO`
- Null form dates → no mismatch (form didn't have date fields)

### REQ-503: Boarding Form Modal ✅

- `src/components/BoardingFormModal.jsx` (NEW) — follows SyncDetailModal pattern; priority fields first; amber alert for date_mismatch; print button
- `src/index.css` — `@media print` block added: hides app chrome, shows `.boarding-form-print-content`

### REQ-504: Missing form indicator ✅

- `src/hooks/useBoardingForms.js` (NEW) — queries `boarding_forms` joined to `boardings`; filters departures >= today midnight; returns `formsByBoardingId` map + `isBoardingUpcoming(boarding)` helper
- `src/components/BoardingMatrix.jsx` — dog names → `<button>` with amber (no form) or indigo (form found) styling; `BoardingFormModal` at bottom
- `src/pages/DogsPage.jsx` — same pattern for boardings table dog column

### REQ-505: Forms scraper logging ✅

- All log calls in `forms.js` use `createSyncLogger('Forms')` pattern with emoji prefixes
- `cron-detail.js` logs `[CronDetail] 📋 Processing form job` for form-type items

---

## Useful SQL for v3.0 verification

```sql
-- Check external_pet_id population
SELECT name, external_pet_id FROM dogs ORDER BY updated_at DESC LIMIT 10;

-- Check form fetch queue (sync_queue has no created_at — order by id)
SELECT id, external_id, type, meta, status FROM sync_queue
WHERE type = 'form' ORDER BY id DESC LIMIT 10;

-- Check stored forms
SELECT bf.boarding_id, d.name, bf.submission_id, bf.date_mismatch,
       bf.form_arrival_date, bf.form_departure_date, bf.fetched_at
FROM boarding_forms bf
JOIN boardings b ON bf.boarding_id = b.id
JOIN dogs d ON b.dog_id = d.id
ORDER BY bf.fetched_at DESC LIMIT 10;
```

---

## v2.4 Outcome (for reference)

- **REQ-400 ✅** — Calendar print with date range + boarding groups
- **REQ-401 ✅** — Cron health monitoring card in Settings
- **REQ-402 ✅** — Security hardening: creds server-side, SSRF fix, proxy token auth, dead code deleted

---

## v2.3 Outcome (for reference)

- **REQ-300–306 ✅** — Dashboard config, change password, cleanText(), sortable revenue table, Dogs page cleanup

---

## Remaining Backlog

### Longer-term
- **REQ-107:** Sync history UI + enable/disable toggle (deferred, SyncHistoryPage skeleton exists)
- Fix status field extraction (always null — `.appt-change-status` needs `textContent` on `<a><i>`)
- Fix or remove DST-flaky test in `DateNavigator.test.jsx` (pre-existing, 1 test fails on DST boundary days)
- **Low priority:** Store datetimes in PST (America/Los_Angeles) instead of UTC
- **Low priority:** REC-3 — add warning log to cron handlers when `CRON_SECRET` is absent in production

---

## Decisions Locked In

- **Rate fallback chain:** `boarding.night_rate ?? dog.night_rate ?? 0`
- **Single-line pricing:** classified as night or day based on service name
- **Two-line pricing:** night from non-day line, day from day line
- **Day service patterns:** `SCRAPER_CONFIG.dayServicePatterns` = `/day/i, /daycare/i, /^DC/i, /pack/i`
- **Pricing filter (sync.js):** all-day-services OR staff-boarding → skip before saving
- **Dog rate updates:** only when `updateRates && rate > 0` (never zero-overwrite)
- **HASH_FIELDS:** identity/structure fields only — pricing fields NOT included (intentional)
- **Unchanged path:** explicitly writes `appointment_total` + `pricing_line_items` when present
- **Multi-pet:** `all_pet_names[]` from extraction; secondary external_id = `{appt_id}_p{index}`
- **REQ-110 parse degradation:** does NOT flag missing `appointment_total` (legitimately absent)
- **sync_status column:** use `sync_status = 'archived'` — `is_archived` does not exist
- **Archived appointments:** preloaded into `archivedExternalIds` Set at sync start; skipped before detail fetch
- **cron-detail:** processes 1 queue item per invocation (Hobby plan 10s timeout). "Sync Now" in Settings now drains all pending form queue items automatically after the main sync.
- **`.maybeSingle()` vs `.single()`:** All existence-check `find*` queries use `.maybeSingle()` (returns `{ data: null, error: null }` for 0 rows). Never use `.single()` for existence checks — it logs a 406 error to console even when caught.
- **historicalSync.js:** kept — `runSync()` in 30-day batches, useful for full data rebuild. Not dead code.
- **VITE_SYNC_PROXY_TOKEN:** intentionally VITE_-prefixed so browser can read it; different from `CRON_SECRET`
- **Form field parsing:** regex with forward window (600 chars from `id="field_\d+"` marker) — avoids nested div closing tag complexity; works in Node.js and browser
- **Form matching:** most recent submission whose `submittedDate` falls within `(arrival − 7 days)` to `(arrival day)` inclusive. Submissions with no parseable date excluded. No fallback to old forms — if nothing in window, don't store, re-enqueue.
- **Form job enqueueing:** only for boardings where `departure_datetime >= today midnight` AND dog has `external_pet_id`
- **Form re-enqueue logic:** `boarding_forms` is the source of truth — skip enqueue only if a row exists for the boarding. If no row exists (form not yet fetched/submitted), enqueue with `resetIfDone: true` so previously-`done` queue items get retried. This ensures late form submissions are picked up on the next sync.

---

## Useful SQL

```sql
-- Check cron health
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;

-- Queue status
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;

-- What was touched recently
SELECT b.external_id, d.name, b.billed_amount, b.night_rate, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC LIMIT 20;

-- Check data quality
SELECT b.external_id, d.name, b.night_rate, b.billed_amount
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.night_rate IS NULL AND b.billed_amount > 0
ORDER BY b.created_at DESC LIMIT 10;

-- If sync gets stuck
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';

-- Archive a stale sync_appointment manually
UPDATE sync_appointments
SET sync_status = 'archived', last_change_type = 'archived', last_changed_at = NOW()
WHERE external_id = 'REPLACE_ME';

-- Null the boarding FK before deleting (avoids FK violation)
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id = (SELECT id FROM boardings WHERE external_id = 'REPLACE_ME');
DELETE FROM boardings WHERE external_id = 'REPLACE_ME';
```

---

## Archive

- Full v2.4 session history: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
- Full v2.3 session history: `docs/archive/SESSION_HANDOFF_v2.3_final.md`
- Full v2.2 session history: `docs/archive/SESSION_HANDOFF_v2.2_final.md`
- Full v2.1 session history: `docs/archive/SESSION_HANDOFF_v2.1_final.md`
- Full v2.0 session history: `docs/archive/SESSION_HANDOFF_v2.0_final.md`
