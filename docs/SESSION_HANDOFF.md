# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 16, 2026, 23:50 UTC (session 33, end). Production recovered and is watched again. Two steps wait on Kate: `GH_ACTIONS_TOKEN` in Vercel, and pushing the history rewrite. First job next session: confirm the schedules run green on Node 22.

---

## ▶ START HERE (every session)

1. **Read this file to the end, then `docs/ENGINEERING_PROCESS.md`** (team gates). Check the baseline before changing anything: `git status`, `npm run test:run`, open PRs and issues.
2. **Kate's rules:**
   - Work on branches and never commit to `main`. Commit and push each green chunk; Kate merges.
   - Use `type: description (#issue)` commits. Never add AI attribution: no Co-Authored-By, no Claude-Session, no session links. The hook and CI reject them, and they overrule Claude Code's per-session reminder.
   - Tests must catch bugs, not just exist. Follow the good-tests rules and report the mutation score, not just "N tests pass".
   - Give options as one line each with real counts, then one recommendation.
   - Ask before sending any WhatsApp message, re-enabling workflows, adding secrets or changing repo settings.
3. **Shell:** `gh` is aliased to `history | grep`, so always type `command gh …`.
4. **Gates:** run the `architect` agent on the design note before a new job, service, secret or table. Run the `reviewer` agent before every PR. A new scheduled job ships with its failure alert, and that alert must run outside the job's own scheduler.
5. **New code only:** the gates cover code written from 2026-10-16 on. Bringing older code up to the same bar is #239.

---

## Session 34 (2026-10-18, Sunday)
- **Node 22 schedules are green:** 21 of 21 runs since #253. #252 closed. GitHub is firing Gmail Monitor (hourly) only 5–6 times a day and hours late; in August it fired 23 a day. That's the GitHub scheduler, not our code.
- **ops-watch has never run:** there's no `cron_health` row for `ops-watch`. Cron Health Check reported this to Kate on 10-17 and 10-18 (the watcher works). Likely cause: `CRON_SECRET` is missing in Vercel, so every call gets 401. That also means the older crons are running only because they fail open, so **don't ship the fail-closed fix until `CRON_SECRET` is confirmed set**. Asked Kate.
- **Production checks:**
  - sync queue at 0 (Integration Check drains it 3× a day; the Vercel detail crons do 2 items a day)
  - roster image 200 `image/png` (it takes `?token=`, not a bearer header)
- **History rewrite NOT pushed yet.** Rebuilt and verified on 10-18 (388 commits, main `af1e510`). **Merge freeze** until Kate pushes, then rebuild if main moved.
- **#239 slice 1: PR #256** (open, waits for the freeze to end). 114 tests for notify plus the sync crons; scoped mutation 0% → 83.27%. Ratchet 35 → 37. CI scores on main logged.
- **New: #255.** A notify send where every recipient fails still returns 200 and stores the hash, so 7am and 8:30 skip. Needs Kate's REQ decision.
- **Monday 10-19:** confirm the 4am roster was sent **and delivered**, then close #246.
- **#239 next:** `syncRunner.js` (229 survived or uncovered), `pictureOfDay.js` (195), then `sync-proxy.js`.

## Current State (2026-10-16, end of session 33)

