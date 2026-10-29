# #323 design note: detailed job logs go to a private table, public run logs keep only counts and IDs

**Status:** Kate answered Q1–Q4 (session 55, 2026-10-29); architect: proceed with changes (folded in below, same day). Issue #323 (`priority: high`; triage 2026-10-22: "do it", next in the #318 build order, architect gate for the new table). Build step 2 of `docs/specs/sync-redesign-design-note.md:124` ("`job_logs` table, service key only, 30-day delete; the Node entry point replaces `console.*` first; a test fails if a fixture name reaches stdout"). It has to land before #318 step 4, which moves the full sync onto GitHub Actions and would print far more.

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
1. **Migration `031_job_logs.sql`:** table `job_logs` (`id` identity, `job` text, `run_id` text (GitHub's run ID + attempt), `seq` int, `logged_at` timestamptz default now(), `lines` jsonb: `[{ t, level, msg }]`). RLS on with **no policies** (as `028_add_site_access.sql:29-30`), plus `revoke all` from `anon` and `authenticated`, so only the service key can read or write. Index on `(job, logged_at)`. Kate runs it and checks that a signed-in select is refused (permission denied, 42501).
2. **`src/lib/jobLog.js`:** `install({ job })` replaces `console.log/info/warn/error/debug` (formatting with `util.format`, as Node does; each line capped at 2 KB) and returns `{ public, flush, exit }`. `logger.js:68-83` and `fileLogger.js:29-32` look `console.*` up at call time, and nothing in `scripts/` or `src/lib/` writes to `process.stdout`/`stderr` directly (architect), so the shim catches every line. `public` and jobLog's own messages (including a failed save) write through the **saved original** `console`, never back into the buffer.
   - **Chunks:** saved every 200 lines (~6 inserts per Integration Check run), one row per chunk, so a run killed mid-way loses at most one chunk.
   - **Exits:** `process.exit()` skips async work and Node runs only synchronous `exit` listeners, so a normal exit can't flush by itself. Every exit goes through `jobLog.exit(code)`, which awaits `flush()` with a 5 s cap and then calls `process.exit(code)`. That covers `integration-check.js:460, 509, 519, 525, 533, 537, 575, 582`, `cron-health-check.js:280` and `gmail-monitor.js:497`.
   - **Signals and crashes:** GitHub's cancel and `timeout-minutes` send SIGINT, then SIGTERM, then a hard kill (the gaps, about 7.5 s and 2.5 s by the architect's recollection, are confirmed on a cancelled branch run during the build). `SIGINT`, `SIGTERM`, `uncaughtException` and `unhandledRejection` all run the capped flush (an `AbortSignal` on the insert) and then exit. A handled signal stops Node exiting on its own, so the handler must exit. `unhandledRejection` matters because Node prints a rejection's full message straight to stderr, bypassing `console`, and messages can carry IDs (`forms.js:266`). An uncaught error prints only its name and "details in job_logs, run <id>".
3. **Installed only when the script runs as a job:** inside each script's `process.argv[1]?.endsWith(...)` guard (e.g. `integration-check.js:579`), not as an import side effect. Four test files import the entry scripts (`integrationCheckReport.test.js:20`, `integrationCheckSession.test.js:16, 43`, `cronHealthCheckAlert.test.js:37-38`, `gmailMonitorForward.test.js:22, 67`), and `GITHUB_ACTIONS=true` is set in CI too, so that can't be the gate. None of the imported modules logs at module scope, so installing in the guard loses nothing.
4. **Which jobs:** `scripts/integration-check.js` (the leak), `cron-health-check.js` and `gmail-monitor.js` (they leak nothing today; they already have the service key). **Not `keepalive.js`:** it has only `GITHUB_TOKEN` (`keepalive.yml:26-29`), prints no booking data, and its `::error::` annotations (`keepalive.js:45-53`) are its only visible signal; adding the service key there would be a new use of a secret. `notify-4am`, `notify-7am`, `notify-830am`, `notify-friday-pm`, `notify-intraday` and `ops-alert` only `curl` a Vercel endpoint and print its status: unchanged. The #318 full pass installs it when it's built.
5. **What stays public:** booking IDs (e.g. `C63QhMFU`), counts, step names, pass/fail, the error's class, and **"alert delivered: yes/no"** (the entry script prints it, since `alertAndLog`'s "alert NOT delivered" and `sendAlert`'s errors, `alertKate.js:43, 60, 66, 94`, go private; Telegram is unaffected). Private: pet names, appointment titles, pet or client IDs, prices, HTML, boarding UUIDs, the final report (`integration-check.js:572`) and Playwright's error text (`:535`, it carries URLs and selectors) (Q1). The workflow never sets `DEBUG=pw:*`.
6. **30-day delete:** after its last flush, each run deletes `job_logs` rows older than 30 days **for every job**, so a job that stops or is retired (#318 step 6) doesn't leave rows behind (Q2). One query per run, no new scheduler.
7. **If saving fails** (Supabase down, a bad key): the job carries on and prints one public line, "detail log not saved: <error code>"; it doesn't fail the run (the job's own outcome is what Kate depends on). ops-watch catches it (below).
8. **Docs:** REQ-662 (new), RUNBOOK "where a job's detailed log is", `docs/SESSION_HANDOFF.md` reading recipe, ADR-011.

**Not changed:** Vercel functions (`api/`), Sync Now in the browser, Telegram alerts, `cron_health`, `sync_logs`. Their logs aren't public.

## What could go wrong
- **A line that should be public is hidden:** the public log of a failed run says little. Mitigation: the entry script prints each step, its counts and whether the alert was delivered; the private log is one query away.
- **Losing the log exactly when it's needed** (a crash or a cancel): chunks of 200 and the capped flush on every exit, signal and crash keep the loss to the last chunk. If the measured gap before the hard kill is too short for an insert, the last chunk is lost and the public line says so.
- **Something prints around the shim:** Node's own warnings, `npm`, Playwright's install step. None carries booking data (E1/E2 show only our modules do). The stdout test below would catch a module that writes to `process.stdout` directly.
- **Size:** ~150 KB a run × 3 a day × 30 days ≈ 14 MB, kept steady by the delete (the hourly `gmail-monitor` adds many small rows). Free plan: 500 MB.
- **The table holds booking details:** no more than `sync_appointments` already holds (which includes access instructions), with stricter access (no policies at all).

## Threat
- **Secrets:** none new (keepalive is left out). The jobs already use the service key; a leak of it was already a full-database leak, and this adds nothing to that.
- **Who can read `job_logs`:** only the service key (Kate in Supabase, the GitHub jobs, Vercel functions). The app's signed-in users can't. This is separate from #365 (signed-in users can write synced tables).
- **Public text:** this note, the PR and the issue name no pets, clients or booking contents. The check script's output is counts only.

## How we'll know it's working
- **Test (fails today):** run the Integration Check's sync path on a fixture page with a synthetic pet name, capture everything written to stdout and stderr, and assert the name isn't there and is in the rows saved to the fake `job_logs`.
- **Guard test:** every `.github/workflows/*.yml` step that runs `node scripts/<x>.js` points at a script that installs `jobLog` in its run guard, except an allow-list with reasons (`keepalive.js`), so a new GitHub job can't forget it.
- Unit tests: chunking at 200; the last chunk is saved when the script exits through `jobLog.exit`; SIGINT/SIGTERM/`unhandledRejection` flush then exit; the 5 s cap; the failed-save line goes to the real stdout, not the buffer; the 2 KB line cap; the 30-day delete's cutoff across all jobs; `public` reaches stdout.
- Scoped Stryker on `jobLog.js` ≥ 80%.
- **After deploy:** the next three Integration Check logs have 0 lines with a name from `dogs` (the same count as E1), and `job_logs` has their rows.

## How we'll know when it isn't
- **ops-watch** (Vercel, daily) alerts when: the Integration Check's last scheduled success has no `job_logs` row with its run ID (`loadLastSuccess`, `api/ops-watch.js:105-121`, already reads that run from GitHub; it returns `workflow_runs[0].id` too), or the oldest `job_logs` row is over 32 days old (the delete stopped). No new token: ops-watch already reads that run.
- **A check script** `npm run check:public-logs` (Claude runs it after each deploy and at session start, Q4): downloads the latest run log of the jobs that run sync code (`integration-check`, `cron-health-check`, `gmail-monitor`; not `ci`/`mutation`, whose test titles name staff on purpose) and counts lines with a whole-word, case-sensitive match on a `dogs`/`employees` name of 4+ letters. Anything above 0 fails. It prints counts only. Tokens: the local `gh` login (downloading logs needs one, even on a public repo) and the service key in `.env.local` for the name lists.

## Old logs
106 Integration Check run logs (since 07-31) contain pet names (E5). After this ships: delete those runs' logs with `DELETE /repos/{owner}/{repo}/actions/runs/{id}/logs` (the run stays, only its log goes; whether it also removes re-run attempts' logs is checked on one run first), Kate's OK first (triage comment on #323). It runs with Kate's `gh` login; if the tooling blocks Claude from the deletes, Kate runs one `!` command (Q3).

## Questions for Kate (answered 2026-10-29)
1. ~~What may stay public?~~ **Booking IDs, counts and pass/fail only; pet names are private too** (Kate).
2. ~~Keep the private details 30 days?~~ **Yes, 30 days** (Kate).
3. ~~Old logs?~~ **Delete the 106 runs' logs once the fix is live** (Kate; any run between now and then is added to the list).
4. ~~The public-logs check?~~ **A script Claude runs** (`npm run check:public-logs`, after each deploy and at session start); no ops-watch step, so ops-watch's token keeps its one use (Kate).
