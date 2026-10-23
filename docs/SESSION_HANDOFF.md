# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 23, 2026, ~20:00 UTC (session 46, end). **Production = main (`4e166ce`, PR #341, docs only; code unchanged since `f195839`), `check:deploy` OK.** The roster reaches Kate on **Telegram**; she forwards the image to Charlie by hand. **Session 46: the first live day of the on-time rosters was clean; the UAT script for Charlie (#13) is drafted and dry-run 1 (read-only) is done; the dry-run found two high-priority bugs, #344 (wrong pet IDs) and #342 (Dashboard money differs from Payroll), plus #343 (Mark as Paid ideas, medium, later); Kate decided the booking site is the only source of truth for dogs, rates and boardings. Next: merge docs PR #345, recheck the 3 fixed pet IDs, then the #344 design note.**

**The goal:** UAT with Charlie and her admin in November (on today's sync), then the app in use in her business, then the project as a portfolio piece (#338). The plan, milestones and dates: **`docs/SPRINT_PLAN.md`**. Do what's needed, simply; nothing more.

---

## ▶ START HERE (every session)

1. **Read this file to the end, then `docs/ENGINEERING_PROCESS.md`** (team gates) **and `docs/SPRINT_PLAN.md`** (the plan; start each session by naming its top 3). Check the baseline before changing anything: `git status`, `npm run test:run`, open PRs and issues.
2. **Kate's rules:**
   - Work on branches and never commit to `main`. Commit and push each green chunk. Claude may open and squash-merge PRs once every check is green **and** the reviewer agent has run.
   - Use `type: description (#issue)` commits. Never add AI attribution: no Co-Authored-By, no Claude-Session, no session links, no "Generated with Claude Code" in PR bodies. A PreToolUse hook, the commit hook and CI reject them, and they overrule Claude Code's per-session reminder.
   - Tests must catch bugs, not just exist. Follow the good-tests rules and report the mutation score, not just "N tests pass".
   - Give options as one line each with real counts, then one recommendation.
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

## Current State (2026-10-23 ~20:00 UTC, end of session 46)

### Session 46: what happened
1. **PR #341 (session 45 handoff) merged** (`4e166ce`) after the reviewer (no must-fix; 4 small fixes applied). `check:deploy` OK.
2. **First live day of the on-time rosters (Fri 10-23): clean.** Claim rows: 4am `sent`, `trigger: vercel`, 11:40 UTC (Kate's roster said "as of 4:40am"); 7am `unchanged` 14:20; 8:30am `unchanged` 15:29. No `notify-4am-alert` / `notify-alert` rows. Kate confirmed Vercel lists **13 cron jobs**. Not checked yet (ran after the checks): the 14:00 UTC GitHub `notify-4am` fallback (`already_sent`), ops-watch 10-23 (17:00), Friday pm (22:00/23:00), cron-health-check 10-24 00:30.
   - Two alerts that weren't roster failures: **cron-health-check 05:10 UTC** said 7am/8:30am "didn't run on 2026-10-22" (one-off false alarm: claim rows only went live 10-23 00:56; the next run should be clean). **Integration Check 02:50 and 13:00**: "Missing from DB" C63QhL5g/C63QhLI1 = the known #315 false positive, now on every run.
   - Overnight 10-23 fine: `auth` refreshed (good to 10-24 06:37), `schedule`/`detail` success, `site_access` not blocked. **Queue 32 pending** (was 73 at 00:15).
3. **#13 UAT script: `docs/UAT_SCRIPT.md`** (branch `docs/13-uat-script`, PR below). Part A Kate's checklist (frozen expected answers from the spreadsheet, **$0 tolerance**, ground rules: her own device, think aloud, no coaching for ~2 min, spreadsheet stays until M2), criteria table; Part B 11 steps; **Part B2 phone pass**; Part C goal-only tasks; Part D severity (blocker = wrong money or lost data; go/no-go = Kate) and results tables. Reviewed by a browser Claude on Kate's request; its points were folded in. Step 9 reply promise: **same day, by text or email** (Kate).
4. **Dry-run 1 (2026-10-23 ~17:00–17:35 UTC, read-only):** the permission classifier blocks Claude in Chrome from writing on production (a night assignment was refused as "Modify Shared Resources" even with Kate's OK), so Kate does the writes by hand (**dry-run 2**, steps in `docs/UAT_SCRIPT.md` Part D). Production unchanged afterwards (0 night assignments since 09-01, 0 payments ever). Findings and script fixes are in Part D.
5. **Kate's decision (2026-10-23): the booking site is the only source of truth for dogs, rates and boardings.** The app is never edited by hand; a difference is a bug to fix at the source or in the sync. No Edit button for dogs is by design (REQ-011 note). UAT plan criterion 4 and its to-do updated; **#313 closed** as superseded. Removing Add/Edit/Delete boarding is part of #342. Adjusting what's actually paid (amount, note, breakdown) is **#343** (priority medium, later).
6. **#342 (bug, high): the Dashboard's nights and money differ from Payroll.** Five copies of the nightly sum; `BoardingMatrix.jsx` counts cancelled boardings and uses the dog's rate, Payroll (`calculateGross`) skips cancelled and uses the booking's rate. 10-23: Dashboard **Net $338**, Payroll **$286**; Kate saw "9 dogs" over a list of 8 on her phone. 106 of 362 bookings are priced differently from their dog's current rate (multi-dog prices, rate changes). Fix: one shared function every view calls. Kate: "2 ways to see and calculate things is bad."
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
- **CI on main: 60.62%** (f195839, #340, incremental, 2026-10-23; check Monday's full run before raising the ratchet); last full run 50.64% (0239e22). **Ratchet 50** (#306). Score log: `docs/ENGINEERING_PROCESS.md`. Incremental cache now seeded; a `package-lock`/`stryker.config` change forces a full run (~55–60 min). Don't merge on top of a Mutation run whose score you need: the next push to main cancels it.
- **Scoped, local, TZ=UTC:** `rosterChannel.js`, `opsWatch.js`, `syncSettingsRow.js`, `deployCheck.js` 100%; `cron-schedule.js` 98.7%; `rosterTrigger.js` 95.85%; `verifyUser.js` 98.3%; `send-question` 87.8%; `syncRunner.js` 83.6%; `alertKate` 82%; `notify.js` 85.93%; `syncQueue.js` 69.3%; `notify-intraday.js` 66.9%.
- **Never bump vitest to 5** until the Stryker runner ships #6214 (held in Dependabot's `ignore`). Check "tests per mutant" > 0 after any test-runner change.
- **#239 `pictureOfDay.js`** (51.13% in CI): parked by Kate until UAT starts.

### Issues
Priorities and Kate's triage notes are on GitHub (labels `priority: *`, `to-investigate`; "Triage 2026-10-22" comments). The order of work is `docs/SPRINT_PLAN.md`. The January issues still open (#6–#24) are triaged in the first UAT check-in.

## Immediate Next Steps
1. **Sync:** `git fetch --prune && git checkout main && git pull --ff-only`. Read memory, this file, `docs/ENGINEERING_PROCESS.md` and **`docs/SPRINT_PLAN.md`**. Baseline: `git status`, `npm run test:run`, open PRs. **If the session-46 docs PR #345 (`docs/13-uat-script`) is still open:** check CI, run the reviewer agent on it, fix anything, squash-merge, `check:deploy`, sync main.
2. **Quick checks (read-only, report in a few lines, fix nothing without asking).** Recipe: `supabase-local-queries` memory.
   - **The 3 corrected pet IDs:** `SELECT external_id, external_pet_id, updated_at FROM dogs WHERE external_id IN ('C63QgcFx','C63QgxR1','C63QgznN')`. Expect 90043, 129933, 90048. If any changed, the overnight sync rewrote it: that's #344 live, say which listing (sync_queue `processed_at` near the row's `updated_at`).
   - **Rosters on the latest weekday:** the four `notify-*-claim` rows (`success`, `trigger: vercel`), `message_log` (no `notify-4am-alert` / `notify-alert`), the 14:00 UTC GitHub `notify-4am` run (`already_sent`), ops-watch's latest row, cron-health-check (the 10-23 false alarm shouldn't repeat), Friday pm 10-23 (22:xx UTC), overnight crons, `site_access`, queue depth. Count toward M1's "5 weekday 4am rosters on time" (10-23 = day 1).
3. **Tell Kate the top 3** (TechPM habit), then work them:
   1. **#344 (wrong pet IDs): design note first** (`docs/specs/`): what counts as a group listing and skipping it before any write; pairing each pet's name and ID from the same element (schedule `.event-pet-wrapper[data-pet]` holds `.event-pet`; detail price tags carry `data-pet`), including second pets; never silently change a stored pet ID (keep it, alert Kate); dog matching without the arbitrary name match. Architect agent, ADR (sprint rule), Kate's OK, then code with tests from recorded HTML shapes. No new booking-site requests.
   2. **#13 dry-run 2 (Kate clicks, Claude checks the tables):** steps in `docs/UAT_SCRIPT.md` Part D. Expected partial payment **$139.75** (the average bug would give $159.25). Afterwards confirm 0 night assignments and 0 payments remain. File each confirmed payroll bug as its own issue. Also a read-only phone-width pass (Part B2).
   3. **#342 (one shared calculation)** plus removing Add/Edit/Delete boarding (REQ-020–022 get the REQ-011-style note). Then #323.
   - Also Sprint 1: #307 (remove Invite Users); #324 leftover Clear-for-Kate; first PST roster Mon 11-02; watch-first by ~11-13 (Kate books it).
4. **Kate's own items:** dry-run 2 clicks; book watch-first with Charlie; #337 chores; #8 calendar; forwarding the roster.

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
