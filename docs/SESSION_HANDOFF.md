# Dog Boarding App Sync - Session Handoff
**Date:** February 21, 2026 (morning session 2)
**Status:** REQ-109 fully built + deployed code ready. DB migration still needs to be run in Supabase. 4 commits ahead of origin/develop — not yet pushed.

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

### Session 6 (Feb 21, morning) — committed `dcf7eda`
29. ✅ Implemented REQ-109: Automated Scheduled Sync (micro mode)
    - New: `src/lib/scraper/sessionCache.js` — get/store/clear session in sync_settings
    - New: `src/lib/scraper/syncQueue.js` — enqueue/dequeue/retry/stuck-reset for sync_queue
    - New: `api/cron-auth.js` — refresh session every 6h (Node.js runtime, NOT edge)
    - New: `api/cron-schedule.js` — scan 2 schedule pages/hour, queue candidates
      Uses inline regex `parseScheduleHtml()` to avoid DOMParser (browser-only)
    - New: `api/cron-detail.js` — process 1 queued appointment every 5min
    - Updated: `vercel.json` — cron entries for all 3 handlers
    - Updated: `eslint.config.js` — Node.js globals for api/ and src/lib/scraper/
    - Updated: `config.js` and `sync.js` — process.env fallbacks (3 locations)
    - New: `src/__tests__/scraper/sessionCache.test.js` — 13 tests
    - New: `src/__tests__/scraper/syncQueue.test.js` — 22 tests
    - Updated: `docs/REQUIREMENTS.md` — REQ-109 added
    - 81 scraper tests pass; 42/42 requirements at 100% coverage

### Session 7 (Feb 21, morning 2) — committed `6feea28`
30. ✅ Built date range UI for manual "Sync Now" button
    - `SyncSettings.jsx`: date range pickers (From/To) with rolling default today → today+60d
    - "Full sync (no date filter)" link for complete scans
    - Uses `new Date(y, m-1, d)` constructor to avoid UTC timezone bug
    - `useSyncSettings.js`: cleaned up commented-out code; `triggerSync(startDate, endDate)` now accepts optional params
    - Modified: `src/hooks/useSyncSettings.js`, `src/components/SyncSettings.jsx`

### Session 5 (Feb 20, ~7–9pm) — planning only, no commits
23. ✅ Ran DB migration: `ALTER TABLE sync_logs ADD COLUMN appointments_archived INTEGER DEFAULT 0;`
24. ✅ Verified REQ-108 end-to-end:
    - Synced Feb 18–19 window: 0 candidates found, 0 archived (correct — no amended appts in that range)
    - Synced Feb 20–25 window: C63QgS0U found as candidate, source_url confirmed inaccessible (HTTP 200
      but no `data-start_scheduled`), archived correctly. C63QgQz4 (replacement) left active.
    - `appointments_archived = 1` written to sync_logs. All 3 DB queries confirmed correct.
25. ✅ Investigated "smart default dates" for sync UI — concluded:
    - Sync date range = BOARDING DATES, not booking creation dates
    - No reliable "appointment created at" timestamp in HTML (note timestamps are client-authored, not reliable)
    - Correct default: rolling window (today-7 → today+60 days); change detection handles skipping unchanged records
26. ✅ Confirmed deployment platform is **Vercel** (not Netlify) — `vercel.json` exists, `api/sync-proxy.js`
    uses Vercel Edge Runtime syntax
27. ✅ Identified key blocker: Vercel Hobby plan caps function execution at 10 seconds.
    A full sync takes ~90-120s. Cannot fit in one function call on Hobby plan.
28. ✅ Designed REQ-109: Automated Scheduled Sync — full plan below, ready to implement.

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

