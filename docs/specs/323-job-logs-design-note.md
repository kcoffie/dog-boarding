# #323 design note: detailed job logs go to a private table, public run logs keep only counts and IDs

**Status:** draft for Kate (session 55, 2026-10-29); architect not yet run. Issue #323 (`priority: high`; triage 2026-10-22: "do it", next in the #318 build order, architect gate for the new table). Build step 2 of `docs/specs/sync-redesign-design-note.md:124` ("`job_logs` table, service key only, 30-day delete; the Node entry point replaces `console.*` first; a test fails if a fixture name reaches stdout"). It has to land before #318 step 4, which moves the full sync onto GitHub Actions and would print far more.

## Problem
The repo is public, so every GitHub Actions run log is public too: anyone can read it, for 90 days (the repo's retention, `artifact-and-log-retention` = 90, the maximum). The sync code logs booking details with `console.*` to help debugging, and when it runs inside a GitHub job those lines land in the public log. Vercel function logs are private to Kate's account (and kept 1 h on Hobby), and Sync Now logs to Kate's own browser console, so neither is affected.

## Evidence (read-only, 2026-10-29)
| # | Claim | Source |
|---|---|---|
| E1 | The **Integration Check** is the job that leaks. Its 14:46 UTC run printed 16 lines with a real pet name: `Forms … Fetching forms list for pet <pet ID> (<pet name>)`, `No in-window submission for boarding <uuid> (<pet name>)`, `SyncRunner:Detail ✅ <pet name> → created`. It also prints appointment titles (`ENQUEUE <id> title="…"`) and 120-character raw HTML snippets of the pricing block (`[extractPricing] price tag matched: …`, with the site's client and pet ID attributes) | latest run log of `integration-check.yml`, matched against the `dogs` and `employees` name lists (counts only, no names printed) |
| E2 | The other jobs print no names: `gmail-monitor`, `cron-health-check`, `notify-4am`/`7am`/`friday-pm`, `ops-alert`, `keepalive` had 0 lines with a name in their latest runs. `ci` and `mutation` match only test titles ("alerts Kate") and synthetic fixtures | same check, each workflow's latest run |
| E3 | The names come from shared sync modules, not from the Integration Check script: `forms.js:259, 317`, `syncRunner.js:349, 737`, `extraction.js:576–669`, plus `mapping.js` and `schedule.js` (`schedule.js:74` prints the first booking's pet and client name: browser path only today, but it's the same module the #318 engine will run on GitHub). About 110 `console.*` calls in `src/lib/scraper/` and `scripts/integration-check.js` | `grep` |
| E4 | No client names, phone numbers or emails appear in the current or an August (08-20) Integration Check log; the `client=` matches are the site's numeric `data-client` attributes | same logs |
| E5 | **106** Integration Check runs since 2026-07-31 still have their logs (3 a day now, 00/08/16 UTC). Older logs were already deleted by the 90-day retention | `gh run list` |
| E6 | The Integration Check already has `SUPABASE_SERVICE_ROLE_KEY` as a GitHub secret (`integration-check.yml:51`), as does `cron-health-check` | workflow files |
| E7 | A run log of the Integration Check is ~1,100 lines, ~150 KB | latest run |

## Options
**A. A private Supabase table `job_logs`, written by the GitHub jobs; public stdout gets only what the entry script explicitly prints (recommended).** Each GitHub Node entry point installs one small module (`src/lib/jobLog.js`) as its first import. From then on every `console.*` call, from any module, goes into a buffer, not stdout. The buffer is saved to `job_logs` in chunks. The entry script prints its public lines with `jobLog.public(...)`: step names, counts, booking IDs, pass/fail. Private is the default, so a new log line added anywhere in the sync can't leak.
- No new secret, service or scheduler. One table, one migration (Kate runs it).
- Kate reads a run's details in the Supabase table editor (filter by job and run ID); Claude reads them with the usual scratch-script recipe.

**B. Upload the detailed log as a GitHub Actions artifact.** On a public repo, any signed-in GitHub user can download a run's artifacts, so they're no more private than the log, unless encrypted, which needs a new key and makes reading a log a chore.

**C. Only strip the details out of stdout and keep no detailed log.** Simplest, but the details are what we debug from (#344, #368 were found from them), and Vercel's 1-hour logs don't cover GitHub jobs. Against the issue's "should stay available for debugging".

(Making the repo private isn't an option: the project is a public portfolio piece, #338.)

## Choice and why
**A.** It keeps the details, makes "private" the default rather than something every new log line must remember, reuses a key the jobs already have, and is the shape the sync redesign already planned for #318's engine.

## What changes (A)
1. **Migration `031_job_logs.sql`:** table `job_logs` (`id` identity, `job` text, `run_id` text (GitHub's run ID + attempt), `seq` int, `logged_at` timestamptz default now(), `lines` jsonb: `[{ t, level, msg }]`). RLS on with **no policies**, and `revoke all` from `anon` and `authenticated`, so only the service key can read or write. Index on `(job, logged_at)`. Kate runs it and checks a signed-in select returns nothing.
2. **`src/lib/jobLog.js`:** `install({ job })` replaces `console.log/info/warn/error/debug` (formatting with `util.format`, as Node does) and returns `{ public, flush }`. Lines are saved every 200 lines and at the end, one row per chunk, so a run killed mid-way (the Integration Check's 10-minute timeout, a crash) loses at most one chunk. `SIGTERM`, an uncaught error and a normal exit all flush first. An uncaught error prints only its name and "details in job_logs, run <id>" to stdout.
3. **Entry points:** the GitHub Node scripts install it first: `scripts/integration-check.js` (the leak), and `cron-health-check.js`, `gmail-monitor.js`, `keepalive.js` (they leak nothing today, but this keeps the rule simple: every GitHub Node job). The `notify-*` and `ops-alert` workflows only `curl` a Vercel endpoint and print its status; unchanged. The #318 full pass installs it when it's built.
4. **What stays public:** booking IDs (e.g. `C63QhMFU`), counts, step names, pass/fail, the error's class. Not: pet names, appointment titles, pet or client IDs, prices, HTML, boarding UUIDs (Q1).
5. **30-day delete:** each run deletes `job_logs` rows older than 30 days for its own job after its last flush (Q2). One query per run, no new scheduler.
6. **If saving fails** (Supabase down, a bad key): the job carries on and prints one public line, "detail log not saved: <error code>"; it doesn't fail the run (the job's own outcome is what Kate depends on). ops-watch catches it (below).
7. **Docs:** REQ-662 (new), RUNBOOK "where a job's detailed log is", `docs/SESSION_HANDOFF.md` reading recipe, ADR-011.

**Not changed:** Vercel functions (`api/`), Sync Now in the browser, Telegram alerts, `cron_health`, `sync_logs`. Their logs aren't public.

## What could go wrong
- **A line that should be public is hidden:** the public log of a failed run says little. Mitigation: the entry script prints each step and its counts publicly, and the private log is one query away.
- **Losing the log exactly when it's needed** (a crash before a flush): chunks of 200 and the exit/`SIGTERM` flush keep the loss to the last chunk. How long GitHub waits between its cancel signal and the hard kill is to be checked in the build (a cancelled run on a branch shows it); if it's too short for an insert, the last chunk is lost.
- **Something prints around the shim:** Node's own warnings, `npm`, Playwright's install step. None carries booking data (E1/E2 show only our modules do). The test below would catch a module that writes to `process.stdout` directly.
- **Size:** ~150 KB a run × 3 a day × 30 days ≈ 14 MB, kept steady by the delete. Free plan: 500 MB.
- **The table holds booking details:** no more than `sync_appointments` already holds (which includes access instructions), with stricter access (no policies at all).

## Threat
- **Secrets:** none new. The jobs already use the service key; a leak of it was already a full-database leak, and this adds nothing to that.
- **Who can read `job_logs`:** only the service key (Kate in Supabase, the GitHub jobs, Vercel functions). The app's signed-in users can't (no policies; also outside #365's problem, since there is no write or read path for them).
- **Public text:** this note, the PR and the issue name no pets, clients or booking contents.

## How we'll know it's working
- **Test (fails today):** run the Integration Check's sync path on a fixture page with a synthetic pet name, capture everything written to stdout, and assert the name isn't there and is in the rows saved to the fake `job_logs`.
- **Guard test:** every `.github/workflows/*.yml` step that runs `node scripts/<x>.js` points at a script whose first import is `jobLog.js` (a new GitHub job can't forget it).
- Unit tests: chunking at 200, flush on exit, the failed-save line, the 30-day delete's cutoff, `public` reaches stdout.
- Scoped Stryker on `jobLog.js` ≥ 80%.
- **After deploy:** the next three Integration Check logs have 0 lines with a name from `dogs` (the same count as E1), and `job_logs` has their rows.

## How we'll know when it isn't
- **ops-watch** (Vercel, daily) alerts when: the Integration Check succeeded in the last 26 h but `job_logs` has no row for it in that time (saving is failing), or the oldest `job_logs` row is over 32 days old (the delete stopped).
- **A check script** `npm run check:public-logs` (Claude runs it after each deploy and at session start): downloads the latest run log of each workflow and counts lines with a name from `dogs` and `employees`; anything above 0 fails (Q4).

## Old logs
106 Integration Check run logs (since 07-31) contain pet names (E5). After this ships: delete those runs' logs with `DELETE /repos/{owner}/{repo}/actions/runs/{id}/logs` (the run stays, only its log goes), Kate's OK first (triage comment on #323). Otherwise they expire by themselves over the next 90 days (Q3).

## Questions for Kate
1. **What may stay public?** Recommended: booking IDs, counts, pass/fail only. Pet names go private too, although you've said dog names in docs are fine: one simple rule ("details are private") is easier to keep than a list of what's allowed.
2. **Keep the private details 30 days?** (The issue suggested monthly.)
3. **Old logs:** delete the 106 runs' logs once the fix is live (recommended), or let them expire?
4. **The public-logs check:** a script Claude runs (recommended: no new job), or also a daily ops-watch step (it would download logs from GitHub with ops-watch's existing token, a second use of that token: an architect question)?
