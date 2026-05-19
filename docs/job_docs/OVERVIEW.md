# Jobs Overview

**Last updated:** May 19, 2026

All automated work in this system runs as either Vercel cron jobs (nightly, inside the Vercel function runtime) or GitHub Actions workflows (GH-managed compute, no Vercel timeout constraint). This doc is a map of every job — what it does, when it runs, and why it matters.

---

## Quick Reference

| Job | Platform | Schedule (PDT) | Sends WhatsApp? | Audience |
|-----|----------|----------------|-----------------|----------|
| `cron-auth` | Vercel | 5:00 PM daily (00:00 UTC) | No | — |
| `cron-schedule` | Vercel | 5:05 PM daily (00:05 UTC) | No | — |
| `cron-detail` | Vercel | 5:10 PM daily (00:10 UTC) | No | — |
| `cron-detail-2` | Vercel | 5:15 PM daily (00:15 UTC) | No | — |
| `cron-health-check` | GH Actions | 5:30 PM daily (00:30 UTC) | When issues found | Kate only |
| `integration-check` | GH Actions | 1am, 9am, 5pm | Always | Kate only |
| `gmail-monitor` | GH Actions | Hourly at :15 | When issues found | Kate only |
| `notify-4am` | GH Actions | 4:00 AM Mon–Fri | Always | Full team |
| `notify-7am` | GH Actions | 7:00 AM Mon–Fri | On change | Full team |
| `notify-830am` | GH Actions | 8:30 AM Mon–Fri | On change | Full team |
| `notify-friday-pm` | GH Actions | 3:00 PM Fri | Always | Full team |
| `notify-intraday` | GH Actions | 9am–8pm hourly Mon–Fri | On boarding delta | Full team |

---

## When Does the DB Get Updated From AGYD?

Two different tables update on different schedules.

### Overnight boardings (`boardings` table)

New overnight boarding records enter the DB through the queue pipeline:

1. **5:05 PM PDT** — `cron-schedule` scans AGYD and adds newly discovered appointments to `sync_queue`
2. **5:10 PM + 5:15 PM PDT** — `cron-detail` and `cron-detail-2` each pull one queued item's full detail page from AGYD and write it to `boardings`

That's the only time new boardings are automatically added. **Two items drain per night** (one per detail job). If the queue is longer, use the UI "Sync Now" button to drain it on demand.

**One exception:** the integration-check also calls `runDetailSync()` at **1 AM, 9 AM, and 5 PM** as part of its Step 0 mini-sync. If items are sitting in the queue from the prior evening's `cron-schedule` run, those runs will drain them — so a new boarding can land in the DB as early as 1 AM rather than waiting until the next 5 PM cycle.

### Daytime appointments (`daytime_appointments` table)

Daytime data is refreshed far more frequently — every job that touches AGYD also upserts daytime events as a side effect:

| Time (PDT) | Job | How |
|---|---|---|
| 1:00 AM | `integration-check` (Step 0) | `runScheduleSync()` → `upsertDaytimeAppointments()` |
| 4:00 AM | `notify-4am` | `refreshDaytimeSchedule()` |
| 7:00 AM | `notify-7am` | `refreshDaytimeSchedule()` |
| 8:30 AM | `notify-830am` | `refreshDaytimeSchedule()` |
| 9:00 AM | `integration-check` (Step 0) | `runScheduleSync()` → `upsertDaytimeAppointments()` |
| 3:00 PM | `notify-friday-pm` (Fri only) | `refreshDaytimeSchedule()` |
| 5:00 PM | `integration-check` (Step 0) | `runScheduleSync()` → `upsertDaytimeAppointments()` |
| 5:05 PM | `cron-schedule` | `parseDaytimeSchedulePage()` → `upsertDaytimeAppointments()` |

On a weekday, daytime appointments are refreshed up to 8 times. The `notify-intraday` job does **not** refresh from AGYD — it reads `boardings` from the DB only.

---

## The Nightly Sync Cluster (5:00–5:30 PM PDT / midnight UTC daily)

Five jobs run back-to-back each evening with 5-minute gaps to ensure each step completes before the next begins. These run at **midnight UTC**, which is **5:00 PM PDT** (UTC-7 in summer).

