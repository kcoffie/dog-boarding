# Integration Check Job

**Status:** Live (SKIP_SYNC=true — Step 0 disabled, see Known Issues)
**Last reviewed:** March 8, 2026

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

### Step 0 — Sync trigger *(currently disabled)*
Intended to POST `/api/run-sync` before comparing so the check always works with fresh data. **Broken** — see Known Issues. Controlled by `SKIP_SYNC` env var; `true` = skip.

### Step 1 — Load session cookies
Reads `session_cookies` from `sync_settings` in Supabase — the same auth token the midnight cron uses. If missing or expired, sends WhatsApp and exits. The session is refreshed by `cron-auth.js` which runs at midnight.

### Step 2 — Playwright scrapes the live schedule
- Launches headless Chromium in GH Actions
- Injects session cookies into the browser context so the first navigation is authenticated
- Navigates to `https://agirlandyourdog.com/schedule`
- Detects login redirect (if session is stale, AGYD redirects to login page)
- Takes a full-page PNG screenshot (~600KB)
- Extracts all `<a href="/schedule/a/{id}/{ts}">` links from the rendered DOM → list of `{id, title}`
- Applies `NON_BOARDING_PATTERNS` to filter out DC/PG/ADD/switch-day/etc — same patterns as the sync pipeline but defined independently (no import from `src/`)

### Step 3 — Claude reads the screenshot *(requires Anthropic credits)*
Sends the PNG to Claude API (claude-sonnet-4-6) with a vision prompt asking it to list every boarding dog name it can see. Returns `string[]`. This is the "what a human would see" signal — entirely independent from any code. Non-fatal: if Claude fails (no credits, API down), the check continues without the name comparison.

### Step 4 — Query the DB
Fetches all boardings from `boardings JOIN dogs` where:
- `arrival_datetime <= today + 7 days`
- `departure_datetime >= midnight UTC today`

The lower bound is **midnight UTC** (not exact now) so boardings that depart earlier today are still included — otherwise they show as "missing" even though they're in the DB.

### Step 5 — Compare (3 checks)
1. **Missing from DB** — any schedule appointment ID from Playwright not found in DB → "Missing from DB: {id} ({title})"
2. **Unknown dog name** — any DB boarding in the window with `dog_name = 'Unknown'` → "Unknown dog name in DB: {id}"
3. **Claude name mismatch** — any name Claude sees that doesn't match any DB boarding name → "Claude sees '{name}' but no DB boarding matches"
   - Only runs when Claude returned names (skipped if Claude failed)
   - Known limitation: compares first-word names ("Buddy Jr." in DB won't match "Buddy" from Claude)

### Step 6 — WhatsApp report
Sends to `INTEGRATION_CHECK_RECIPIENTS` (Kate only — separate from `NOTIFY_RECIPIENTS` which goes to the whole team). Text-only message:
- ✅ `Integration check passed (3/8) — 12 boardings, all match DB`
- ⚠️ `Integration check found issues (3/8)\n• Missing from DB: ...`

---

## What We Need to Remember (Gotchas)

| Gotcha | Detail |
|---|---|
| **Session cookie is a live auth credential** | `session_cookies` from `sync_settings` must never be logged — only log hours remaining |
| **Same-day departures** | DB query uses midnight UTC as lower bound. If you switch to `now()` you'll get false positives for boardings that departed earlier today |
| **NON_BOARDING_PATTERNS must be case-insensitive** | `ADD` is uppercase on the schedule. `/\badd\b/i` not `/\badd\b/`. Same fix needed in `cron-schedule.js` |
| **NON_BOARDING_PATTERNS are duplicated on purpose** | Defined independently in `integration-check.js`, not imported from `src/` — signal isolation. If you update them in the sync pipeline, update here too |
| **Claude name check is fuzzy** | Claude returns first-word names from appointment titles. A dog named "Buddy Jr." will always trigger a false positive. This is acceptable for a smoke test |
| **Claude is non-fatal** | If Claude API fails or returns unparseable output, Check 3 is skipped. Checks 1 and 2 still run. The report will still be sent |
| **Playwright downloads ~280MB of Chromium** | Cached by GH Actions after first run. If the cache is cold the job takes ~5 minutes |
| **SKIP_SYNC defaults to true** | Scheduled runs always skip Step 0. Manual `workflow_dispatch` has a `skip_sync` input to override |
| **GH Actions secrets vs Vercel env vars** | These are separate. Adding something to Vercel doesn't make it available in GH Actions. All secrets in the workflow must also be added as **Repository secrets** in GitHub (NOT environment secrets — the workflows don't declare `environment:`) |

