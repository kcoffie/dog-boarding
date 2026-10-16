# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 16, 2026 (session 33, end): production recovered and back under watch. The team-gates process is merged, keep-alive and ops-watch are live, the backlog is drained, and the Friday roster was delivered. Waiting on Kate: the GitHub token in Vercel, and the history-rewrite push.

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

## Current State (2026-10-16, end of session 33)

### Production
- **WhatsApp works.** The Friday weekend roster was sent by hand at 22:58 UTC: `delivered` to both recipients and `read` by Kate. K-8 is not blocking.
- **Sync caught up.** The 880-item queue was drained to 0 by `scripts/drain-queue.js`: 835 skipped (daycare/same-day), 39 boardings created, 1 updated, 17 forms.
- **All 10 GitHub workflows are active**, including the new `keepalive` and `attribution`. The 8 scheduled ones were re-enabled at about 20:50 and 22:53 UTC. Whether they actually resume firing is unconfirmed (see the next steps). ops-watch's first run will report it either way.
- **Image crash fixed (#246, PR #247).** The deps bump took satori 0.26 → 0.35, which crashed every image function on Vercel (`FUNCTION_INVOCATION_FAILED`). satori is pinned at 0.26.0. Locally both versions rendered fine, so only a production check catches this. ops-watch now does that check daily.
- **ops-watch is live (#250, REQ-651)**, a Vercel cron at 17:00–17:59 UTC. It fails closed: requests without `CRON_SECRET` get 401. **It needs `GH_ACTIONS_TOKEN` in Vercel** (see the next steps). Until then it alerts "Couldn't check the scheduled workflows".

### Merged today
| PR | What |
|---|---|
| #240 | 20 Dependabot updates combined (#225 superseded) |
| #242 | Team gates: attribution hook and required check, reviewer/architect agents, ENGINEERING_PROCESS, CONTRIBUTING, Stryker ratchet |
| #244 | Weekly keep-alive (REQ-650). Best effort: GitHub doesn't document that the enable call resets the timer |
| #247 | satori pinned to 0.26.0 (image crash) |
| #248 | `scripts/drain-queue.js` plus a RUNBOOK note |
| #249 | Mutation job on Node 22 (Stryker 10 needs it; it failed 3 times on Node 20) |
| #250 | ops-watch, plus cron-health-check watching it back |

The ruleset now also requires `no-attribution`.

### Mutation
Baseline **35.25% (2648 / 7512)**, ratchet 35. New code: `workflowHealth.js` 100%, `opsWatch.js` 99.33%, `api/ops-watch.js` 82.74%. The first CI `mutation` run on main (Node 22) is still to be checked.

### Issues
Open:
- #239 (backfill: existing code up to the gates bar; findings are in its comments)
- #238 (deps; close it once the majors are triaged)
- #246 (image crash; close it once a scheduled roster renders)
- #145
- 15 January backlog items (#6–#24)

Dependabot majors left open: #174 (vite 8), #219 / #241 (vitest 5), #234 (dev group). Note that satori must stay at 0.26 until it's tested in a Vercel deploy.

## Immediate Next Steps
1. **Kate: create the GitHub token.** Fine-grained PAT, repo `kcoffie/dog-boarding` only, **Actions: Read and write**. Set it as `GH_ACTIONS_TOKEN` in Vercel → Production, and confirm `CRON_SECRET` is set there. Then: `curl -H "Authorization: Bearer $CRON_SECRET" "https://qboarding.vercel.app/api/ops-watch?dryRun=1"`.
2. **Kate: push the history rewrite.** It was prepared and verified but needs her to push, because the force push to main was blocked for Claude. The backup is `~/projs/qap/_salvage/dog-boarding-main-before-rewrite-2026-10-16.bundle`. After the push, every local clone needs `git fetch && git reset --hard origin/main` (on main). SHAs quoted in older docs and issue comments will no longer resolve.
3. **Check the schedules resumed:** `command gh run list --event schedule --limit 5`. If nothing has run since 2026-10-16, ops-watch will say so. Next, try disabling and re-enabling one workflow, or pushing to main.
4. **Monday 2026-10-19:** confirm the 4am roster was sent and delivered. That's the first scheduled send since August.
5. **Kate: run `! rm ~/projs/qap/dog-boarding/docs/MEMORY.md && rm -rf ~/projs/qap/dog-boarding/.stryker-tmp`.** The delete guard blocks Claude here.
6. Start #239, beginning with tests for `notify.js` and the sync crons (0% mutation score).

## Open TODOs
- [ ] #239 backfill (mutation gaps, Ops audit of every job, `CRON_SECRET` fail-open in older crons, Node 20 EOL, majors incl. satori)
- [ ] `mutate:changed` (80% on changed lines) as a PR check
- [ ] A PR check that `thresholds.break` never goes down (the reviewer enforces it for now)
- [ ] keep-alive: confirm after 60 days (around 2026-12-15) that the timer was really reset. ops-watch will report it if not.
- [ ] 80+ stale remote branches still carry the pre-rewrite history; delete the merged ones (Kate's call)

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
- **getAlertRecipients()**: returns `INTEGRATION_CHECK_RECIPIENTS` (Kate only — `+15550100103`). NOT `NOTIFY_RECIPIENTS` (full team).
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
