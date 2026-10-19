# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 19, 2026, ~19:15 UTC (session 35, end). **Kate's alerts work end to end:** Telegram from GitHub jobs and from Vercel is proven, and ops-watch authenticates. The team roster still has **no working channel** until SMS (#260; Twilio registration not started). **The sync queue churns** (#278): every scan re-queues every multi-day stay. First jobs next session: confirm ops-watch's first scheduled run (17:00 UTC 10-20) wrote its `cron_health` row, then design #278.

---

## ▶ START HERE (every session)

1. **Read this file to the end, then `docs/ENGINEERING_PROCESS.md`** (team gates). Check the baseline before changing anything: `git status`, `npm run test:run`, open PRs and issues.
2. **Kate's rules:**
   - Work on branches and never commit to `main`. Commit and push each green chunk. Claude may open and squash-merge PRs once every check is green **and** the reviewer agent has run.
   - Use `type: description (#issue)` commits. Never add AI attribution: no Co-Authored-By, no Claude-Session, no session links. The hook and CI reject them, and they overrule Claude Code's per-session reminder.
   - Tests must catch bugs, not just exist. Follow the good-tests rules and report the mutation score, not just "N tests pass".
   - Give options as one line each with real counts, then one recommendation.
   - Ask before sending any message to anyone (Telegram test alerts, SMS, WhatsApp), re-enabling workflows, adding secrets or changing repo settings.
   - Messages must never be tied to the client's (Charlie's) business. The app is Kate's alone, and Kate has no registered business.
