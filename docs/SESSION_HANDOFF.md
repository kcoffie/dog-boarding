# Dog Boarding App — Session Handoff (v2.3)
**Last updated:** February 27, 2026
**Status:** v2.3 IN PROGRESS — 643 tests (642 pass, 1 pre-existing date-flaky). Commit `ebcb00f` deployed to Vercel.

---

## Current State

- **643 tests, 642 pass.** 1 failure is pre-existing DST-flaky test in `DateNavigator.test.jsx` — unrelated.
- **Deployed commits:** `4061fa4`, `8598a59`, `713a722`, `bf01842`
- Migrations 012 and 013 applied in production. No new migrations needed.
- 3 crons live: cron-auth 0:00 UTC → cron-schedule 0:05 UTC → cron-detail 0:10 UTC
- Vercel env vars confirmed set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, VITE_EXTERNAL_SITE_USERNAME, VITE_EXTERNAL_SITE_PASSWORD

> **Check first thing each session:** Did overnight crons run?
> Vercel dashboard → Logs → filter by `/api/cron-auth`, `/api/cron-schedule`, `/api/cron-detail`
> Hobby plan logs persist ~1 hour — check within that window after midnight UTC.

---

## v2.2 Outcome

Revenue intelligence is working. All boardings with `billed_amount` now have `night_rate` populated.
Zero rows for `night_rate IS NULL AND billed_amount > 0`. Pricing captures correctly for:
- Single-service boardings (nights only) ✅
- Two-service boardings (nights + days) ✅
- Multi-pet appointments (Mochi + Marlee Hill) ✅
- Discounted rates ("Boarding discounted nights for DC full-time") ✅
- Day-only / staff appointments correctly skipped by pricing filter ✅

---

## Known Data Issues (carry into v2.3)

1. **Millie McSpadden — two overlapping boardings:**
   - C63QgH5K: March 3–19, `billed_amount=880`, `day_rate=null` (single-service, nights only)
   - C63QgNHs: March 4–19, `billed_amount=1025`, `day_rate=50`
   - C63QgH5K is the original appointment; C63QgNHs is the amended version. C63QgH5K should
     be archived by reconciliation when its URL becomes inaccessible. Monitor — may resolve itself.
   - If it doesn't self-resolve: `UPDATE sync_appointments SET sync_status = 'archived' ... WHERE external_id = 'C63QgH5K'` + delete the boarding.

2. **Mochi Hill C63QgLj7 (Jan 23–26) — lost during cleanup:**
   - Deleted all Hill boardings and re-synced with default window (today forward).
   - Jan 23 boarding wasn't recreated — outside sync window. Had `billed_amount=470`, `night_rate=55`.
   - Recovery: run a targeted sync over Jan 23–26 to recreate it.

3. **Null service_types** (self-correct on next sync of their date range):
   C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe

4. **Amended appointments not yet archived:**
   - C63QgNGU→C63QfyoF (4/1–13): old appointment URL likely inaccessible — reconciliation should catch it
   - C63QgH5K→C63QgNHs (3/3–19): see item 1 above

---

## v2.3 — Progress

### Completed this session (commit `ebcb00f`, deployed):
- **REQ-302 ✅** — `cleanText()` in extraction.js now decodes `&#x27;` and `&apos;` (fixes Lilly O'Brien)
- **REQ-303 ✅** — Revenue table columns are now sortable (Dog, Check-in, Check-out, Revenue). Default: Check-out desc.
- **REQ-304 ✅** — Dogs page cleaned up: removed Import CSV/Add Boarding header buttons, Edit/Delete dog row buttons, inline boarding form, and all related dead state/handlers.
- **REQ-301 ✅** — Change Password card added at bottom of Settings page (uses `updatePassword` from AuthContext).

---

## Remaining v2.3 Tasks

### REQ-300 — Kate does this (Supabase dashboard, ~2 min, no code)
1. Supabase Dashboard → Authentication → Providers → Email → toggle **"Confirm email"** OFF
2. Supabase Dashboard → Authentication → URL Configuration → set **Site URL** to the production Vercel URL

### REQ-302 — SQL backfill (run in Supabase dashboard SQL editor)
Verify first:
```sql
SELECT id, name FROM dogs WHERE name LIKE '%&#x27;%';
```
Then fix:
```sql
UPDATE dogs SET name = REPLACE(name, '&#x27;', '''') WHERE name LIKE '%&#x27;%';
```

### REQ-305 — Mochi Hill Jan 23 recovery (manual, no code)
Run a targeted sync from the Settings page with **start = Jan 23, 2026** and **end = Jan 26, 2026** to recreate the lost boarding for Mochi Hill (external_id C63QgLj7, expected `billed_amount=470`, `night_rate=55`).

### REQ-306 — Millie McSpadden amended appointment archival (monitor → SQL if needed)
Two overlapping boardings exist:
- **C63QgH5K**: March 3–19, `billed_amount=880` — original, should be archived
- **C63QgNHs**: March 4–19, `billed_amount=1025` — amended version, keep

After the next cron run, check if C63QgH5K auto-archived. If not, run:
```sql
UPDATE sync_appointments SET sync_status = 'archived', last_change_type = 'archived', last_changed_at = NOW() WHERE external_id = 'C63QgH5K';
UPDATE sync_appointments SET mapped_boarding_id = NULL WHERE mapped_boarding_id = (SELECT id FROM boardings WHERE external_id = 'C63QgH5K');
DELETE FROM boardings WHERE external_id = 'C63QgH5K';
```

---

## Backlog (v2.4+)
- REQ-107: Sync history UI + enable/disable toggle
- Fix status field extraction (always null — `.appt-change-status` needs `textContent` on `<a><i>`)
- `est.` label in Revenue table is intentional — shown when `billed_amount IS NULL`, uses `night_rate × nights`

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

---

## Useful SQL

```sql
-- Check data quality
SELECT b.external_id, d.name, b.night_rate, b.billed_amount
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.night_rate IS NULL AND b.billed_amount > 0
ORDER BY b.created_at DESC LIMIT 10;

-- Full rate picture
SELECT b.billed_amount, b.night_rate, b.day_rate, d.name,
       b.arrival_datetime, b.departure_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.billed_amount IS NOT NULL
ORDER BY b.departure_datetime DESC;

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

- Full v2.2 session history: `docs/archive/SESSION_HANDOFF_v2.2_final.md`
- Full v2.1 session history: `docs/archive/SESSION_HANDOFF_v2.1_final.md`
- Full v2.0 session history: `docs/archive/SESSION_HANDOFF_v2.0_final.md`