### Production
- **WhatsApp works.** The Friday roster was sent by hand at 22:58 UTC: `delivered` to both recipients and `read` by Kate. K-8 isn't blocking.
- **Sync caught up.** The 880-item queue was drained to 0 by `scripts/drain-queue.js`: 835 skipped, 39 boardings created, 1 updated, 17 forms.
- **All 10 workflows are active, and schedules resumed.** The first one fired at 23:34 UTC (Gmail Monitor). That run **failed**: supabase-js 2.117 (from #240) needs Node 22 and the workflows ran Node 20. **Fixed in #253** (#252): every workflow is now on Node 22. **Not yet seen green:** the next Gmail Monitor run (around 00:15 UTC) is the first one on Node 22.
- **Image crash fixed (#246 / #247).** satori 0.35 crashed every image function on Vercel. It's pinned at 0.26.0 and the production weekend image is verified at 200 `image/png`.
- **ops-watch is live (#250, REQ-651).** Vercel cron, daily 17:00–17:59 UTC. Requests without `CRON_SECRET` get 401 (verified). **It needs `GH_ACTIONS_TOKEN` in Vercel.** Until then it alerts "Couldn't check the scheduled workflows".
- **Expected false alarm:** tonight's 00:30 UTC Cron Health Check will say "ops-watch has never run". Its first run is 2026-10-17 17:00–17:59 UTC.

### Merged in session 33
| PR | What |
|---|---|
| #240 | 20 Dependabot updates combined (#225 superseded) |
| #242 | Team gates: attribution hook and required check, reviewer/architect agents, ENGINEERING_PROCESS, CONTRIBUTING, Stryker ratchet 35 |
| #244 | Weekly keep-alive (REQ-650). Best effort: GitHub doesn't document that the enable call resets the timer |
| #247 | satori pinned to 0.26.0 (image crash) |
| #248 | `scripts/drain-queue.js` plus a RUNBOOK note |
| #249 | CI mutation job on Node 22 |
| #250 | ops-watch, plus cron-health-check watching it back |
| #251 | Session handoff |
| #253 | All workflows on Node 22 (supabase-js) |

Ruleset: `no-attribution` is now required. 29 shipped issues were closed. Tracking issues #235, #236 and #237 are done.

### Mutation
Baseline **35.25% (2648 / 7512)**, ratchet 35. New code: `workflowHealth.js` 100%, `opsWatch.js` 99.33%, `api/ops-watch.js` 82.74%. CI's `mutation` job on main runs on Node 22 since #249. **Check its first green run and add the CI score to the score log** in ENGINEERING_PROCESS.

### History rewrite (Kate approved; Kate must push)
110 old commits on main carry Claude attribution lines. Claude can't force-push main (blocked by the permission classifier), so: `sh scripts/prepare-history-rewrite.sh <empty scratch dir>` builds the rewrite in a fresh clone and verifies it:
- same commit count, and every commit's tree, author, dates and subject unchanged
- no attribution left
- dependabot co-authors kept
- a backup bundle saved to `~/projs/qap/_salvage/`

It then prints the exact push command for Kate. **Rebuild right before Kate pushes**: any merge to main makes an older build's `--force-with-lease` refuse (safely). After the push:
- every clone needs `git fetch && git reset --hard origin/main` while on main
- SHAs quoted in old docs and comments stop resolving
- 80+ stale remote branches still hold the old history (deleting them is Kate's call)

### Issues
Open:
- #239 (backfill: existing code up to the gates bar; findings are in its comments)
- #238 (deps; close it once the majors are triaged)
- #246 (close it after a scheduled roster renders)
- #252 (close it after green Node 22 scheduled runs)
- #145
- 15 January backlog items (#6–#24)

Dependabot majors still open: #174 (vite 8), #219 / #241 (vitest 5), #234 (dev group). **Keep satori at 0.26** until a newer version is proven in a Vercel deploy.

## Immediate Next Steps
1. **Verify the schedules on Node 22:** `command gh run list --event schedule --limit 8`. Gmail Monitor, Integration Check and Cron Health Check should be green since #253. If one fails, read `--log-failed` and fix it like #253. Then close #252.
2. **Kate:** create a fine-grained PAT (repo `kcoffie/dog-boarding` only, **Actions: Read and write**), set it as `GH_ACTIONS_TOKEN` in Vercel → Production, and confirm `CRON_SECRET` is set there. Check with `curl -H "Authorization: Bearer $CRON_SECRET" "https://qboarding.vercel.app/api/ops-watch?dryRun=1"`. The next agent can't read Vercel env; ask Kate.
3. **After 2026-10-17 17:00–17:59 UTC:** confirm ops-watch ran (`cron_health` row `ops-watch`) and what it reported.
4. **Monday 2026-10-19:** confirm the 4am roster was sent **and delivered** (`message_log` job `notify-4am`, then `message_delivery_status`). If yes, close #246.
5. **History rewrite:** if Kate hasn't pushed yet, rebuild with `scripts/prepare-history-rewrite.sh` and give her the printed command. Don't merge anything between the rebuild and her push.
6. **Kate (delete guard):** `rm ~/projs/qap/dog-boarding/docs/MEMORY.md ~/projs/qap/nah.bak && rm -rf ~/projs/qap/dog-boarding/.stryker-tmp`.
7. Start #239: tests for `api/notify.js` and the sync crons first (0% mutation score; they're what the client feels).

## Open TODOs
- [ ] #239 backfill (mutation gaps, Ops audit of every job, `CRON_SECRET` fail-open in older crons, majors incl. satori)
- [ ] `mutate:changed` (80% on changed lines) as a PR check
- [ ] A PR check that `thresholds.break` never goes down (the reviewer enforces it for now)
- [ ] keep-alive: confirm after 60 days (around 2026-12-15) that the timer really reset. ops-watch reports it if not.
- [ ] Delete merged stale remote branches (Kate's call)
- [ ] Old worktrees for merged branches live in the session scratchpad (temporary). Nothing is unpushed.

---

## Session 32 State (2026-05-19, reference)


- **v6 OPEN** — theme: *Client-driven operational intelligence*
- **1065 tests, 61 files, 0 failures**
- **main clean** — PR #208 (U-2) + PR #209 (C-1) both merged today
- Live at [qboarding.vercel.app](https://qboarding.vercel.app)

### Session 32 Summary (this session)
| Item | Status |
|---|---|
| U-2 — "Send a Question" button in nav user dropdown | ✅ Done. PR #208 merged. `api/send-question.js` + `QuestionModal` in `Layout.jsx`. 7 tests (REQ-700). WhatsApp to Kate via `getAlertRecipients()`. |
| OVERVIEW.md corrections — Vercel cron times were wrong | ✅ Done. Fixed all cron times (midnight UTC = 5 PM PDT, not midnight PDT). Added "When Does the DB Get Updated From AGYD?" section. Updated "A Real Weekday" timeline. Removed stale Claude vision reference. |
| C-1 — Employee overnight calendar grid | ✅ Done. PR #209 merged. Second calendar grid below dog calendar on CalendarPage. Colored name chips, N/A pill, blank for unassigned. 7 tests (REQ-701). Vercel deploy pending verification. |

### Session 31 Summary (reference)
| Item | Status |
|---|---|
| Integration check alert — "Missing from DB: Rio Prabhakar 6/15-7/3 (C63Qglz7)" | ✅ Diagnosed. Bad booking in AGYD — same-day filter correctly skipped it. Kate confirmed bad entry; B-3 will re-queue on URL timestamp change. No code change needed. |
| Integration check WINDOW_DAYS=7 too narrow for far-future boardings | ⏸ Deferred. Fix: `WINDOW_DAYS = 7 → 90` in `scripts/integration-check.js`. Kate monitoring. |
| "Day boarding {date}" label rename — EmployeeDropdown checkbox | ✅ Done. PR #206 merged. |

---

### Session 32 next steps (superseded)

1. **Verify Vercel deploy** — go to [qboarding.vercel.app](https://qboarding.vercel.app) → Calendar page → confirm "Overnight Staff" grid renders below the dog calendar with colored name chips and N/A pills
2. **Kate picks G-1 or G-3** — see specs in SPRINT_PLAN.md

---

## Upcoming Tickets

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| G-1 | Alert on failed wamid — `message_delivery_status` table exists but nothing fires on `status='failed'` | Medium | Kate to pick this or G-3 |
| G-3 | Client-facing status page — last cron run, last notify sent, last delivery status | Medium | Kate to pick this or G-1 |
| B-4 | Integration check WINDOW_DAYS too narrow — change `WINDOW_DAYS = 7 → 90` in `scripts/integration-check.js` | Trivial | Deferred — do if repeated false alerts on far-future bookings |

---

## Key Facts (Don't Re-Derive)

- **VITE_SYNC_PROXY_TOKEN**: used for `Authorization: Bearer` auth on internal API endpoints (`/api/send-question`, `/api/run-sync`, etc.)
- **Alerts to Kate**: `sendAlert()` / `alertAndLog()` in `src/lib/alertKate.js` (Telegram, REQ-652). The team roster uses `NOTIFY_RECIPIENTS` (WhatsApp, moving to SMS in #260).
- **nightAssignments** in DataContext: `[{ date: 'YYYY-MM-DD', employeeId, workedFollowingDay }]` — top-level in `useData()`
- **employees** in DataContext: lives at `settings.employees`, NOT top-level
- **Vercel cron times**: all run at midnight UTC = 5:00 PM PDT (documented correctly in OVERVIEW.md as of this session)
- **K-8 open**: Replace Meta test phone number before ~July 2, 2026

---

## Session 30 Summary (reference)
| Item | Status |
|---|---|
| B-3 — re-sync appointments modified on AGYD after initial sync | ✅ Done + verified. PR #205 merged. `enqueue()` re-queues `done` items when URL timestamp changes. |

## Session 28 Summary (reference)
| Item | Status |
|---|---|
| B-2 — removed Check 3 (Claude vision) entirely | ✅ PR #202 merged. Integration check now: DOM ID match + unknown name + daytime check. |
