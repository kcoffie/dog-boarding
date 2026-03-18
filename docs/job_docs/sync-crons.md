# Sync Cron Jobs

**Status:** Live (Hobby plan — once per day, midnight UTC; cron-detail runs twice via cron-detail-2)
**Last reviewed:** March 18, 2026

---

## What They Do

Three Vercel cron jobs run in sequence each night to keep the Supabase DB in sync with the AGYD booking site. They run on the **Hobby plan**, which allows one cron trigger per path per day, so each job runs once at midnight UTC:

| Job | Path | Schedule (UTC) | Purpose |
|---|---|---|---|
| `cron-auth` | `/api/cron-auth` | `00:00` | Refresh the AGYD session cookie |
| `cron-schedule` | `/api/cron-schedule` | `00:05` | Scan schedule pages, enqueue new appointments |
| `cron-detail` | `/api/cron-detail` | `00:10` | Process one queued item from `sync_queue` |
| `cron-detail-2` | `/api/cron-detail-2` | `00:15` | Second detail processor — doubles nightly throughput |

The 5-minute gaps ensure each step completes before the next begins. `cron-detail-2` is a re-export of `cron-detail` registered under a separate Vercel path — the Hobby plan gives each path one run/day, so this doubles the queue processing throughput at zero code complexity cost.

---

## Why They Exist

The AGYD booking site is the source of truth for all appointments. The app's Supabase DB needs to mirror it. Rather than scraping in one monolithic job (which would exceed Vercel's 10s function timeout), the work is split across three jobs that hand off via the DB:

- `cron-auth` owns the **credential** — a session cookie stored in `sync_settings`
- `cron-schedule` owns the **discovery** — finding appointment IDs and enqueuing them in `sync_queue`
- `cron-detail` owns the **enrichment** — fetching one appointment's full detail page and upserting to `boardings`/`dogs`

This queue-based design means a single slow appointment detail page can't block the whole sync. Failed items retry (up to 3 times with backoff). The UI's "Sync Now" button processes multiple queue items on demand for faster catch-up.

---

## Job 1: `cron-auth` (`api/cron-auth.js`)

### What it does
Checks whether a valid session exists in the `sync_settings` table. If yes, does nothing. If the session is expired or missing, authenticates against AGYD with stored credentials and caches the resulting cookies with a 24-hour TTL.

### How it works
1. Calls `getSession(supabase)` from `sessionCache.js`
2. If session exists → logs "skipped" and returns
3. If not → calls `authenticate(username, password)` from `auth.js`
4. Stores result via `storeSession(supabase, cookies, 24h TTL)`
5. Writes outcome to `cron_health` table (`auth` row)

### Key details
- Uses `EXTERNAL_SITE_USERNAME` and `EXTERNAL_SITE_PASSWORD` Vercel env vars
- Session TTL is hardcoded to 24 hours — matches the nightly run cadence
- If credentials are wrong, throws → writes `failure` to `cron_health`
- **Does NOT log the session cookie value** — only logs hours remaining (security)

### On failure
`cron-schedule` and `cron-detail` will both skip gracefully when they find no session. The system recovers automatically the next night when `cron-auth` retries.

---

## Job 2: `cron-schedule` (`api/cron-schedule.js`)

### What it does
Fetches schedule pages from the AGYD site, extracts all appointment links, filters out non-boarding appointments (DC, PG, ADD, etc.), and enqueues boarding candidates into `sync_queue`. Also ingests all daytime activity (DC + PG appointments) into `daytime_appointments` using `parseDaytimeSchedulePage`.

### How it works

#### Page fetching strategy — three pages per run
Each run fetches **exactly three** schedule pages to balance freshness vs. coverage within the Hobby plan's once-daily budget:

1. **Current week (always)** — catches active long-stay boardings that started before today
2. **Next week (always)** — eliminates the 1-week blind spot where bookings made for next week aren't seen until the cursor rotates to them
3. **Cursor week (rotating, weeks 2–8)** — advances +7 days each run, cycling through weeks 2–7 beyond today (today+14d → today+56d), wrapping back to week 2 after 6 runs