### 1. 🔴 Run DB migration in Supabase
**Required before cron functions can work.** Run this SQL in the Supabase dashboard:
```sql
ALTER TABLE sync_settings
  ADD COLUMN sync_mode VARCHAR DEFAULT 'micro',
  ADD COLUMN session_cookies TEXT,
  ADD COLUMN session_expires_at TIMESTAMPTZ,
  ADD COLUMN schedule_cursor_date DATE;

CREATE TABLE sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  title TEXT,
  status VARCHAR DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);
```

### 2. 🔴 Push commits + deploy to Vercel
Branch `develop` is 4 commits ahead of `origin/develop`. `git push` to deploy.
Cron schedules are already in `vercel.json` — they activate automatically on deploy.

### 3. Test cron functions locally (or in Vercel logs)
```bash
curl http://localhost:3000/api/cron-auth
curl http://localhost:3000/api/cron-schedule
curl http://localhost:3000/api/cron-detail
```
CRON_SECRET check is skipped locally when the env var is not set.

### 4. (Low priority) Investigate `status` extraction
Always returns `null`. `.appt-change-status` selector may need to handle `<i>` icon inside anchor:
`<a ...><i ...></i> Completed</a>` — try `$('.appt-change-status').text().trim()` or similar.

### 5. (Low priority) Pre-detail-fetch date filter
For boardings with parseable title dates, run `parseServiceTypeDates()` BEFORE fetching detail page.
If out of range, skip. Saves ~48s per 1-day sync. Especially valuable for cron-schedule.

---

## REQ-109: Automated Scheduled Sync — Full Plan

### Problem
Vercel Hobby plan caps function execution at 10 seconds. A full sync takes ~90-120s.
The solution: break sync into 3 small cron jobs, each completing in <10s.

### Architecture: 3 Cron Jobs

```
cron-auth      every 6h    ~2s   Re-authenticate, cache session in DB
cron-schedule  every 1h    ~4s   Fetch 1-2 schedule pages, queue new appointments
cron-detail    every 5min  ~8s   Process 1 queued appointment detail
```

**Why session caching is the key enabler:**
Auth costs ~4.5s every call. Cache the session cookie in `sync_settings`. Then
`cron-schedule` and `cron-detail` skip auth entirely. Each call goes from ~8.5s → ~4s.

**Cursor strategy for cron-schedule:**
Each hourly call fetches TWO schedule pages:
1. **Current week (always)** — catches currently active long-stays every hour
2. **Cursor week (rotating)** — advances 7 days each call, wraps after 8 weeks (~today+56 days)

This ensures active boardings are never more than 1 hour stale, and future bookings
appear in the queue within 8 hours of the cron cycle.

**How detail processing works:**
Appointments found on schedule pages get saved to `sync_queue` with `status = 'pending'`.
`cron-detail` picks 1 pending item per call, fetches the detail page, upserts to DB.

### SYNC_MODE Property (upgrade path)

```
SYNC_MODE=micro      → Hobby plan: 3 chunked cron jobs (default)
SYNC_MODE=standard   → Pro plan: single cron, full runSync() with rolling window
```

**To upgrade to Pro plan:**
1. Upgrade Vercel account
2. Set `SYNC_MODE=standard` in Vercel environment variables dashboard
3. Done — no code changes required

### Files Built (all committed as dcf7eda + 6feea28)
All code is done. DB migration is the only remaining prerequisite before deploy.

### DB Migration (run before first cron deploy)

```sql
-- Add to sync_settings
ALTER TABLE sync_settings
  ADD COLUMN sync_mode VARCHAR DEFAULT 'micro',
  ADD COLUMN session_cookies TEXT,
  ADD COLUMN session_expires_at TIMESTAMPTZ,
  ADD COLUMN schedule_cursor_date DATE;

-- New queue table
CREATE TABLE sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  title TEXT,
  status VARCHAR DEFAULT 'pending',   -- pending, processing, done, failed
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);
```

