# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 29, 2026, ~21:30 UTC (session 55). **Production = main (`4bad191`, #372, docs only; code as `7b8d5c3`), `check:deploy` OK.** The roster reaches Kate on **Telegram**; she forwards the image to Charlie by hand. **Session 55: #316 and #368 verified and closed, #13 dry-run 2 done (two payroll bugs confirmed → #370, high, fix by Fri 11-06), #323 design note through the architect (#371 merged). **Kate has a job screening call Mon 11-02 11:00 (her local time) and will share her GitHub: #338 portfolio work moves up to before then.** Next: #338 README, Fri 10-30 roster check, then #370 and #323 builds.**

**The goal:** UAT with Charlie and her admin in November (on today's sync), then the app in use in her business, then the project as a portfolio piece (#338). The plan, milestones and dates: **`docs/SPRINT_PLAN.md`**. Do what's needed, simply; nothing more.

---

## ▶ START HERE (every session)

1. **Read this file to the end, then `docs/ENGINEERING_PROCESS.md`** (team gates) **and `docs/SPRINT_PLAN.md`** (the plan; start each session by naming its top 3). Check the baseline before changing anything: `git status`, `npm run test:run`, open PRs and issues.
2. **Kate's rules:**
   - Work on branches and never commit to `main`. Commit and push each green chunk. Claude may open and squash-merge PRs once every check is green **and** the reviewer agent has run.
   - Use `type: description (#issue)` commits. Never add AI attribution: no Co-Authored-By, no Claude-Session, no session links, no "Generated with Claude Code" in PR bodies. A PreToolUse hook, the commit hook and CI reject them, and they overrule Claude Code's per-session reminder.
   - Tests must catch bugs, not just exist. Follow the good-tests rules and report the mutation score, not just "N tests pass".
   - Give options as one line each with real counts, then one recommendation.
   - `TechPM.md` / `TechPM_1.md` are a persona for **planning sessions only**, when Kate asks for one (Kate, 2026-10-26). The process is `docs/ENGINEERING_PROCESS.md`; its TPM gate is this file plus the sprint plan.
   - Ask before sending any message to anyone (Telegram test alerts, SMS, WhatsApp), re-enabling workflows, adding secrets or changing repo settings.
   - Messages must never be tied to the client's (Charlie's) business. The app is Kate's alone, and Kate has no registered business.