---

## What It Still Needs

### Step 0 — Sync before compare (broken)
`api/run-sync.js` calls `runSync()` from `src/lib/scraper/sync.js`, which calls `fetchAllSchedulePages()` from `schedule.js`. That file uses `DOMParser` — a browser API that doesn't exist in Vercel's Node.js runtime. Also, the Hobby plan's 10s function timeout is too short for a full sync anyway.

**Fix options:**
- **Option A (preferred):** Have `api/run-sync.js` call the existing cron endpoints via HTTP using `CRON_SECRET` (already a Vercel env var). Call `cron-schedule` once to enqueue, then loop `cron-detail` until queue depth = 0.
- **Option B:** Remove Step 0 entirely. The check verifies DB state as-is — if the midnight cron is broken, missing boardings surface in Step 5. The sync step was added to ensure fresh data, but the check's *job* is to catch sync failures.

### Claude credits
The Anthropic API key has no credits as of March 8, 2026. Step 3 (name mismatch check) is silently skipped. Top up at console.anthropic.com → Plans & Billing.

### `ADD` filter not case-insensitive in `cron-schedule.js`
The same `/\badd\b/` pattern without `i` flag exists in `cron-schedule.js`. This could cause `ADD *` appointments to get enqueued by the cron. Low priority since the sync pipeline's post-filter catches them too, but worth fixing for consistency.

### Multi-week schedule coverage
Currently only scrapes today's schedule page (this week). Boardings starting next week won't appear in Playwright's scrape but will be in the DB query window. This means the check only catches *this week's* missing boardings. Widening to 2 weeks would require fetching a second schedule page.

### Claude name comparison is fragile for multi-word names
`"Buddy Jr."` in the DB won't match `"Buddy"` from Claude. Currently logged as a warning, not a hard failure. Could be improved by fuzzy matching (startsWith, or checking if DB name starts with the Claude name).

---

## Required Secrets

All must be **Repository secrets** in GitHub (Settings → Secrets → Actions → Repository secrets tab — NOT environment secrets).

| Secret | Description | Source |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (public) | Supabase project settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS | Supabase project settings → API → Secret keys |
| `ANTHROPIC_API_KEY` | Claude API key | console.anthropic.com → API Keys |
| `TWILIO_ACCOUNT_SID` | Twilio account | Copy from Vercel env vars |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Copy from Vercel env vars |
| `TWILIO_FROM_NUMBER` | Twilio sandbox number | Copy from Vercel env vars |
| `INTEGRATION_CHECK_RECIPIENTS` | Kate's phone number only (E.164) | Manually set — NOT from Vercel |
| `APP_URL` | Vercel production URL | Already set as repo secret |
| `VITE_SYNC_PROXY_TOKEN` | Auth token for `/api/run-sync` | Already set as repo secret |

Note: `TWILIO_*` and `SUPABASE_SERVICE_ROLE_KEY` are also Vercel env vars. They must be separately added as GH repo secrets — Vercel and GitHub Actions do not share env vars.

---

## Files

| File | Purpose |
|---|---|
| `scripts/integration-check.js` | The job script — runs in GH Actions |
| `api/run-sync.js` | On-demand sync endpoint (currently broken — Step 0) |
| `.github/workflows/integration-check.yml` | Schedule + secrets wiring |

---

## Schedule

Runs 3× daily (PDT = UTC-7, update each DST transition):

| Time (PDT) | UTC | Why |
|---|---|---|
| 1:00 AM | 08:00 | Shortly after midnight cron finishes (cron-auth 00:00, cron-schedule 00:05, cron-detail 00:10) |
| 9:00 AM | 16:00 | Morning check |
| 5:00 PM | 00:00 | Afternoon check |

Also available on-demand via `workflow_dispatch` in the Actions tab. The manual trigger has a `skip_sync` input (default `true`).

---

## Architecture Note — Why Not a Vercel Endpoint?

The check uses Playwright (headless Chromium, ~280MB) and runs for ~1 minute. Vercel Hobby serverless functions have a 50MB bundle limit and 10s execution timeout. GH Actions has neither constraint, has Chromium pre-available, and is already where the notify workflows live.

---

## Known False Positive Patterns

These will look like failures but aren't:

1. **Same-day departures before midnight UTC** — fixed in PR #54 (start-of-day window)
2. **`ADD *` appointments** — should be filtered; `i` flag fix in PR #54
3. **Multi-word dog names vs Claude first-word extraction** — by design, low-priority
4. **No boardings this week** — the check will pass with `0 boardings — all match DB` which is correct
