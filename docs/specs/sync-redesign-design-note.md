# Design note: sync redesign — #318

**Status:** **decided by Kate 2026-10-21 (session 40): option 3**, with the decisions at the end. Revised after the architect gate ("proceed with changes"). Build in the order below, starting next session. Evidence and Kate's decisions: `docs/specs/sync-redesign-findings.md` (problems P1–P21, answers in 6a, decisions in 6b).

## Problem
The app has to match the booking site without anyone pressing a button, and a failure has to reach Kate in a form she can act on. Today:
- **Removed bookings stay** on the roster and in pay. Only Sync Now reconciles (P1, #316), and the roster and payroll ignore what reconciliation marks (#322).
- **The real syncing is done by the checker.** The Integration Check drains the queue and then checks its own work (P3).
- **Two engines with two parsers** behave differently (findings section 2).
- **Sync Now lives in a browser tab.** It takes 48 min, dies on reload and locks the button (P9, P10, #317).
- **GitHub starts scheduled runs 4–6 h late** (P21, #321).
- **The booking-site account is Charlie's.** A limit or a lockout hurts her business. Kate's constraint: one good full sync a day is the minimum. Today, later today and tomorrow must be right; the rest can be slower (6b).

## What the architect found in today's code (verified)
These are true today, whichever option is chosen. Each one risks Charlie's account or her data.
1. **Reconciliation cancels a boarding on any error.** `isAccessDeniedPage` (`reconcile.js`) returns true for any non-OK response. So a 429, 403 or 503 during reconciliation archives the booking and cancels the boarding. Archived IDs are then skipped forever. A schedule parse that returns 0 rows would make every booking in the window a candidate.
2. **Retries are broken, and they hide the real error.** `withRetry` (`sync.js`) reads `SCRAPER_CONFIG.retryDelays`, which doesn't exist. The first error becomes `Cannot read properties of undefined (reading '0')`. That is P18's error, so the "playgroup crash" is some other first failure, masked. A 429 would be logged the same way, and the detail loop carries on to the next booking.
3. **Any path can log in.** `ensureSession` re-logs in whenever the cached session is missing. After a password change, every path would retry the wrong password every day, which is how accounts get locked.
4. **Forms are fetched unpaced.** The form drain makes up to 40 back-to-back requests per run (list plus detail, up to 20 forms).
5. **Names reach stdout.** `logger.js` gates only its file output on `DEV`. In Node every log line prints, including dog and client names.
6. **The browser parser can't run in Node.** `schedule.js` uses `DOMParser`; that's why `syncRunner.js` has a regex parser.
7. **0 rows found counts as success** in `runSync`, and reconciliation runs on that empty result.
8. **Local time.** The window and week URLs use local time. On a UTC runner, a 6 pm Pacific run thinks it's tomorrow.

## Options
1. **Patch the current pieces.** Add reconciliation to `syncRunner`, fix the requeue (P20), make the Integration Check compare both ways. Keeps two engines and the checker-as-syncer (P3), and leaves Sync Now in the tab.
2. **Everything on Vercel.** Hobby gives 100 crons, each at most once a day, and functions up to 300 s with Fluid compute (on for qboard, Kate confirmed 2026-10-21). A near-term run (~12 pages, ~100 s) fits. A full pass (~10 min) doesn't.
3. **One engine, two runtimes: near-term on Vercel, full pass on GitHub.** One Node-safe engine (the regex parser, plus `runSync`'s flow and reconciliation). Near-term runs are Vercel crons calling it directly. The daily full pass is a GitHub workflow started on time by a Vercel cron (`workflow_dispatch` with the existing `GH_ACTIONS_TOKEN`). The button starts the full-pass workflow. The Integration Check only checks.
4. **One engine, all runs on GitHub, all dispatched by Vercel** (the first draft). Same engine as 3. It's one runtime, but today-and-tomorrow freshness then depends on GitHub and the token.

**Choice: 3** (the architect's simpler option). The runs that matter most (today, tomorrow) don't depend on GitHub or a token. Only the slow daily pass uses GitHub. No new secret, no paid plan.

## Before any unattended run: a site-safety PR (#324)
This ships first and protects today's paths. The plan below comes from reading every path that touches the booking site (2026-10-21, session 41; no requests were made to the site).

### Every path that touches the booking site today
| Path | When (UTC) | Can log in | Paced | Stops on 429/403 |
|---|---|---|---|---|
| `cron-auth` | 00:00 slot (ran 00:37 on 10-21) | yes, every run (intended) | 2 requests | no |
| `cron-schedule` (`runScheduleSync`) | 00:05 slot (ran 00:14) | yes, through `ensureSession` | no: 3 week pages back to back | no |
| `cron-detail`, `cron-detail-2` (`runDetailSync`) | 00:10, 00:15 slots | yes, through `ensureSession` | 1–2 requests | no: `markFailed` uses up the item's retries |
| Roster refresh (`notify` → `refreshDaytimeSchedule`) | each roster run | yes, through `ensureSession` | 1 request | no: it doesn't check the status |
| Integration Check step 0 | 3×/day | yes, through `ensureSession` | no: up to ~43 requests back to back (3 pages + 20 detail-and-form rounds) | no: it carries on to Playwright |
| Integration Check compare (Playwright) | 3×/day | no: it loads the stored session | 1 page | no |
| Sync Now (`runSync` in the browser, through `sync-proxy`) | when pressed | yes, on nearly every press | mostly 1.5 s; the form drain isn't | no, and it's the only path that reconciles |
| Historical import (Settings → `historicalSync.js`) | when pressed | as Sync Now | as Sync Now | no: `runSync` per batch, with reconciliation, carrying on after failures |
| Local dev server (`vite.config.js` proxy) | `npm run dev` Sync Now | **yes, with an empty password**: every local Sync Now sends a failed login to the real site | — | no |
| Scripts: `scripts/drain-queue.js`, `scripts/test-cron.mjs`, `scripts/clear-session.mjs`; `test-stages.mjs` and `test-full-sync.mjs` at the repo root | by hand | `drain-queue` and `test-cron` can; the two root `test-*.mjs` are January debug scripts, deleted in PR A | — | no |

Every path except Playwright goes through two functions in `src/lib/scraper/auth.js`: `authenticate()` and `authenticatedFetch()`. The browser's calls reach the site through `api/sync-proxy.js`.

**What "gone" looks like (one request, Kate's OK, 2026-10-21 19:20 UTC):** with a valid session and redirects not followed, an archived booking's URL (`C63QhHuu`) returns **302 with `Location: https://agirlandyourdog.com/schedule`** (259 bytes, "Redirecting..."). #108's notes saw the schedule page because `fetch` follows the redirect. Today `isAccessDeniedPage` also counts any non-OK response as gone.

**How often reconciliation archives (sync_logs, 123 runs since 2026-01-11):** 0 in 118 runs, 1 in 4 runs, 4 in one run (2026-03-24). 12 archived in total. More than 10 candidates in one run has never happened. No 403, 429 or 503 appears in `sync_queue` or `cron_health_log` errors.

### Kate's decisions for #324 (2026-10-21)
1. **Only a lockout risk trips the breaker:** a rejected login, or a 429/403. A 5xx, a timeout or an unrecognised page fails that run and needs no Clear.
2. **Clear** lives on the Settings page and **logs in at once**.
3. **More than 10 candidates:** skip reconciliation without opening any. **Check first, mark at most 3.**
4. **Remove the historical import** (the daily full pass replaces it).
5. **The stored session is good for 30 h** (was 24 h); a login page in a response is the real expiry signal.

### The plan
**One paced fetch.** `authenticatedFetch` paces every request in the process 1.5 s apart, as a promise chain (Fluid compute can run two calls in one process, so not read-then-sleep). In the browser it paces the tab's calls to `sync-proxy`. Two separate jobs aren't paced against each other; the redesign's one-run-at-a-time rule closes that.

**A stop that can't be swallowed.** On a 429 or 403, `authenticatedFetch` throws `SiteThrottled` and sets a stop flag in `auth.js` (reset by `setSession` at the start of the next run). Every later request in that run throws at once without touching the site, so the loops that catch errors and carry on can't keep going. `runDetailSync` re-throws it instead of `markFailed`; `refreshDaytimeSchedule` checks the status; Integration Check step 0 skips Playwright after it. `withRetry` is deleted (it never retried: its delay list, `SCRAPER_CONFIG.retryDelays`, doesn't exist).

**The session and the breaker move to a new table, `site_access`:** one row (a boolean primary key), row-level security on and no policies, so only the service key can read or write it.
- Columns: `session_cookies`, `session_expires_at` (moved from `sync_settings`), `blocked_at`, `blocked_reason`, `cleared_at`, `cleared_by`.
- **One way in:** `getSiteSession(supabase)` replaces `ensureSession`. It returns the cookie, or throws `SITE_BLOCKED` or `NO_SESSION`, and fails closed if the read fails. It never logs in. Every Node path calls it.
- **Trips** (first trip wins; later ones don't change the reason or alert again): a rejected login in `cron-auth`, or a 429/403 anywhere. In Node, `authenticatedFetch` trips it where the error happens (`setSession(cookies, { expiryMs, supabase })` gives it the client; today's signature is `setSession(cookies, expiryMs)`). In the browser, `sync-proxy` trips it on the server.
- **The session stays on the server.** `sync-proxy` checks the breaker, adds the stored cookie itself, follows no redirects, passes status and `Location` back, and allows only the site's sync paths (schedule, appointment, forms). Its `authenticate` action and the browser's `isAuthenticated()` checks (`runSync`, `schedule.js`, `extraction.js`) go.
- **Only cron-auth and Clear log in,** through one shared login function that checks the breaker first. A rejected session is cleared and that run fails; the next `cron-auth` or Clear logs in.
- A blocked run exits with `action: 'site_blocked'` and touches nothing. It isn't a cron failure, because the breaker has already alerted; ops-watch keeps reporting it (below), and the roster's own refresh warning doesn't repeat it.

**Clear:** a Settings section shows "Booking site blocked since <time>: <reason>" and a **Clear** button. `POST /api/site-access` (`verifyUser`) clears it in one conditional update (only while blocked, so a double press means one login), records who and when, then runs `cron-auth`'s login. A failed login trips it again with a new alert. `GET /api/site-access` returns `{ blocked, reason, since }` only.

**The alert** (Telegram, `alertAndLog`, once per trip): what happened, that nothing will contact the booking site until it's cleared, what the roster uses, and for a rejected login: "update the password in Vercel before you press Clear". Example: "Booking site blocked 00:05 PDT: it answered 429 (too many requests) during the schedule scan. Nothing will contact it until you press Clear in Settings: <link>. The roster uses the data already in the app." ops-watch adds a daily finding while it stays blocked, and `site-access` joins its `ALERT_JOBS`, so an undelivered trip alert is a finding too.

**Reconciliation guard** (only Sync Now reconciles until the new engine):
- **Gone** = a 302 whose `Location` path is exactly `/schedule`. Anything else isn't gone.
- **Stop, mark nothing, no trip:** a redirect elsewhere (a redirect to the login page also means the session failed), a 5xx, or an unrecognised page. A 429/403 stops and trips.
- **More than 10 candidates:** skip without opening any, and report it.
- **Check first, mark after:** open every candidate, then mark only if 3 or fewer are gone; more than 3, mark none and report it.
- Sync Now runs in the browser, so "report" means the run's result and `sync_logs`; a Telegram alert for these comes with the server-side engine.

**0 rows fails the run:** 0 appointments across the whole schedule scan (not per page) fails `runSync` and `runScheduleSync` before anything else.

### Two PRs
- **A (code only, no schema):** the paced fetch, `SiteThrottled` and the stop flag (with the re-throws above), removing `withRetry`, the reconciliation guard (with `sync-proxy` passing status and `Location`, no redirects), 0 rows fails, removing the historical import, deleting the dev-server login proxy and the two `test-*.mjs` files.
- **B (new table, architect gate passed with changes; built 2026-10-21, session 42):** `site_access`, `getSiteSession`, the breaker, only cron-auth and Clear log in, `sync-proxy` adds the cookie on the server, Clear, the alert, ops-watch, the 30 h stamp. **Order:** migration (create `site_access`, copy the session in), then deploy B, then drop the old columns in a later PR after one good night. Every step outside 23:30–01:30 UTC. The old columns were added by hand, so the migration is written against production's real schema.
  - **As built:** `sync-proxy` stays on the Edge runtime (it already ran there); it reads `site_access` with the service key. Whether Edge `fetch` with `redirect: 'manual'` returns the real 302 and `Location` is checked on a preview: if it doesn't, reconciliation stops and marks nothing (safe). Clear works only while blocked; a missing session (not blocked) waits for the next `cron-auth`.

### Tests (from the rules; each seen failing)
- A second request waits until 1.5 s after the first; two concurrent calls are still 1.5 s apart.
- A 429 and a 403 each throw `SiteThrottled`; after one, the next request in the run throws without a fetch; `runDetailSync` doesn't mark the item failed.
- Reconciliation: a 302 to `/schedule` is gone; a 302 to the login page, a 200, a 500 and an unknown page are not, and stop the loop; 11 candidates open nothing; 4 gone marks none; 3 gone marks 3.
- 0 rows across the scan fails the run before reconciliation; 0 on one page of three doesn't.
- Breaker: a 429 trips it once (one alert for two trips); each listed path makes no request while it's tripped; `getSiteSession` never logs in and fails closed; Clear records the user and logs in once for two presses; a rejected login re-trips it; `GET /api/site-access` never returns the cookie; `sync-proxy` fetches only the site's sync paths, follows no redirects and never returns the cookie; `site_access` can't be read with the anon key.
- A 5xx, a timeout and an unrecognised page don't trip the breaker; a second trip keeps the first reason; a blocked run returns `site_blocked` and isn't a cron failure; the stored session's stamp is 30 h.
- The stop flag resets at the next run's `setSession`; `refreshDaytimeSchedule` returns a warning on a 429; Integration Check skips Playwright after `SiteThrottled`.
- 10 candidates opens all 10 (11 opens none).

## How it works (after the safety PR)
| Run | Runs on | When (UTC; Pacific) | Window | Booking pages opened | Requests per run (est.) |
|---|---|---|---|---|---|
| **Near-term** | Vercel cron | 2×/day to start: 09:00 (2am PDT / 1am PST), 01:00 (6pm / 5pm). Add 19:00 once a week of `sync_logs` shows real counts | today, tomorrow | boardings active today or tomorrow; anything new or changed | 2 schedule + ~10 + forms ≤ 4 → **~16**, cap 40 |
| **Full pass** | GitHub, dispatched by Vercel at 07:00 (midnight PDT / 11pm PST); best-effort GitHub backup at 08:17 | 1×/day | 7 days back to 45 days ahead (Kate) | every boarding in the window; new or changed; reconciliation both ways | ~8 + ~40–50 + forms ≤ 20 → **~75**, cap 150 |

- **Skip store:** bookings known not to be boardings aren't re-opened while their ID, title and link stay the same.
- **Unchanged boardings** aren't re-opened between full passes, except today's and tomorrow's (P4).
- **Daily budget:** all paths together, about **110–120 requests a day** (forms included). A daily ceiling of 250 in the database stops further runs and alerts.
- **One at a time:** the button refuses while any run is going, or within 15 min of the last. Near-term and full pass don't queue behind each other: a run that finds another running exits and logs "skipped: busy".
- **Every run writes `sync_logs`** (kind, window, requests, counts, status), so Sync History is real (P11). The button page reads it (#317).
- **Timezone:** the workflow sets `TZ=America/Los_Angeles`. Window code gets a test under `TZ=UTC`.
- **Stuck runs:** `abortStuckSync`'s cutoff goes from 30 to 60 min. The first full pass, with an empty skip store, is run once by hand with Kate watching.
- **Retired after 3 good nights:** `cron-schedule`, `cron-detail`, `cron-detail-2`, booking items in `sync_queue` (form items stay), and the Integration Check's sync-before-compare. `MONITORED_CRONS` and ops-watch's queue checks change in the same PR. `cron-auth` stays; it and Clear are the only paths that log in.
- **Integration Check:** check only, once a day, both ways (P13), each finding reported once (#315). Dispatched by Vercel at 08:30 UTC, after the full pass (07:00 + up to 59 min of jitter + ~10 min). It stays a separate run, so the checker never checks its own work.
- **ADR:** a new ADR supersedes ADR-002 ("sync on Vercel crons").

## Build order (each a PR with tests written from the REQs and a reviewer pass)
0. #322: roster and payroll treat a cancelled boarding as gone.
1. Site-safety PR (above).
2. Private job logs (#323): `job_logs` table, service key only, 30-day delete. **The Node entry point replaces `console.*` first**, so stdout gets only counts and IDs. A test fails if a fixture name reaches stdout.
3. One Node-safe engine: the regex parser becomes the only schedule parser (a parity test against today's fixtures, then the `DOMParser` one goes). Plus run kind, window and requests in `sync_logs` (a migration) and the skip store. This is the big one: new code in a 781-line file with no mutation score.
4. Full pass on GitHub, dispatched by Vercel, alongside the old paths until 3 good nights.
5. Near-term runs on Vercel. The roster moves to a Vercel trigger too (#321).
6. Retire the old paths; Integration Check check-only.
7. Button (#317) and Sync History (#311).
8. Drift list (#313), with its own short note.

## What breaks
- **Layout change:** the parse-degradation check (REQ-110) and the 0-row floor fail the run; the Playwright check disagrees. Both alert.
- **Password change:** cron-auth's login fails once, trips the breaker, and Kate gets one alert. Nothing else tries to log in.
- **Throttling:** the run stops at the first 429 or 403 and the breaker trips. Nothing is archived.
- **A dispatch fails** (token expired 2027-10-19, GitHub down): the dispatching Vercel function alerts at once on any non-2xx response. The backup at 08:17 may still run; GitHub can drop scheduled runs, so it's best effort.
- **Vercel cron skipped:** the full pass's GitHub backup still runs; near-term has no backup, and ops-watch reports the miss.
- **DST:** UTC times keep the same order in PDT and PST. The 09:00 near-term run stays before the 11:00 roster even 59 min late.
- **GitHub schedules disabled after 60 days:** only the backup uses a schedule, and `keepalive.yml` covers it.

## Threat
- **No new secret.** The booking-site login is already a GitHub secret (Integration Check) and a Vercel env var. `GH_ACTIONS_TOKEN` (fine-grained, this repo, Actions read/write) gains one use: dispatching the full pass from a Vercel cron and from the signed-in button endpoint. Any signed-in user could start a full pass, limited by one-at-a-time, the 15-min gap and the daily budget. The token becomes a single point of failure for the full pass, so a failed dispatch alerts.
- **Public repo and logs:** stdout carries only counts, IDs and status (build step 2). Details go to `job_logs`.
- **The account:** one paced fetch, stop on the first sign of throttling, one login path, a breaker, a daily budget, about 110–120 requests a day.

## How we'll know it's working (and when it isn't)
- **A failed run alerts at once** (Telegram, `alertAndLog`; exit 1 if the alert fails). It says what happened, what the roster will use, and gives one link to re-run from a phone. Example: "Full sync stopped 00:12 PDT: the booking site refused the login. Nothing will log in again until you clear it. The 4am roster uses yesterday's data. Re-run: <link>".
- **ops-watch** (Vercel; it watches the GitHub full pass, and its near-term checks read outcomes in `sync_logs`) alerts on: no finished full pass in 26 h; no near-term success before the roster; a missed slot; the breaker tripped; the daily budget hit. GitHub's `cron-health-check` alerts if ops-watch didn't run.
- **The Integration Check** alerts when the app and the site disagree, either way.
- **Sync History** shows each run with its kind, requests and status.

## Kate's decisions (2026-10-21)
1. **Option 3:** near-term runs on Vercel (Fluid compute is on for qboard, so functions get 300 s), full pass on GitHub dispatched by Vercel.
2. **After a failed login, nothing logs in again until Kate clears the flag.** The alert must say clearly what happened and how to clear it.
3. **Reconciliation archives at most 3 bookings per run;** above that it archives nothing and alerts. *(Refined 2026-10-21 for #324: skip above 10 candidates, check first; a browser run reports in its result and `sync_logs`, Telegram comes with the server-side engine.)*
4. **Near-term runs 2×/day** (09:00 and 01:00 UTC = 2am and 6pm PDT); add midday after a week of real counts.
5. **Full pass window: 7 days back to 45 days ahead.**
6. **Button:** one run at a time, at least 15 min apart.
7. **Integration Check once a day** (check only, both ways), and **retire the old sync paths after 3 good nights** in a row.

### What those two things are (checked in the code, 2026-10-21)
- **Integration Check** (`scripts/integration-check.js`, GitHub workflow `integration-check.yml`, scheduled 00:00, 08:00 and 16:00 UTC; GitHub starts it hours late). Each run:
  - Step 0: it runs a sync itself: the same schedule scan as the Vercel cron, then up to 20 queued bookings. If that fails, it carries on.
  - Then it opens the booking site's schedule page in a real headless browser (Playwright), reads the booking links on the page, and compares them with the app's boardings from 7 days ago to 7 days ahead.
  - It flags bookings on the page that aren't in the app, boardings with an "Unknown" dog name, and today's daycare and playgroup visits that are on the page but not in the app. It never checks the other way (in the app but gone from the site).
  - The 08:00 run always sends its report to Telegram. The other two send only when something is wrong. It fails (red run) only when a needed report couldn't be delivered.
  - After the redesign: step 0 goes, it compares both ways, and it runs once a day after the full pass.
- **The old sync paths** to retire:
  - **The Vercel crons** `cron-schedule` (00:05 UTC, scans 3 week pages and queues bookings), `cron-detail` and `cron-detail-2` (00:10 and 00:15, each processes one queued booking).
  - **The Integration Check's step 0.**
  - **The booking items in `sync_queue`.** Form items stay.
  - `cron-auth` (00:00, signs in to the booking site once a day) **stays**; it and Clear are the only paths allowed to log in.
