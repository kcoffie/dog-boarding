# Integration Check Job

**Status:** Live — Step 0 sync-before-compare (v4.5), boarding + daytime checks, always exits 0
**Last reviewed:** March 20, 2026

---

## What It Does

The integration check is an independent verification job that runs 3× daily and confirms that the AGYD (agirlandyourdog.com) booking site and the app's Supabase database are in sync. It catches sync failures that the sync pipeline itself cannot catch — because using the same code that did the sync to verify the sync would confirm any bugs it has.

In short: **Playwright + Claude see what a human sees. The DB sees what the sync stored. If they don't match, you get a WhatsApp.**

---

## Why It Exists

The nightly sync cron (`cron-schedule.js` + `cron-detail.js`) runs at midnight UTC. If it fails silently — bad session, network error, parse bug — boardings go missing from the DB. There's currently no alert for that. You'd only notice when a dog shows up that nobody knew about.

The integration check is that alert. It uses two signal paths that are completely independent from the sync pipeline:

1. **Playwright DOM extraction** — renders the AGYD schedule page in a real browser, reads the rendered DOM. Different execution environment and code path from the regex-based HTML parser the cron uses.
2. **Claude vision** — reads a screenshot of the page the way a human would, pixel-level, no DOM parsing at all.

If either signal sees something the DB doesn't have → WhatsApp to Kate.

---

## How It Works (Step by Step)

### Step 0 — Sync-before-compare *(v4.5)*
Runs the schedule sync and drains the detail queue **before** the Playwright compare. This eliminates the known false positive where a booking made after midnight UTC (after the midnight cron ran) but before the 1am check appears as "Missing from DB."

- Calls `runScheduleSync(supabase)` from `src/lib/scraper/syncRunner.js` — scans schedule pages, enqueues new items, upserts daytime events
- Calls `runDetailSync(supabase)` in a loop (max 20 iterations) until `action === 'idle'`, processing any newly queued (or previously queued) detail items
- `resetStuck` is called once before the loop, not on every iteration (avoids 20 redundant DB queries)
- **Non-fatal** — if Step 0 throws for any reason (session expired and no credentials configured, network error), the error is logged and the check continues to Step 1 with whatever is currently in the DB
- Does NOT call `writeCronHealth` — health tracking is the Vercel cron handlers' responsibility. Step 0 is a "best effort" sync, not a scheduled cron run.
- Signal isolation is preserved: Steps 2–5 (Playwright, Claude, DB compare) are unchanged and import nothing from `src/lib/scraper/`. Step 0 runs before the independent check begins.

**Session re-auth in Step 0:** `ensureSession` can re-authenticate if the session is expired, provided `EXTERNAL_SITE_USERNAME` and `EXTERNAL_SITE_PASSWORD` are set as GH repo secrets. If they are, a stale session will be refreshed and the fresh session is available to Step 1's `loadSession` (making Playwright work too). If they're not set, re-auth silently fails and Step 0 is skipped.

### Step 1 — Load session cookies
Reads `session_cookies` from `sync_settings` in Supabase — the same auth token the midnight cron uses. If missing or expired, sends WhatsApp and exits. The session is refreshed by `cron-auth.js` which runs at midnight.

### Step 2 — Playwright scrapes the live schedule
- Launches headless Chromium in GH Actions
- Injects session cookies into the browser context so the first navigation is authenticated
- Navigates to `https://agirlandyourdog.com/schedule`
- Detects login redirect (if session is stale, AGYD redirects to login page)
- Takes a full-page PNG screenshot (~600KB)
- Extracts **boarding appointments**: all `<a href="/schedule/a/{id}/{ts}">` links from the rendered DOM → list of `{id, title, petName}`, then filtered by `NON_BOARDING_PATTERNS`. `petName` comes from `.event-pet` text inside the link.
- Extracts **daytime appointments**: all `<a class="day-event cat-5634 ...">` and `cat-7431` links → list of `{id, catId, dayTs, title, petName}` (DC + PG only)
- `NON_BOARDING_PATTERNS` and `DAYTIME_CAT_IDS` are defined independently in this file — no import from `src/` (signal isolation)

### Step 3 — Claude reads the screenshot *(requires Anthropic credits)*
Sends the PNG to Claude API (claude-sonnet-4-6) with a vision prompt asking it to list every boarding dog name it can see. Returns `string[]`. This is the "what a human would see" signal — entirely independent from any code. Non-fatal: if Claude fails (no credits, API down), the check continues without the name comparison.

### Step 4 — Query the DB
Two queries run in parallel:

**Boardings** — `boardings JOIN dogs` where:
- `arrival_datetime <= today + 7 days`
- `departure_datetime >= 7 days ago (midnight UTC)`

The lower bound is **7 days ago** so boardings that departed earlier this week (but are still visible on the AGYD schedule page, which shows ~2 weeks) are included. Using `now()` or midnight today creates false positives for past-departed boardings that are still on the page.

**Daytime** — `daytime_appointments` where `appointment_date = today` (UTC). Returns `{external_id, service_category, title}`.

### Step 5 — Compare (4 checks)

