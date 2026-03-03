# Dog Boarding App — Session Handoff (v3.0)
**Last updated:** March 3, 2026 (fix 406 console errors + Sync Now drains form queue)
**Status:** v3.0 ALL CODE COMMITTED — migration 016 pending production apply, then push to deploy

---

## Current State

- **681 tests, 672 pass.** 9 pre-existing failures: 1 DST-flaky in `DateNavigator.test.jsx` + 8 in `BoardingMatrix.test.jsx` (sorting UI) — all unrelated to sync work.
- **Last deployed:** `398387b` — v2.4 (still in production)
- **All v3.0 code committed on `main`; not yet pushed to Vercel.**
- **Migration 016 NOT yet applied to production** — must apply before deploying.

## What Was Done This Session (March 3, 2026)

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

## Immediate Next Steps (To Deploy v3.0)

> **This is the critical path. Migration 016 must go first — the app will break without it.**

### Step 1 — Apply Migration 016 to production

Run `supabase/migrations/016_add_boarding_forms.sql` in production (Supabase dashboard SQL editor or `supabase db push`).

Adds:
- `dogs.external_pet_id TEXT` + index
- `sync_queue.type TEXT`, `sync_queue.meta JSONB`
- `boarding_forms` table

Verify after applying:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'dogs' AND column_name = 'external_pet_id';
SELECT column_name FROM information_schema.columns WHERE table_name = 'sync_queue' AND column_name = 'type';
SELECT table_name FROM information_schema.tables WHERE table_name = 'boarding_forms';
```

### Step 2 — Push to Vercel / deploy

`git push origin main` — Vercel auto-deploys from main.

No new env vars needed (all were set for REQ-402).

### Step 3 — Verify end-to-end

1. Hit "Sync Now" in Settings (use today → today+60d date range)
2. Watch console — should see `[Sync] 📋 Draining form queue...` followed by per-form log lines, NO 406 errors
3. Check DB:
```sql
-- dogs should have external_pet_id populated
SELECT name, external_pet_id FROM dogs WHERE external_pet_id IS NOT NULL LIMIT 10;

-- boarding_forms should have rows
SELECT bf.boarding_id, d.name, bf.date_mismatch, bf.fetched_at
FROM boarding_forms bf
JOIN boardings b ON bf.boarding_id = b.id
JOIN dogs d ON b.dog_id = d.id
ORDER BY bf.fetched_at DESC LIMIT 10;

-- sync_queue should be empty (all done)
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type;
```
4. Open Dashboard or Dogs page — upcoming boardings should show as indigo (form found) or amber (no form) buttons
5. Click a dog name → boarding form modal opens

---

> **Check first thing each session:** Did overnight crons run?
> `SELECT cron_name, last_ran_at, status, result FROM cron_health ORDER BY cron_name;`
> Or check the Cron Health card on the Settings page.
> To drain the sync queue quickly: use "Sync Now" in Settings (now drains all form jobs automatically).

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

## Next Steps (To Deploy v3.0)

### 1. Apply Migration 016

```sql
-- Run supabase/migrations/016_add_boarding_forms.sql in production
-- Or: supabase db push (if using Supabase CLI)
```

### 2. Push to Vercel

All v3.0 changes are committed (`7074442`) and ready to push once migration 016 is applied.

### 3. End-to-end verification

1. Run "Sync Now" in Settings — confirm `external_pet_id` appears on dogs (`SELECT name, external_pet_id FROM dogs LIMIT 20`)
2. Confirm form fetch jobs enqueued: `SELECT * FROM sync_queue WHERE type = 'form' LIMIT 10`
3. Trigger cron-detail for each form job (or drain via "Sync Now")
4. Confirm `boarding_forms` row created: `SELECT * FROM boarding_forms LIMIT 5`
5. Open Dashboard — dog name should show as indigo link; click → modal opens
6. If `date_mismatch = true`, amber alert visible with both sets of dates
7. Print button → browser print dialog → only form content visible

### 4. Useful SQL for v3.0 verification

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
- **Form matching:** most recent submission with submittedDate ≤ boarding arrival date; fallback to most recent overall
- **Form job enqueueing:** only for boardings where `departure_datetime >= today midnight` AND dog has `external_pet_id`

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
