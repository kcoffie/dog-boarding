# Dog Boarding App — Session Handoff (v2.4)
**Last updated:** March 2, 2026 (REQ-402 security hardening — complete)
**Status:** REQ-402 DONE — 4 commits on main, not yet pushed/deployed. See deploy checklist below.

---

## Current State

- **651 tests, 650 pass.** 1 failure is pre-existing DST-flaky test in `DateNavigator.test.jsx` — unrelated.
- **Last committed:** `cc3a9e5` — add VITE_SYNC_PROXY_TOKEN auth to sync-proxy
- **4 commits on main, NOT YET PUSHED** — do not deploy until Vercel env vars are set
- Migrations 012–015 applied in production.
- 3 crons live and confirmed working.

### ⚠️ Deploy Checklist (MUST do before pushing)

In **Vercel dashboard → Settings → Environment Variables:**
1. Rename `VITE_EXTERNAL_SITE_USERNAME` → `EXTERNAL_SITE_USERNAME`
2. Rename `VITE_EXTERNAL_SITE_PASSWORD` → `EXTERNAL_SITE_PASSWORD`
3. Add `VITE_SYNC_PROXY_TOKEN` → any random string (e.g. `openssl rand -hex 32`)

Without #1/#2: `cron-auth.js` can't read credentials → auth cron fails.
Without #3: proxy accepts any caller (not enforced until env var is set).

**After deploy:** run `npm run build` locally, search `dist/` for a fragment of the real password → must return zero results.

> **Check first thing each session:** Did overnight crons run?
> `SELECT cron_name, last_ran_at, status, result FROM cron_health ORDER BY cron_name;`
> Or check the Cron Health card on the Settings page.
> To drain the sync queue quickly: use "Sync Now" in Settings, or repeatedly trigger the detail cron in Vercel UI.

---

## v2.4 What Was Built

### REQ-401: Cron Health Monitoring ✅
- `supabase/migrations/014_add_cron_health.sql` — `cron_health` table (cron_name UNIQUE, last_ran_at, status, result JSONB, error_msg)
- `api/_cronHealth.js` — shared `writeCronHealth(supabase, name, status, result, errorMsg)` helper (underscore prefix = not a Vercel route)
- All 3 cron handlers upsert on every exit path: success, skip (no_session), session_cleared, failure
- `src/hooks/useCronHealth.js` — reads `cron_health` table for the Settings page
- `SettingsPage.jsx` — new "Cron Health" card above Sync Settings; shows Auth / Schedule / Detail rows with last ran time (relative, absolute on hover), OK/Failed badge, result summary
- Tests: `src/__tests__/scraper/cronHealth.test.js` (4 tests — writeCronHealth behavior)

### REQ-400: Calendar Print / Export ✅
- Print button top-right of Calendar page header → `PrintModal` with date range pickers (default: **today → today+7**)
- "Generate & Print" → `handlePrint(from, to)` → sets `printRange` state → `useEffect` fires after render → `window.print()`
- `PrintView` portaled to `document.body` (via `createPortal`) — critical so `@media print` CSS can hide `#root` and show `#calendar-print-view`
- Each day section: date header, Arriving (green) / Staying (blue) / Departing (amber) groups, overnight count + Gross + Net summary
- Arriving/Departing rows show **dates only** (no times) — e.g. `→ Mar 7` / `Feb 28 →`
- **Printed-at footer** on every page: `Printed at 1:13pm Mon 2 Mar 2026` (position: fixed, bottom: 8px)
- Empty days skipped; all app chrome hidden during print
- Print font sizes: date header 22px, section labels 15px, booking rows 17px, summary 15px
- Tests: `src/__tests__/pages/CalendarPrint.test.js` (4 tests — eachDayInRange logic)
- **Bug fixes (`bb4e244`, `dbd4d7f`):** original used `setTimeout(print, 50)` (race) and rendered PrintView inside #root (CSS cascade — blank page). Fixed with portal + useEffect.

