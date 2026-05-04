# Integration Check Job

**Status:** Live — Step 0 sync-before-compare (v4.5), boarding + daytime checks, always exits 0
**Last reviewed:** May 1, 2026

---

## What It Does

The integration check is an independent verification job that runs 3× daily and confirms that the AGYD (agirlandyourdog.com) booking site and the app's Supabase database are in sync. It catches sync failures that the sync pipeline itself cannot catch — because using the same code that did the sync to verify the sync would confirm any bugs it has.

In short: **Playwright + Claude see what a human sees. The DB sees what the sync stored. If they don't match, you get a WhatsApp.**

---

## Why It Exists

The nightly sync cron (`cron-schedule.js` + `cron-detail.js`) runs at midnight UTC. If it fails silently — bad session, network error, parse bug — boardings go missing from the DB. There's currently no alert for that. You'd only notice when a dog shows up that nobody knew about.

The integration check is that alert. It uses a signal path completely independent from the sync pipeline:

**Playwright DOM extraction** — renders the AGYD schedule page in a real browser, reads the rendered DOM. Different execution environment and code path from the regex-based HTML parser the cron uses.

If Playwright sees something the DB doesn't have → WhatsApp to Kate.

---

## How It Works (Step by Step)

### Step 0 — Sync-before-compare *(v4.5)*
Runs the schedule sync and drains the detail queue **before** the Playwright compare. This eliminates the known false positive where a booking made after midnight UTC (after the midnight cron ran) but before the 1am check appears as "Missing from DB."

- Calls `runScheduleSync(supabase)` from `src/lib/scraper/syncRunner.js` — scans schedule pages, enqueues new items, upserts daytime events
- Calls `runDetailSync(supabase)` in a loop (max 20 iterations) until `action === 'idle'`, processing any newly queued (or previously queued) detail items
- `resetStuck` is called once before the loop, not on every iteration (avoids 20 redundant DB queries)
- **Non-fatal** — if Step 0 throws for any reason (session expired and no credentials configured, network error), the error is logged and the check continues to Step 1 with whatever is currently in the DB
- Does NOT call `writeCronHealth` — health tracking is the Vercel cron handlers' responsibility. Step 0 is a "best effort" sync, not a scheduled cron run.
- Signal isolation is preserved: Steps 2–4 (Playwright, DB compare) are unchanged and import nothing from `src/lib/scraper/`. Step 0 runs before the independent check begins.

**Session re-auth in Step 0:** `ensureSession` can re-authenticate if the session is expired, provided `EXTERNAL_SITE_USERNAME` and `EXTERNAL_SITE_PASSWORD` are set as GH repo secrets. If they are, a stale session will be refreshed and the fresh session is available to Step 1's `loadSession` (making Playwright work too). If they're not set, re-auth silently fails and Step 0 is skipped.

### Step 1 — Load session cookies
Reads `session_cookies` from `sync_settings` in Supabase — the same auth token the midnight cron uses. If missing or expired, sends WhatsApp and exits. The session is refreshed by `cron-auth.js` which runs at midnight.

### Step 2 — Playwright scrapes the live schedule
- Launches headless Chromium in GH Actions
- Injects session cookies into the browser context so the first navigation is authenticated
- Navigates to `https://agirlandyourdog.com/schedule`
- Detects login redirect (if session is stale, AGYD redirects to login page)
- Takes a full-page PNG screenshot (~600KB)
- Extracts **boarding appointments**: all `<a href="/schedule/a/{id}/{ts}">` links from the rendered DOM → list of `{id, title, petName}`, then filtered by `SCRAPER_CONFIG.nonBoardingPatterns`. `petName` comes from `.event-pet` text inside the link.
- Extracts **daytime appointments**: all `<a class="day-event cat-5634 ...">` and `cat-7431` links → list of `{id, catId, dayTs, title, petName}` (DC + PG only)
- `SCRAPER_CONFIG.nonBoardingPatterns` is imported from `src/lib/scraper/config.js` (shared with the sync pipeline). The independent verification signal is Playwright's live DOM rendering, not a duplicate copy of the filter logic. `DAYTIME_CAT_IDS` is still defined locally.