**Boarding (3 checks):**
1. **Missing from DB** — any schedule appointment ID from Playwright not found in DB → `"Missing from DB: Buddy — 3/16-19 (C63QgY32)"`. Format is `"{petName} — {title} ({id})"` when a pet name is available, otherwise falls back to just `"{title} ({id})"`.
2. **Unknown dog name** — any DB boarding in the window with `dog_name = 'Unknown'` → "Unknown dog name in DB: {id}"
3. **Claude name mismatch** — any name Claude sees that doesn't match any DB boarding name → "Claude sees '{name}' but no DB boarding matches"
   - Only runs when Claude returned names (skipped if Claude failed)
   - Known limitation: compares first-word names ("Buddy Jr." in DB won't match "Buddy" from Claude)

**Daytime (1 check — smoke test):**
4. **Daytime missing from DB** — DOM events in today's column (filtered by `dayTs`) not found in DB by `external_id` → `"Daytime missing from DB: Buddy — D/C FT (C63QgY4U)"`. Same `petName — title (id)` format as boarding.

### Step 6 — WhatsApp report + exit
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
| **NON_BOARDING_PATTERNS are duplicated on purpose** | Defined independently in `integration-check.js`, not imported from `src/` — signal isolation. If you update them in the sync pipeline, update here too |
| **Claude name check is fuzzy** | Claude returns first-word names from appointment titles. A dog named "Buddy Jr." will always trigger a false positive. This is acceptable for a smoke test |
| **Claude is non-fatal** | If Claude API fails or returns unparseable output, Check 3 is skipped. Checks 1 and 2 still run. The report will still be sent |
| **Playwright downloads ~280MB of Chromium** | Cached by GH Actions after first run. If the cache is cold the job takes ~5 minutes |
| **GH Actions secrets vs Vercel env vars** | These are separate. Adding something to Vercel doesn't make it available in GH Actions. All secrets in the workflow must also be added as **Repository secrets** in GitHub (NOT environment secrets — the workflows don't declare `environment:`) |

---

## What It Still Needs

### Claude credits
The Anthropic API key has no credits as of March 8, 2026. Step 3 (name mismatch check) is silently skipped. Top up at console.anthropic.com → Plans & Billing.

### Multi-week schedule coverage
Playwright scrapes the current week's schedule page only. Boardings starting next week won't appear in Playwright's scrape but will be in the DB query window. This means the boarding ID check only catches *this week's* missing boardings. Widening would require fetching a second schedule page.

### Claude name comparison is fragile for multi-word names
`"Buddy Jr."` in the DB won't match `"Buddy"` from Claude. Currently logged as a warning, not a hard failure. Could be improved by fuzzy matching (startsWith, or checking if DB name starts with the Claude name).

---

## Required Secrets

All must be **Repository secrets** in GitHub (Settings → Secrets → Actions → Repository secrets tab — NOT environment secrets).

| Secret | Description | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (public) | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS | Supabase project settings → API → Secret keys |
| `EXTERNAL_SITE_USERNAME` | AGYD login email — Step 0 re-auth | Copy from Vercel env vars |
| `EXTERNAL_SITE_PASSWORD` | AGYD login password — Step 0 re-auth | Copy from Vercel env vars |
| `ANTHROPIC_API_KEY` | Claude API key | console.anthropic.com → API Keys |
| `TWILIO_ACCOUNT_SID` | Twilio account | Copy from Vercel env vars |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Copy from Vercel env vars |
| `TWILIO_FROM_NUMBER` | Twilio sandbox number | Copy from Vercel env vars |
| `INTEGRATION_CHECK_RECIPIENTS` | Kate's phone number only (E.164) | Manually set — NOT from Vercel |

Note: `TWILIO_*`, `SUPABASE_SERVICE_ROLE_KEY`, `EXTERNAL_SITE_USERNAME`, and `EXTERNAL_SITE_PASSWORD` are also Vercel env vars. They must be separately added as GH repo secrets — Vercel and GitHub Actions do not share env vars.

`APP_URL` and `VITE_SYNC_PROXY_TOKEN` were removed in v4.5 (Step 0 no longer uses an HTTP endpoint).

---

## Files

| File | Purpose |
|---|---|
| `scripts/integration-check.js` | The job script — runs in GH Actions |
| `.github/workflows/integration-check.yml` | Schedule + secrets wiring |

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
2. **Multi-word dog names vs Claude first-word extraction** — by design, low-priority (e.g. "Buddy Jr." in DB won't match "Buddy" from Claude)
3. **No boardings this week** — passes with "0 in DB — all match schedule" which is correct
4. **No daytime events today** — passes with "0 on schedule, 0 in DB — all good" which is correct
5. **DB daytime count > DOM count** — the DB may have stale records from previous syncs for appointments that were removed from the AGYD schedule. The daytime check only flags DOM→DB misses, not DB→DOM misses, so these don't trigger alerts.
6. **Canceled/pending booking requests** — AGYD shows booking requests on the schedule DOM even when the client submitted a request that was never confirmed (`booking_status='canceled'`) or is still pending. The sync pipeline (Layer 3b in sync.js) correctly skips canceled ones. The integration check cannot detect cancellation status without fetching every detail page (too slow), so these appear as "Missing from DB" false positives. If you see a missing boarding alert for a dog you know had a canceled or unconfirmed request, this is why.