This ensures bookings in the next 2 weeks are seen every night, and bookings 2–8 weeks out appear in the queue within 6 nights (one full cursor cycle). The cursor date is persisted in `sync_settings.schedule_cursor_date`.

#### Page parsing — regex only (no DOMParser)
Unlike `schedule.js` (the browser scraper), this cron uses a regex-based `parseScheduleHtml()` because `DOMParser` is a browser API unavailable in Node.js. The regex matches `<a href="/schedule/a/{id}/{ts}">` blocks and extracts:
- `id`, `url`, `timestamp`
- `petName`, `clientName`, `time`, `title` (from class-named spans)
- `petIds` from `data-pet` attributes (forwarded to queue `meta` for cron-detail)

#### Pre-filter (NON_BOARDING_RE)
Applied before enqueue to skip obvious non-boardings:
- `d/c`, `dc` — Daycare
- `p/g`, `g/p`, `pg` — Pack Group
- `\badd\b` — ADD appointments (note: needs `i` flag — see Known Issues)
- `switch day`, `back to N`, `initial eval`, `busy`

These are **defined inline** in `cron-schedule.js`, not imported from `src/`. The sync pipeline (`sync.js`) has its own independent copy — this is intentional, so a scraper bug doesn't corrupt the cron's filter.

#### Daytime ingestion (bonus pass)
On the same HTML already fetched, calls `parseDaytimeSchedulePage()` and `upsertDaytimeAppointments()` to keep `daytime_appointments` fresh. No extra HTTP requests.

#### Session expiry detection
If the schedule page HTML contains both `"login"` and `"password"`, the session has been rejected. The cron clears the cached session (`clearSession`) and returns — `cron-auth` will re-authenticate the next night.

### Outputs
- Enqueues boarding candidates into `sync_queue` (type=`appointment`)
- Upserts daytime events into `daytime_appointments`
- Advances cursor in `sync_settings.schedule_cursor_date`
- Writes `cron_health` row (`schedule`)

---

## Job 3: `cron-detail` (`api/cron-detail.js`)

### What it does
Picks one item off the `sync_queue`, fetches its full detail page (or form page), and upserts the result into `boardings`, `dogs`, and related tables. Handles two item types: `appointment` and `form`.

### Why one item per run
Vercel Hobby functions have a **10-second execution timeout**. A single detail page fetch + parse + DB write fits in ~2–4s. Processing multiple items would risk timeout on slow responses. For bulk catch-up, the UI "Sync Now" button calls this endpoint in a loop until the queue is empty.

### How it works

#### Reset stuck items first
On every invocation, calls `resetStuck(supabase)` — returns any items stuck in `processing` for >10 minutes back to `pending`. This handles the case where a previous invocation timed out mid-processing.

#### Dequeue
Calls `dequeueOne(supabase)` — atomically marks the oldest pending item as `processing` and returns it. If the queue is empty, logs "idle" and returns.

