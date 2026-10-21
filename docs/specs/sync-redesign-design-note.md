# Design note: sync redesign — #318

**Status:** revised after the architect gate (2026-10-21, session 40: "proceed with changes"). No code until Kate decides. Evidence and Kate's decisions: `docs/specs/sync-redesign-findings.md` (problems P1–P21, answers in 6a, decisions in 6b).

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
2. **Everything on Vercel.** Hobby gives 100 crons, each at most once a day, and functions up to 300 s with Fluid compute (on by default; qboard's setting to confirm). A near-term run (~12 pages, ~100 s) fits. A full pass (~10 min) doesn't.
3. **One engine, two runtimes: near-term on Vercel, full pass on GitHub.** One Node-safe engine (the regex parser, plus `runSync`'s flow and reconciliation). Near-term runs are Vercel crons calling it directly. The daily full pass is a GitHub workflow started on time by a Vercel cron (`workflow_dispatch` with the existing `GH_ACTIONS_TOKEN`). The button starts the full-pass workflow. The Integration Check only checks.
4. **One engine, all runs on GitHub, all dispatched by Vercel** (the first draft). Same engine as 3. It's one runtime, but today-and-tomorrow freshness then depends on GitHub and the token.

**Choice: 3** (the architect's simpler option). The runs that matter most (today, tomorrow) don't depend on GitHub or a token. Only the slow daily pass uses GitHub. No new secret, no paid plan.

## Before any unattended run: a site-safety PR
This ships first, on its own, and also protects today's paths:
- **One fetch for everything.** Every booking-site request (sync, forms, reconciliation, Integration Check, roster refresh) goes through one paced fetch: sequential, 1.5 s apart.
- **A typed stop.** 429, 403 or a login challenge throws `SiteThrottled`. That ends the run with no retries and skips reconciliation. `withRetry` goes: no retries inside a run, and the next scheduled run is the retry.
- **A shared circuit breaker** (`sync_settings.site_blocked_until` plus a reason):
  - Set by any login failure, 429, 403 or challenge, from any path.
  - Every path checks it before touching the site, backups included.
  - **Only cron-auth logs in.** Every other path uses the stored session or fails.
  - After a failed login, nothing logs in until Kate clears it or ~24 h pass (Kate decides which).
- **Reconciliation guard:**
  - Archive only on a positive "gone" signal: a 404, or a 200 that is neither the login page nor an appointment page.
  - Skip reconciliation when the schedule found 0 rows, or far fewer than the database expects for the window.
  - Archive at most 3 per run. Above that, archive nothing and alert.
- **A 0-row schedule fails the run** before reconciliation.

## How it works (after the safety PR)
| Run | Runs on | When (UTC; Pacific) | Window | Booking pages opened | Requests per run (est.) |
|---|---|---|---|---|---|
| **Near-term** | Vercel cron | 2×/day to start: 09:00 (2am PDT / 1am PST), 01:00 (6pm / 5pm). Add 19:00 once a week of `sync_logs` shows real counts | today, tomorrow | boardings active today or tomorrow; anything new or changed | 2 schedule + ~10 + forms ≤ 4 → **~16**, cap 40 |
| **Full pass** | GitHub, dispatched by Vercel at 07:00 (midnight PDT / 11pm PST); best-effort GitHub backup at 08:17 | 1×/day | 7 days back to ~60 ahead | every boarding in the window; new or changed; reconciliation both ways | ~10 + ~50–65 + forms ≤ 20 → **~90**, cap 150 |

- **Skip store:** bookings known not to be boardings aren't re-opened while their ID, title and link stay the same.
- **Unchanged boardings** aren't re-opened between full passes, except today's and tomorrow's (P4).
- **Daily budget:** all paths together, about **110–120 requests a day** (forms included). A daily ceiling of 250 in the database stops further runs and alerts.
- **One at a time:** the button refuses while any run is going, or within 15 min of the last. Near-term and full pass don't queue behind each other: a run that finds another running exits and logs "skipped: busy".
- **Every run writes `sync_logs`** (kind, window, requests, counts, status), so Sync History is real (P11). The button page reads it (#317).
- **Timezone:** the workflow sets `TZ=America/Los_Angeles`. Window code gets a test under `TZ=UTC`.
- **Stuck runs:** `abortStuckSync`'s cutoff goes from 30 to 60 min. The first full pass, with an empty skip store, is run once by hand with Kate watching.
- **Retired after 3 good nights:** `cron-schedule`, `cron-detail`, `cron-detail-2`, booking items in `sync_queue` (form items stay), and the Integration Check's sync-before-compare. `MONITORED_CRONS` and ops-watch's queue checks change in the same PR. `cron-auth` stays as the only path that logs in.
- **Integration Check:** check only, once a day after the full pass, both ways (P13), each finding reported once (#315).
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

## Decisions for Kate
1. **Option 3:** near-term on Vercel, full pass on GitHub. (Option 4 puts everything on GitHub.)
2. **After a failed login:** nothing logs in again until you clear it (safest), or it retries after ~24 h?
3. **Reconciliation:** archive at most 3 bookings per run; above that, archive nothing and alert?
4. **Near-term:** start at 2×/day (09:00 and 01:00 UTC), add midday after a week?
5. **Full pass window:** 7 days back to 60 days ahead (~90 requests), or 30 ahead (~55)?
6. **Button:** one at a time, at least 15 min apart?
7. **Integration Check** once a day; retire the old sync paths after 3 good nights.
8. **Confirm in Vercel:** qboard → Settings → Functions, is Fluid compute on? Option 3's near-term runs need the 300 s limit.