### Vercel Environment Variables (set in dashboard)
These are likely already set for the deployed app. The cron functions read the same vars:
- `VITE_EXTERNAL_SITE_USERNAME`
- `VITE_EXTERNAL_SITE_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `CRON_SECRET` (auto-set by Vercel, used to authenticate cron requests)

### Logging Plan

Follow existing `[Prefix]` pattern from sync/reconcile. Each cron has its own prefix.

**cron-auth `[CronAuth]`:**
```
🔐 Starting auth refresh
⏭️ Session still valid (expires in 14h), skipping
🔑 Session expired or missing, re-authenticating...
✅ Session cached (expires: 2026-02-21T10:00:00Z)
❌ Auth failed: {reason}
```

**cron-schedule `[CronSchedule]`:**
```
📅 Starting scan — cursor: 2026-02-20, mode: micro
🔑 Session: cached (valid 14h remaining)
📋 Found 18 appointments on schedule page
🐕 4 boarding candidates (14 skipped — non-boarding by title)
⏭️ 3 already in queue or DB (unchanged by title hash)
📥 1 queued for detail fetch: C63QgXYZ
➡️ Cursor advanced to 2026-02-27
🔄 Cursor wrapped back to today
📊 Queue depth after scan: 3 pending
```

**cron-detail `[CronDetail]`:**
```
🐕 Processing 1 of 3 queued: C63QgXYZ
   source_url: https://agirlandyourdog.com/schedule/a/C63QgXYZ/...