3. **Shell:** `gh` is aliased to `history | grep`, so always type `command gh …`. Production is **`https://qboarding.vercel.app`** (Vercel project `qboard`; the `dog-boarding` Vercel project is a duplicate that deploys production on every merge, but whose crons don't fire). Claude can't read Vercel env or logs (no CLI; Hobby logs keep 1 h). Use Kate's Chrome, the Supabase tables, or ask Kate.
4. **Gates:** run the `architect` agent on the design note before a new job, service, secret or table. Run the `reviewer` agent before every PR. A new scheduled job ships with its failure alert, and that alert must run outside the job's own scheduler.
5. **New code only:** the gates cover code written from 2026-10-16 on. Bringing older code up to the same bar is #239.

---

## Current State (2026-10-19, end of session 35)

### Session 35
1. **The 10-19 red Integration Check was a false positive, fixed (#272, PR #273).**
   - `C63QhIww` ("Wknd DC 10/24") is a DC-category daycare: `sync_queue` row `done`, in `daytime_appointments`, correctly not a boarding.
   - The checker's title filter now skips `Wknd DC` / `Weekend DC`, but only without a date range (a range might be a real stay). Never a bare `DC` (#198).
   - The filter test now imports the real function instead of a copied pattern list. Triage steps are in `docs/job_docs/integration-check.md`.
   - **Not yet seen green on a scheduled run:** none had fired since the merge by 18:12 UTC.
2. **`sync_queue` backlog:** 27 pending after Monday's scan, then 56–76 after the manual checks. The cause is #278 (item 8), and it was drained to 0 by hand at about 19:05 UTC.
3. **Client data scrubbed (#264, PR #274)** from tests, code comments and active docs:
   - names, a mobile number, a personal email, an address, client, pet and appointment IDs, and an invoice in `SPRINT_PLAN.md`;
   - `docs/archive/` is left as history;
   - the values are **still in git history**, and whether to rewrite again is Kate's call.
   - **New CI check (REQ-653):** `npm run check:test-pii` in the Lint job rejects realistic phone numbers and personal emails in every tracked test file. It runs only in CI, because vitest also runs in Stryker's untracked sandbox where git sees no files.
4. **#239 slice 2, `syncRunner.js` (PR #276):**
   - REQ-109 gained a "Shared runners" spec, and 62 tests were written from it.
   - Scoped mutation 35.67% → **82.45%**.
   - Two bugs fixed: `cursorAdvancedTo` was a UTC date, and a non-Error throw left the queue item stuck in `processing`.
   - Silent-failure gaps went to **#275** (design note + architect first): `sync_settings` errors cascade into duplicate rows, `session_cleared` loops silently, and failed enqueues still advance the cursor.
5. **Mutation on main: 44.94% (3592/7993)**, the same on two runs. Ratchet 37 → **44**. All 11 timeouts are in pre-10-16 files.
6. **WhatsApp isn't just rejecting sends.** Meta accepts them (a `wamid` comes back), then the webhook marks each one `failed 131031 "Business Account locked"`.
   - On 10-19 GitHub fired **notify-4am at 17:21 UTC** (6 h late), and `cron_health` recorded `notify` **success** while nothing was delivered.
   - ops-watch's "4am roster not delivered" rule covers this. It hasn't run on schedule yet; the first run is 17:00 UTC on 10-20 (item 7).
   - Other windows aren't covered (#257).
7. **Kate's alert setup is done, and both alert paths plus ops-watch auth are proven** (about 18:30–19:10 UTC, each test message OK'd by Kate):
   - **Setup** (the Vercel part per Kate, since Claude can't read Vercel env): the GitHub secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` are set. Vercel qboard Production has `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`, `CRON_SECRET` and `GH_ACTIONS_TOKEN` (a fine-grained PAT for this repo only, Actions read/write, **expires 2027-10-19**), and has been redeployed.
   - **GitHub → Telegram:** a manual Integration Check (run 39306919363) logged `[Alert] Sent to Telegram`, and Kate received it.
     - The first try (run 39304992997) failed loudly, as designed, with `403 the bot can't send messages to the bot`: the chat ID was the bot's own ID.
     - **The chat ID must come from `getUpdates` → `"chat":{"id":…}` after Kate messages @qap_alert_bot.** The digits before the `:` in the token are the bot's ID, not hers.
   - **Vercel → Telegram:** Kate's Send-a-Question arrived.
   - **ops-watch:** Kate's `?dryRun=1` curl with `CRON_SECRET` returned a JSON list of findings.
   - **Not yet seen:** a scheduled ops-watch `cron_health` row. The first run with the secret is 17:00 UTC on 10-20.
8. **The queue churns: #278 (found during the test).**
   - Every scan re-queues every ongoing multi-day appointment. The URL timestamp is the date the appointment is shown on, which moves forward daily, and B-3 (#205) takes any URL change as an edit.
   - One scan: 17 new, **32 re-queued "modified"**, 18 in-flight mismatches.
   - There are about 4 scans a day, but only about 62 items a day get drained, so the backlog grows.
   - Kate OK'd a manual drain at about 19:05 UTC (`node --env-file=.env.local scripts/drain-queue.js 200`): 37 items, **all skipped** (same-day or daycare), and the queue went to 0. So the backlog wasn't hiding stays, but it will refill on every scan until #278 is fixed.
9. **Open question for Kate: `C63QhKpW` ("10/19-22").** The Integration Check reports it missing. Its detail page is an **Initial Evaluation** ($60, one roughly 6-hour visit on 10/20), so the sync correctly skips it.
   - If the dog really boards 10/19–22, the booking needs fixing on AGYD.
   - Otherwise it's a false positive that repeats until 10/22 (the checker sees only titles, as with N/C).
10. **Kate decides:**
   - `src/lib/workers.js` publishes five employees' full names with their AGYD IDs: move them to the DB or env?
   - Whether to rewrite history for the scrubbed values (and the 20 old tags).

## Session 34 (reference)

### What happened in session 34
1. **Node 22 schedules verified green.** #252 closed.
2. **History rewrite pushed by Kate.** main is now attribution-free: 388 commits, with trees, authors and dates unchanged.
   - **20 tags were NOT moved** (v3.0.0 → v6.1.0). GitHub's "block command line pushes that expose my email" rejected them, so they still point at the old commits.
   - Fix (Kate): untick that setting at github.com/settings/emails, run `git push --force origin --tags` from a fresh `scripts/prepare-history-rewrite.sh` build, then tick it again.
   - The rewrite closed open PRs (#256 → replaced by #261; #258 → #262).
3. **Merged:**

   | PR | What |
   |---|---|
   | #261 | 114 tests for `api/notify.js` + the sync crons. Scoped mutation 0% → 83%. CI score log, ratchet 35 → 37 |
   | #262 | #255 fixed: a notify send that reaches nobody fails (500), stores no hash, and the next window resends |
   | #263 | Real phone numbers replaced with fictional ones (they're still in git history) |
   | #265 | **Kate's alerts over Telegram** (#259, REQ-652). Details below |

4. **ops-watch had never run (fixed 10-19, session 35 item 7).** `CRON_SECRET` and `GH_ACTIONS_TOKEN` were never set in Vercel; ops-watch fails closed and returns 401. Verified in Kate's Vercel: neither the qboard project, the Shared tab, nor the dog-boarding project has them. The older sync crons only run because they skip the secret check when it's unset (fail open).
5. **Meta disabled the WhatsApp Business account** (the test account, unverified, "policy issues") on 2026-10-18. Every WhatsApp send now fails: the roster and all alerts.
   - **Kate's decision: end users get SMS (or WhatsApp), never Telegram.**
   - **The plan for end users:** Kate has no registered business, so the roster moves to **Twilio SMS/MMS under a Sole Proprietor 10DLC registration** (#260). Twilio's published fees at the time: $4.50 brand, $15 vetting, $2/month.
   - **The plan for Kate's own alerts:** they moved to Telegram (#265).
6. **GitHub's scheduler is unreliable:**
   - On 10-19 nothing fired between 10:00 and 14:39 UTC: notify-4am and notify-7am were dropped, and keepalive has **never** run.
   - Gmail Monitor (hourly) fires only 5–6 times a day.
   - **So #260 must not trigger the roster from GitHub's scheduler.** Options for its design note: Vercel crons (reliable so far, but Hobby fires anywhere in the hour) or an external cron service.

## Current reference (still true after session 35)

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
  - ops-watch's "no 4am roster" finding stays on until #260.
- **The secrets have existed since 2026-10-19, and both paths are proven** (Session 35 item 7). If they're ever removed, every alert fails as "not configured" and those runs go red, which is loud and intended.

### Kate's setup steps (steps 1–4 done 2026-10-19; kept for reference if the bot or token changes)
1. In @BotFather: `/setjoingroups` → `@qap_alert_bot` → Disable. Then send the bot any message.
2. Chat ID: copy the bot token, then run `! curl -s "https://api.telegram.org/bot$(pbpaste)/getUpdates" | grep -o '"chat":{"id":[0-9-]*' | head -1`
3. GitHub secrets: `! pbpaste | command gh secret set TELEGRAM_BOT_TOKEN -R kcoffie/dog-boarding`, then the same for `TELEGRAM_ALERT_CHAT_ID`.
4. Vercel **qboard → Production**, type **Secret**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`, `CRON_SECRET` (random, e.g. `openssl rand -hex 32`), `GH_ACTIONS_TOKEN` (fine-grained PAT, this repo only, Actions read and write). Then **redeploy**.
5. Optional: turn off Cron Jobs on the duplicate `dog-boarding` Vercel project, or delete that project. It deploys production on every merge, so if its crons are ever enabled, every cron runs twice.
6. Five Vercel variables show "Needs Attention". All five are secret-looking values stored as type **Config**, so the likely fix is to re-save them as type **Secret** (unconfirmed).

### Production (verified 2026-10-19 18:15 UTC)
- main `5cb12fd` is deployed to qboard. The roster image (`/api/roster-image?type=weekend&token=…`) returns 200 `image/png`. send-question without auth returns 401.
- **The duplicate `dog-boarding` Vercel project deploys production on every merge to main** (100+ deployments). Its crons are *not* firing: `cron_health_log` shows auth and schedule once a night, and detail twice (cron-detail plus cron-detail-2). If its Cron Jobs were ever enabled, every cron would run twice. Kate's setup step 5 (turn its crons off, or delete the project) still stands.
- `sync_queue`: 0 pending after the manual drain at about 19:05 UTC. It refills on every scan (#278).

### Mutation
- **CI on main:** 44.94% (2026-10-19, two runs). Ratchet 44. The next main run is the first after #276; add it to the score log.
- **Scoped scores:**
  - `syncRunner.js`: 82.45%
  - notify/crons: 83.27%
  - `opsWatch.js`: 99.4%
  - `send-question`: 87.9%
  - `ops-watch`: 87.3%
  - `alertKate`: 82%
  - integration-check daycare filter: 90.6%
- **Next #239 target:** `pictureOfDay.js` (51.4% in CI's 10-19 per-file table).

### Issues
- **#275:** sync silent failures (`sync_settings` errors, endless `session_cleared`, failed enqueues). Needs a design note and the architect review, because it changes what alerts.
- **#264:** closed. The history rewrite is Kate's call.
- **#260:** the roster over SMS (Twilio Sole Proprietor). Waits on Kate's Twilio registration. Needs a design note and the architect review, and its trigger must not be GitHub's scheduler.
- **#257:** ops-watch rule for `notify` / `notify-friday-pm` failure rows.
- **#246:** open. Close it only after a scheduled roster is sent **and** delivered, which now means after #260.
- **#239:** the backfill. Its comments list the review findings:
  - send-question auth is weak; the `VITE_` token ships to browsers
  - gmail-monitor exits 0 on a revoked Gmail grant
  - make the older crons fail closed on `CRON_SECRET` (**only after Kate confirms it's set**)
  - next mutation targets: `syncRunner.js`, then `pictureOfDay.js`
- **Dependencies:**
  - #238 (triage the majors), #145 (eslint 9→10, plugin-react 5→6: a manual upgrade, not Dependabot).
  - The old Dependabot PRs (#174, #219/#241, #234, #243, #245) were closed by the history rewrite.
  - Five new ones arrived 10-19 (#266–#270, including vite 8 and vitest 5 majors). After any dependency merge, verify the production image endpoint and the next scheduled run, and keep satori at 0.26.

## Immediate Next Steps
1. **ops-watch's first scheduled run (17:00 UTC, 2026-10-20):** confirm a `cron_health` row for `ops-watch`.
   - Its findings go to Kate over Telegram, plus the `ops-alert.yml` dispatch. Expect "no 4am roster delivered" until #260.
   - If there's no row, Kate can check the Vercel logs (Hobby keeps 1 h), or re-run the dry-run curl herself.
2. **Integration Check runs:** read each red run's log before anything else; the triage steps are in `docs/job_docs/integration-check.md`.
   - Expect `C63QhKpW` until 10/22 unless Kate says otherwise (Session 35 item 9).
   - Check `sync_queue` pending. It will be back up because of #278.
3. **#278 (queue churn): next build item.**
   - Write a design note: what counts as "modified", plus a queue-depth / oldest-pending alert.
   - Then the architect review, then the fix with tests from REQUIREMENTS (REQ-109 / B-3) and mutation scores.
4. **#275 (sync silent failures):** a design note, then the architect review. It can share a note with #278, since both touch the same alerting.
5. **Add the next main CI mutation score** (the first after #276) to the score log.
6. **#260 SMS roster:** once Kate has a Twilio account, write the design note (trigger not on GitHub's scheduler, MMS via a short-lived signed URL, status callbacks into `message_delivery_status`, opt-in wording), then the architect review, then the build.
7. **#239:** `pictureOfDay.js` tests from REQ-610/611, with mutation scores. Also #257 (ops-watch rule for notify failures and undelivered rosters in every window).

## Open TODOs
- [ ] #278 queue churn, #275 sync silent failures, #239 backfill (see its comments), #257 ops-watch notify-failure rule
- [ ] Kate: `GH_ACTIONS_TOKEN` expires 2027-10-19 (calendar reminder)
- [ ] Kate: is `C63QhKpW` a real 10/19–22 stay (fix it on AGYD) or an evaluation?
- [ ] Kate: rewrite history for the #264 values (and the 20 old tags)?
- [ ] 20 old tags still on the pre-rewrite history (Kate)
- [ ] `mutate:changed` (80% on changed lines) as a PR check
- [ ] A PR check that `thresholds.break` never goes down (the reviewer enforces it for now)
- [ ] keep-alive has never run on GitHub's scheduler. ops-watch's workflow-age check should report it now that `GH_ACTIONS_TOKEN` is set; confirm in its first findings.
- [ ] Remove `INTEGRATION_CHECK_RECIPIENTS` and the stale `TWILIO_*` GitHub secrets (Kate; no code uses them now)
- [ ] Delete merged stale remote branches (Kate's call)

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
