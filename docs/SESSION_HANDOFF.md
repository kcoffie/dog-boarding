# Dog Boarding App — Session Handoff (v2.4)
**Last updated:** February 27, 2026
**Status:** v2.3 COMPLETE — 643 tests (642 pass, 1 pre-existing date-flaky). All REQs done. Ready for v2.4.

---

## Current State

- **643 tests, 642 pass.** 1 failure is pre-existing DST-flaky test in `DateNavigator.test.jsx` — unrelated.
- **Deployed commits:** `4061fa4`, `8598a59`, `713a722`, `bf01842`, `ebcb00f`, `927b30e`
- Migrations 012 and 013 applied in production. No new migrations needed.
- 3 crons live: cron-auth 0:00 UTC → cron-schedule 0:05 UTC → cron-detail 0:10 UTC
- Vercel env vars confirmed set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, VITE_EXTERNAL_SITE_USERNAME, VITE_EXTERNAL_SITE_PASSWORD

> **Check first thing each session:** Did overnight crons run?
> Vercel dashboard → Logs → filter by `/api/cron-auth`, `/api/cron-schedule`, `/api/cron-detail`
> Hobby plan logs persist ~1 hour — check within that window after midnight UTC.

---

## v2.3 Outcome

All six REQs complete:

- **REQ-300 ✅** — Supabase dashboard config complete (manual)
- **REQ-301 ✅** — Change Password card added to Settings page
- **REQ-302 ✅** — `cleanText()` decodes `&#x27;`/`&apos;`; SQL backfill run (fixes Lilly O'Brien)
- **REQ-303 ✅** — Revenue table columns sortable (Dog, Check-in, Check-out, Revenue); default: Check-out desc
- **REQ-304 ✅** — Dogs page cleaned up: removed CSV import, Add Boarding buttons, Edit/Delete row buttons
- **REQ-305 ✅** — Mochi Hill Jan 23–26 data verified present
- **REQ-306 ✅** — Sync now skips archived appointments; Millie McSpadden C63QgH5K boarding deleted + won't recur

---

## Known Data Issues

1. **Millie McSpadden — C63QgH5K boarding deleted, sync_appointment archived:**
   - C63QgNHs (Mar 4–19, `billed_amount=1025`, `day_rate=50`) is the active record.
   - C63QgH5K sync_appointment is `archived`; sync will now skip it permanently.
   - Monitor: if a third boarding appears for Millie in March, investigate.

2. **Null service_types** (self-correct on next sync of their date range):
   C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe

3. **Amended appointments not yet archived:**
   - C63QgNGU→C63QfyoF (4/1–13): old URL likely inaccessible — reconciliation should catch it on next sync

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
- **Archived appointments:** preloaded into `archivedExternalIds` Set at sync start; skipped before detail fetch

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

- Full v2.3 session history: `docs/archive/SESSION_HANDOFF_v2.3_final.md`
- Full v2.2 session history: `docs/archive/SESSION_HANDOFF_v2.2_final.md`
- Full v2.1 session history: `docs/archive/SESSION_HANDOFF_v2.1_final.md`
- Full v2.0 session history: `docs/archive/SESSION_HANDOFF_v2.0_final.md`
