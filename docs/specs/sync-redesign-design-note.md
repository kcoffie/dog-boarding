# Design note: sync redesign — #318

**Status:** draft for the architect gate and Kate's decision, 2026-10-21 (session 40). No code until Kate decides. Evidence and Kate's decisions so far: `docs/specs/sync-redesign-findings.md` (problems P1–P21, answers in 6a, decisions in 6b).

## Problem
The app has to match the booking site without anyone pressing a button, and a failure has to reach Kate in a form she can act on. Today:
- **Removed bookings stay** on the roster and in pay. Only Sync Now reconciles (P1, #316), and the roster and payroll ignore what reconciliation marks (#322).
- **The real syncing is done by the checker.** The Integration Check drains the queue and then checks its own work (P3). The Vercel crons fetch two bookings a day (P2).
- **Two engines with two parsers** (`sync.js` in the browser, `syncRunner.js` on the server) behave differently (section 2).
- **Sync Now lives in a browser tab.** It takes 48 min, dies on reload and locks the button (P9, P10, #317).
- **GitHub starts scheduled runs 4–6 h late** (P21, #321).
- **The booking-site account is Charlie's.** Hitting a limit or getting it locked hurts her business. Kate's constraint: one good full sync a day is an OK minimum. Today, later today and tomorrow must be right; the rest can be slower (6b).

## Options
1. **Patch the current pieces.** Add reconciliation to `syncRunner`, stop the playgroup re-queue (P20), make the Integration Check compare both ways, and move its schedule to a dispatch. Least new code. But it keeps two engines, the checker still does the syncing, Vercel's queue still moves two bookings a day, and Sync Now stays in the tab. It fixes symptoms and leaves P3, P9 and P10.
2. **Run the full engine on Vercel.** Not possible on Hobby: each cron path runs once a day, and a function's time limit is far below a 10–25 min sync (exact limit to verify). Vercel Pro (paid) lifts both, at a monthly cost, and the sync would still run in a function with a time limit.
3. **One engine on GitHub Actions, started on time by Vercel.** `runSync` (the browser's engine, with reconciliation) runs in Node in a GitHub workflow, which has no short time limit (6a Q1: three small changes). A Vercel cron starts each run with `workflow_dispatch` using the `GH_ACTIONS_TOKEN` already in Vercel, so runs start within Vercel's hour, not 4–6 h late. The button starts the same workflow. The Integration Check stops syncing and only checks.

**Choice: 3.** It's the only option that leaves one engine, a checker that doesn't check its own work, a button that survives a reload, and on-time starts, with no new secret and no paid plan.

## How it works
Two kinds of run of the same engine, one at a time (one GitHub `concurrency` group for both and for the button):

| Run | When (UTC; Pacific in brackets) | Window | Opens which booking pages | Pages per run (est.) |
|---|---|---|---|---|
| **Near-term** | 3×/day: 09:00 (2am PDT / 1am PST), 19:00 (noon / 11am), 01:00 (6pm / 5pm) | today and tomorrow | every boarding active today or tomorrow, plus anything new or changed on the schedule page | 2 schedule + ~10 = **~12** (~2 min) |
| **Full pass** | 1×/day: 07:00 (midnight PDT / 11pm PST) | 7 days back to ~60 days ahead (Kate: look back once a day at most) | every boarding in the window, plus new or changed items; reconciliation both ways | ~10 schedule + ~50–65 boardings + a few reconciliation checks = **~70** (~10 min) |

- **Not re-opened, ever:** bookings already known not to be boardings (playgroup and daycare series, same-day visits) while their title and link stay the same. The engine stores each skip decision with the booking's ID, title and link, and re-opens it only when one of those changes. This removes most of today's ~150 fetched-and-thrown-away pages (Q2) and the playgroup parser crashes (P18, P20).
- **Not re-opened between full passes:** boardings whose title and link haven't changed, except today's and tomorrow's (near-term runs re-open those, because rate and dog changes don't show on the schedule page, P4).
- **Total load:** ~70 + 3 × 12 + the Integration Check's ~2 = **about 110 pages a day**, close to today's ~90 and well under one Sync Now press per run. Requests stay one at a time, 1.5 s apart.
- **Booking-site safety:** a run **stops at the first 429, 403 or login challenge** and alerts. It doesn't retry, and the next scheduled run tries again. A run also stops at a hard cap (300 pages), which protects against a loop. The button refuses to start while a run is going, or within 15 min of the last one.
- **Backup schedule:** each workflow also has a GitHub `schedule` an hour after its Vercel time. When it starts, it exits at once if a run of the same kind already succeeded in that slot. So if Vercel's cron is down, GitHub's late start still runs the sync, with no double load.
- **Every run writes `sync_logs`** (kind, window, pages fetched, counts, status), so Sync History and "Last Sync" show real runs (P11). The button page reads that row, so a reload loses nothing (#317).
- **Retired, after 3 good nights in a row:** `cron-schedule`, `cron-detail`, `cron-detail-2` and the booking items in `sync_queue` (form items stay; `runSync` drains them). Also the Integration Check's sync-before-compare. `cron-auth` stays (one login a day; `ensureSession` self-heals). `MONITORED_CRONS` and ops-watch's queue checks change in the same PR (6a Q10).
- **Integration Check:** check only, **once a day** after the full pass. It compares both ways: on the site but not in the app, and in the app but gone from the site (P13). It uses its independent Playwright reader, and a finding it already reported isn't reported again (#315, P14).

## Build order (each a PR with its own tests and reviewer pass)
0. #322: the roster and payroll treat a cancelled boarding as gone (next session, before any of this).
1. Private job logs (#323): a `job_logs` table, readable only with the service key, deleted after 30 days. Public run logs keep only counts, IDs and pass/fail. This comes first, because the server sync logs far more than today's jobs.
2. Full pass on GitHub, dispatched by Vercel, writing `sync_logs`, with its alert and the ops-watch check. It runs alongside the old paths until 3 good nights.
3. Near-term runs. The same dispatch fixes the late roster (#321).
4. Retire the old paths; Integration Check becomes check-only, both ways, once a day.
5. The button starts the workflow (#317), and Sync History shows the runs (#311).
6. Drift list for hand edits (#313, Kate 6b: the app wins until the site changes). This changes what the sync may overwrite, so it gets its own short note.

## What breaks
- **Untested engine:** `sync.js` (781 lines) predates the 2026-10-16 gates and has no mutation score. Before it runs unattended, the Node entry point, the skip store, the stop-on-429 rule and reconciliation get tests written from the REQs (#239 scope).
- **A booking-site layout change** breaks the parser for every run kind at once. The parse-degradation check (REQ-110) marks the run, and the independent Playwright check disagrees. Both alert.
- **Login failure:** the run alerts with "booking-site login failed" and stops. Nothing is written, so yesterday's data stands. A run that saves nothing must not look like "no changes": the log records pages fetched, and a full pass with 0 schedule rows is a failure, not an empty day.
- **DST:** the times are fixed in UTC. Every slot above stays in the right order in both PDT and PST. The near-term run stays before the 11:00 UTC roster even when Vercel starts it 59 min late.
- **A run killed mid-way** (runner lost, cancelled) leaves a `running` row. The next run marks rows older than 60 min as failed, and ops-watch counts only finished successes.
- **GitHub disables schedules after 60 days:** the dispatches don't depend on schedules, and `keepalive.yml` keeps the backups alive.
- **Supabase free tier pausing:** the daily runs keep it active.

## Threat
- **No new secret.** The booking-site login is already in GitHub secrets (the Integration Check uses it). `GH_ACTIONS_TOKEN` (fine-grained, this repo, Actions read and write) is already in Vercel. It gains a second use: a signed-in endpoint that dispatches the sync. Any signed-in user could then start a sync. That's limited by the one-at-a-time group, the 15-min gap and the page cap. A leaked token could start workflows, which hits the same limits.
- **Public repo:** the workflow logs only counts, booking IDs and status. Details go to `job_logs` (step 1). No client names in run logs, step summaries or issues.
- **The booking-site account:** paced, sequential requests; stop on the first sign of throttling; no retries inside a run; about 110 pages a day.

## How we'll know it's working (and when it isn't)
- **A failed run alerts Kate at once** (Telegram, `alertAndLog`). If the alert itself fails, the run exits 1. The message says what happened, what the roster will use, and gives one link to re-run the workflow from a phone. Example: "Full sync failed 00:12 PDT: booking-site login rejected. The 4am roster will use yesterday's data. Re-run: <link>".
- **ops-watch** (Vercel, a different scheduler from the GitHub runs) alerts when there's no finished full pass in 26 h, no near-term success before the roster, or a run hit the page cap. GitHub's `cron-health-check` still alerts when ops-watch didn't run.
- **The Integration Check** independently alerts when the app and the site disagree either way.
- **Load is visible:** pages fetched per run and per day are in `sync_logs`. Over about 150 a day is a finding.
- **Sync History** shows each run, its kind, its counts and its status.

## Decisions for Kate
1. Option 3 as the direction?
2. Near-term runs 3×/day (09:00, 19:00, 01:00 UTC), about 36 pages a day. Or 2×/day (drop 19:00), about 24.
3. The full pass window: 7 days back (agreed) to how far ahead: 60 days (~70 pages), or 30 (~40)?
4. The button: 15 min minimum between runs, and one at a time. OK?
5. The Integration Check once a day instead of three times.
6. Retire the old sync paths after 3 good nights in a row.