### `cron-auth` — 5:00 PM PDT (00:00 UTC)
**What:** Unconditionally re-authenticates against the AGYD booking site and caches the session cookie in `sync_settings` with a 24h TTL.

**Why unconditional:** An earlier version skipped re-auth if the session looked valid. That caused a race condition: a session cached at 5:27 PM PDT (00:27 UTC) would appear valid to the 5:00 PM cron but expire before the 4am/7am/8:30am notify windows the following morning — and all three sends would fail with "no session." The fix was to always re-auth, at the cost of one extra HTTP call per night.

**File:** `api/cron-auth.js`

---

### `cron-schedule` — 5:05 PM PDT (00:05 UTC)
**What:** Fetches schedule pages from AGYD, extracts appointment links, and enqueues boarding candidates into `sync_queue`. Also ingests daytime (DC/PG) events into `daytime_appointments`.

**Interesting details:**
- Fetches **exactly 3 pages per night**: (1) the current week, (2) next week, (3) a rotating cursor week (cycles through weeks 2–8 beyond today). This means bookings up to 2 weeks out are seen every night; bookings 2–8 weeks out appear in the queue within 6 nights.
- Daytime ingestion is a bonus pass on HTML already fetched for boarding — no extra HTTP requests.
- Uses regex-based HTML parsing (`parseScheduleHtml`) because `DOMParser` is a browser API unavailable in Node.js.
- Pre-filters using `SCRAPER_CONFIG.nonBoardingPatterns` before enqueue (catches DC, ADD, etc.). The anchor on the DC pattern (`/^(d\/c|dc)\b/i`) is intentional — "DC" mid-title in a boarding service name should not be filtered.

**File:** `api/cron-schedule.js`

---

### `cron-detail` + `cron-detail-2` — 5:10 PM + 5:15 PM PDT (00:10 + 00:15 UTC)
**What:** Each picks one item from `sync_queue`, fetches its full detail page, runs post-detail filter gates, and upserts the result into `boardings`/`dogs`.

**Why one item per run:** Vercel Hobby functions have a 10-second timeout. One detail page fetch + parse + DB write takes 2–4s. Multiple items would risk timeout on slow responses.

**Why two jobs:** `cron-detail-2` is literally a re-export of `cron-detail` registered under a different Vercel path (`/api/cron-detail-2`). The Hobby plan gives each path one cron slot per day, so two paths = two slots = 2 items processed per night, at zero code complexity cost.