#### Session check
Loads cached session from `sessionCache.js`. If missing, resets the dequeued item back to `pending` (so it's not lost) and returns — waiting for `cron-auth` to refresh.

#### Type dispatch

**`appointment` (default):**
1. Calls `fetchAppointmentDetails(appointmentId, timestamp)` from `extraction.js`
2. Falls back to the queue item's `title` for `pet_name` if extraction returned empty (prevents "Unknown" dog collapse)
3. Calls `mapAndSaveAppointment(details, { supabase, externalPetId })` from `mapping.js`
4. `externalPetId` comes from `item.meta.external_pet_id` — forwarded from the schedule page's `data-pet` attribute. **Critical:** without this, no form jobs get enqueued and dog external IDs are null.
5. Marks item `done`

**`form`:**
1. Reads `boarding_id` and `external_pet_id` from `item.meta`
2. Calls `fetchAndStoreBoardingForm(supabase, boardingId, externalPetId, title)` from `forms.js`
3. Marks item `done`
4. Old queue items without `external_pet_id` (pre-v3 artifact) are skipped and marked `done`

#### Retry / failure
- Session expiry → clear session, reset item to `pending`, return (will retry after re-auth)
- Other errors → `markFailed(supabase, item.id, msg)` — increments `retry_count`. After 3 retries, item status becomes `failed` (permanent) and is excluded from future `dequeueOne` calls.

### Outputs
- Upserts into `dogs`, `boardings`, `sync_appointments`, `boarding_forms`
- Marks queue item `done` or `failed`
- Writes `cron_health` row (`detail`) with action, externalId, queueDepth

---

## Cron Health Monitoring

All three jobs write to the `cron_health` table after each run. Check it with:

```sql
SELECT cron_name, last_ran_at, status, result, error_msg
FROM cron_health
ORDER BY cron_name;
```

`status` is `success` or `failure`. Note: `success` means the job completed without an unhandled error — it does NOT mean data was changed (e.g., "skipped — session valid" is a `success`). Read the `result` JSON column for the actual action taken.

---

## Required Vercel Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `EXTERNAL_SITE_USERNAME` | AGYD login email |
| `EXTERNAL_SITE_PASSWORD` | AGYD login password |
| `CRON_SECRET` | Vercel-injected secret — validates that requests come from Vercel, not external callers |
| `VITE_EXTERNAL_SITE_URL` | Override for AGYD base URL (defaults to `https://agirlandyourdog.com`) |

Security: all three handlers check `Authorization: Bearer {CRON_SECRET}` before executing. Requests without this header return 401. In local dev, `CRON_SECRET` is typically unset, so the check is skipped.

---

## Files

| File | Purpose |
|---|---|
| `api/cron-auth.js` | Session refresh job |
| `api/cron-detail.js` | Queue consumer job (00:10 UTC) |
| `api/cron-detail-2.js` | Second queue consumer — re-exports cron-detail under a distinct Vercel path (00:15 UTC) |
| `api/cron-schedule.js` | Schedule scanner + queue producer job |
| `vercel.json` | Cron schedules (Vercel Hobby: once/day at midnight UTC) |
| `api/_cronHealth.js` | Shared `writeCronHealth()` helper |
| `src/lib/scraper/auth.js` | `authenticate()`, `authenticatedFetch()`, `setSession()` |
| `src/lib/scraper/sessionCache.js` | `getSession()`, `storeSession()`, `clearSession()` |
| `src/lib/scraper/syncQueue.js` | `enqueue()`, `dequeueOne()`, `markDone()`, `markFailed()`, `resetStuck()`, `getQueueDepth()` |
| `src/lib/scraper/extraction.js` | `fetchAppointmentDetails()` — detail page parser |
| `src/lib/scraper/mapping.js` | `mapAndSaveAppointment()` — DB upsert orchestrator |
| `src/lib/scraper/forms.js` | `fetchAndStoreBoardingForm()` — boarding form fetcher |
| `src/lib/scraper/daytimeSchedule.js` | `parseDaytimeSchedulePage()`, `upsertDaytimeAppointments()` |

---

## Known Issues

### Hobby plan: two queue items processed per night
`cron-detail` and `cron-detail-2` each run once per day and each processes **one** item — so 2 items drain per night. If the queue builds up (e.g., after many new bookings in a week), use the UI "Sync Now" button to drain the queue immediately. On a Pro plan, `cron-detail` can run every 5 minutes — the code supports this, only the `vercel.json` schedule needs changing.


### Pro plan upgrade path
Both `cron-auth` and `cron-schedule` have comments showing the Pro plan schedules:
- `cron-auth`: `0 */6 * * *` (every 6 hours)
- `cron-schedule`: `0 * * * *` (every hour)
- `cron-detail`: `*/5 * * * *` (every 5 minutes)

Upgrading requires only updating `vercel.json`. The handler logic is already designed for higher frequency.

---

## Useful SQL

```sql
-- Queue status
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;

-- Failed queue items
SELECT external_id, title, retry_count, last_error, updated_at
FROM sync_queue WHERE status = 'failed' ORDER BY updated_at DESC;

-- If sync gets stuck (running > 5 min)
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';

-- Cron health
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;

-- Recent boardings (verify cron-detail is saving)
SELECT b.external_id, d.name, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC LIMIT 20;
```
