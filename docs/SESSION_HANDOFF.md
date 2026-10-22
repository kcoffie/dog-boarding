# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 22, 2026, ~17:50 UTC (session 43, end). **Production = main (`6ff56de`, #335).** The roster reaches Kate on **Telegram**. WhatsApp is locked (since 2026-10-17). **#324 is done (migration 029 ran). The 4am roster is now sent on time by Vercel (REQ-658, #335); its first live run is Fri 10-23 11:00–12:59 UTC. Next session: check that run, then build the full TBD list with Kate before UAT.**

**The goal for the next few sessions:** get the app back to where it was in May (the roster reaches staff every morning, unattended, and a failure alerts Kate), then **start real UAT with the end user**, and prioritise the remaining work from UAT feedback. Do what's needed, simply; nothing more.

---

## ▶ START HERE (every session)

1. **Read this file to the end, then `docs/ENGINEERING_PROCESS.md`** (team gates). Check the baseline before changing anything: `git status`, `npm run test:run`, open PRs and issues.
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

---

## Current State (2026-10-22 ~17:50 UTC, end of session 43)

### Session 43: what happened
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

## Current reference (still true after session 42)

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
- **CI on main: 52.06%** (e0fe16a, #310, incremental, 2026-10-20); last full run 50.64% (0239e22). **Ratchet 50** (#306). Score log: `docs/ENGINEERING_PROCESS.md`. Incremental cache now seeded; a `package-lock`/`stryker.config` change forces a full run (~55–60 min). Don't merge on top of a Mutation run whose score you need: the next push to main cancels it.
- **Scoped, local, TZ=UTC:** `rosterChannel.js`, `opsWatch.js`, `syncSettingsRow.js`, `deployCheck.js` 100%; `cron-schedule.js` 98.7%; `verifyUser.js` 98.3%; `send-question` 87.8%; `syncRunner.js` 83.6%; `alertKate` 82%; `notify.js` 81.2%; `syncQueue.js` 69.3%; `notify-intraday.js` 66.9%.
- **Never bump vitest to 5** until the Stryker runner ships #6214 (held in Dependabot's `ignore`). Check "tests per mutant" > 0 after any test-runner change.
- **#239 `pictureOfDay.js`** (51.13% in CI): parked by Kate until UAT starts.

### Issues
- **#318 sync redesign (top priority):** research → design note → architect → Kate decides → build. Covers #316, #317 (high), #311, #294; touches #313, #315, #312.
- **UAT fixes:** #312 ($0 rate, before UAT), #314 (pay breakdown image), #313 (hand edits; after the redesign decides who wins), #319 (Sync Details window off-screen, can't scroll).
- **#299** (alert when a merge doesn't reach production; architect gate; needs `INTERNAL_API_TOKEN` in the workflow since #301).
- **#260:** Twilio SMS roster. Kate starts the Twilio upgrade (A2P needs a paid account; no registered business, and messages can't be tied to Charlie's, so check the sole-proprietor or toll-free route). PR #291 holds the design and Kate's open decisions.
- **#307:** remove invite-code management from Settings (sign-up is gone since #301).
- **#257** (fold into #260), **#293, #295** (low), **#285** vitest 5 / **#284** vite 8 (parked), **#246** (close after #260).
- **January issues #6–#24:** triage with Charlie at the first UAT check-in (`docs/UAT_PLAN.md`).

## Immediate Next Steps
1. **Sync:** `git fetch --prune && git checkout main && git pull --ff-only`. Read memory, this file, `docs/ENGINEERING_PROCESS.md`. Baseline: `git status`, `npm run test:run`, open PRs.
2. **Check the on-time 4am roster** (first run Fri 10-23; on later days check the latest weekday). Read real timestamps (`date -u`):
   - `SELECT status, result, error_msg, updated_at FROM cron_health WHERE cron_name = 'notify-4am-claim';` → `success`, `result.trigger = 'vercel'`, `result.at` between 11:00 and 12:59 UTC (PDT; from 11-02, 12:00–13:59).
   - `message_log`: one `notify-4am` `sent` in that window, and no `notify-4am-alert` row.
   - The 14:00 UTC `notify-4am` run (Actions) logs `already_sent` (`command gh run view <id> --log | grep -i skipped`).
   - Ask Kate when the roster arrived. If anything's off, use `docs/RUNBOOK.md` "How the 4am roster is sent".
   - Also: the overnight crons (`auth` `refreshed`, `schedule` / `detail` success, `site_access.blocked_at` NULL), ops-watch's latest row.
3. **Kate's main goal for the session: one complete TBD list before UAT.** Build it **before** changing anything, then prune and prioritise it with her. Sources, all of them:
   - Open GitHub issues (39 on 10-22: `command gh issue list --state open --limit 200`) and open PRs (#291 SMS design, #285 vitest 5).
   - "Open TODOs" below, "Issues" under Current reference, and `docs/UAT_PLAN.md` (open decisions, the January issues #6–#24 to triage with the client).
   - `docs/SPRINT_PLAN.md`, `docs/REQUIREMENTS.md` (anything Planned/Deferred), the design notes' "Not in this change" / open questions (`docs/specs/*-design-note.md`, `sync-redesign-findings.md`), `docs/job_docs/*` "Known Issues / Backlog", and `grep -rn "TODO\|FIXME" api src scripts`.
   - Memory notes (Kate's earlier decisions and asks).
   - **Present it as one table:** item, source (issue # / doc), what it is in one line, status (open / partly done / probably stale), and a suggested group (before UAT / during UAT / after UAT / close). Flag duplicates and issues that are already done (e.g. #324's code is done: what's left is Kate's Clear decision, the unproven Sync Now 302 and optional secret clean-up; #321's 4am part is done, 7am/8:30 still late). Then work through it with Kate: close, merge, re-word, prioritise. Update the issues and this file with the result.
4. **Decision for Kate before Sun 11-01 (DST):** the 7am, 8:30am, Friday-pm and intraday GitHub crons are UTC and fire an hour early from 11-01 unless edited (table in `docs/job_docs/notify-jobs.md` "DST Note"). Options: edit the four crons on 10-31 (ask before changing any schedule), or move 7am/8:30am to the Vercel pattern (REQ-658: one cron line each plus their Pacific hour; note 8:30 can't be hit exactly on Hobby, which fires anywhere in the hour). **Never move `notify-4am.yml` off 14:00 UTC.**
5. Then, per Kate's priorities from step 3. The sync redesign's build order was: #323 private job logs (architect gate: new table) → engine → full pass → near-term (+#321 rest) → retire old paths → button (#317/#311) → drift list (#313). UAT prep: #312 before UAT; Kate creates the client's and her admin's accounts.

## Open TODOs
- [ ] **#318 sync redesign: DECIDED 2026-10-21 (option 3), build in order:** ~~#322~~ → ~~#324~~ → ~~4am roster trigger~~ (#335) → #323 → engine → full pass → near-term (+#321 rest) → retire old paths → button (#317/#311) → drift list (#313). Covers #316, #294
- [ ] #324: code done (A #329, B #331, 029 #333; first night clean). Left: Kate decides who may press Clear; the browser Sync Now 302 is unproven (check `sync_logs` after her next natural Sync Now); optionally delete the unused `EXTERNAL_SITE_*` GitHub secrets; then close #324
- [ ] 4am roster on time: live (#335, REQ-658). Check the first runs (Fri 10-23; first PST run Mon 11-02). 7am/8:30am/Friday/intraday: DST edit or move to Vercel before 11-01 (Kate decides)
- [ ] #326 flag past boardings that change after an employee worked them
- [ ] #323 private job logs (30-day delete); then delete old public run logs with names (ask Kate)
- [ ] #321 scheduled runs 4–6 h late: 4am fixed (#335); 7am/8:30am/Friday/intraday still on GitHub
- [ ] #299
- [ ] UAT: Kate reviews `docs/UAT_PLAN.md` decisions, creates the admin account, runs "watch first" with Charlie and her admin; triage #6–#24 at the first check-in
- [ ] #312 a dog with no rate counts as $0, silently (before UAT)
- [ ] #313 a correction by hand must survive the next sync
- [ ] #314 pay breakdown image per employee (Charlie sends it; the app never does)
- [ ] Maybe: notify Charlie when her admin adds or changes boarding info
- [ ] Maybe: a clear "something looks wrong at 9pm" path (Send a Question, made obvious, with what happens next)
- [ ] #307 invite-code management
- [ ] #319 Sync Details window off-screen, can't scroll (UAT bug)
- [ ] #260 Twilio (Kate: upgrade + A2P; #291 decisions)
- [ ] #311 Sync History page usable (someday, after UAT starts)
- [ ] #239 backfill: parked until UAT (Kate revisits)
- [ ] #257, #293, #295
- [ ] #285 vitest 5: wait for stryker-js #6214; #284 vite 8
- [ ] #315 Integration Check: skip same-day-visit candidates
- [ ] `mutate:changed` PR check (80% on changed lines)
- [ ] Kate: delete the `META_*` Vercel vars with #260; optionally delete the disconnected `dog-boarding` Vercel project; remove the stale `INTEGRATION_CHECK_RECIPIENTS`/`TWILIO_*` GitHub secrets; `GH_ACTIONS_TOKEN` expires 2027-10-19

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
| Integration check alert — "Missing from DB: one boarding 6/15-7/3 (C63Qglz7)" | ✅ Diagnosed. Bad booking in AGYD — same-day filter correctly skipped it. Kate confirmed bad entry; B-3 will re-queue on URL timestamp change. No code change needed. |
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

- **Tokens (since #301, 2026-10-20):** jobs and server endpoints use the server-only `INTERNAL_API_TOKEN` (Vercel qboard Production, GitHub secret, `.env.local`; `check:deploy` reads it). Browser calls (`send-question`, `sync-proxy`) need a signed-in Supabase user (REQ-656). `run-sync` and the invite-code sign-up page are gone. The old `VITE_SYNC_PROXY_TOKEN` is deleted (never write its abuse path anywhere public).
- **AGYD schedule link timestamps**: a stay's links all carry its start; a recurring series has one per visit (#278). Week pages are Sunday–Saturday.
- **Alerts to Kate**: `sendAlert()` / `alertAndLog()` in `src/lib/alertKate.js` (Telegram, REQ-652). The team roster uses `NOTIFY_RECIPIENTS` (WhatsApp, moving to SMS in #260).
- **nightAssignments** in DataContext: `[{ date: 'YYYY-MM-DD', employeeId, workedFollowingDay }]` — top-level in `useData()`
- **employees** in DataContext: lives at `settings.employees`, NOT top-level
- **Vercel cron times**: the sync crons run at 00:00–00:15 UTC (5:00–5:15 PM PDT); ops-watch runs at 17:00 UTC
- **K-8 closed by events:** Meta disabled the test WhatsApp account on 2026-10-18. The roster moves to SMS (#260), and Kate's alerts are on Telegram (#265).

---

## Session 30 Summary (reference)
| Item | Status |
|---|---|
| B-3 — re-sync appointments modified on AGYD after initial sync | ✅ Done + verified. PR #205 merged. `enqueue()` re-queues `done` items when URL timestamp changes. |

## Session 28 Summary (reference)
| Item | Status |
|---|---|
| B-2 — removed Check 3 (Claude vision) entirely | ✅ PR #202 merged. Integration check now: DOM ID match + unknown name + daytime check. |
