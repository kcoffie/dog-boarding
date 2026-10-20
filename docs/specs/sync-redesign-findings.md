# Sync redesign: findings (research before the design note)

**Status:** research, 2026-10-20 (session 39). **No decisions yet.** This is everything known about how the app gets in step with the booking site, what goes wrong, and what we still need to find out. The design note (options → choice → what breaks → threat → how we'll know) comes after Kate has read this, and goes through the architect gate before any code.

**Why now:** on 2026-10-20 a boarding that was gone from the booking site was on the 4am roster and would have counted toward pay (#316), and a manual Sync Now stopped part-way and locked the button for 30 minutes (#317). The roster, pay and UAT all depend on the app agreeing with the booking site.

**Goal (Kate):** the app reliably matches the booking site without anyone pressing a button, a failure alerts Kate in a way she can act on, and the in-app sync behaves well when she does use it.

## 1. Every path that writes booking-site data into the app

Times are UTC (Kate: PDT = UTC−7 until Nov 1, then PST = UTC−8).

| # | Path | When | Runs on | What it does | Writes |
|---|---|---|---|---|---|
| 1 | Nightly crons `cron-auth`, `cron-schedule`, `cron-detail`, `cron-detail-2` (`vercel.json`) | Once a day, scheduled 00:00–00:15. Vercel Hobby starts each any time within the hour. Seen 10-20: schedule 00:14, detail 00:16 and 00:50, auth 00:37 | Vercel | `auth` signs in to the booking site, session stored for 24 h. `schedule` scans 3 week pages (this week, next week, a cursor week cycling weeks 2–8) and queues new bookings, and done bookings whose title or link changed. **Each `detail` run processes one queued booking**, so 2 a day | `sync_queue`, `sync_appointments`, `boardings`, `daytime_appointments`, `cron_health` |
| 2 | Integration Check, step 0 "sync-before-compare" (`scripts/integration-check.js`) | Scheduled 00:00, 08:00, 16:00. GitHub started it 3–5 h late on 10-20 (02:50, 13:08, 19:43) | GitHub Actions | Runs the same schedule scan, then **drains the whole queue**. This is where most bookings actually get processed (the newest `last_synced_at` on 10-20 was 13:09, its run). Then it compares (section 4) | same as 1 |
| 3 | Roster refresh (`refreshDaytimeSchedule`, `api/notify.js`) | Each morning roster job | GitHub → Vercel | Fetches today's week page and refreshes **today's daytime schedule only**. Boarders on the roster come from `boardings` as left by the last sync | `daytime_appointments` |
| 4 | Sync Now (Settings → External Sync, `src/lib/scraper/sync.js` `runSync`) | When Kate presses it | Kate's browser, through `api/sync-proxy` (signed-in user, REQ-656) | Full sync of a date range: fetches every booking's detail page, then **archive reconciliation** (REQ-108, `reconcile.js`): an active booking in the range that wasn't seen, and whose page confirms it's gone, is archived and its boarding marked cancelled. Drains the form queue | `sync_logs`, `sync_appointments`, `boardings`, forms |
| 5 | Historical Import (Settings) | By hand | Kate's browser | Backfill of past ranges | as 4 |

Only path 4 writes `sync_logs`, so Sync History and "Last Sync" show only button presses (the last full one before 10-20 was 2026-03-29). Paths 1–2 record to `cron_health` / `cron_health_log`.

## 2. Two sync implementations

- **Browser:** `sync.js` (781 lines) uses `schedule.js` (`fetchAllSchedulePages`) to read the schedule, and does reconciliation.
- **Server:** `syncRunner.js` (534 lines) has **its own schedule parser** (regex in `syncRunner.js`) and a queue, and no reconciliation.
- **Shared:** `extraction.js` (detail page), `mapping.js` (save), `forms.js`, `appointmentFilter.js`, `syncSettingsRow.js`.
- `auth.js` already has a browser path (via `sync-proxy`) and a Node path (direct fetch), so `runSync` may be able to run on a server. **Not yet verified.**

Two parsers and two flows mean the paths behave differently (reconciliation is only in one) and a site change can break one but not the other.

## 3. Problems found

| ID | Problem | Evidence | Caught today? |
|---|---|---|---|
| P1 | **A booking removed on the booking site stays in the app**, on the roster and in pay. Only Sync Now reconciles | `C63QhHuu` (10/19–10/25): synced 10-16 21:57, never re-checked, on the 10-20 4am roster. #316 | No |
| P2 | **The Vercel path can't keep up:** 2 detail fetches a day (Hobby: 60 s max per run, one run per cron path per day) | `api/cron-detail.js` header; 86 queued on 10-20 were mostly already done | Indirectly: works only because P3's path drains the queue |
| P3 | **The checker is also the main syncer.** Integration Check drains the queue and then checks its own result. One GitHub outage stops both the sync and its alarm | August 2026: GitHub disabled all scheduled workflows for 60 days without a commit | Partly: ops-watch on Vercel checks the schedule cron's result |
| P4 | **Edits are only seen when the title or link changes.** A changed rate, swapped dog or other detail on a done booking is never re-fetched by paths 1–2 | `describeEdit` in `syncQueue.js` compares URL and title only | No |
| P5 | **Past weeks are never re-scanned.** Pay looks backwards; a late change to last week is missed | `cron-schedule` scans this week forward; Integration Check compares 7 days forward | No |
| P6 | **Cron order isn't guaranteed.** On 10-20 schedule (00:14) and detail (00:16) ran on the previous day's session; auth refreshed at 00:37. Works because the session lasts 24 h and auth's start time has been stable | `cron_health_log` | Session failures alert |
| P7 | **A sync that hangs isn't reported** for `auth`/`detail` (`checkHungCron` exists but is never called) | #294 (parked into this redesign) | `schedule` only, by ops-watch |
| P8 | **The 00:30 health check can race Vercel's start-time jitter** and report "didn't run" for a late cron | #294 | — |
| P9 | **Sync Now lives in the page: no visible outcome, and a reload kills it.** On 10-20 a 476-booking sync (10/20–11/20) showed "~5 min" and ran 25+ min. It reached reconciliation (archived `C63QhHuu` at 21:50:23), then most likely died when the page was reloaded, before writing its counts. Its log row has no result. Whether a background tab slows it is unproven | `sync_logs` row 21:24:51, #317 | No |
| P10 | **A stuck-looking Sync Now locks the button for 30 min**, with no explanation, until `abortStuckSync` runs on a later page load. The same 30-min cutoff can mark a long sync that's still running as failed | #317 | No |
| P16 | **`sync_appointments.last_synced_at` isn't a progress signal:** reconciliation doesn't update it, and unchanged bookings may not either. Judging a sync by it misled us on 10-20 | this session | — |
| P11 | **Sync History / "Last Sync" are misleading:** they show only button presses ("Last Sync 3/29, Partial" while the nightly sync was running) | #311 | — |
| P12 | **Hand edits are overwritten** by the next sync, and deleted synced boardings come back | #313 | No |
| P13 | **Integration Check compares one way only:** on the site but missing from the DB, and "Unknown" dog names. Never "in the DB but gone from the site" | `compareResults` in `scripts/integration-check.js` | — (this is why P1 was silent) |
| P14 | **Repeated alerts get ignored:** the same evaluation (`C63QhKpW`) has been reported on every run for days | #315 | — |
| P15 | **A booking can be synced late:** the 10/10–10/11 stay was first synced on 10-16, after it had happened | `sync_appointments.first_synced_at` | No |

## 4. What alerts today

| Check | Where | What it looks at | Gap |
|---|---|---|---|
| cron-health-check | GitHub, 00:30 | Did each sync cron run tonight | Same scheduler as path 2; P7, P8 |
| ops-watch | Vercel, 17:00 | Schedule cron's result fresh; alerts delivered; 4am roster sent | Doesn't check that the data matches |
| Integration Check | GitHub, 3×/day | Site vs DB, 7 days forward, one way | P3, P13, P14 |
| Roster refresh alert | GitHub → Vercel | Today's daytime refresh failed | Boarders not covered |
| Red runs | GitHub email | Any failed workflow | Easy to miss |

## 5. Constraints

- **Vercel Hobby:** functions max 60 s (`vercel.json`), each cron path once a day, start time anywhere in the hour, deploy quota (memory: mass pushes block production deploys).
- **GitHub Actions:** scheduled runs start late (3–5 h seen on 10-20), and schedules are disabled after 60 days without a commit (`keepalive.yml` mitigates). Jobs can run for hours.
- **Booking site:** the only source of truth. No API; HTML pages behind a login. A full sync fetches every booking page in the range (476 for one month on 10-20). **Unknown:** rate limits, or whether heavy automated use could lock the account.
- **Rules:** silence is never success; the watcher runs on a different scheduler from the job; a new job ships with its alert; the repo is public (no client data); messages never tied to Charlie's business; Kate's OK for new secrets and settings.

## 6. Open questions (research before options)

1. Can `runSync` (path 4) run unchanged in Node on GitHub Actions? What breaks: `isBrowser`, the proxy, `import.meta.env`, timing?
2. How long does a full sync take server-side, for one month and for two? Where does the time go (per-page fetch, deliberate delays)?
3. Booking-site load: what's safe? Is there any sign of rate limiting in past runs?
4. Should reconciliation look back as well as forward (P5), and how far: the current pay period?
5. How should the button work if the server does the sync (#317 point 1): trigger a GitHub run (`workflow_dispatch`, needs a token) or something else? What does the page show while it runs?
6. Which side wins on a hand edit (#313): the site, the app, or "the app until the site changes"?
7. Is a separate check still worth having if the sync reconciles both ways? If so, what does it compare?
8. Retire the Vercel sync crons, or keep one as a backup?
9. What exactly should an alert say, so Kate can act at 7pm with no laptop?
10. Does anything else read `sync_queue`, `cron_health` rows for `detail`/`auth`, or `sync_logs`, that a change would break (ops-watch, cron-health-check, Settings UI)?

## 7. Direction under consideration (not decided)

One sync engine, one independent watcher, both judged by outcomes:
1. The server runs the same full sync as the button, including reconciliation, on GitHub Actions (no 60 s cap), on a schedule that finishes well before the 4am roster. It writes `sync_logs`, so Sync History is real.
2. The button asks the server to run that sync, and the page shows its progress and outcome (#317).
3. A failed sync alerts Kate at once, with what to do. The next scheduled run is the retry.
4. Vercel's ops-watch (the other scheduler) alerts if there's been no complete successful sync in ~26 h.
5. The Integration Check becomes a pure check, both ways, or is folded into 1.

Covers P1–P4, P6–P11, P13, P15. P5 and P12 need Kate's decisions (questions 4 and 6). P14 is #315.

## Related

#316 (vanished bookings), #317 (Sync Now), #311 (Sync History), #294 (hung syncs; parked into this), #313 (hand edits), #315 (repeated Integration Check findings), #312 (silent $0 rate, which P4 affects).