✅ Saved: Buddy (Smith) — created
❌ Failed (retry 1/3): {error message}
⚠️ Stuck item reset to pending: C63QgABC (was processing for 12min)
📊 Queue depth remaining: 2
```

### Exception Handling Plan

**Top-level in every cron handler — never swallow errors silently:**
```js
try { ... }
catch (err) {
  console.error('[CronDetail] ❌ Unhandled error:', err.message, err.stack);
  return new Response(JSON.stringify({ error: err.message }), { status: 500 });
}
```

**Session errors** — if cron-schedule or cron-detail gets a login page back (no `data-start_scheduled`):
1. Log `[SessionError] Cached session rejected — clearing`
2. Clear `session_cookies` in DB
3. Return 200 cleanly — next `cron-auth` run will re-authenticate

**Queue item failures:**
- Increment `retry_count`
- Store `last_error` text
- Set `next_retry_at = now + (retry_count * 5 minutes)` (backoff: 5m, 10m, 15m)
- At `retry_count >= 3` → mark `status = 'failed'`, stop retrying, log warning with full details

**Stuck items** — at start of every `cron-detail` run:
- Find items where `status = 'processing'` AND `processing_started_at < now - 10 minutes`
- Reset to `status = 'pending'`
- Log a `⚠️ Stuck item reset` warning for each one

**Vercel CRON_SECRET verification:**
```js
const auth = request.headers.get('authorization');
if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
```
Skip check in dev (CRON_SECRET not set locally).

### Tests Plan

| Module | What to test |
|---|---|
| `sessionCache.js` | Valid session returns cached; expired triggers re-auth; invalid clears cookie |
| `syncQueue.js` | Enqueue skips duplicates (UNIQUE on external_id); dequeue picks oldest pending; retry backoff calculates correctly; stuck item reset works |
| `SYNC_MODE` reading | Defaults to `micro`; reads env var correctly |
| `process.env` fallbacks | Existing 46 tests still pass (import.meta.env takes priority, process.env is fallback) |
| Cron handler isolation | Session error → clears DB cookie + returns 200, does not throw |

Cron HTTP handlers themselves are integration points — test the business logic modules
they call (`sessionCache`, `syncQueue`), not the handlers directly.

### Known Limitations of micro Mode

- **Reconciliation (REQ-108) does not run in micro mode.** Reconciliation needs
  `seenExternalIds` from a complete date-window scan, which isn't available in chunked
  1-page-per-call mode. Reconciliation only runs in `standard` mode (Pro plan) or via
  the manual "Sync Now" button in the UI.
- **New bookings appear within ~8 hours** (worst case — cursor must cycle through to
  their week). Currently active boardings are always checked every 1 hour.
- **Concurrent sync safety**: manual "Sync Now" and cron can run simultaneously. Both
  are idempotent (change detection + atomic upserts). Risk of conflict is low.

### Local Dev Testing
Cron endpoints are plain HTTP GET handlers. Test locally by hitting them directly:
```bash
curl http://localhost:3000/api/cron-auth
curl http://localhost:3000/api/cron-schedule
curl http://localhost:3000/api/cron-detail
```
No special tooling needed. CRON_SECRET check is skipped when env var is not set.

---

## Known Data Issues

### Known null service_types in DB
These were out of range for the Feb 18–19 sync window and will self-correct when their date range is synced:
`C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe`

### Known amended bookings
| Old (archived ✅) | New (active) | Dog |
|---|---|---|
| C63QgS0U (2/20-24) | C63QgQz4 (2/20-25) | Captain Morgan — **ARCHIVED in Session 5** |
| C63QgNGU (4/1-13) | C63QfyoF (4/2-13) | same dog — not yet archived (out of sync window) |
| C63QgH5K (3/3-19) | C63QgNHs (3/4-19) | same dog — not yet archived (out of sync window) |

---

## Architecture Quick Reference

```
src/lib/scraper/
├── config.js          ✅ 4 verified selectors: h1, .appt-change-status, .event-client, .event-pet
│     ⚠️ NEEDS: process.env fallback on line 8 (for REQ-109 cron functions)
├── auth.js            ✅ Login + session management
│     isBrowser() — returns false in Node.js → uses direct fetch (correct for cron context)
│     authenticatedFetch() — routes through /api/sync-proxy in browser; direct fetch server-side
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
├── sessionCache.js    ✅ REQ-109 (dcf7eda)
│     getSession(supabase)          — reads from sync_settings, returns null if expired
│     storeSession(supabase, cookies, expiryMs) — writes to sync_settings
│     clearSession(supabase)        — clears session_cookies + session_expires_at
├── syncQueue.js       ✅ REQ-109 (dcf7eda)
│     enqueue(supabase, {external_id, source_url, title}) — upsert, skip if already queued/done
│     dequeueOne(supabase)          — picks oldest pending item (respects next_retry_at)
│     markDone(supabase, id)        — sets status: done, processed_at: now
│     markFailed(supabase, id, error) — increments retry_count, sets next_retry_at backoff
│     resetStuck(supabase)          — resets processing items > 10min old back to pending
│     getQueueDepth(supabase)       — count of pending + processing items
├── changeDetection.js ✅ service_type in HASH_FIELDS (2469d5a)
├── mapping.js         ✅ Maps to dogs/boardings/sync_appointments tables
├── sync.js            ✅ All fixes + REQ-108 + process.env fallbacks (cf4f49a + dcf7eda)
│     seenExternalIds Set populated at start of loop (before filters)
│     reconcileArchivedAppointments() called after main loop, own try/catch
│     result.appointmentsArchived + updateSyncLog appointments_archived
├── logger.js          ✅ File + console logging
└── changeDetection.js ✅ Content hash change detection

api/
├── sync-proxy.js      ✅ Vercel Edge Function — CORS proxy for browser→external site requests
│     action: 'authenticate' — logs in, returns cookies
│     action: 'fetch' — fetches URL with cookies, returns HTML
├── cron-auth.js       ✅ REQ-109 (dcf7eda) — Node.js runtime, refreshes session every 6h
├── cron-schedule.js   ✅ REQ-109 (dcf7eda) — Node.js runtime, scans 2 pages/hour, enqueues
│     Uses inline regex parseScheduleHtml() — avoids DOMParser (browser-only)
└── cron-detail.js     ✅ REQ-109 (dcf7eda) — Node.js runtime, processes 1 queued item/5min

src/hooks/useSyncSettings.js  ✅ (6feea28)
  triggerSync(startDate?, endDate?) — optional date range params; null = full sync

