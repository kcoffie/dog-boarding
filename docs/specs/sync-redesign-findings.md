# Sync redesign: findings (research before the design note)

**Status:** research, 2026-10-20 (session 39); answers added 2026-10-21 (section 6a). **No decisions yet.** This is everything known about how the app gets in step with the booking site, what goes wrong, and what we still need to find out. The design note (options → choice → what breaks → threat → how we'll know) comes after Kate has read this, and goes through the architect gate before any code.

**Why now:** on 2026-10-20 a boarding that was gone from the booking site was on the 4am roster and would have counted toward pay (#316), and a manual Sync Now stopped part-way and locked the button for 30 minutes (#317). The roster, pay and UAT all depend on the app agreeing with the booking site.

**Goal (Kate):** the app reliably matches the booking site without anyone pressing a button, a failure alerts Kate in a way she can act on, and the in-app sync behaves well when she does use it.

## 1. Every path that writes booking-site data into the app

Times are UTC (Kate: PDT = UTC−7 until Nov 1, then PST = UTC−8).

| # | Path | When | Runs on | What it does | Writes |
|---|---|---|---|---|---|
| 1 | Nightly crons `cron-auth`, `cron-schedule`, `cron-detail`, `cron-detail-2` (`vercel.json`) | Once a day, scheduled 00:00–00:15. Vercel Hobby starts each any time within the hour. Seen 10-20: schedule 00:14, detail 00:16 and 00:50, auth 00:37 | Vercel | `auth` signs in to the booking site, session stored for 24 h. `schedule` scans 3 week pages (this week, next week, a cursor week cycling weeks 2–8) and queues new bookings, and done bookings whose title or link changed. **Each `detail` run processes one queued booking**, so 2 a day | `sync_queue`, `sync_appointments`, `boardings`, `daytime_appointments`, `cron_health` |
| 2 | Integration Check, step 0 "sync-before-compare" (`scripts/integration-check.js`) | Scheduled 00:00, 08:00, 16:00. GitHub started it 3–5 h late on 10-20 (02:50, 13:08, 19:43) | GitHub Actions | Runs the same schedule scan, then processes **up to 20 queued bookings** (`MAX_DETAIL_ITERATIONS`; it warns when it stops with items left). This is where most bookings actually get processed (the newest `last_synced_at` on 10-20 was 13:09, its run). Then it compares (section 4) | same as 1 |
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
| P2 | **The Vercel path can't keep up:** 2 detail fetches a day (one run per cron path per day on Hobby; the `api/cron-detail.js` header says a 10 s limit, but with Fluid compute, on by default, Hobby functions get 300 s; qboard's setting to confirm) | `api/cron-detail.js` header; 86 queued on 10-20 were mostly already done | Indirectly: works only because P3's path processes up to 20 per run (60/day); a bigger backlog drains slowly |
| P3 | **The checker is also the main syncer.** Integration Check drains the queue and then checks its own result. One GitHub outage stops both the sync and its alarm | August 2026: GitHub disabled all scheduled workflows for 60 days without a commit | Partly: ops-watch on Vercel checks the schedule cron's result |
| P4 | **Edits are only seen when the title or link changes.** A changed rate, swapped dog or other detail on a done booking is never re-fetched by paths 1–2 | `describeEdit` in `syncQueue.js` compares URL and title only | No |
| P5 | **Past weeks are never re-scanned.** Pay looks backwards; a late change to last week is missed | `cron-schedule` scans this week forward; Integration Check's DB side covers the past 7 days to 7 days ahead | No |
| P6 | **Cron order isn't guaranteed.** On 10-20 schedule (00:14) and detail (00:16) ran on the previous day's session; auth refreshed at 00:37. Works because the session lasts 24 h and auth's start time has been stable | `cron_health_log` | Session failures alert |
| P7 | **A sync that hangs isn't reported** for `auth`/`detail` (`checkHungCron` exists but is never called) | #294 (parked into this redesign) | `schedule` only, by ops-watch |
| P8 | **The 00:30 health check can race Vercel's start-time jitter** and report "didn't run" for a late cron | #294 | — |
| P9 | **Sync Now lives in the page: no visible outcome, and a reload kills it.** On 10-20 a 476-booking sync (10/20–11/20) showed "~5 min" and ran 25+ min. It reached reconciliation (archived `C63QhHuu` at 21:50:23), then most likely died when the page was reloaded, before writing its counts. Its log row has no result. Whether a background tab slows it is unproven | `sync_logs` row 21:24:51, #317 | No |
| P10 | **A stuck-looking Sync Now locks the button for 30 min**, with no explanation, until `abortStuckSync` runs on a later page load. The same 30-min cutoff can mark a long sync that's still running as failed | #317 | No |
| P11 | **Sync History / "Last Sync" are misleading:** they show only button presses ("Last Sync 3/29, Partial" while the nightly sync was running) | #311 | — |
| P12 | **Hand edits are overwritten** by the next sync, and deleted synced boardings come back | #313 | No |
| P13 | **Integration Check compares one way only:** on the site but missing from the DB, and "Unknown" dog names. Never "in the DB but gone from the site" | `compareResults` in `scripts/integration-check.js` | — (this is why P1 was silent) |
| P14 | **Repeated alerts get ignored:** the same evaluation (`C63QhKpW`) has been reported on every run for days | #315 | — |
| P15 | **A booking can be synced late:** the 10/10–10/11 stay was first synced on 10-16, after it had happened | `sync_appointments.first_synced_at` | No |
| P16 | **`sync_appointments.last_synced_at` isn't a progress signal:** reconciliation doesn't update it, and unchanged bookings may not either. Judging a sync by it misled us on 10-20 | this session | — |
| P17 | **A full Sync Now is slow:** 2026-10-20 21:56:36–22:44:24 UTC, **47 m 49 s** for one range (10/20–12/19). Found 519, skipped 500, updated 17, failed 2, archived 0. Skips happen before fetching (known non-boarding titles, archived IDs) or after fetching the detail page (`applyDetailFilters`); the log doesn't say how many pages were fetched. 1.5 s between requests (`SCRAPER_CONFIG.delayBetweenRequests`) | `sync_logs` 7631626e | — |
| P18 | **Playgroup bookings fail during the detail fetch** (the architect found the error text comes from `withRetry` reading a missing `SCRAPER_CONFIG.retryDelays`, which masks the first real error), so every full sync ends "Partial": `Cannot read properties of undefined (reading '0')` on `C63QhBhg` ("P/G M/T/W/Th") and `C63QhBhu` ("P/G FT"). Same error as the 215 failures in the 2026-03-28 sync. Harmless to boardings, but a permanent "Partial" teaches Kate to ignore the status | `sync_logs` 7631626e, 77b4c6f0 | — |
| P19 | **Sync Details shows changes that aren't changes:** check-in/out "Oct 8, 9:00 AM → Oct 8, 9:00 AM" (likely a format difference in the stored value). Also: 4 boardings had an empty client name that this sync filled, so the automatic paths may not be setting it | Sync Details screen, 10-20 | — |
| P20 | **Recurring playgroup series are re-queued as "edited" by the schedule scan, then fetched and thrown away.** Wasted booking-site load, and two of them crash the parser (P18) | `schedule` cron 2026-10-21 00:15 UTC: `requeuedEdited` 18, all recurring playgroup titles (`PG FT`, `P/G M/T/W/Th` style) (`C63QhBhg`, `C63QhBhu`, …); `sync_queue` pending 47 (expected < 30) | No |
| P21 | **GitHub starts scheduled runs 4–6 h late, so the "4am" roster isn't at 4am.** It affects any job on a GitHub schedule, a nightly sync included. Runs started by `workflow_dispatch` start at once | `notify-4am` (11:00 UTC): started 15:34 UTC 10-20, 17:21 UTC 10-19. `notify-7am` (14:00 UTC): 18:23 10-20, 19:44 10-19 (it ran at 14:30 in August). `cron-health-check` (00:30): 04:48–05:06 | No |

## 4. What alerts today

| Check | Where | What it looks at | Gap |
|---|---|---|---|
| cron-health-check | GitHub, 00:30 | Did each sync cron run tonight | Same scheduler as path 2; P7, P8 |
| ops-watch | Vercel, 17:00 | Schedule cron's result fresh; alerts delivered; 4am roster sent | Doesn't check that the data matches |
| Integration Check | GitHub, 3×/day | Site vs DB (DB side: past 7 days to 7 days ahead), one way | P3, P13, P14 |
| Roster refresh alert | GitHub → Vercel | Today's daytime refresh failed | Boarders not covered |
| Red runs | GitHub email | Any failed workflow | Easy to miss |

## 5. Constraints

- **Vercel Hobby:** a short function time limit (the sync crons run on the default; `vercel.json` sets 60 s only for ops-watch; exact limit to verify), each cron path once a day, start time anywhere in the hour, deploy quota (memory: mass pushes block production deploys).
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

## 6a. Answers so far (session 40, 2026-10-21, read-only research)

**Kate's constraint (2026-10-21):** don't risk a limit or a lock on the booking-site account. Boardings don't change often. **One good full sync every 24 h is an OK minimum.** Other checks are welcome only if they're light. Every option below is judged by how many booking-site pages it fetches.

**Q1. Can `runSync` run in Node on GitHub Actions? Not as it is.** It needs the regex schedule parser and log redirection as well as the changes below.
- `auth.js` already has a Node path: `isBrowser()` is false without `window`, so `authenticatedFetch` calls the booking site directly (no proxy).
- `runSync` calls `authenticate()` with no credentials when it has no session, and the Node path needs them. A server wrapper would load the stored session first (`sessionCache`, `setSession`), as `syncRunner.js` does, so `runSync` skips the login. That's one login a day (cron-auth's), not one per run.
- `runSync` defaults to an anon-key Supabase client. The server passes a service-role client through `options.supabase`, which `runSync` already accepts and hands to `mapAndSaveAppointment`. `mapping.js`'s own `import.meta.env` default is then never evaluated.
- **Corrected by the architect (2026-10-21):** `logger.js` gates only its file output on `DEV`; in Node every log line prints, names included. And `schedule.js` parses with `DOMParser`, which Node doesn't have (that's why `syncRunner.js` has a regex parser). So it's more than three small changes: see the design note.
- Not yet run. A local Node run would prove it, but it would fetch from the booking site, so it waits for Kate's OK.
- `sync.js` predates the 2026-10-16 gates and has no mutation score. Running it unattended brings it under the gates (#239).

**Q2. Where the 47 m 49 s went (Sync Now 2026-10-20, 10/20–12/19).**
- Per booking page fetched: about 8–9 s. Consecutive saves were 7–9 s apart (`sync_appointments.last_synced_at`). That's the 1.5 s delay plus ~4–5 s for the booking site to answer: GitHub Actions' direct fetches in the Integration Check take ~4–5 s per page too, so it's the site, not the proxy.
- Saves ran from 21:57 to 22:19 (22 min). At ~8.5 s a page that's **roughly 150–160 booking pages fetched**, of which 17 were saved and 2 failed. So **most fetched pages are thrown away after fetching** (`applyDetailFilters`: playgroup, same-day, outside the range). The other ~360 skips happen before fetching (title patterns, archived IDs).
- 22:19 to 22:44 (25 min) is unaccounted for. It's reconciliation (one page per candidate, 1.5 s apart), the form drain (up to 20), fetched-and-skipped bookings after the last save, or all three. The log doesn't say. Estimate, not measured.
- Compare March: 623 found in 6 m 56 s and 450 in 4 m 56 s (2026-03-24). The same code was 7× faster, so the duration depends on how many pages get fetched (and possibly on a background tab), not on the range.
- **A full sync's cost is ~10 schedule pages + ~150–200 booking pages.** At today's pace that's ~25 min on a server, spaced one request every ~8 s.

**Q3. Booking-site load: is there any sign of rate limiting?** None found.
- 123 `sync_logs` rows (2026-01 to 10-20): every error is a parser crash, a timeout or abort, or a login problem. No 429, 403, captcha or "too many".
- 4 recent Integration Check logs: no 429/403. `sync_queue` has no stored errors.
- Absence isn't proof. The site's limits are unknown, and every request says `DogBoardingSync/2.0` in its User-Agent, so the site can tell these requests apart from a person.
- **Today's load, estimated:** Integration Check 3×/day (3 schedule pages + up to 20 booking pages + forms + its Playwright week pages) ≈ 80; Vercel crons ≈ 7; roster jobs ≈ 5. **About 90 pages a day.** A nightly full sync as it works today adds ~190, the same as one Sync Now press. Not re-fetching bookings already known to be non-boarding, or unchanged since the last full sync, could cut that a lot. That's a design choice, because P4 (edits invisible from the schedule page) argues for re-fetching.

**Q10. What reads the tables a change would touch.**
- `sync_logs`: only `useSyncHistory` (Sync History page, Settings "Last Sync"), written by `sync.js` and `historicalSync.js`. A server sync that writes it makes those pages truthful (P11) with no reader change.
- `sync_queue`: `ops-watch` (pending count, oldest pending, last done) and `syncRunner`/`syncQueue`. Retiring the queue means changing ops-watch's checks in the same PR.
- `cron_health` rows `auth`/`schedule`/`detail`: `scripts/cron-health-check.js` (`MONITORED_CRONS`), ops-watch (schedule) and Settings (`useCronHealth`). Retiring a Vercel cron means removing it from `MONITORED_CRONS`, or the 00:30 check alerts "didn't run" every night.

**Q5 (partly). The button can trigger a server run with no new secret.** `GH_ACTIONS_TOKEN` (fine-grained, this repo, Actions read and write) is already in Vercel for ops-watch. A signed-in endpoint could dispatch the sync workflow and the page could read its `sync_logs` row. Whether to reuse that token for a second purpose is an architect-gate question.

**Already in place for a second, independent reader:** the Integration Check renders the booking site's week pages in a real browser (Playwright, `scripts/integration-check.js`) and reads the live DOM, deliberately apart from the regex parser. A screenshot of those same pages could be read by an AI model and compared with the app and the roster image, at no extra booking-site load. Costs: a new API key (architect gate), client data sent to another third party (Kate's call), and answers that can vary between runs, so it can raise a flag but not be the source of truth. Screenshots show names and dates, not rates (#312).

**Timing (P21): start GitHub jobs from Vercel.** GitHub's schedule ran 4–6 h late on 10-19 and 10-20, but `workflow_dispatch` runs start at once. A Vercel cron (start time within the hour) can dispatch a GitHub workflow with `GH_ACTIONS_TOKEN`, which is already in Vercel. That gives a nightly sync with no function time limit that starts on time. The same applies to the morning roster. The dispatching cron then shares Vercel with ops-watch, so the watcher has to check outcomes (a finished `sync_logs` row), not that the dispatch happened.

Still open: Q4 (how far back to reconcile), Q6 (who wins on a hand edit), Q7–Q9. These need Kate's decisions or belong in the design note.

## 6b. Kate's decisions (2026-10-21)

1. **Freshness by date.** Today, later today and tomorrow matter most: those bookings must be right and mostly up to date. The full sync of 100+ bookings can be slow and less frequent.
2. **Booking-site load.** Don't re-open bookings already known not to be boardings. Skip bookings that haven't changed, with **one full pass a day** as the minimum.
3. **Q6, hand edits (half-done until seen in real use):** the app wins until the site changes. A hand edit is a **drift** between the app and the booking site, and the app keeps a list of drifts with two states: (1) the app differs from the site; (2) they differed, and now they match. Acting on those states waits until the case comes up in real use. (#313)
4. **Q4 (how far back):** waiting on the cost and benefit below.
5. **Public logs:** detailed logs are wanted for debugging but must be private and expire (#323).

**The AI screenshot check was tried before.** Integration Check "Step 3" used Claude vision to compare dog names in the roster image with the database. It ran silently skipped whenever the API key had no credits, and was removed in PR #202 (May 2026, B-2/K-5) after false positives. Today `ANTHROPIC_API_KEY` is used only by gmail-monitor's optional one-line summaries.

**Q4, cost and benefit of looking back.** Today the paths look back different amounts: Sync Now and its reconciliation start at the range's first day (today by default); the `schedule` cron starts at this week's Sunday (0–6 days back); the Integration Check's DB side covers the past 7 days. Looking back one more week costs one schedule page (~5 s) plus one page for each booking in that week that's new, changed or missing. With "skip unchanged" that's a few pages, except in the daily full pass, which re-opens every boarding page in the window (~5–15 boardings a week, at ~8.5 s each). The benefit: a late change (an early pickup, a changed rate, a removed stay) is caught before pay is worked out. Reconciliation can only catch a removed past stay if the past is in its window.

## 7. Direction under consideration (not decided)

One sync engine, one independent watcher, both judged by outcomes:
1. The server runs the same full sync as the button, including reconciliation, on GitHub Actions (no Vercel function time limit), on a schedule that finishes well before the 4am roster. It writes `sync_logs`, so Sync History is real.
2. The button asks the server to run that sync, and the page shows its progress and outcome (#317).
3. A failed sync alerts Kate at once, with what to do. The next scheduled run is the retry.
4. Vercel's ops-watch (the other scheduler) alerts if there's been no complete successful sync in ~26 h.
5. The Integration Check becomes a pure check, both ways, or is folded into 1.

Covers P1–P4, P6–P11, P13, P15. P5 and P12 need Kate's decisions (questions 4 and 6). P14 is #315.

## Related

#316 (vanished bookings), #317 (Sync Now), #311 (Sync History), #294 (hung syncs; parked into this), #313 (hand edits), #315 (repeated Integration Check findings), #312 (silent $0 rate, which P4 affects).