**5 post-detail filter gates** (things the schedule pre-filter can't catch):
1. Title/service_type — second pass of `nonBoardingPatterns` on the full detail-page data
2. `booking_status: canceled` — client submitted a request that was never confirmed
3. Pricing — skip when all line items are day services
4. Same-day duration `< 12h` — catches uninvoiced PG/DC daycare events
5. Date-overlap — only applied in the browser sync path, not here

**Files:** `api/cron-detail.js`, `api/cron-detail-2.js`

---

### `cron-health-check` — 5:30 PM PDT (00:30 UTC)
**What:** Verifies that the nightly sync crons (auth, schedule, detail) actually ran and didn't fail. Sends a WhatsApp alert to Kate if any cron missed its window or has 2+ consecutive failures in `cron_health_log`.

**Why 5:30 PM:** Gives the full cron chain (5:00–5:15 PM PDT / 00:00–00:15 UTC) time to complete before the check runs.

**What it checks:**
- Did each cron run since midnight UTC? (checks `cron_health.last_ran_at`)
- Does `cron_health_log` show 2 consecutive failures for any cron?

**File:** `scripts/cron-health-check.js` | **Workflow:** `.github/workflows/cron-health-check.yml`

---

## The Monitoring Jobs

Three jobs that run independently of the sync pipeline to catch failures the pipeline cannot detect about itself.

### `integration-check` — 1am, 9am, 5pm PDT (3× daily)
**What:** The main system health check. Uses Playwright (real browser) to render the AGYD schedule page, compares what it sees against what's in the DB, and sends a WhatsApp report to Kate.

**Why it can't use the same code as the sync:** If the sync pipeline has a parsing bug, using the same parser to verify the sync would confirm the wrong output and call it a pass. The integration check uses a completely independent signal path: **Playwright DOM** — headless Chromium reads the live rendered DOM, not the raw HTML the regex-based cron uses.

**Step 0 (sync-before-compare):** Before the Playwright check runs, a mini sync fires (`runScheduleSync` + `runDetailSync`). This eliminates false positives for bookings made after midnight UTC (after the overnight cron ran but before the 1am check).

**Always exits 0:** Data issues are content of the report, not a job failure. The GH Actions UI shows green whether or not issues were found.

**Checks run:** (1) boarding DOM IDs vs DB, (2) unknown dog names in DB, (3) daytime events DOM vs DB. Claude vision (formerly Check 3) was removed in PR #202 — Check 1 (DOM ID match) is the reliable signal and already catches any real sync miss.

**File:** `scripts/integration-check.js` | **Workflow:** `.github/workflows/integration-check.yml`

---

### `gmail-monitor` — Hourly at :15 past
**What:** Scans `kcoffie@gmail.com` for unread emails from known infrastructure senders (GitHub, Vercel, Supabase). When a match is found, sends a WhatsApp alert to Kate and records the email ID in Supabase to prevent duplicate alerts.

**Coverage:** GitHub Actions run failures, Vercel deploy failures, any Supabase email (quota, downtime, billing).

**Self-skip guard:** If the Gmail Monitor workflow itself fails, GitHub sends a "run failed" email to the inbox. Without the guard, the next run would pick that up and alert — potentially infinitely. Emails whose subject matches `/gmail[- ]monitor/i` are silently dropped before any other processing.

**Why :15 past:** Avoids collision with other hourly jobs that run at :00.

**File:** `scripts/gmail-monitor.js` | **Workflow:** `.github/workflows/gmail-monitor.yml`

---

## The Notify Cluster (Mon–Fri, 4am–8pm PDT)

Five workflows send WhatsApp notifications to the full team. Together they answer three different questions:
- "Who's boarding tonight?" (4am/7am/8:30am roster image)
- "Who's boarding this weekend?" (Friday PM preview)
- "Did anything change since this morning?" (intraday delta)

### `notify-4am` — 4:00 AM Mon–Fri
**What:** Always sends. Delivers the daily roster image — one dog per worker, today's boarding dogs in the Q Boarding card.

**Key behavior:** No UPDATED! badge (no prior send exists to compare against). No blue overlay. This is the day's baseline.

**File:** `api/notify.js` (`window=4am`) | **Workflow:** `.github/workflows/notify-4am.yml`

---

### `notify-7am` — 7:00 AM Mon–Fri
**What:** Sends only if the roster hash changed since 4am. If nothing changed, silent skip.

**Key behavior:** Shows UPDATED! badge if the roster changed vs. yesterday. Shows blue overlay for any dog whose status changed since the 4am send ("what's new since the image you received 3 hours ago").

**File:** `api/notify.js` (`window=7am`) | **Workflow:** `.github/workflows/notify-7am.yml`

---

### `notify-830am` — 8:30 AM Mon–Fri
**What:** Same as 7am (sends on change, UPDATED! badge, blue overlay). Additionally stores a snapshot of tonight's boarders in `cron_health` (`boarders-snapshot` row) — this is what the intraday job reads all day.

**Why 8:30am is the snapshot point:** It's the last morning send. By 8:30am the roster has had time to settle. Any boarder additions or cancellations after this point are what the intraday job detects.

**File:** `api/notify.js` (`window=8:30am`) | **Workflow:** `.github/workflows/notify-830am.yml`

---

### `notify-friday-pm` — 3:00 PM Fri
**What:** Always sends. Delivers a weekend-themed roster image showing dogs arriving and departing Saturday–Sunday.

**Why always send:** The weekend roster is inherently time-sensitive. Unlike the morning dedup logic (skip if nothing changed), a missed weekend preview has no recovery — the team needs it before they leave for the day.

**File:** `api/notify.js` (`window=friday-pm`) | **Workflow:** `.github/workflows/notify-friday-pm.yml`

---

### `notify-intraday` — Hourly 9am–8pm Mon–Fri
**What:** Compares tonight's current boarders against the 8:30am snapshot. If anything changed (new booking added, cancellation), sends a "Q Boarding Changes" delta image showing added/cancelled dogs.

**Skip logic (3 gates):**
1. No 8:30am snapshot for today → skip (`no_snapshot`)
2. Delta is empty → skip (`no_change_since_830am`)
3. Delta hash matches the last intraday send → skip (same delta already sent this hour, nothing new)

**Interesting scheduling detail:** 5pm–8pm PDT crosses UTC midnight, so two cron expressions are needed — one for UTC hours 16–23 (Mon–Fri UTC) and one for UTC hours 0–3 (Tue–Sat UTC, which is Mon–Fri PDT evenings).

**File:** `api/notify-intraday.js` | **Workflow:** `.github/workflows/notify-intraday.yml`

---

## A Real Weekday (1am → 8pm PDT)

What actually fires on a typical Monday. The Vercel sync crons run at **midnight UTC = 5 PM PDT** — they run in the *evening*, not overnight.

| Time (PDT) | Job | Outcome |
|------------|-----|---------|
| 1:00 AM | `integration-check` | Step 0 mini-sync runs, then Playwright compares DB to live schedule; WhatsApp report sent |
| 4:00 AM | `notify-4am` | Live schedule refreshed from AGYD; roster image sent to full team (always) |
| 7:00 AM | `notify-7am` | Live schedule refreshed; roster image sent if anything changed since 4am |
| 8:30 AM | `notify-830am` | Live schedule refreshed; roster image sent if anything changed since 7am; boarders snapshot stored |
| 9:00 AM | `notify-intraday` | Checks for boarding changes since 8:30am; skips if none |
| 9:00 AM | `integration-check` | Step 0 mini-sync runs, then mid-morning DB vs schedule compare |
| 9:15 AM | `gmail-monitor` | Inbox scanned; alerts if infrastructure email found |
| 10:00 AM–4:00 PM | `notify-intraday` (hourly) | Same delta check; fires only when a new booking or cancellation appears |
| 3:00 PM | `notify-friday-pm` | (Fridays only) Live schedule refreshed; weekend preview image sent |
| 5:00 PM | `integration-check` | Step 0 mini-sync runs, then afternoon DB vs schedule compare |
| 5:00 PM | `cron-auth` | Fresh session cookie cached in DB (00:00 UTC) |
| 5:05 PM | `cron-schedule` | Schedule scanned, new boarding appointments enqueued, daytime events upserted (00:05 UTC) |
| 5:10 PM | `cron-detail` | Oldest queue item fetched from AGYD → boarding upserted (00:10 UTC) |
| 5:15 PM | `cron-detail-2` | Second queue item fetched from AGYD → boarding upserted (00:15 UTC) |
| 5:15–8:00 PM | `notify-intraday` (hourly) | Same delta check continues |
| 5:30 PM | `cron-health-check` | Confirms all sync crons ran; alerts if any failed (00:30 UTC) |

---

## How Failure Alerts Reach You

Three independent paths ensure a failure surfaces before it causes a missed notification:

| Failure type | Who catches it | Via |
|---|---|---|
| Vercel cron didn't run / threw an error | `cron-health-check` | WhatsApp to Kate at 5:30 PM PDT (00:30 UTC) |
| GH Actions workflow failed (any workflow) | `gmail-monitor` | WhatsApp to Kate within 1 hour |
| Sync ran but missed a booking (silent data bug) | `integration-check` | WhatsApp to Kate at 1am/9am/5pm |
| Morning notify fired but image never delivered to phone | F-1 webhook + `message_delivery_status` table | (G-1 alert not yet implemented) |

---

## Detailed Docs

| Doc | Covers |
|-----|--------|
| [sync-crons.md](sync-crons.md) | `cron-auth`, `cron-schedule`, `cron-detail`, `cron-detail-2` — queue design, filter gates, session management, Hobby plan constraints |
| [notify-jobs.md](notify-jobs.md) | All 5 notify workflows — change detection, blue overlay, intraday delta, Meta Cloud API upload-first |
| [integration-check.md](integration-check.md) | Independent verification — Playwright signal path, Claude vision, Step 0 sync-before-compare, false positive patterns |
| [gmail-monitor.md](gmail-monitor.md) | Inbox scanner — OAuth2, self-skip guard, dedup, re-auth runbook |
