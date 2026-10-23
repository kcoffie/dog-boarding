# Q Boarding: Sprint Plan (v7, UAT)

**Approved by Kate, 2026-10-22 (session 44).** Replaces the May sprint plan (archived to `docs/archive/SPRINT_PLAN-2026-05.md`). Built from the full TBD triage on 2026-10-22: priorities are GitHub labels (`priority: high/medium/low`, `to-investigate`), and every triaged issue has a "Triage 2026-10-22" comment with Kate's decision.

## Goal
1. **UAT** with Charlie and her admin, on real pay periods.
2. **In use** in Charlie's business: she pays from the app's numbers.
3. **Portfolio:** the system, its decisions and its process are ready to show to prospective employers (#338).

Each stage feeds the next. Real use is the portfolio's strongest evidence, so portfolio work never delays UAT.

## Rules for every sprint
- Two-week sprints. Each session starts with the 3 tickets that move the goal most.
- **Hardening before features:** reliability, security, failure alerts and the booking-site pipeline come first. A new feature that isn't needed for UAT has to justify its effort.
- **Booking-site safety:** every change that touches the sync says how many requests it adds and what happens if the site throttles or changes.
- **ADR with each decision:** an architect-gated decision gets an ADR in `docs/adr/` in the same PR.
- The existing gates stay as they are (`docs/ENGINEERING_PROCESS.md`): design note and architect before new jobs, tables or secrets; reviewer before every PR; mutation score reported; `check:deploy` after every merge.

## Dates that constrain the plan
| Date | Why it matters |
|---|---|
| Fri 10-30 | Last day to hand-edit the GitHub roster crons if #321 hasn't shipped |
| Sun 11-01 | DST ends; GitHub crons fire an hour early from here unless fixed |
| Mon 11-02 | First 4am roster in PST (check it) |
| ~11-13 | Latest start for UAT watch-first; later than this, UAT slips to January |
| 11-23 to 11-27 | Thanksgiving week: no asks of Charlie |
| December | Charlie's peak season: no asks of Charlie |
| 2027-10-19 | `GH_ACTIONS_TOKEN` expires (#337) |

## Milestones and definitions of done

### M1 UAT-ready (target Fri 11-13)
- [ ] 5 weekday 4am rosters on time with no help (claim row `success`, `trigger: vercel`)
- [ ] 7am, 8:30am and Friday pm on time, DST-proof, with failure alerts (#321)
- [ ] No unexplained alerts for a week
- [ ] A dog with no rate alerts Kate (#312 step 1)
- [ ] The pay breakdown prints and can be sent to a phone (#314)
- [ ] Invite-code management removed; Charlie's and her admin's accounts exist and the invite was dry-run (#307)
- [ ] Payment history sortable (#9); calendar refresh done (#8, Kate)
- [ ] Job logs private (#323)
- [ ] UAT script written and dry-run end to end on production (#13)
- [ ] Watch-first session with Charlie done; her pay period known

### M2 In use (target January)
- [ ] UAT acceptance criteria 1–4 met (`docs/UAT_PLAN.md`). Criterion 5 (staff roster by phone) waits on #260; until then Kate forwards the roster image by hand
- [ ] 4 pay periods in a row paid from the app's numbers, every payment logged in the app

### M3 Sync redesign done: #318 through build step 6 (target ~12-09)
- [ ] One full pass a day and near-term runs twice a day, on time
- [ ] About 120 booking-site requests a day, under a 250 ceiling that stops runs and alerts
- [ ] Every failed run alerts with what happened and how to fix it; ops-watch reports a missed run
- [ ] The Integration Check compares both ways, once a day, with no false alarms
- [ ] The old paths are retired (`cron-schedule`, `cron-detail`, `cron-detail-2`, queue booking items, the Integration Check's own sync)
- [ ] ADR-005 supersedes the rest of ADR-002 (ADR-004 already replaced its notifications part)
- [ ] Closed: #323, #316, #321, #294, #315, #22 (and #324, #295)

Steps 7 (button #317, Sync History #311) and 8 (drift list #313) are separate work after M3, ordered by UAT feedback.

### M4 Portfolio (target end of December; #338)
- [ ] Independent in-depth code review; findings fixed or documented
- [ ] README and GitHub repo page reworked
- [ ] ADRs current
- [ ] A write-up for each audience, including the engineering process and how AI-assisted development was used

## Sprint 1: Thu 10-22 → Wed 11-04, "Mornings that run themselves"
**Top 3:**
1. **#321:** 7am, 8:30am and Friday pm move to the Vercel pattern used by the 4am roster (REQ-658), so DST needs no edits and each window has a failure alert (#257 folded in). Short addendum to the roster-trigger design note, then architect. **Merged by Fri 10-30, or the GitHub crons are hand-edited for PST.**
   - **Merged 2026-10-23 00:56 UTC (PR #340, REQ-659, ADR-004).** First live day Fri 10-23; first PST day Mon 11-02. Tick M1's box once they're verified.
2. **#13 UAT:** Kate books watch-first with Charlie (week of 11-09). Claude writes the UAT script for Charlie, including where "something looks wrong" goes (Send a Question) and what happens next, and dry-runs it on production.
   - **Script drafted 2026-10-23:** `docs/UAT_SCRIPT.md` (frozen expected answers, $0 tolerance, goal-only tasks, severity and go/no-go). Dry-run next.
3. **#323:** private job logs (#318 step 2). Architect gate (new table); Kate runs the migration. After it merges, ask Kate about deleting the old public run logs that contain names.

**Also:**
- Check the on-time 4am roster: Fri 10-23 and the first PST run Mon 11-02
- #324 leftovers: Clear for Kate only (server-side check); the Sync Now 302 proof when it next happens naturally
- #307: remove invite-code management (moved up from Sprint 2, Kate 2026-10-23: a small removal, and Charlie would click it); Kate creates the admin's account after a dry-run invite
- Docs PR: this plan, the archive of the May plan, the handoff, REQ-652 status, the G-1 WhatsApp delivery-alert item (K-8, M3-7, N-1 are history and stay where they are)
- Investigations, batch A (below)
- If #321 lands early: start #318 step 3 with the parser parity test
- Kate: #337 chores, #8 calendar (browser agent), forward the roster to Charlie by hand

## Sprint 2: Thu 11-05 → Wed 11-18, "UAT-ready, then start"
**Top 3:**
1. **#312 step 1:** alert Kate when a dog with no rate is counted. Step 2 (why it happens) after a real case.
2. **#314:** pay breakdown image, drafted before watch-first and adjusted after it.
3. **#318 step 3:** one Node-safe engine: the parser parity test, then the regex parser only, the skip store, `sync_logs` run kind and requests (migration, Kate runs it). The biggest step. It changes `sync.js`, which Sync Now uses; a Sync Now break during UAT is accepted (Kate, 2026-10-22). Any test run against the booking site needs Kate's OK. Target ~11-25.

**Also:**
- #9 sortable payment history
- Kate: watch-first with Charlie and her admin; M1 go/no-go; the first side-by-side pay period starts

## Sprint 3: Thu 11-19 → Wed 12-02, "First UAT round, full pass" (Thanksgiving week)
**Top 3:**
1. Fixes from UAT period 1 (keep / fix / wish); ship at least one of Charlie's asks within a week
2. **#318 steps 4–5:** full pass on GitHub started by Vercel (first run by hand with Kate watching; 3 good nights alongside the old paths; needs #323 merged first), then near-term runs on Vercel. Closes #316
3. **ADRs 005–007** (decisions already made and shipped): sync redesign (supersedes the rest of 002), booking-site breaker and single login, alerts on Telegram. ADR-004 (roster claim rows) shipped with #321

**Also:** the rest of step 3 if it runs over; #319; #315 if the Integration Check still raises false alerts; #338 scope, and Kate starts the independent review (`/code-review ultra`)

## Sprint 4: Thu 12-03 → Wed 12-16, "Sync done, portfolio" (December peak: no asks of Charlie)
**Top 3:**
1. **#318 step 6:** retire the old paths; the Integration Check becomes check-only → **M3 done (~12-09)**
2. **#338:** README, repo page, write-ups
3. Review findings from the independent review

**Also:** #295; the second side-by-side pay period

## After Sprint 4 (late December → January)
- UAT adoption: 4 pay periods → **M2**
- Then, by UAT feedback: #317 + #311 (button, Sync History), #313 (drift list), #326, #7 (change history + notify Charlie), #260 (a real roster channel for Charlie and staff), #6/#17/#23/#24 (user roles, low)

## Investigation queue
**Batch A (Sprint 1, read-only, quick):**
| Item | Question |
|---|---|
| #21 | Any duplicate boardings in the database? If not, close |
| #20 | Do the May changes (daytime follow-on pay, "Day boarding" checkbox) already cover it? |
| #15, #19 | What was asked for, and does something already cover it (REQ-202 revenue, payroll)? |
| #239, #284 / PR #285, #299 | Still needed? (#239 likely feeds #338) |
| PR #291 | Close if #260 doesn't go to SMS |
| G-3 status page | Still needed now that ops-watch and Telegram exist? |
| `mutate:changed` PR check | Worth adding for #338? |
| Small leftovers | Appointment status parses as null; optional token rename |

**Batch B (re-check as #318 steps ship):**
| Item | Re-check after |
|---|---|
| #316 removed bookings stay | Step 4 |
| #321 rest | Step 5 |
| #294, #315, #22, the Integration Check's 7-day window, ops-watch's queue limit (30), findings Q7–Q9 | Step 6 |
| #317, #311 | Step 7 |
| #313 | Step 8 |

## Backlog by priority
- **High:** #318, #324, #323, #321, #295, #312, #314, #307, #8, #9, #13, #260, #315, #337, #338
- **Medium:** #326, #319, #7
- **Low:** #6, #17, #23, #24, a third watcher for when both schedulers die (no issue)

## Kate's decisions (2026-10-22)
- Start UAT now on today's sync; build #318 alongside it. #318 is done at step 6.
- The engine (#318 step 3) moves up to Sprint 2; a Sync Now break during UAT is an accepted risk.
- Only Kate may press Clear; later, only admins.
- DST must not need code edits: the roster windows move to the Vercel pattern.
- Telegram won't work for Charlie; Kate forwards the roster image by hand until there's a better channel.
- The portfolio issue is public and names Claude Code; commits and PRs still carry no AI attribution.
- Closed: #246, #238, #145, #293, #10, #257.