### Step 3 — Query the DB
Two queries run in parallel:

**Boardings** — `boardings JOIN dogs` where:
- `arrival_datetime <= today + 7 days`
- `departure_datetime >= 7 days ago (midnight UTC)`

The lower bound is **7 days ago** so boardings that departed earlier this week (but are still visible on the AGYD schedule page, which shows ~2 weeks) are included. Using `now()` or midnight today creates false positives for past-departed boardings that are still on the page.

**Daytime** — `daytime_appointments` where `appointment_date = today` (UTC). Returns `{external_id, service_category, title}`.

### Step 4 — Compare (3 checks)

**Boarding (2 checks):**
1. **Missing from DB** — any schedule appointment ID from Playwright not found in DB → `"Missing from DB: Buddy — 3/16-19 (C63QgY32)"`. Format is `"{petName} — {title} ({id})"` when a pet name is available, otherwise falls back to just `"{title} ({id})"`.
2. **Unknown dog name** — any DB boarding in the window with `dog_name = 'Unknown'` → "Unknown dog name in DB: {id}"

**Daytime (1 check — smoke test):**
3. **Daytime missing from DB** — DOM events in today's column (filtered by `dayTs`) not found in DB by `external_id` → `"Daytime missing from DB: Buddy — D/C FT (C63QgY4U)"`. Same `petName — title (id)` format as boarding.

### Step 5 — WhatsApp report + exit
Sends to `INTEGRATION_CHECK_RECIPIENTS` (Kate only — separate from `NOTIFY_RECIPIENTS` which goes to the whole team). Two-section text:
- ✅ Pass:
  ```
  ✅ Integration check passed (3/17)
  Boarding: 3 in DB — all match schedule
  Daytime today: 12 on schedule, 12 in DB — all good
  ```
- ⚠️ Issues found:
  ```
  ⚠️ Integration check found issues (3/17)
  Boarding:
  • Missing from DB: Buddy — 3/16-19 (C63QgY32)
  Daytime:
  • Daytime missing from DB: Max — D/C FT (C63QgY4U)
  ```

**Always exits 0.** The job's responsibility is to run and deliver the report. Data issues are content of the report — not a job failure. GH Actions will show ✅ green whether or not issues were found. A non-zero exit is only used if the job crashes (unhandled exception).

---

## What We Need to Remember (Gotchas)

| Gotcha | Detail |
|---|---|
| **Session cookie is a live auth credential** | `session_cookies` from `sync_settings` must never be logged — only log hours remaining |
| **Past-week departures still visible on schedule** | DB query uses 7-days-ago as lower bound. The AGYD schedule page shows ~2 weeks. If you narrow the lower bound to midnight today, past-departed boardings still on the page will be falsely flagged as missing |
| **NON_BOARDING_PATTERNS must be case-insensitive** | `ADD` is uppercase on the schedule. `/\badd\b/i` not `/\badd\b/`. Same fix needed in `cron-schedule.js` |
| **NON_BOARDING_PATTERNS are shared, not duplicated** | `integration-check.js` imports `SCRAPER_CONFIG.nonBoardingPatterns` from `src/lib/scraper/config.js`. Signal isolation is at the scraping level (Playwright DOM vs regex HTML parser), not the filter level. Updating `config.js` automatically applies to the integration check. |
| **Playwright downloads ~280MB of Chromium** | Cached by GH Actions after first run. If the cache is cold the job takes ~5 minutes |
| **GH Actions secrets vs Vercel env vars** | These are separate. Adding something to Vercel doesn't make it available in GH Actions. All secrets in the workflow must also be added as **Repository secrets** in GitHub (NOT environment secrets — the workflows don't declare `environment:`) |

---

## What It Still Needs

### Multi-week schedule coverage
Playwright scrapes the current week's schedule page only. Boardings starting next week won't appear in Playwright's scrape but will be in the DB query window. This means the boarding ID check only catches *this week's* missing boardings. Widening would require fetching a second schedule page.

