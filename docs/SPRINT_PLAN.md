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
- **Triage rule (Kate, 2026-10-27):** anything that can make the roster or pay wrong gets `priority: high` and its own date in this plan. "Closes when #X ships" is not a plan (#316 was parked that way for a week).
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
- [x] Invite-code management removed (#307, PR #366, 2026-10-28)
- [ ] Charlie's and her admin's accounts exist and the invite was dry-run
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
- [ ] Closed: #323, #316, #321, #294, #315 (and #324, #295; #22 closed 10-27 as superseded)

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
   - **Script drafted 2026-10-23:** `docs/UAT_SCRIPT.md` (frozen expected answers, $0 tolerance, goal-only tasks, severity and go/no-go). Dry-run 1 (read-only) done 2026-10-23; dry-run 2 (Kate's writes) next.
3. **#344 (added 2026-10-23, first):** the sync writes another dog's pet ID (group playgroup listings and multi-pet bookings pair names and IDs by position), which can show another client's pet's boarding form, and creates $0 dogs. Design note first; no new booking-site requests.
   - **Design note v2 + ADR-008 approved 10-23. PR 1 merged 10-23 (PR #346, REQ-660): pages read without following redirects; first night clean. PR 2 merged 10-25 (PR #347, REQ-661): dog = pet ID, never rename, link only with evidence; migration 030 (unique pet ID) run first; 15 current bookings re-queued. First night clean (10-26); #344 closed.**
4. **#342 (added 2026-10-23, after #344):** one shared calculation for nights and pay. The Dashboard and Payroll disagree today (10-23: Net $338 vs $286), which fails UAT step 5. Includes removing Add/Edit/Delete boarding (source of truth). The duplicate-dog merge and the 3 pet-ID fixes were done by SQL on 2026-10-23.
   - **Merged 2026-10-26 (PR #349, `332d53a`, REQ-036):** `nightStays` is the one calculation for every view. Add/Edit/Delete boarding removed (REQ-020–023). Production 10-23: $286 net everywhere. Follow-ups: #350 (UI "today" in San Francisco time), #351 (dogs still edited by hand).
5. **#350 (added 2026-10-26, high):** every date and time in the app is San Francisco time, whatever the device (Kate: "I don't want Charlie to see anything weird").
   - **PR 1 merged 2026-10-26 (PR #354, `7b191bd`, REQ-064):** "today" and every calendar date the UI builds. **PR 2 = #353 PR 2, merged 2026-10-27 (PR #360).** Four screens still show real moments in the device's zone: #361 (low, Kate: fine for now).
6. **#353 (added 2026-10-26, high):** the booking site's times are Pacific clock times stored as UTC, so the app and the Friday roster show them 7–8 hours early, and `isDayPresent`'s 5pm rule reads a 4pm arrival as 9am. Design note → architect first (stored data, a pay rule, the roster); PR 1 and PR 2 below (PR 2 = #350 PR 2).
   - **Option B chosen (Kate, 10-26), ADR-009. PR 1 merged 2026-10-26 (PR #357, `f317878`, REQ-065):** `siteClock.js`, the Friday pm roster ("Fri – Mon", site times), zone-proof server dates, the guard test. **PR 2 merged 2026-10-27 (PR #360, `5a8546c`):** the screens (Dogs page, Calendar, nights/day icon, Sync History, form view, upcoming forms). Fri 10-30 roster checked with Kate; **#353 and #350 closed 2026-10-31.**
7. **#316 (added to the plan 2026-10-26, high, Kate: "very soon"):** a booking removed on the booking site stayed on the rosters and in pay (only Sync Now noticed).
   - **Merged 2026-10-27 (PR #358, `ee20596`, REQ-108, REQ-109, ADR-010):** the nightly sync cancels it (every dog), restores on proof, one `sync-reconcile` alert a night. Report-only run 00:05 UTC 10-28 (SF 10-27), live from 00:05 UTC 10-29 (SF 10-28). Close after the first live night's checks.
   - **Report-only night 10-28 correct:** "would cancel" `C63QhB7h` and `C63QhDpK` (Kate confirmed both removed on the site). First live night 00:05 UTC 10-29: check, then close.
8. **#351 (added 2026-10-26, medium; Sprint 1 or 2):** remove the Dogs page's hand edits: Add Dog, Import CSV, delete dog and Deactivate.
   - **Merged 2026-10-27 (PR #364, `b995cd4`); REQ-010–013 Removed.**
9. **#323:** private job logs (#318 step 2). Architect gate (new table); Kate runs the migration. After it merges, ask Kate about deleting the old public run logs that contain names.
10. **#368 (added 2026-10-28, high, triage rule):** empty dog rows with no pet ID blocked a dog's first booking (`C63QhMFU`, 10/28–10/30: missing from the 10-28 roster and pay).
   - **Data fix run by Kate 2026-10-28 23:14 UTC:** 37 rows copied to `backup.dogs_removed_2026_10_28` and deleted; `C63QhMFU` re-queued. Verify after 00:15 UTC 10-29 (new dog with the booking's pet ID, $55, boarding saved; no "nothing shows it's this pet" notice), then close.
11. **#370 (added 2026-10-29, high, triage rule): fixed by Fri 11-06, before the watch-first week of 11-09.** Mark as Paid can record the wrong payment: a partial payment pays an average per night (confirmed in #13 dry-run 2: $159.25 instead of $139.75), a double-click pays twice (confirmed on the second try: two rows for the same night, 283 ms apart), and a failed save closes the box as if it worked.
12. **#338 portfolio, first pass (moved up 2026-10-29, Kate): by Mon 11-02 11:00 (Kate's local time),** for a job screening call where Kate shares her GitHub: README rewrite (stale counts), repo description/topics, profile README + pin; stale PRs and Dependabot alerts if time. The full #338 (write-ups, independent review) stays in Sprint 4.
    - **Done 2026-10-31:** README (#374, #376, #377), repo description and topics, profile README and pin, #285 and #291 closed. The product is named Pawroll (Kate); trademark and domain unchecked. Dependabot alerts left for the next lockfile change.

**Also:**
- Check the on-time 4am roster: Fri 10-23 and the first PST run Mon 11-02
- #324 leftovers: Clear for Kate only (server-side check); the Sync Now 302 proof when it next happens naturally
- #307: remove invite-code management. **Merged 2026-10-28 (PR #366, `7b8d5c3`); REQ-006 Removed.** Kate adds Charlie's and the admin's accounts by hand in Supabase; the in-app way is #367
- Investigations batch A done 2026-10-27/28: #20, #15, #19, #22 closed; #21 has 9 same-dog same-date groups (Revenue counts both; Kate checks one pair on the site); #294 and #315 still real
- Docs PR: this plan, the archive of the May plan, the handoff, REQ-652 status, the G-1 WhatsApp delivery-alert item (K-8, M3-7, N-1 are history and stay where they are)
- Investigations, batch A (below): the rows still open
- If #321 lands early: start #318 step 3 with the parser parity test
- Kate: #337 chores, #8 calendar (browser agent), forward the roster to Charlie by hand

## Sprint 2: Thu 11-05 → Wed 11-18, "UAT-ready, then start"
**Top 3:**
1. **#326 (high since 2026-10-27, triage rule):** alert Kate when a synced change touches a boarding that has an employee assigned (Kate's spec on the issue).
2. **#312 step 1:** alert Kate when a dog with no rate is counted. Step 2 (why it happens) after a real case.
3. **#318 step 3:** one Node-safe engine: the parser parity test, then the regex parser only, the skip store, `sync_logs` run kind and requests (migration, Kate runs it). The biggest step. It changes `sync.js`, which Sync Now uses; a Sync Now break during UAT is accepted (Kate, 2026-10-22). Any test run against the booking site needs Kate's OK. Target ~11-25.

**Also:**
- **#314:** pay breakdown image, drafted before watch-first and adjusted after it
- #9 sortable payment history
- #294 (small: call `checkHungCron`, `scripts/cron-health-check.js:160`)
- Kate: watch-first with Charlie and her admin; M1 go/no-go; the first side-by-side pay period starts

## Sprint 3: Thu 11-19 → Wed 12-02, "First UAT round, full pass" (Thanksgiving week)
**Top 3:**
1. Fixes from UAT period 1 (keep / fix / wish); ship at least one of Charlie's asks within a week
2. **#318 steps 4–5:** full pass on GitHub started by Vercel (first run by hand with Kate watching; 3 good nights alongside the old paths; needs #323 merged first), then near-term runs on Vercel
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
- #365 (medium): make the synced tables read-only for app users, after #318 step 7 (server-side Sync Now). Target mid-December, before M4 if it fits
- #367 (medium): admins add people from the app (design, build, drop `invite_codes`)
- Then, by UAT feedback: #317 + #311 (button, Sync History), #313 (drift list), #7 (change history + notify Charlie), #260 (a real roster channel for Charlie and staff), #6/#17/#23/#24 (user roles, low)

## Investigation queue
**Batch A (Sprint 1, read-only, quick):**
| Item | Question |
|---|---|
| ~~#21, #20, #15, #19~~ | Done 2026-10-27/28 (see Sprint 1 "Also") |
| #239, #284 / PR #285, #299 | Still needed? (#239 likely feeds #338) |
| PR #291 | Close if #260 doesn't go to SMS |
| G-3 status page | Still needed now that ops-watch and Telegram exist? |
| `mutate:changed` PR check | Worth adding for #338? |
| Small leftovers | Appointment status parses as null; optional token rename |

**Batch B (re-check as #318 steps ship):**
| Item | Re-check after |
|---|---|
| #321 rest | Step 5 |
| #294, #315, the Integration Check's 7-day window, ops-watch's queue limit (30), findings Q7–Q9 | Step 6 |
| #317, #311 | Step 7 |
| #313 | Step 8 |

## Backlog by priority
- **High:** #370 (by 11-06), #326, #318, #324, #323, #295, #312, #314, #8, #9, #13, #260, #315, #337, #338
- **Medium:** #343, #319, #7, #365, #367
- **No priority label yet (`to-investigate`):** #294 (Sprint 2, small), #21 (waits on Kate's site check)
- **Low:** #6, #17, #23, #24, #361 (four screens' real moments in the device's zone), #363 (admin-only project dashboard), a third watcher for when both schedulers die (no issue)

## Kate's decisions (2026-10-22)
- Start UAT now on today's sync; build #318 alongside it. #318 is done at step 6.
- The engine (#318 step 3) moves up to Sprint 2; a Sync Now break during UAT is an accepted risk.
- Only Kate may press Clear; later, only admins.
- DST must not need code edits: the roster windows move to the Vercel pattern.
- Telegram won't work for Charlie; Kate forwards the roster image by hand until there's a better channel.
- The portfolio issue is public and names Claude Code; commits and PRs still carry no AI attribution.
- Closed: #246, #238, #145, #293, #10, #257.