3. **After every merge:** `npm run check:deploy` (REQ-654). It reads main's head from GitHub, waits for qboard's Vercel status, then checks the home page and roster image. Only `main` (and `preview/**` branches) deploy on Vercel (#298).
4. **Shell:** `gh` is aliased to `history | grep`, so always type `command gh …`. Production is **`https://qboarding.vercel.app`** (Vercel project `qboard`; the duplicate `dog-boarding` Vercel project was **disconnected from GitHub by Kate on 2026-10-19** and no longer deploys; since then qboard's commit status is named plain `Vercel`). Claude can't read Vercel env or logs (no CLI; Hobby logs keep 1 h). Use Kate's Chrome, the Supabase tables, or ask Kate.
5. **Gates:** run the `architect` agent on the design note before a new job, service, secret or table. Run the `reviewer` agent before every PR. A new scheduled job ships with its failure alert, and that alert must run outside the job's own scheduler.
6. **New code only:** the gates cover code written from 2026-10-16 on. Bringing older code up to the same bar is #239.
7. **Things Claude can't do here; ask Kate to run them with `! <command>`:**
   - Delete files: a hook blocks `git rm`/`rm` in this repo.
   - Dispatch a workflow that sends a message (e.g. `notify-4am.yml`), and push to a Dependabot branch: the permission classifier blocks both even with Kate's OK in chat.
   - Read Vercel env or logs.
   - Run SQL or migrations against production: Kate runs them (the classifier blocks Claude in the Supabase SQL editor).

---

## Current State (2026-10-29 ~21:30 UTC, session 55)

### Session 55: what happened (2026-10-29)
1. **Baseline:** main `7b8d5c3`, suite **2687 passed / 1 skipped**. **#369 (session 54 handoff) merged → `971a8f8`, `check:deploy` OK.**
2. **Overnight 10-29 clean:** `schedule` 00:15, `auth` 00:37 (refreshed), 4am roster 11:40, 7am 14:20, 8:30 15:29 UTC; Integration Check 14:49 passed (20 boardings match); `site_access` not blocked; queue 0 pending / 0 failed. Small oddity, not a failure: the `detail` health row was last stamped 00:50 although detail work ran at 03:46.
3. **#316 closed.** First live night (00:15 UTC 10-29): `reconcile` mode live, candidates 2, gone 2, archived 2, errors 0, alert delivered. `C63QhB7h`, `C63QhB7h_p1`, `C63QhDpK` cancelled as `appointment_archived`, `sync_appointments` archived; one `sync-reconcile` "Cancelled" message. `to-investigate` dropped.
4. **#368 closed.** `C63QhMFU` was **moved on the booking site** from 10/28–30 to **11/4–6** (title "11/4-6 (Fri)", new URL; old dates in `previous_data`). The 03:47 detail run found the old URL redirecting ("stay moved or cancelled?" notice); the 14:47 Integration Check found the new URL and saved it under a **new dog with pet ID 236219, $55/night** (2 nights, $110). No pet-match notice since. Assignable nights: 11/4 and 11/5 (Kate confirmed the move).
5. **`C63QhMVa`** saved on its existing dog (pet ID match) with checkout **11/1** (not 1/1).
6. **#13 dry-run 2 done** (Kate clicked, Claude checked the tables; results in `docs/UAT_SCRIPT.md` Part D). Re-check first: 10-16 net $139.75, 10-17 $178.75. **Partial payment averaged: confirmed** ($159.25 shown, $139.75 right). **Double-click: confirmed** on the second try: two rows for the same night 283 ms apart. Failed save: not run on production (test instead). Delete, nights back to —, Send a Question all pass. Kate's 3 test night assignments (10-23 → 10-25) were cleared by her. Cleanup verified 21:16 UTC: 0 payments, no night assignments 10-10 → 10-31.
7. **Filed #370 (bug, high, fixed by Fri 11-06, in Sprint 1 of `docs/SPRINT_PLAN.md`):** Mark as Paid averages partial payments, a double-click pays twice, a failed save looks saved. Results comment on the issue. Proposed fix includes a database guard so a night can't be paid twice (`payments.dates` is an array: a per-night table or a database function; migration run by Kate).
8. **#323 design note: PR #371** (`docs/specs/323-job-logs-design-note.md`, plus #370 in the sprint plan). Evidence: only the Integration Check's public logs carry pet names (16 lines in the 14:46 run; titles and pricing HTML too), from the shared sync modules; no client names, phones or emails; 106 runs since 07-31 still have logs (90-day retention). Choice: private `job_logs` table (service key only, RLS no policies + revoke), every GitHub Node job captures `console.*`, only booking IDs, counts, pass/fail and "alert delivered" go public. **Kate: pet names private too; keep 30 days; delete the 106 old logs once live; `check:public-logs` is a script Claude runs.** Architect: proceed with changes, folded in (flush via `jobLog.exit` since `process.exit` skips async work; SIGINT + `unhandledRejection`; keepalive left out; install inside each script's run guard; check script scoped to sync jobs).
9. **Merged:** #369 → `971a8f8`, #371 (#323 design note + #370 in the sprint plan) → `3eee342`, #372 (this handoff + UAT dry-run 2 results) → `4bad191`; `check:deploy` OK after each.
10. **#338 portfolio moved up (Kate, 2026-10-29):** Kate has a first screening call with a company **Mon 11-02 11:00 (her local time)** and will give them her GitHub address. Agreed plan, most visible first (Kate liked it; nothing started):
    1. **`README.md` rewrite** (it's stale: says 946 tests / 54 files / v5.4.0; main has 2687 tests / 103 files): what the app does and for whom, architecture, how it's tested (mutation testing + score, good-tests rules), the process (design notes → architect → ADRs, ops gate "silence is never success"), real incidents and fixes. **Built with Claude Code, said openly** (Kate's #338 decision), still no AI attribution in commits/PRs. Screenshots with synthetic data only; no client, pet or staff names, no phone numbers, no booking-site name in new text beyond what's already public.
    2. **Repo page:** one-line description, topics, website link (Kate sets these in GitHub settings; Claude drafts the text).
    3. **Kate's profile:** short profile README (repo `kcoffie/kcoffie`) and pin dog-boarding (Kate does the account settings; Claude drafts).
    4. **Tidy-up if time:** stale PRs #291 and #285; the 2 Dependabot alerts on main (1 high, 1 moderate) shown on push.
    5. **Not now:** the 106 old Integration Check logs with pet names stay until #323 ships (Kate's plan; no client data in them).
    Keep #370 (due 11-06) on track; nothing else bumped.
11. Kate ran no SQL. No booking-site requests by Claude, no messages sent. Note for the next session: never `select('*')` on `site_access` in a scratch script (it prints the stored session); select the columns needed.

## Previous session (54)

### (was Current State, 2026-10-28 ~23:30 UTC, session 54)

### Session 54: what happened (2026-10-27 / 10-28)
1. **Baseline:** main `6f7eb21`; read-only checks 10-27 ~21:30 UTC: overnight clean, `site_access` not blocked, queue 0; the 13:45 Integration Check cancel (Playwright apt hang) did not repeat. Ops-watch's 17:36 "IC last success 14h" alert was that cancel.
2. **Triage rule (Kate, 2026-10-27), now in `docs/SPRINT_PLAN.md` rules:** anything that can make the roster or pay wrong gets `priority: high` and its own date. Kate was worried #316 had been parked under #318 step 4 with no date. First uses: **#326 raised to high** (Kate's spec on the issue: alert when a synced change touches a boarding with an employee assigned; Sprint 2) and #368.
3. **#351 shipped: PR #364 → `b995cd4`, `check:deploy` OK, #351 closed.** Dogs page: no Add Dog, Import CSV, Deactivate or Actions column; `useDogs` fetch-only; `DogForm`, `DogCsvImport` deleted (Kate's `git rm`); REQ-010–013 Removed. papaparse stays in `package.json` until the next lockfile change (Kate OK'd). Stryker: 0 mutants (deletions + JSX text).
4. **#307 shipped: PR #366 → `7b8d5c3`, `check:deploy` OK, #307 closed.** Settings has no Invite Users; `useInvites` and its test deleted (Kate's `git rm`); REQ-006 Removed; new `SettingsPage.noInvites.test.jsx` (fails on main). The `invite_codes` table stays: dropping it (and its policies) is part of **#367**. Suite **2687 passed / 1 skipped**; Stryker: no mutants (deletions + a comment). Reviewer: no must-fix; findings on the PR.
5. **#316 report-only night (00:05 UTC 10-28) correct:** "Would cancel" `C63QhB7h` (two dogs, 11/3 → 11/12) and `C63QhDpK` (10/30 → 11/1); Kate confirmed both are gone from the site. `result.reconcile`: candidates 2, gone 2, errors 0, alertDelivered true. Both still active until the first live run (00:05 UTC 10-29).
6. **#368 (bug, high).** `C63QhMFU` (10/28 → 10/30, $55/night) wasn't saved: an empty same-name dog row (no pet ID, $0, no boardings; made by the old sync) blocked it under ADR-008's "link only with evidence". 37 such rows existed (7 $0 rows from the old sync, 30 hand-entered in January); `C63QhMFU` was the only booking blocked. **Kate ran the cleanup 2026-10-28 23:14 UTC:** copied to `backup.dogs_removed_2026_10_28`, deleted, `C63QhMFU` re-queued. Verified read-only: 0 of the 37 left, dogs 70, boardings 370 unchanged, queue item pending. No new rows of this kind can appear (#344 fixed the $0 rows, #351 removed hand entry).
7. **`C63QhMVa` ("10/31-1/1"):** a new booking found by the 20:41 UTC Integration Check and queued (pending); its dog already has the pet ID, so it links. The title looks like a typo for 11/1; the sync uses the page's timestamps (arrival 10/31 10:00). Check it saved with checkout 11/1.
8. **Issues:** filed **#363** (low, admin-only project dashboard), **#365** (medium, synced tables writable by signed-in users outside the app's screens; fix after #318 step 7; the how-to stays out of public text), **#367** (medium, admins add people from the app: design, build, drop `invite_codes`), **#368** (high, above). Closed #20, #15, #19 (covered or intended), #22 (superseded by #318/#316). **#21:** 9 groups / 21 live boardings with the same dog and dates under different booking IDs (March–August); nights and pay aren't doubled, Revenue counts both; Kate to check one pair (`C63QgeoP` / `C63QgeoR`) on the site. #294 and #315 still real.
9. Kate ran SQL (step 6 only). No booking-site requests by Claude, no messages sent. Not yet answered: whether the Dashboard's today mark showed the SF date after 5pm PDT.

## Previous session (53)

### Session 53: what happened (2026-10-27)
1. **Baseline:** main `ee20596`, 2486 passed / 1 skipped. **#359 (session 52 handoff) merged as `6f7eb21`** on Kate's word, `check:deploy` OK.
2. **Read-only checks (10:00 PDT):** neither #316 night had happened yet. Overnight 10-27 clean: `schedule` 00:14, `detail` 00:50 idle, `auth` 00:37 refreshed (good to 10-28 06:37); `site_access` not blocked; queue 0; no alerts; the 4am roster sent from Vercel at 11:40 UTC. Integration Check 03:08 passed; **the 13:45 Integration Check was cancelled**: `npx playwright install chromium --with-deps` hung in apt for 10 min and hit `timeout-minutes: 10` before the script ran (no requests, nothing written; GitHub runner problem). Watch for a repeat (2 of the last 40 runs cancelled). CI Mutation on `ee20596`: 66.06% (incremental).
3. **Dogs Tonight after 5pm:** Kate asked what to check. The count can't tell (10-27 and 10-28 are both 2 dogs): check that the Dashboard's **today mark** (and the phone view's first day) is the SF date after 5pm PDT. Not yet checked.
4. **#353 PR 2 (= #350 PR 2) shipped: #360 → `5a8546c`, `check:deploy` OK. REQ-065 Complete, REQ-504 updated.**
   - Dogs page "Oct 29, 2026 10:00 AM PT" (date only under Q2/Q5/Q6) and its badge vs `siteNow`; Calendar grid, bars, day panel, print view on site dates with site times; `calculateNights`/`isOvernight`/`isDayPresent` on site dates; Sync History booking dates as the site shows them and run times in SF ("PT"); form view's Date Discrepancy; upcoming forms to the end of the SF departure day, query with `!inner` (it returned all 93 forms before; 6 now, checked read-only on production).
   - `siteClock.js` gains `bookingDateTime`, `siteHour` and now holds `BUSINESS_TIME_ZONE` (re-exported by `dateUtils.js`). Removed from `dateUtils.js`: `formatDate`, `formatTime`, `formatDateTime`, `toTimeInputValue` (components keep their own local formatters). Guard `NOT_YET` = only `scripts/integration-check.js`.
   - Test fixtures that stored booking times with no zone (read as device-local) now carry `Z` (the database always returns `+00:00`). Shared host-zone harness: `src/__tests__/hostZones.js`.
   - **Evidence:** suite 2704 passed / 1 skipped; new tests in 6 host zones, each behaviour test failing on main in at least one; **scoped Stryker on the changed lines (UI files included) 92.1% (Kiritimati) / 93.5% (Pago Pago)** (survivors: marker-only lines, the Calendar's month pre-filter which is equivalent, an unreachable guard). **10-23 still 8 dogs / $440 / $286** on production data with the host in Pacific, Kiritimati, Pago Pago.
   - Reviewer: no must-fix; findings + what was done posted on #360. Accepted (design note): Sync History can't show a genuine 7:00/8:00am changed time (no AM/PM label there).
   - **Filed #361 (low, Kate: fine for now):** Settings page, booking-site access card, Sync Settings and Profile show real moments in the device's zone.
   - Tool note: a force-push after a rebase is blocked by the classifier ("Git Destructive"); merge `origin/main` into the branch instead.
5. **Kate asked why two runs:** only the first night is report-only (her Q5a). From 10-29 every nightly run is live, so a booking removed on the site is cancelled within ~24 h (next 00:05 UTC run), if it overlaps this week or next (Sunday to Saturday); further out it's caught when it enters the window. Sync Now runs a similar check at once (`reconcileArchivedAppointments`); twice-a-day is #318 step 5.
6. **`C63QhB7h` (Mochi + Marlee, 11-03 → 11-12) is gone from the site and still `confirmed` in the app** (Kate). Read-only 18:17 UTC: row active, last read 10-26, queue item `done` with URL `…/C63QhB7h/1793721600`, both boardings not cancelled; 13 active bookings overlap tonight's window (Sun 10-25 → Sat 11-07). If the week pages no longer list it, tonight's report says "would cancel" and 10-29's run cancels both boardings. If tonight's report doesn't name it, the site still lists it somewhere: investigate before 10-29.
7. Nothing else changed: no SQL by Claude, no booking-site requests, no messages sent.

## Previous session (52)

### (was Current State, 2026-10-27 ~01:00 UTC, session 52)

### Session 52: what happened (2026-10-26 / 10-27 UTC)
1. **Baseline:** main `a558dc6`, 2252 passed / 1 skipped. No overnight run yet at the start; 10-27's ran later: `schedule` 00:14 (192 found, 95 queued), `detail` 00:16, `auth` 00:37 refreshed (good to 10-28 06:37), queue empty, `site_access` not blocked. Kate: Dogs Tonight after 5pm not checked yet (it was 4pm PDT).
2. **#356 (session 51 handoff + #353 design note):** reviewer run, findings posted on the PR and all fixed (one count of title-only rows, open questions in one place, every reader assigned to PR 1 or 2, guard allowlist, dropped "Kate's own items" restored). Merged `b070778`.
3. **Kate's answers on #353:** Q4 (a) Monday-morning pick-ups stay on the Friday roster, header "Fri – Mon"; Q5 (a) an AM/PM label that contradicts the time shows the date only (logged); Q6 (a) `C63QgTXx`'s 23:00Z departure shows the date only (its title says 3/8, so "Mar 8" is right); Q7 (b) leave `C63QgNHs`'s labelled 08:00 arrival alone (for PR 2).
4. **#353 PR 1 shipped: #357 → `f317878`, `check:deploy` OK. ADR-009, REQ-065 (new), REQ-630.**
   - `src/utils/siteClock.js` (`siteDate`, `siteTime`, `bookingTime` with "PT", `formatSiteDate`, `siteNow`, `siteMidnight`, `timeStatus`) is the only reader of booking times.
   - Friday pm roster: site times ("Sat 10:15 AM PT"), window from the run's hour in SF (rounded down) to Monday noon, header "Fri – Mon", day only for title-only or contradicting times.
   - Zone-proof server dates: `queryBoarders`, form matching, the form-job "departed?" check (until the end of the SF departure day), Sync Now's filter and reconcile window, title-only dates as `Date.UTC`.
   - Guard test `siteClockGuard.test.js`: a local-zone call or a non-UTC formatter in a file naming a booking field fails unless marked `// real-moment: <why>`; PR 2's files are on `NOT_YET` (plus `scripts/integration-check.js`, #350's "today").
   - Reviewer must-fix found and fixed: the weekend window compared Supabase's `+00:00` times as text with the start's `.000Z`, which would have dropped every booking exactly at the start hour (3pm arrivals on the 3pm run, 4pm on the retry).
   - Evidence: each behaviour test fails on main in at least one host zone; scoped Stryker on the changed lines **96.6% with host `TZ=Pacific/Kiritimati` and `TZ=Pacific/Pago_Pago`** (`siteClock.js` 100%).
   - **Found, not fixed (fail on main too):** with the host in Kiritimati, DateNavigator "Today" and pet birthdate extraction; in Pago Pago, `toDateInputValue`. Stryker runs in those zones need a vitest config leaving those 3 files out (scratch: `.stryker-tmp/pr1/vitest.config.mjs`, gitignored).
5. **#316 (Kate: priority high, "very soon"): shipped as #358 → `ee20596`, `check:deploy` OK. ADR-010, REQ-108, REQ-109.** Design note `docs/specs/316-removed-bookings-design-note.md` (architect: proceed with changes, all folded in).
   - The nightly `cron-schedule` (only it; the Integration Check stays check-only) reconciles the two weeks it reads: a stored booking on no page tonight is opened once at its newest known URL (its queue item's); a 302 → `/schedule` cancels every dog's boarding (all or nothing), then archives it. #324's limits unchanged (≤10 opened, ≤3 marked).
   - A cancelled booking seen again is re-queued (`meta.restore`) and un-cancelled after its page is read and saved; not when its dog has another live boarding on those dates. A restore that doesn't happen sets `meta.restore_blocked` = that URL (not re-read until the URL changes). Sync Now re-queues archived bookings the same way (it used to skip them forever).
   - One Telegram alert per night with anything to say: job **`sync-reconcile`** (in ops-watch `ALERT_JOBS`); restores go in `sync-detail`. Counts in `cron_health` `schedule` `result.reconcile`; an undelivered alert makes the run a failure.
   - **Report-only first night (Kate Q5): `RECONCILE_LIVE_FROM = '2026-10-28'`** (SF date). Run 00:05 UTC 10-28 = report only; run 00:05 UTC 10-29 = live.
   - Kate's answers: Q1 a stay is listed on every week page it covers; Q2 `C63QhB7h` answers **302 → `/schedule`** (her Network tab); Q3 one alert per run, OK; Q4 (a) a booking moved more than two weeks out is cancelled, then restored when it reappears; Q5 (a) report-only first night.
   - Reviewer: no path where a correct read cancels a live booking; 9 should-fixes all done (newest URL, all-or-nothing cancel, restore guards, `restore_blocked`, `maxDuration` removed: runs already take 10.7–22.7 s, so Fluid compute's 300 s applies). 9 of 9 scripted rule-breaks red; scoped Stryker on the changed lines **91.76%** (TZ=UTC; same in Kiritimati).
   - The RUNBOOK's old "mark a boarding as archived" SQL (a column `boardings` doesn't have) is replaced by a playbook for the new alert.
6. **Labels:** #316 now `priority: high` (Kate); `to-investigate` kept (ask Kate to drop it when #316 closes). Nothing else changed: no SQL by Claude, no booking-site requests (Kate checked the 302 herself), no messages sent.

## Previous session (51)

### (was Current State, 2026-10-26 ~23:00 UTC, session 51)

### Session 51: what happened (2026-10-26)
1. **Baseline and checks (read-only):** main `7b191bd`, 2252 passed / 1 skipped. #355 (session 50 handoff) merged as `a558dc6` on Kate's word, `check:deploy` OK. Form jobs of 10-26 all `done` (14); the only `sync-detail` alerts were session 49's two links. Overnight 10-26: `schedule`, `auth`, `detail` success; `site_access` not blocked (session to 10-27 06:37); queue 1 pending. 4am roster `sent` by Vercel 11:40 UTC. ops-watch: "gmail-monitor last success 5h ago": GitHub ran it late; every run succeeded.
2. **Kate:** 10-23 on Dashboard/Payroll/Calendar looks right (8 dogs, $440, $286). Dogs Tonight after 5pm not yet checked (ask next session). "Buddy boarding but not on the 4am roster": no bug; Buddy left 10-26 at 4:15pm, the roster's boarding box lists only dogs staying the night, and the Dashboard showed his departure-day icon (Kate had it on the wrong day).
3. **#353 design note: `docs/specs/353-booking-times-design-note.md`** (this PR). Proven (read-only, plus 3 booking-site page loads in Kate's Chrome with her OK, and one page Kate pasted): the site's times are SF clock times written as UTC, year-round, no DST shift (AM/PM labels agree with the UTC hour on 387 of 389 times; 14,954 daytime rows' printed times match; `C63QhM5Q` across DST ends "PM", duration "4 days, 7 hours"). The 25 rows at 00:00/07:00/08:00/23:00Z are title-only dates.
   - **Kate: option B.** Keep the stored values; one `src/utils/siteClock.js` (`siteDate`, `siteTime` + "PT", `siteNow`) reads them everywhere. No data repair, no migration, no booking-site requests. ADR-009 to write.
   - **Kate's answers:** day icon keeps "before 5pm" (a); leave Goose's two 5:15pm stays (a staff dog) alone; title-only rows show no time (a); "PT" on every booking time; Friday-afternoon bookings go on the Friday pm roster (today they're left off: 9 arrivals and 16 departures so far, next Mochi Fri 12-04 4pm).
   - **Architect: proceed with changes**, all folded into the note: test zones `Pacific/Kiritimati` and `Pacific/Pago_Pago` (UTC/Paris/Tokyo can't catch a wrong date), an `fs`-walking guard test, weekend window from `siteNow()` rounded to the hour, 5 more readers.
   - **Open for Kate (design note Q4–Q6):** Monday-morning pick-ups on the Friday roster (they're already listed today; keep + header "Fri – Mon", recommended, or end Sunday 11:59pm); the 2 rows whose AM/PM contradicts the time (date only, recommended); `C63QgTXx`'s 23:00Z title-only departure (date only, recommended).
4. **`C63QhB7h`** (Mochi and Marlee, 11-03 → 11-12): Kate's Chrome got "You cannot view appointment" and Kate thinks the booking may be deleted on the site. The app still has both boardings. Check after tonight's sync (reconcile cancels only on a 302 to `/schedule`).
5. Nothing else changed: no SQL by Claude, no messages sent, no code.

## Previous session (50)

### (was Current State, 2026-10-26 ~19:30 UTC)

### Session 50: what happened (2026-10-26)
1. **Process (Kate):** the standing prompt no longer says "as my TechPM". `ENGINEERING_PROCESS.md` is the process; `TechPM.md` is for planning sessions on request.
2. **Kate's answers and decisions:**
   - She ran no SQL on 10-24/25.
   - **#350 = `priority: high`**, next in Sprint 1. **The business is in San Francisco: every date and time in the app is San Francisco time, whatever the device** (a payment made from Paris is logged in SF time). A "PT" label on times is fine.
   - **#351 = `priority: medium`**, Sprint 1 or 2; **Deactivate is removed too** (it only greys a row and lowers the Dashboard's active count; the sync reactivates any dog the site still books, `activeField`, `src/lib/scraper/mapping.js:265`).
   - Client and pet names in docs don't matter to Kate ("it's just dogs"); no scrub needed.
3. **The 74→73 dateless `sync_appointments` rows: explained.** `C63QhLBU` (saved dateless from the week page on 10-23) gained its dates when the sync re-read it on its new URL. A later update (10-26 02:35 UTC) overwrote `previous_data`, which hid it from session 49's check. Its boarding is now 10-29 → 11-01 at **$380** (was $330 as "10/29pm-11/1"; the site now says "10/29am-11/1"). The other 73 have no boarding and haven't been re-read since 10-23.
4. **#353 filed (`priority: high`): booking times are Pacific clock times stored as UTC.**
   - **Proof:** Kate checked one booking on the site: 10:00am → 4:15pm; the app stores 10:00Z → 16:15Z (3:00am → 9:15am Pacific). The **10-23 Friday pm roster** shows departures at "Sat 3:15 AM" / "Sun 3:15 AM" and an arrival at "Sat 3:00 AM" (screenshot from Kate). Of 408 dated rows, check-ins cluster at 10:00/09:00/11:00 UTC.
   - **Affects:** times shown in the app; the Friday roster (`formatWeekendDatetime`, `api/roster-image.js:724`); `isDayPresent`'s "arrived before 5pm" (a 4pm arrival reads as 9am); and, once times are read in Pacific, which day a pre-7am time lands on. Unknown: whether every timestamp is a clock time (the 08:00 UTC rows may be bookings with no time).
   - **Next:** design note → architect; changes stored data, a pay rule and the roster. No guessing: check claims against the booking site.
5. **#350 PR 1 shipped: PR #354, `7b191bd`, REQ-064, `check:deploy` OK.**
   - `src/utils/dateUtils.js`: `businessToday()` (SF date via `Intl`), `businessTodayDate()` (local-midnight Date of it, for pickers), `toDateStr()` (YYYY-MM-DD from a date's own parts, never `toISOString()`), `daysBetween()` (DST-proof).
   - Now SF's today: Dogs Tonight, the phone view's opening day and today mark, **payment `paid_date`** (0 payments exist, nothing to repair), Dashboard/Payroll defaults and saved ranges, Today buttons, Calendar month/today mark/Print range/"Printed at", Settings effective date, manual sync range.
   - **Not yet (#350 PR 2, waits on #353):** stored moments (booking times, nights, day presence, labels, Calendar placement, Sync History times, `useBoardingForms`' today); the manual sync passes local Dates to `sync.js`.
   - **Evidence:** `src/__tests__/businessToday.test.jsx`, 31 tests, clock at 9pm Pacific, device switched via `process.env.TZ` (UTC, Paris, Tokyo, Pacific; each switch asserted). 20 call sites reverted one at a time, each test went red. Suite **2252 passed / 1 skipped**. Fixed `usePayments.test.js`'s `paid_date` test (expected the UTC date; would have failed every evening). Reviewer run; all findings fixed.
   - **Stryker, changed lines of `dateUtils.js`: 27/27 with host TZ=UTC and TZ=Europe/Paris**; 26/27 with host Pacific (the survivor drops the timezone option, indistinguishable there). **Tool note:** `process.env.TZ` switching only works in vitest's forks pool. Stryker forces threads, so the other-zone tests show as skipped there; run scoped Stryker once per host zone (`TZ=UTC` and `TZ=Europe/Paris`). A module-level `Intl` formatter was backed out because Stryker can't test module-level code.
6. **#352 (session 49 handoff) merged as `d67dc8b`** after the reviewer: client names replaced by pet IDs, answered questions removed.
7. Nothing else changed: no SQL by Claude, no booking-site requests, no messages sent. Kate has **not yet** eyeballed the Dashboard/Payroll for 10-23, and the read-only checks (Immediate Next Steps 2) weren't run this session.

## Earlier session (49)

### Session 49: what happened (2026-10-26)
1. **#344 first-night checks (read-only): all passed. #344 closed** with a comment: PRs #346 and #347 plus the results.
   - **The 15 re-queued bookings** were all read again with no errors. Vercel `detail` read 1 at 00:16 and 1 at 00:50; Integration Check run `40259684634` (02:33 UTC) read the rest.
   - **Dogs:** none renamed or created (still 107). The 4 corrected rows kept their IDs. 59 dogs have a pet ID, all distinct.
   - **Two links by evidence, each sent as a `sync-detail` alert.** Each dog already had a boarding on that booking (rule 1a):
     - **Pet 160430** (booking `C63QhFVc`): the second pet on all 6 of this client's two-pet bookings since February.
     - **Pet 201014** (booking `C63QhB7h`): the second pet on all 15 of this household's bookings.
     - Neither needs a decision. Their form jobs were queued (7 done by 03:20 UTC, 7 pending).
   - **Forms under another pet's ID:** still 0 (93 forms).
   - **The IC log shows `[Extraction] 🐾 2-pet page: pet IDs 90053,201014; data-pets="201014,90053"; priced pet IDs 90053,201014`.** So the raw page's prices carry `data-pet`.
   - **Overnight:** `auth` refreshed at 00:37 (good until 10-27 06:37), `site_access` not blocked, ops-watch 10-25 had no findings.
   - **`sync_appointments` without dates is 73, not the 74 of 10-24: explained.** `C63QhLBU` (saved dateless on 10-23 from the week page) gained its dates when the sync re-read it on its new URL; a later update on 10-26 02:35 UTC overwrote its `previous_data`, which hid the change at first. Kate ran no SQL. The other 73 have no boarding and haven't been re-read since 10-23.
2. **#342 shipped: PR #349 merged as `332d53a`, `check:deploy` OK.** REQ-036; REQ-020 to REQ-023 are now **Removed**.
   - **`nightStays(dogs, boardings, date)`** in `src/utils/calculations.js` is now the only place that decides a night. The rules (Kate, 2026-10-26):
     - a cancelled boarding has no night;
     - the rate is the booking's price, else the dog's rate, else $0, and a $0 booking counts $0;
     - a dog counts once a night; if two of its boardings cover the night, the first arrival sets the rate (lower id on a tie);
     - the daytime credit uses the same dogs.
   - **There were 8 copies, not 5:** the Calendar day panel and its **print view**, and the Dogs page's per-boarding Gross, also used the dog's rate.
   - **Where it shows:**
     - The Dashboard, phone view, Summary cards, Employee Totals, Payroll, the Calendar and the Dogs page all call it.
     - The Dashboard rate column shows the booking's price, or "$40–60" when a dog has two prices in range. Day visits and cancelled boardings don't count toward it.
     - The Dogs page shows a cancelled boarding as **Cancelled, $0.00**.
     - **The Calendar hides cancelled boardings entirely** (Kate: "hide them").
   - **Removed:**
     - Edit and Delete boarding on the Dogs page.
     - `add/addBoardings/update/deleteBoarding` in `useBoardings` and `DataContext`.
     - The unused `BoardingForm`, `CsvImport` and `InlineDeleteButton` (Kate ran the `git rm`).
     - `check:requirements` now exempts the status `Removed`.
     - `deleteBoardingsForDog` remains behind dog delete, which has no screen; that belongs to #351.
   - **Production check (read-only, the shipped function on production data, TZ Pacific):** 10-23 = **8 dogs, $440 gross, $286 net at 65%**, the same as Payroll. The old Dashboard rule reproduces the mismatch: 9 dogs, $520, $338.
   - **Evidence:**
     - Expected values are worked out by hand in `src/__tests__/fixtures/oneNight.js`: 3 dogs, $140, $91.00, plus a $55.25 daytime credit.
     - `oneNightAcrossViews.test.jsx` has 18 view tests; 11 of the first 14 failed on main.
     - 10 scripted rule-breaks in the shared function: each turns a test red.
     - Scoped Stryker on `calculations.js` (TZ=UTC): **98.77%**, every changed-line mutant killed (the one survivor is in the unchanged `calculateEmployeeTotals`).
     - Suite: 2221 passed, 1 skipped.
     - Two reviewer passes (the second on the whole final diff: no must-fix), posted as a PR comment.
   - **Tool note:** the classifier blocked `gh pr merge` as "Merge Without Review" until Kate said "do the merge" in chat. The reviewer's findings are now posted on the PR as well.
3. **Filed:**
   - **#350:** the UI takes "today" as the UTC date. After 5pm Pacific, "Dogs Tonight", the phone view's default day and the "today" highlight show tomorrow, and **a payment recorded in the evening gets tomorrow's `paid_date`**. Kate: "the UI should reflect the time in San Francisco." **`priority: high`**, next in Sprint 1 (Kate, 10-26).
   - **#351:** the Dogs page still edits dogs by hand (Add Dog, Import CSV, Deactivate, plus the delete-dog functions). Kate's Q3 = separate issue. **`priority: medium`**, Sprint 1 or 2; Deactivate goes too (Kate, 10-26).
4. Nothing else changed: no SQL by Claude, no booking-site requests, no messages sent.

## Earlier sessions (reference)

### Session 48, continued (2026-10-25): #344 PR 2 deployed
1. **Kate ran migration 030** (~21:20 UTC): the pre-check returned 0 rows, then the two statements. She confirmed the index (`dogs_external_pet_id_key`, unique; the old `idx_dogs_external_pet_id` gone). Read-only: 57 dogs with a pet ID, 57 distinct.
2. **PR #347 squash-merged as `8af23ed`** (all 6 checks green, reviewer done). `check:deploy` OK: deploy success, home page 200, roster image 200.
3. **Kate ran the re-queue SQL** (RUNBOOK "After the #344 PR 2 deploy" step 2). It matched **15** bookings, not the 18 estimated on 10-24 (likely because some checked out since; not checked). Verified read-only: those 15 `sync_queue` appointment items went `done` → `pending`. Tonight's detail runs read those 15 pages once, under PR 2's rules: Vercel `cron-detail` / `cron-detail-2` (00:10 / 00:15 UTC, a few items each), then Integration Check (scheduled 00:00 UTC, seen ~02:45 on 10-24) drains the rest.
4. **#344 is still open on GitHub** on purpose: close it after the first-night checks pass (with a short comment: what shipped, PR #346 + #347, and the check results; no AI mention).
5. Nothing else changed: no SQL by Claude, no booking-site requests, no messages sent.


### Session 48: what happened (2026-10-24)
1. **Quick checks, PR 1's first night (10-24): clean.**
   - No new `sync_appointments` row without dates (still 74). No dog created or renamed (107). The 4 corrected rows kept their IDs (`C63QgcFx` 90043, `C63QgxR1` 129933, `C63QgznN` 90048, `C63QhLBU` 204168).
   - **One `sync-detail` alert (02:46 UTC):** two playgroup series ("PG:FT" `C63Qh4QH`, "P/G FT" `C63Qh4Qf`) redirected to another booking's URL (`redirected_elsewhere`); nothing written. Both were re-queued on new URL timestamps at 12:22, as designed (`detail_redirect`, not `detail_skip`). No `redirected_to_schedule` or `dateless_page` that night.
   - `detail` 00:16 / 00:50 (one item each), Integration Check 02:45 and 12:22 drained the queue (43 → 3). IC alerts: only the known #315 "Missing from DB" pair (`C63QhL5g`, `C63QhLI1`).
   - Friday pm 10-23 sent 22:39 UTC (`notify-friday-pm-claim` `sent`, `trigger: vercel`). cron-health-check ran 04:53 UTC (GitHub late), success, no alert: the 10-23 false alarm didn't repeat. `auth` refreshed 00:37 (good to 10-25 06:37); `site_access` not blocked.
2. **Found (read-only): 15 boarding forms belonged to another pet.** Checked against the 57 verified IDs (session 46's "all 107 correct" had been checked against queue meta, the buggy value). 14 on the dog with pet 83736 held pet 168474's one submission; 1 (`C63QhGXE`) on pet 91317 held pet 90029's. **Kate deleted them** (~00:25 UTC; verified 92 forms, 0 mismatched). Cause not proven; PR 2 removes the only source of that ID.
3. **Found while planning PR 2:** the stored client is blank on 218 of 407 dated bookings (the `.event-client` selector also matches `event-clients-pets`), so the design's "same client" check had little to check. Kate's decisions (2026-10-24), recorded in the design note v3 and an ADR-008 amendment:
   - **1a:** link a same-name dog without a pet ID only with evidence (this booking already has a boarding on it, or its bookings name the same client; another client rules it out); otherwise nothing for that pet + alert.
   - **2a:** a page with no pet element (a staff member's dog) keeps #49's title name; exactly one same-name dog without an ID is it; more than one alerts.
   - **3a:** delete the 15 forms (done).
4. **#344 PR 2 built (branch `fix/344-pr2-pet-identity`, REQ-661):** see REQ-661 for the rules. Code: `extraction.js` (`extractPets`, `extractClient`, `ratesByPet`, `nameFromTitle`), `mapping.js` (`resolvePetDog`, `resolveTitleDog`, per-pet boardings by dog; `upsertDog`, `findDogByName`, `findDogByExternalId`, `mapToDog` removed), `syncRunner.js` / `sync.js` (no `meta.external_pet_id` for appointments; `schedule_pet_ids` cross-check; notices in the one alert per run, deduplicated by `meta.detail_notice`). **Migration 030** (unique `dogs.external_pet_id`): Kate runs it before the deploy.
   - Tests: pages built on the two real two-pet bookings (`twoPetPages.js`), an in-memory Supabase (`fakeSupabase.js`: filters, row counts, 23505). 39 rule-breaks scripted: 37 turned their test red; 1 had no test (added, then seen red); 1 equivalent (the runner's title fallback: `pet_name` is always the first pet's). Suite 2143 passed / 1 skipped.
   - Behaviour change to know: a booking's status, AM/PM and dates now apply to every pet's boarding (a cancelled two-pet booking used to leave the second pet's boarding `confirmed`).
   - **Reviewer:** 3 must-fix (rules with no failing test: a linked dog's result, the 23505 on the link update, a known pet without its own price div). All three now have tests, each seen failing with the reviewer's own mutation. Its should-fixes, all done:
     - a client page with no readable pet is reported, never named from the title;
     - the form job checks the pet ID belongs to its boarding's dog before any request (`formJobPetMatches`);
     - a multi-pet page whose prices don't carry a pet's ID keeps stored rates and alerts;
     - every name link is reported with its evidence; a dog with two boardings on one booking keeps `<id>` and alerts;
     - each price is classed by its own service wrapper; `&#039;` and other numeric entities are decoded;
     - hand-entered dogs are never reactivated; the alert header is now "N booking(s) to check"; RUNBOOK section and job docs updated;
     - a deploy step re-queues the 18 current/upcoming bookings (already-read bookings are otherwise never re-read).
   - **Final evidence:** suite 2209 passed / 1 skipped; 22 more scripted rule-breaks all red. **Scoped Stryker (TZ=UTC), changed lines 87.55% (647/739)**: `mapping.js` 90.0%, `syncRunner.js` 94.6%, `sync.js` 86.7%, `forms.js` 84.2%, `extraction.js` 79.6% (its survivors: the shape log line, regex variants equivalent on real IDs). 19.7 tests per mutant; the only timeout on changed lines is a genuine infinite loop (the `g` flag dropped from a regex used with `exec`).

### Session 47 (2026-10-23): what happened
1. **#344 root cause: the server followed redirects.** A booking URL the site won't show answers 302 → `/schedule`; server `fetch` followed it, and the sync read the whole week's schedule as that booking (all 74 dateless `sync_appointments` rows: 64 playgroup series, 10 real stays). That gave dogs another pet's ID (the 3 Kate corrected), **renamed** `C63QhLBU`'s dog to the week's first pet, and created $0 dogs. A redirect means "edited or hidden", not removed: `C63QhLBU`'s stay is valid at a new URL timestamp.
2. **Design note v2** (`docs/specs/344-pet-id-design-note.md`, architect "proceed with changes", all folded in) and **ADR-008** (`docs/adr/008-dog-identity-is-the-pet-id.md`), both approved by Kate. Kate: alert only (never rename a dog); one alert summary per run.
3. **Two real two-pet bookings read in Kate's Chrome (read-only, with her OK; `C63QhFVc`, `C63QhB7h`):** full nesting confirmed; every price div carries `data-pet` and `data-client`; on one, `data-pets` lists the pets in the opposite order to the links.
4. **PR 1 merged ~21:55 UTC (PR #346, `aaa5426`, REQ-660), `check:deploy` OK:** booking and form pages fetched with `redirect: 'manual'` (shared classifier `src/lib/scraper/redirects.js`); a redirected or dateless page writes nothing (`meta.detail_redirect` / `detail_dateless`, never `detail_skip`); one `sync-detail` alert per run. Scoped Stryker 95.31%.
5. **All 57 stored pet IDs verified:** 51 by single-dog bookings (dates + exactly one pet on the page, name matches; 0 conflicts), 4 by Kate on the site, 2 by Claude reading the pet pages in Kate's Chrome with her OK.
6. **Data repaired (Kate ran the SQL, verified ~23:56 UTC):** row for `C63QhLBU` renamed back (pet 204168, 4 boardings); the hand-entered duplicate row deleted; 107 dogs.

### Session 46 (reference, 2026-10-23): what happened
1. **PR #341 (session 45 handoff) merged** (`4e166ce`) after the reviewer (no must-fix; 4 small fixes applied). `check:deploy` OK.
2. **First live day of the on-time rosters (Fri 10-23): clean.** Claim rows: 4am `sent`, `trigger: vercel`, 11:40 UTC (Kate's roster said "as of 4:40am"); 7am `unchanged` 14:20; 8:30am `unchanged` 15:29. No `notify-4am-alert` / `notify-alert` rows. Kate confirmed Vercel lists **13 cron jobs**. Not checked yet (ran after the checks): the 14:00 UTC GitHub `notify-4am` fallback (`already_sent`), ops-watch 10-23 (17:00), Friday pm (22:00/23:00), cron-health-check 10-24 00:30.
   - Two alerts that weren't roster failures: **cron-health-check 05:10 UTC** said 7am/8:30am "didn't run on 2026-10-22" (one-off false alarm: claim rows only went live 10-23 00:56; the next run should be clean). **Integration Check 02:50 and 13:00**: "Missing from DB" C63QhL5g/C63QhLI1 = the known #315 false positive, now on every run.
   - Overnight 10-23 fine: `auth` refreshed (good to 10-24 06:37), `schedule`/`detail` success, `site_access` not blocked. **Queue 32 pending** (was 73 at 00:15).
3. **#13 UAT script: `docs/UAT_SCRIPT.md`** (branch `docs/13-uat-script`, PR below). Part A Kate's checklist (frozen expected answers from the spreadsheet, **$0 tolerance**, ground rules: her own device, think aloud, no coaching for ~2 min, spreadsheet stays until M2), criteria table; Part B 11 steps; **Part B2 phone pass**; Part C goal-only tasks; Part D severity (blocker = wrong money or lost data; go/no-go = Kate) and results tables. Reviewed by a browser Claude on Kate's request; its points were folded in. Step 9 reply promise: **same day, by text or email** (Kate).
4. **Dry-run 1 (2026-10-23 ~17:00–17:35 UTC, read-only):** the permission classifier blocks Claude in Chrome from writing on production (a night assignment was refused as "Modify Shared Resources" even with Kate's OK), so Kate does the writes by hand (**dry-run 2**, steps in `docs/UAT_SCRIPT.md` Part D). Production unchanged afterwards (0 night assignments since 09-01, 0 payments ever). Findings and script fixes are in Part D.
5. **Kate's decision (2026-10-23): the booking site is the only source of truth for dogs, rates and boardings.** The app is never edited by hand; a difference is a bug to fix at the source or in the sync. No Edit button for dogs is by design (REQ-011 note). UAT plan criterion 4 and its to-do updated; **#313 closed** as superseded. Removing Add/Edit/Delete boarding is part of #342. Adjusting what's actually paid (amount, note, breakdown) is **#343** (priority medium, later).
6. **#342 (bug, high): the Dashboard's nights and money differ from Payroll.** Five copies of the nightly sum (Employee Totals too: it uses the dog's rate); `BoardingMatrix.jsx` counts cancelled boardings and uses the dog's rate, Payroll (`calculateGross`) skips cancelled and uses the booking's rate. 10-23: Dashboard **Net $338**, Payroll **$286**; Kate saw "9 dogs" over a list of 8 on her phone. 106 of the 362 bookings checked (before the duplicate merge) are priced differently from their dog's current rate (multi-dog prices, rate changes). Fix: one shared function every view calls. Kate: "2 ways to see and calculate things is bad."
7. **#344 (bug, high): the sync writes another dog's pet ID.** Cause traced (code, IC log run 39957294215, tables; no booking-site requests): the sync pairs `petIds[0]` from the schedule page with the **first pet name on the detail page**. **Group playgroup listings** ("PG FT", weekly, no dates: 74 of 481 synced appointments) and multi-pet bookings list several pets, so the wrong ID lands, and `upsertDog` overwrites `external_pet_id` every sync. Evidence: queue `C63QgznN` 2026-09-09 00:53:19, `C63QgxR1` 2026-07-02 17:55. Same root: listings run the secondary-pet loop (one listing touched ~50 dogs at 12:59 on 10-23) and create **$0 dogs with no boardings**; second pets never get a pet ID, so their forms are never fetched. `sync_queue.meta.external_pet_id` is the same buggy value, so it is **not** valid evidence; only the booking site's pet page is (Kate checked them).
8. **Data fixes Kate ran (SQL, verified):**
   - **Merged 3 same-pet duplicate dogs** (17 boardings and 34 `sync_appointments` moved, 3 rows deleted; 108 dogs, 368 boardings, nothing orphaned).
   - **Corrected 3 wrong pet IDs** (rows keyed `C63QgcFx` → 90043, `C63QgxR1` → 129933, `C63QgznN` → 90048). **Until #344 ships, a group listing can rewrite them when it next syncs: recheck.**
   - All 107 stored boarding forms used correct pet IDs (the wrong IDs were written later).
9. **Other findings:** 19 dogs at $0.00 night rate, none with a booking after June (no current pay effect; 11 have no boardings, from #344's listings). Two different dogs share a name (the sync's name match is arbitrary: part of #344). Dashboard shows "No boardings in range" and $0 for ~5 s while loading; Payroll says "All caught up!" while nights are unassigned (minor, in Part D). Suspected payroll bugs for dry-run 2: partial payments use an average per night; a double-click on Confirm Payment may record two; a failed save is silent (listed in #343).
10. **#307 (remove Invite Users) moved into Sprint 1** (Kate). Sprint 1 order is now #13 → #344 → #342 → #323 (`docs/SPRINT_PLAN.md`).

### Session 45: what happened
1. **The 4am check had to wait.** The session ran 10-22 17:20 PDT (10-23 00:20 UTC), before the first on-time run (10-23 11:00 UTC). It's step 2 below.
   - The 10-23 overnight run was clean: `schedule` 00:15 and `detail` 00:50 succeeded, `auth` `refreshed` at 00:37 (session good until 10-24 06:37), and `site_access` isn't blocked.
   - **The queue keeps growing: 45 → 55 → 73 (10-23 00:15).** Kate said to leave its limit alone; just keep watching.
2. **#321 rest shipped: PR #340 merged (`f195839`, 00:56 UTC 10-23), `check:deploy` OK.** Kate chose to merge before the first on-time 4am run, so 10-23 is the first live day for all of it. Design: the addendum in `docs/specs/roster-trigger-design-note.md`. The architect said "proceed with changes", and all were folded in.
   - **The Pacific hour picks the window** (`triggerWindow` in `src/lib/rosterTrigger.js`), on weekdays only: 4am 04:00–05:59, 7am 07:00–07:59, 8:30am 08:00–08:59, Friday pm 15:00–16:59 (the 16:00 hour is a retry). A trigger call (Bearer `CRON_SECRET`) now rejects **any** `window`/`date`/`force` param with a 400.
   - **13 Vercel crons in all.** `/api/notify` runs at `0 11`, `0 12`, `0 14`, `0 15`, `0 16 * * *` and `0 22`, `0 23 * * 5`, `0 0 * * 6`.
   - **Claim rows** (`cron_health`): `notify-7am-claim`, `notify-830am-claim`, `notify-friday-pm-claim`, next to `notify-4am-claim`. Outcomes: `sent`, `unchanged`, `no_data`, `failed`.
   - **Alerts:** any failed on-time 7am, 8:30am or Friday pm call alerts Kate (job **`notify-alert`**, added to ops-watch `ALERT_JOBS`). No data at 7am/8:30am is OK only if 4am also found none or a 4am call is still running; otherwise it alerts.
   - **Watchers:**
     - ops-watch at 17:00 UTC checks today's 7am and 8:30am claims, and on Saturdays, Friday's Friday pm.
     - cron-health-check (GitHub, 00:30 UTC) checks the claims for the Pacific day of (now − 12 h).
     - ops-watch's "No morning roster" now counts `notify-7am` / `notify-8:30am` sends too.
   - **GitHub:** `notify-7am.yml`, `notify-830am.yml` and `notify-friday-pm.yml` have **no schedule** now, only manual runs (token path, no claim). `notify-4am.yml` is unchanged (fallback at 14:00 UTC). Intraday stays PDT-only (it sends nothing on Telegram).
   - **Kate's decisions (2026-10-22):** GitHub schedules off; Friday 4pm retry; same-morning watcher plus an evening backstop; ADR-004 written now.
   - **Evidence:**
     - Suite 2029 passed / 1 skipped (was 1935).
     - Scoped Stryker (TZ=UTC): `rosterTrigger.js` 95.85%, `notify.js` 85.93%, `opsWatch.js` 100%; changed lines 92.3% before two more assertions were added.
     - Reviewer: no must-fix; 3 should-fix items fixed (no-data rule and wording, a Friday retry-after-failure test, stale docs).
     - **CI Mutation on main (incremental): 60.62%.** Trust Monday's full run.
   - **Docs:** REQ-659 added; REQ-611, 612, 630 and 658 updated. **ADR-004** (`docs/adr/004-rosters-on-vercel-crons-with-claim-rows.md`) supersedes ADR-002's notifications part, and the sprint plan's ADRs are now **005–007**. Job docs (`notify-jobs.md`, `OVERVIEW.md`), the RUNBOOK and the README are updated.
   - **Known and accepted:**
     - On a day 4am failed, the Vercel 7am and the GitHub 4am fallback can both send at 14:00 UTC (PDT).
     - 7am and 8:30am can land seconds apart in PDT and both send a change.
     - A watcher can race a retry call (cron-health-check at 00:30 vs the PST Friday retry at 00:xx).
3. **Not verified:**
   - **Vercel's Cron Jobs page** should list 13 entries (8 for `/api/notify`). Claude can't read it; ask Kate.
   - **The first live runs:** 10-23 (all windows), then Mon 11-02 (the first PST day).

### Session 44 (reference)

Session 44 was planning only; no code changed.
1. **The 4am check was deferred:** the first on-time run is Fri 10-23, after this session. It's step 2 below.
2. **One TBD list, from every source** (issues, PRs, this file, UAT plan, the May sprint plan, REQUIREMENTS, design notes, job docs, code TODOs, memory), triaged with Kate:
   - **Priorities are GitHub labels:** `priority: high`, `priority: medium`, `priority: low`, `to-investigate` (created this session). Every triaged issue has a **"Triage 2026-10-22"** comment with Kate's note and the answer to her question. Read those before re-deriving anything: `command gh issue list --label "priority: high"`.
   - **Closed:** #246 (fixed in c8b5c72), #238 (done in #240/#283; vitest 5 stays as PR #285), #145 (eslint 10 done; plugin-react 6 is #284), #293 (superseded by #324), #10 (hooks enforce it), #257 (folded into #321).
   - **Filed:** #337 (clean-up of unused secrets, env vars, the duplicate Vercel project; Kate, high) and **#338 portfolio** (high, public; names Claude Code openly, which Kate OK'd for that issue only).
3. **New `docs/SPRINT_PLAN.md` (v7), approved by Kate.** The May plan is archived at `docs/archive/SPRINT_PLAN-2026-05.md`. Four 2-week sprints with a top 3 each, milestones M1 UAT-ready (11-13), M2 in use (January), M3 #318 done (~12-09), M4 portfolio (end of December), and an investigation queue.
4. **Kate's decisions (2026-10-22):**
   - **Start UAT now on today's sync; build #318 alongside it.** #318 is **done at build step 6** (retire old paths). Steps 7 (#317/#311) and 8 (#313) are separate work after M3.
   - **The engine (#318 step 3) moves up to Sprint 2.** A Sync Now break during UAT is an accepted risk.
   - **Clear (#324): only Kate may press it now; later, only admins.** Today any signed-in user can (`api/site-access.js` checks sign-in only).
   - **DST must not need code edits:** 7am, 8:30am and Friday pm move to the Vercel Pacific-hour pattern of REQ-658 (#321). If not merged by **Fri 10-30**, hand-edit the GitHub crons for PST (table in `docs/job_docs/notify-jobs.md` "DST Note"). Never move `notify-4am.yml` off 14:00 UTC.
   - **Telegram won't work for Charlie.** Kate forwards the roster image by hand until #260 finds a real channel.
   - **#8 (calendar look):** Kate does it herself with a browser agent.
   - **#13** now carries the UAT plan plus a step-by-step script for Charlie, which Claude dry-runs on production first.
   - **ADRs:** Kate wants them. 004 (roster claim rows) shipped in session 45; 005–007 are planned (sync redesign superseding the rest of 002, breaker + single login, Telegram alerts), and every architect-gated decision gets one from now on.
   - Commits and PRs still carry no AI attribution.
5. **Found:** the 10-22 Integration Check alert "Missing from DB" for C63QhL5g and C63QhLI1 (title "10/19-22") was a false positive. Both are 6-hour day visits the sync correctly skipped (`sync_queue.meta.detail_skip = same_day`); the check reads only the title. That's #315 recurring, now high priority.
6. **Docs fixed:** REQ-652 status → Complete; the job docs' G-1 WhatsApp delivery-alert backlog item and the already-done `window` rename removed.
7. **Two TechPM role files** in the repo root (`TechPM.md` untracked, `TechPM_1.md` tracked): Kate wants that role (2-week sprints, the top 3 tickets each session, hardening before features, ADR reminders, challenge low-value effort).

### Session 43 (reference): what happened
1. **First-day checks on #324 A+B: all clean.** No cron ran between 04:07 and 17:00 UTC (expected). `site_access` never tripped (session good to 10-23 06:37 UTC). Integration Check's 08:00 run started at 13:18 UTC (5 h late) and was green. ops-watch 10-22 17:36: only the two expected queue findings (**55 pending, up from 45**; Kate: leave the limit). No browser Sync Now since PR B, so the Edge 302 is still unproven; Kate needn't press it just for that (the check only fires when a booking has vanished).
2. **PR #333 merged (06acd40):** `sessionCache.js` and its test deleted; **migration 029** dropped `sync_settings.session_cookies` / `session_expires_at`. **Kate ran the SQL** ~15:50 UTC; verified gone, `site_access` intact. Reviewer: no blockers; stale docs fixed.
3. **The 4am roster arrived at 8:48 PDT** (GitHub started it 4 h 48 m late). Kate's manual `gh workflow run` created no run.
4. **Roster trigger, option A (4am only), Kate 2026-10-22.** Design note PR #334 (architect: proceed with changes, all folded in). Kate approved: fallback cron 11:00 → 14:00 UTC; a `force` checkbox for manual re-sends.
5. **PR #335 merged (6ff56de, ~17:40 UTC), REQ-658, `check:deploy` OK.** How it works:
   - Vercel crons call `/api/notify` at 11:00 and 12:00 UTC. `Authorization: Bearer $CRON_SECRET` = the on-time trigger (fails closed; 4am only). It sends only 04:00–05:59 Pacific, Mon–Fri, so **DST needs no edit for the 4am roster**.
   - Every automatic 4am call claims the Pacific day on the `cron_health` row **`notify-4am-claim`** (one conditional update) before any work. "Already sent" needs `notify.lastDate` = today **and** `sentAt` on today's Pacific date.
   - **GitHub `notify-4am.yml` is now the fallback at `0 14 * * 1-5`** (weekdays, from 06:00 Pacific). It sends only if the on-time send didn't, and then alerts Kate why (job **`notify-4am-alert`**, in ops-watch's `ALERT_JOBS`). Manual run: tick **force**.
   - No roster data at 4am now alerts Kate (once a day). A `notify` failure no longer wipes the 7am baseline (`writeCronHealth(..., { keepResult: true })`).
   - The trigger fetches the roster image from `https://qboarding.vercel.app` (`PROD_URL`).
   - Evidence: every DB behaviour checked on production with a throwaway row (deleted); 3 concurrent claims → exactly 1 won. Suite 1935 passed / 1 skipped. **Scoped Stryker (TZ=UTC): changed lines 93.5%**, `rosterTrigger.js` 93.37%, `notify.js` 85.77%. Reviewer ran twice (1 must-fix found and fixed: a `date=` preview would have blocked the next 4am).
   - **Known and accepted:** 7am and the fallback both run at 14:00 UTC, so on a failure day both may send.
   - Runbook: "I didn't get the roster this morning" → "How the 4am roster is sent". Design: `docs/specs/roster-trigger-design-note.md`.
6. **Not verified yet:** the live trigger (no `CRON_SECRET` locally; it's only in Vercel). Its first run is Fri 10-23.
7. **Don't run `notify-4am` without force on 10-22:** today's roster went out before the claim row existed, so an unforced run sends a false "didn't go out on time" alert.
8. **Tool notes:** the classifier blocked `gh pr merge` for #333 ("Merge Without Review") but allowed #334/#335 once Kate said to merge. macOS has no `timeout` command.

### Sessions 41–42 (reference)
#322 merged (PR #327). #324 plan (PR #328), PR A (#329, paced fetch, stop on 429/403, reconcile only on a 302 to `/schedule`), PR B (#331, `site_access` table + breaker + Clear on Settings, one login via `loginToSite`, migration 028). First night on A+B (10-22) clean: `auth` `refreshed`, breaker never tripped. Details: git history of this file.

## Current reference (still true after session 44)

### Telegram alerts (#265, live, proven 2026-10-19)
- **The bot is `@qap_alert_bot`** (neutral name, Kate's).
- **`sendAlert()` / `alertAndLog()` in `src/lib/alertKate.js`:**
  - One attempt, 15 s timeout. It never throws, and no error or log line contains the token.
  - Every attempt is written to `message_log`.
- **A failed alert is never silent:**
  - cron-health-check, integration-check and gmail-monitor **exit 1** (red run → GitHub emails Kate).
  - gmail-monitor marks an email processed only after delivery, and its search excludes its own failure emails.
  - send-question returns **502** instead of "Sent!".
  - ops-watch reports failed alert rows from the last 24 h.
- **Kate's decisions:**
  - Client data in alert text going to Telegram is OK.
  - An hourly red gmail-monitor while Telegram is down is OK.
  - The roster comes to Kate on Telegram until Twilio (2026-10-19). ops-watch's "no 4am roster" finding now reads Telegram sends.
- **The secrets have existed since 2026-10-19, and both paths are proven** (Session 35 item 7). If they're ever removed, every alert fails as "not configured" and those runs go red, which is loud and intended.

### Kate's setup steps (steps 1–4 done 2026-10-19; kept for reference if the bot or token changes)
1. In @BotFather: `/setjoingroups` → `@qap_alert_bot` → Disable. Then send the bot any message.
2. Chat ID: copy the bot token, then run `! curl -s "https://api.telegram.org/bot$(pbpaste)/getUpdates" | grep -o '"chat":{"id":[0-9-]*' | head -1`
3. GitHub secrets: `! pbpaste | command gh secret set TELEGRAM_BOT_TOKEN -R kcoffie/dog-boarding`, then the same for `TELEGRAM_ALERT_CHAT_ID`.
4. Vercel **qboard → Production**, type **Secret**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`, `CRON_SECRET` (random, e.g. `openssl rand -hex 32`), `GH_ACTIONS_TOKEN` (fine-grained PAT, this repo only, Actions read and write). Then **redeploy**.
5. ~~Turn off the duplicate `dog-boarding` Vercel project~~: done 2026-10-19, disconnected from GitHub. Delete it later if nothing misses it.
6. Vercel "Needs Attention" on `SUPABASE_SERVICE_ROLE_KEY`, `EXTERNAL_SITE_PASSWORD` and the three `META_*` variables: leave them (Kate, 2026-10-19). Delete the `META_*` ones together with the WhatsApp code in #260.

### Mutation
- **CI on main: 66.06%** (`ee20596`, #358, incremental, 2026-10-27; was 60.62% on f195839, 2026-10-23; check Monday's full run before raising the ratchet); last full run 50.64% (0239e22). **Ratchet 50** (#306). Score log: `docs/ENGINEERING_PROCESS.md`. Incremental cache now seeded; a `package-lock`/`stryker.config` change forces a full run (~55–60 min). Don't merge on top of a Mutation run whose score you need: the next push to main cancels it.
- **Scoped, local, TZ=UTC:** `rosterChannel.js`, `opsWatch.js`, `syncSettingsRow.js`, `deployCheck.js` 100%; `cron-schedule.js` 98.7%; `rosterTrigger.js` 95.85%; `verifyUser.js` 98.3%; `send-question` 87.8%; `syncRunner.js` 83.6%; `alertKate` 82%; `notify.js` 85.93%; `syncQueue.js` 69.3%; `notify-intraday.js` 66.9%.
- **Never bump vitest to 5** until the Stryker runner ships #6214 (held in Dependabot's `ignore`). Check "tests per mutant" > 0 after any test-runner change.
- **#239 `pictureOfDay.js`** (51.13% in CI): parked by Kate until UAT starts.

### Issues
Priorities and Kate's triage notes are on GitHub (labels `priority: *`, `to-investigate`; "Triage 2026-10-22" comments). The order of work is `docs/SPRINT_PLAN.md`. The January issues still open (#6–#24) are triaged in the first UAT check-in.

## Immediate Next Steps
1. **Sync:** `git fetch --prune && git checkout main && git pull --ff-only`. Read memory, this file, `docs/ENGINEERING_PROCESS.md`, `docs/SPRINT_PLAN.md`. Baseline: `npm run test:run` (**2687 passed / 1 skipped**), open PRs (#291, #285, and the `docs/session-55-wrap` PR if still open: ask Kate to merge, then `check:deploy`).
2. **Read-only checks (fix nothing without asking):**
   - Overnight crons, `site_access`, queue, Integration Check alerts.
   - **Fri 10-30 Friday pm roster (22:00 UTC, retry 23:00):** times match the site (Kate compares 2); header "Fri – Mon"; `C63QhDpK` (cancelled) not on it. Then ask Kate to close #353 and #350.
   - Ask Kate: did the Dashboard's today mark show the SF date after 5pm PDT (she was checking 10-29 evening)?
3. **Top 3 (Sprint 1, ends Wed 11-04):**
   1. **#338 portfolio before Mon 11-02 11:00 (Kate's local time):** start with a draft `README.md` on a branch for Kate to review (item 10 above), then the repo description/topics and profile README text for her to paste. Check every fact against main (counts from `npm run test:run`, the mutation score from the latest CI Mutation run, PR/ADR numbers).
   2. **#370** (fixed by Fri 11-06): design the "a night can't be paid twice" guard (short note: per-night table vs database function; architect if a new table), then the build with a failing test per bug; Kate runs the migration; re-run UAT step 7.
   3. **#323 build** (design note merged): ADR-011, migration 031 (Kate runs it; signed-in select refused), `jobLog.js`, the three entry scripts, ops-watch checks, `check:public-logs`; then ask Kate before deleting the 106 old logs.
   Also: #13, Kate books watch-first with Charlie (week of 11-09); UAT step 7 re-run after #370.
   Dates: DST ends Sun 11-01; first PST 4am roster Mon 11-02 (check it).
4. **Kate's own items:** check one #21 pair on the site; add Charlie's and the admin's accounts in Supabase (dry-run an invite first); book watch-first with Charlie (week of 11-09); #337 chores; #8 calendar; forward the roster.
5. **Data left from #344 (design note "Data repair" 3–5, unchanged by #368):** the 9 other week-page rows that look like real stays, the 73 dateless week-page rows, and the two same-name rows of a staff member's dog (no pet IDs) to merge.
6. **Small follow-ups (ask Kate):** the Integration Check's "today" (#350); an automated check that the site's printed times match `siteTime` (design note #353 "When it isn't"); #294 (call `checkHungCron`, Sprint 2); the 3 tests that fail with the host in Kiritimati/Pago Pago; the 7 no-pet-ID dogs that do have boardings (they link on evidence; check if a booking is ever skipped); the 4 empty rows mapped to a synced booking.

## Open TODOs
The full, prioritised list is **`docs/SPRINT_PLAN.md`** (sprints, milestones, investigation queue, backlog) and the GitHub labels. Don't keep a second copy here; update the sprint plan and the issues instead.

---

## Key Facts (Don't Re-Derive)

- **Tokens (since #301, 2026-10-20):** jobs and server endpoints use the server-only `INTERNAL_API_TOKEN` (Vercel qboard Production, GitHub secret, `.env.local`; `check:deploy` reads it). Browser calls (`send-question`, `sync-proxy`) need a signed-in Supabase user (REQ-656). `run-sync` and the invite-code sign-up page are gone. The old `VITE_SYNC_PROXY_TOKEN` is deleted (never write its abuse path anywhere public).
- **AGYD schedule link timestamps**: a stay's links all carry its start; a recurring series has one per visit (#278). Week pages are Sunday–Saturday.
- **Alerts to Kate**: `sendAlert()` / `alertAndLog()` in `src/lib/alertKate.js` (Telegram, REQ-652). The team roster uses `NOTIFY_RECIPIENTS` (WhatsApp, moving to SMS in #260).
- **nightAssignments** in DataContext: `[{ date: 'YYYY-MM-DD', employeeId, workedFollowingDay }]` — top-level in `useData()`
- **employees** in DataContext: lives at `settings.employees`, NOT top-level
- **Vercel cron times**: the sync crons run at 00:00–00:15 UTC (5:00–5:15 PM PDT); ops-watch runs at 17:00 UTC; `/api/notify` at 11, 12, 14, 15, 16 UTC daily and Fri 22, 23, Sat 00 UTC (the Pacific hour picks the roster window, REQ-659)
- **K-8 closed by events:** Meta disabled the test WhatsApp account on 2026-10-18. The roster moves to SMS (#260), and Kate's alerts are on Telegram (#265).

---