---

## Required Secrets

All must be **Repository secrets** in GitHub (Settings → Secrets → Actions → Repository secrets tab — NOT environment secrets).

| Secret | Description | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (public) | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS | Supabase project settings → API → Secret keys |
| `EXTERNAL_SITE_USERNAME` | AGYD login email — Step 0 re-auth | Copy from Vercel env vars |
| `EXTERNAL_SITE_PASSWORD` | AGYD login password — Step 0 re-auth | Copy from Vercel env vars |
| `META_PHONE_NUMBER_ID` | Meta sender phone number ID | Meta app dashboard |
| `META_WHATSAPP_TOKEN` | Meta system user access token | Meta app dashboard |
| `INTEGRATION_CHECK_RECIPIENTS` | Kate's phone number only (E.164) | Manually set — NOT from Vercel |

Note: `META_PHONE_NUMBER_ID`, `META_WHATSAPP_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `EXTERNAL_SITE_USERNAME`, and `EXTERNAL_SITE_PASSWORD` are also Vercel env vars. They must be separately added as GH repo secrets — Vercel and GitHub Actions do not share env vars.

`APP_URL` and `VITE_SYNC_PROXY_TOKEN` were removed in v4.5 (Step 0 no longer uses an HTTP endpoint).

---

## Files

| File | Purpose |
|---|---|
| `scripts/integration-check.js` | The job script — runs in GH Actions |
| `.github/workflows/integration-check.yml` | Schedule + secrets wiring |
| `src/lib/scraper/syncRunner.js` | `runScheduleSync()`, `runDetailSync()` — shared sync logic called by Step 0 |

---

## Schedule

Runs 3× daily (PDT = UTC-7, update each DST transition):

| Time (PDT) | UTC | Why |
|---|---|---|
| 1:00 AM | 08:00 | Shortly after midnight cron finishes (cron-auth 00:00, cron-schedule 00:05, cron-detail 00:10) |
| 9:00 AM | 16:00 | Morning check |
| 5:00 PM | 00:00 | Afternoon check |

Also available on-demand via `workflow_dispatch` in the Actions tab.

---

## Architecture Note — Why Not a Vercel Endpoint?

The check uses Playwright (headless Chromium, ~280MB) and runs for ~1 minute. Vercel Hobby serverless functions have a 50MB bundle limit and 10s execution timeout. GH Actions has neither constraint, has Chromium pre-available, and is already where the notify workflows live.

---

## Known False Positive Patterns

These will look like issues but aren't:

1. **`ADD *` appointments** — filtered by `NON_BOARDING_PATTERNS` with `i` flag
2. **No boardings this week** — passes with "0 in DB — all match schedule" which is correct
3. **No daytime events today** — passes with "0 on schedule, 0 in DB — all good" which is correct
4. **DB daytime count > DOM count** — the DB may have stale records from previous syncs for appointments that were removed from the AGYD schedule. The daytime check only flags DOM→DB misses, not DB→DOM misses, so these don't trigger alerts.
5. **Canceled/pending booking requests** — AGYD shows booking requests on the schedule DOM even when the client submitted a request that was never confirmed (`booking_status='canceled'`) or is still pending. The sync pipeline (Layer 3b in sync.js) correctly skips canceled ones. The integration check cannot detect cancellation status without fetching every detail page (too slow), so these appear as "Missing from DB" false positives. If you see a missing boarding alert for a dog you know had a canceled or unconfirmed request, this is why.
6. **`N/C *` titles (new client initial evaluations)** — "N/C" prefix means the dog is a new client doing an Initial Evaluation daytime visit (never an overnight boarding). The sync pipeline correctly excludes these via the detail-page `service_type` ("Initial Evaluation" matches `/initial\s+eval/i` in `nonBoardingPatterns`). The integration check only sees the schedule title (e.g. "N/C Tula 3/23-26") and filters it via `DAYCARE_ONLY_PATTERNS`. Confirmed by business owner: N/C prefix is never used on overnight boardings.