### Migration 015: updated_at on boardings + dogs ✅
- `supabase/migrations/015_add_updated_at.sql`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` added to both tables
- Postgres trigger `set_updated_at()` auto-stamps on every UPDATE — no app-code changes needed
- Existing rows backfilled with `created_at`
- **Applied in production March 2, 2026**

### REQ-402: Code Review & Hardening — Security Implementation (March 2, 2026 session)

Commit `80ff992` implements MUST-1, MUST-2, REC-2, REC-4 (partial), REC-5.

**MUST-1 (CRITICAL — DONE):** External site credentials no longer bundled in client JS.
- `sync-proxy.js`: reads creds from `process.env.EXTERNAL_SITE_USERNAME/PASSWORD` server-side
- `auth.js`: browser path no longer sends credentials to proxy
- `sync.js`: `runSync()` no longer reads from `import.meta.env.VITE_*`
- `cron-auth.js`: updated env var key names
- **⚠️ Rename in Vercel BEFORE deploy** (see Current State above)

**MUST-2 (HIGH — DONE):** SSRF fix in `sync-proxy.js` — hostname validated before fetch.

**REC-2 (LOW — DONE):** `cron-detail.js` session_cleared path now writes cron health.

**REC-4 (PARTIAL):** Deleted `deletionDetection.js` and `stagedVerification.js`.
Remaining 6 files (`batchSync.js`, `historicalSync.js`, `SyncHistoryPage.jsx`, `SyncHistoryTable.jsx`,
`SyncDetailModal.jsx`, `useSyncHistory.js`) require removing Historical Import + Batch Sync sections
from `SyncSettings.jsx` and `/sync-history` route from `App.jsx`. **Pending Kate's call.**

**REC-5 (LOW — DONE):** Removed dead `SCRAPER_CONFIG.retryDelays`.

**DONE — all issues resolved:**
- REC-1: `VITE_SYNC_PROXY_TOKEN` Bearer token auth added to sync-proxy (commit cc3a9e5)
- REC-4: batchSync.js deleted + Batch Sync UI removed from SyncSettings.jsx (commit 154c408)
- historicalSync.js kept — still useful for "rebuild from scratch" (runs in 30-day chunks)
- SyncHistoryPage cluster kept — REQ-107 backlog, no security impact

**OPEN (low priority):**
- REC-3: CRON_SECRET warning log when not set in production
- REQ-107: Sync history UI + enable/disable toggle (backlog)

**Final report:** `docs/REQ-402-security-report-FINAL.md`

---

## v2.3 Outcome (for reference)

- **REQ-300 ✅** — Supabase dashboard config complete (manual)
- **REQ-301 ✅** — Change Password card added to Settings page
- **REQ-302 ✅** — `cleanText()` decodes `&#x27;`/`&apos;`; SQL backfill run (fixes Lilly O'Brien)
- **REQ-303 ✅** — Revenue table columns sortable (Dog, Check-in, Check-out, Revenue); default: Check-out desc
- **REQ-304 ✅** — Dogs page cleaned up: removed CSV import, Add Boarding buttons, Edit/Delete row buttons
- **REQ-305 ✅** — Mochi Hill Jan 23–26 data verified present
- **REQ-306 ✅** — Sync now skips archived appointments; Millie McSpadden C63QgH5K boarding deleted + won't recur

---

## Remaining Backlog

- **REQ-402: Code review / hardening** — audit done, implementation ready to start (see `docs/REQ-402-security-audit.md`)
- REQ-107: Sync history UI + enable/disable toggle
- Fix status field extraction (always null — `.appt-change-status` needs `textContent` on `<a><i>`)
- Fix or remove DST-flaky test in `DateNavigator.test.jsx` (pre-existing, 1 test fails on DST boundary days)
- **Low priority:** Store datetimes in PST (America/Los_Angeles) instead of UTC — affects `arrival_datetime`, `departure_datetime` display; currently shows UTC in DB
- v3: new data capture + new page + email image report (planning session pending)

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
- **cron-detail:** processes 1 queue item per invocation (Hobby plan 10s timeout). Use "Sync Now" in Settings for bulk draining.

---

## Useful SQL

```sql
-- Check cron health
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;

-- Queue status
SELECT status, COUNT(*) FROM sync_queue GROUP BY status ORDER BY status;

-- What was touched recently (requires migration 015)
SELECT b.external_id, d.name, b.billed_amount, b.night_rate, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC LIMIT 20;

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
