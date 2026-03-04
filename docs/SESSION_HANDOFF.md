# Dog Boarding App — Session Handoff (v3.1)
**Last updated:** March 4, 2026 (start of v3.1)
**Status:** v3.0 stable and deployed. v3.1 in progress.

---

## Current State

- **697 tests, 697 pass.** All green. Sorting tests fixed (mocks + button selector). DST test fixed (Math.round).
- **v3.0 fully deployed and stable.** All crons running, boarding forms pipeline working.
- **Live URL:** [qboarding.vercel.app](https://qboarding.vercel.app)

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

## v3.1 What Was Done (March 4, 2026)

### Tests: 697/697 passing ✅

Fixed 9 pre-existing test failures:

1. **BoardingMatrix sorting tests** (`src/components/BoardingMatrix.test.jsx`):
   - Added `vi.mock('../hooks/useBoardingForms', ...)`, `vi.mock('./EmployeeDropdown', ...)`, `vi.mock('./BoardingFormModal', ...)` — component added these imports in v3.0 but old test file had no mocks
   - Fixed `getDogNamesInOrder` helper: dog name is in `<button>`, not `spans[1]` — updated to `firstTd?.querySelector('button')?.textContent?.trim()`

2. **DateNavigator DST test** (`src/components/DateNavigator.test.jsx`):
   - Changed `Math.floor` → `Math.round` in "preserves range length when clicking Today" — when today falls within 13 days of a DST boundary, the ms diff is 12.958 days; floor gave 12, round gives 13 correctly.

### README updated ✅
- Added live URL (qboarding.vercel.app)
- Added boarding forms feature description
- Updated project structure (forms.js, migrations/)
- Removed version references

### Supabase: enable RLS on sync_queue ⚠️ PENDING

Supabase security lint flags `sync_queue` table as missing RLS. The table is only accessed by:
- Server-side crons (use `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS)
- Browser sync via `sync-proxy.js` (also uses service role key)

Safe to enable RLS with no policies (completely blocks direct client access, service role still works):
```sql
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;
```
Run this in Supabase SQL editor. No migration file needed (doesn't affect schema).

### GitHub branch protection ⚠️ ACTION REQUIRED

Go to GitHub → Settings → Branches → Add branch protection rule for `main`:
- ✅ Require status checks before merging (add: Lint, Unit Tests, Requirements Coverage, Build)
- ✅ Require branches to be up to date before merging
- ✅ Restrict force pushes
- ✅ Do not allow deletions

### GitHub contributors showing 1 commit ℹ️

One early commit (`b31f3f9` — "Create ci.yml") used `kcoffie@gmail.com` instead of `kcoffie@directcommerce.com`. GitHub sees these as separate users.

Fix: add `kcoffie@gmail.com` as a verified email in your GitHub account settings (Settings → Emails → Add email address). GitHub will then merge the contribution history under your account.

---

## v3.1 Next Steps / Backlog

### Immediate
- Apply RLS to `sync_queue` (SQL above, run in Supabase)
- Set branch protection on GitHub (see above)
- Monitor forms pipeline over next few days

### Longer-term
- **REQ-107:** Sync history UI + enable/disable toggle (deferred, skeleton exists)
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