src/components/SyncSettings.jsx  ✅ (6feea28)
  Date range pickers (From/To), default today → today+60d
  "Full sync (no date filter)" link to bypass date range
vercel.json ← crons block already added (dcf7eda)
```

---

## Key Lessons

### 1. `new Date('YYYY-MM-DD')` is UTC, not local time
```js
new Date('2026-02-18')  // ❌ UTC midnight = PST 4pm on Feb 17
new Date(2026, 1, 18)   // ✅ Local midnight on Feb 18
```
In Vercel cron functions (UTC server), `new Date(y, m, d)` creates UTC midnight — which
is correct since all DB timestamps are stored in UTC.

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

### 10. Sync date range = boarding dates, not booking creation dates
"Sync from last sync time" doesn't work — a booking made today for a stay next month
has check_in = next month. Use a rolling forward window instead. Change detection
handles skipping unchanged records within the window.

### 11. Note timestamps are not reliable booking creation timestamps
`<div class="time note-date">2/13/2026 10:40am</div>` is when the client wrote the note,
not when the appointment was created. Can coincide with booking but isn't guaranteed.

### 12. Deployment is Vercel, not Netlify
`api/` directory = Vercel convention. `export const config = { runtime: 'edge' }` = Vercel.
Vercel Hobby plan: 10s function timeout. Pro plan: 300s. Cron jobs available on both.
Cron functions must use Node.js runtime (NOT edge) — `import.meta.env` not available in Node.js,
use `process.env` fallbacks (`import.meta.env.X ?? process.env.X`).

### 13. `import.meta.env` is Vite-only — not available in Node.js/Vercel functions
Anywhere the scraper uses `import.meta.env`, add `?? process.env.*` fallback.
Only 3 locations need this: `config.js:8`, `sync.js:24-25`, `sync.js:230-231`.

---

## If You Get a Stuck Sync
```sql
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';
```

## If the Queue Gets Stuck (after REQ-109 is built)
```sql
-- Reset stuck processing items
UPDATE sync_queue SET status = 'pending', processing_started_at = NULL
WHERE status = 'processing' AND processing_started_at < NOW() - INTERVAL '10 minutes';

-- See queue state
SELECT status, count(*), min(queued_at), max(retry_count)
FROM sync_queue GROUP BY status;

-- Clear failed items to retry
UPDATE sync_queue SET status = 'pending', retry_count = 0, last_error = NULL
WHERE status = 'failed';
```

---

## First Message for Next Session

> "Picking up from Feb 21 morning session 2. REQ-109 (Automated Scheduled Sync) is fully
> built and committed but not yet deployed. The DB migration has NOT been run yet.
>
> Priority order:
> 1. Run the DB migration SQL in Supabase (in 'Pending TODOs' section of SESSION_HANDOFF.md)
>    — adds 4 columns to sync_settings + creates sync_queue table
> 2. git push origin develop to deploy to Vercel (4 commits ahead of origin)
>    — cron schedules are already in vercel.json; they activate automatically on deploy
> 3. Test locally: curl http://localhost:3000/api/cron-auth (CRON_SECRET check skipped locally)
>
> What's built (all committed, not yet deployed):
> - src/lib/scraper/sessionCache.js — session caching in sync_settings
> - src/lib/scraper/syncQueue.js — queue management with retry backoff
> - api/cron-auth.js — re-auth every 6h (Node.js runtime)
> - api/cron-schedule.js — scans 2 schedule pages/hour, enqueues candidates
> - api/cron-detail.js — processes 1 queued item every 5min
> - src/components/SyncSettings.jsx — date range UI (today → today+60d default)
> - 42/42 requirements at 100% test coverage
>
> Low priority after deploy:
> - Investigate status extraction (always null, .appt-change-status selector issue)
> - Pre-detail-fetch date filter (skip out-of-range before fetching detail page)"
