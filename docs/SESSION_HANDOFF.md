# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 21, 2026, ~17:30 UTC (session 40, end). **Production = main (`e0fe16a`, #310), unchanged this session.** The roster reaches Kate on **Telegram** (proven on the new token 10-21). WhatsApp is locked (since 2026-10-17). **The sync redesign (#318) is decided: option 3. Build it in the design note's order, starting with #322 and the site-safety PR #324.**

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

## Current State (2026-10-21 ~17:30 UTC, end of session 40)

### Session 40: what happened
1. **Overnight checks (first runs after #301), UTC:**
   - `notify-4am` (scheduled 11:00) started **15:51**, sent to Telegram, no 401. **Kate: it arrived.** It listed a dog whose booking was removed on the site: see item 3.
   - `auth` refreshed 00:37. `schedule` 00:15: found 287, **`requeuedEdited` 18** (all recurring playgroup bookings, P20), `urlChangesIgnored` 2. `detail` 00:16 (on yesterday's session, P6) and 00:50.
   - `sync_queue` pending 45–47 (above 30).
   - Integration Check 02:45 and 13:19: no red runs. Both alerted the same two "Missing from DB" items (`C63QhKpW` and a new `C63QhL5g`, same dog and dates, skipped by the sync on purpose). Noted on #315.
   - `cron-health-check` (00:30) started 05:07.
   - **ops-watch had not run by 17:30 UTC** (window 17:00–17:59). Its last row, 10-20 17:36, had one finding: an undelivered Integration Check alert in the previous 24 h. That was 10-19 18:47 UTC, during the Telegram setup (the two red runs that day). Every Integration Check alert since has been sent (`message_log`). **Next session: read today's row; expected no findings.**
   - Kate confirmed `VITE_SYNC_PROXY_TOKEN` is deleted in Vercel.
2. **The sync redesign is decided (#318).** Read `docs/specs/sync-redesign-design-note.md` (decisions at the end) and `docs/specs/sync-redesign-findings.md` (6a research answers, 6b Kate's decisions).
   - **Option 3:** one Node-safe engine. Near-term runs (today and tomorrow, ~16 requests) on Vercel crons at 09:00 and 01:00 UTC. A daily full pass (7 days back to 45 ahead, ~75 requests) on GitHub Actions, dispatched by a Vercel cron at 07:00 UTC with the existing `GH_ACTIONS_TOKEN`. The button starts the full pass. The Integration Check becomes check-only, both ways, once a day. The old sync paths retire after 3 good nights.
   - **The booking-site account is Charlie's; load is a hard constraint.** About 110–120 requests a day, a daily ceiling of 250, one paced fetch, stop at the first 429/403/challenge, no retries inside a run.
   - **After a failed login, nothing logs in again until Kate clears the flag** (with a clear alert). Only `cron-auth` may log in. Reconciliation archives at most 3 per run.
   - **The architect found real problems in today's code (#324):** reconciliation archives on any error (a 429 would cancel real boardings); `withRetry` reads a missing `retryDelays`, so the first error becomes "Cannot read properties of undefined (reading '0')" (that's P18's error, so P18's real first error is hidden by `withRetry`); any path can log in; form fetches are unpaced; 0 schedule rows counts as success; logs print names in Node; `schedule.js` needs `DOMParser` (not in Node). **Until #324 ships, avoid long Sync Now runs.**
   - Fluid compute is on for qboard (Kate), so Vercel functions get 300 s. The `api/cron-detail.js` "10 s" header is out of date.
   - The AI screenshot check was tried before: Integration Check "Step 3" (Claude vision on the roster image), removed in PR #202 (May 2026).
3. **Bug found: archived boardings stay on the roster and in pay (#322).** Reconciliation sets `cancelled_at` and leaves `booking_status` = `confirmed`. The matrix checks `cancelledAt` (correct). `queryBoarders` (morning roster) checks only `booking_status`, `getWeekendBoardings` checks neither, and payroll (`calculateGross`, `computeDaytimeNet`) checks neither. `C63QhHuu` stays on every roster through 10/25. **Kate: fix it first thing next session.**
4. **GitHub starts scheduled runs 4–6 h late (#321):** 4am roster at 15:34–17:21 UTC, 7am at 18:23–19:44. The redesign moves triggers to Vercel.
5. **Booking details appear in public Actions logs (#323).** Kate chose: a private `job_logs` table (service key only), deleted after 30 days. Public logs keep counts, IDs and pass/fail. Old run logs with names need deleting: ask Kate first.
6. **Issues filed:** #321 (late schedules), #322 (archived boardings on roster/pay), #323 (private logs), #324 (booking-site safety). Commented on #313 (Kate's drift direction) and #315.

### Session 39 (reference)
#301 merged and rotated (PR #310); sync findings written; #311–#319 filed. Details: git history of this file.

## Current reference (still true after session 40)

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
- **Scoped, local, TZ=UTC:** `rosterChannel.js`, `opsWatch.js`, `syncSettingsRow.js`, `deployCheck.js` 100%; `cron-schedule.js` 98.7%; `verifyUser.js` 98.3%; `send-question` 87.8%; `syncRunner.js` 83.6%; `alertKate` 82%; `notify.js` 81.2%; `sessionCache.js` 71.8%; `syncQueue.js` 69.3%; `notify-intraday.js` 66.9%.
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
1. **Sync:** `git fetch --prune && git checkout main && git pull --ff-only`. Read memory, this file, `docs/ENGINEERING_PROCESS.md`, `docs/specs/sync-redesign-design-note.md`, `docs/specs/sync-redesign-findings.md`. Baseline: `git status`, `npm run test:run`, open PRs and issues.
2. **Quick checks with real timestamps:** ops-watch's latest row (expected no findings); last night's `schedule`/`auth`/`detail` rows; `sync_queue` pending; the 4am roster (ask Kate it arrived); red Integration Checks.
3. **#322 (first, Kate):** roster and payroll treat a boarding with `cancelled_at` as gone, in all four readers (`queryBoarders`, `getWeekendBoardings`, `calculateGross`, `computeDaytimeNet`). Tests written from the rule; reviewer; merge; `check:deploy`.
4. **#324 site-safety PR** (design note, "Before any unattended run"): one paced fetch for every booking-site request; `SiteThrottled` on 429/403/challenge stops the run; remove `withRetry`; a shared breaker (`sync_settings.site_blocked_until` + reason) that every path checks, set by any login failure or throttle, cleared only by Kate (her decision for login failures; the note applies it to throttling too, so confirm with her), with a clear alert that says how to clear it; only `cron-auth` logs in; the reconciliation guard (positive "gone" signal, max 3 archives, row floor); 0 schedule rows fails the run. A breaker column changes a table: write the short design note section and run the architect first if it's more than the note covers.
5. **#323 private logs:** `job_logs` table (architect gate: new table), 30-day delete, Node entry point redirects `console.*` before imports, a test that fails if a fixture name reaches stdout.
6. Then the design note's build order: the Node-safe engine (regex parser as the only schedule parser, `sync_logs` columns, skip store), full pass on GitHub, near-term on Vercel (+ #321), retire old paths, button (#317/#311), drift list (#313).
7. UAT prep (`docs/UAT_PLAN.md`): design notes for #312 and #314; ask Kate about accounts first.

## Open TODOs
- [ ] **#318 sync redesign: DECIDED 2026-10-21 (option 3), build in order:** #322 → #324 → #323 → engine → full pass → near-term (+#321) → retire old paths → button (#317/#311) → drift list (#313). Covers #316, #294
- [ ] #322 archived boardings on roster and in pay (first, next session)
- [ ] #324 booking-site safety (before any unattended run)
- [ ] #323 private job logs (30-day delete); then delete old public run logs with names (ask Kate)
- [ ] #321 scheduled runs 4–6 h late (fixed by the redesign's Vercel triggers)
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
