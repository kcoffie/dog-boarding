# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 16, 2026 (session 33): restarted after 5 months idle. The team-gates process is ported, keep-alive is built, the stale-data alert is designed and blocked on Kate's decisions, and Dependabot updates are combined on one branch. **Production has been silently broken since August** (below).

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

## Current State (2026-10-16)

### Production: broken and silent
- **All 8 scheduled GitHub workflows have been `disabled_inactivity` since 2026-08-24.** GitHub disables schedules after 60 days without a commit. No morning rosters, no cron health check, no integration check, no Gmail monitor. **Kate decides when to re-enable them.**
- **The Vercel crons kept running, but boardings stopped updating on 2026-09-26.** The detail queue backed up to about 880 items. Real draining happens through integration-check on GitHub (about 60 a day), so it stopped too.
- **K-8 (replace the Meta test number, due about 2026-07-02) is unconfirmed.** If it wasn't done, WhatsApp delivery is dead, both rosters and alerts. Check this first.

### Branches pushed (no PRs opened; Kate opens and merges)
| Branch | Issue | What | Status |
|---|---|---|---|
| `chore/team-gates` | #235 | Attribution hook and CI, reviewer and architect agents, ENGINEERING_PROCESS, CONTRIBUTING, START HERE, Stryker baseline with ratchet and CI job, vitest exclude for `.stryker-tmp` | Ready. 1065 tests |
| `fix/cron-keepalive` | #236 | Weekly `keepalive.yml` plus `workflowHealth.js` (REQ-650), runbook entry | Ready. 12 tests, **100% mutation** on the new module. The enable-call reset isn't documented by GitHub, so treat it as best effort |
| `feat/stale-data-alert` | #237 | Design note plus architect review (`docs/specs/ops-watch-design-note.md`), stacked on `fix/cron-keepalive` | **Blocked on 5 Kate decisions** (in the note). No code yet |
| `chore/deps-oct-2026` | #238 | 20 green Dependabot PRs combined. #213 was re-applied by hand; #225 (ws) was superseded because ws left the tree | Ready. 1065 tests, lint and build green. Close the 20 PRs after merging |

### Mutation baseline (`npm run mutate`)
**35.25% (2648 / 7512)** over `api/`, `src/lib/` and `src/utils/`. Reproduced exactly on a second run. 2998 mutants have no test at all, including `notify.js` and the three sync crons (0%). The ratchet is at 35. The backfill is #239.

### Issues
29 issues that had already shipped were closed (each with its PR). 21 are open: the 5 new ones (#235–#239), #145 (eslint 10, not done), and 15 January backlog items (#6–#24) for Kate to triage.

## Immediate Next Steps
1. **Kate:** confirm K-8 / WhatsApp delivery, with one real test send. Nothing else matters if this is dead.
2. **Kate:** open and merge the PRs in this order: `chore/deps-oct-2026` (its merge also resets GitHub's 60-day timer), `chore/team-gates`, then `fix/cron-keepalive`.
3. **Kate:** re-enable the 8 workflows (Actions tab, or `command gh workflow enable <name>`), then run `Keepalive` by hand.
4. **Kate:** answer the 5 ops-watch decisions in the design note. Then build ops-watch (REQ-651) on `feat/stale-data-alert`.
5. Drain or prune the 880-item queue before UAT day 1.
6. Delete the leftover `.stryker-tmp/` and the dangling `docs/MEMORY.md` symlink. Both are outside the delete guard's allowlist, so Kate does it.

## Open TODOs
- [ ] #239: bring existing code up to the gates bar (mutation gaps, Ops audit, security incl. `CRON_SECRET` fail-open, dependency majors)
- [ ] `mutate:changed` (80% on changed lines) as a PR check, once CI's full-run time is known
- [ ] A PR check that `thresholds.break` never goes down (the reviewer enforces it for now)
- [ ] Ask Kate: rewrite the 114 old commits on main that carry attribution lines, or leave them?

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
- **getAlertRecipients()**: returns `INTEGRATION_CHECK_RECIPIENTS` (Kate only — `+18312477375`). NOT `NOTIFY_RECIPIENTS` (full team).
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
