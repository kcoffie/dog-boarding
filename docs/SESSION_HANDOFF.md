# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 20, 2026, ~16:10 UTC (session 37, end). **Production = main (`545a95d`, #302).** The roster now reaches Kate on **Telegram** (proven 16:01 UTC 10-20). WhatsApp is locked (since 2026-10-17). Staff get the roster again when Twilio SMS (#260) ships.

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

---

## Current State (2026-10-20, end of session 37)

### Session 37: what happened
1. **Deploy and CI budget (#298, PR #300, merged).** Lessons for other projects: `docs/LESSONS_DEPLOY_AND_CI_BUDGET.md`.
   - **Vercel builds only `main` and `preview/**`** (`vercel.json` `git.deploymentEnabled`). An ignored build step wouldn't have helped: canceled builds still count toward the 100/day quota.
   - **`npm run check:deploy [sha]`** runs after every merge. Since the duplicate project was disconnected, qboard's commit status is plain `Vercel` (it used to be `Vercel – qboard`); the check accepts both.
   - **Mutation runs in `.github/workflows/mutation.yml`.** It's incremental (cached results), with a full run when `package-lock`/`stryker.config` change, Mondays 13:00 UTC, or by hand. Burst merges cancel older runs (seen working: 3 cancelled, 1 kept).
   - **Dependabot:** monthly; all dev dependencies in one PR; Actions grouped; vitest 5 and vite 8 majors held in `ignore`. It already closed #286–#289 and opened **#304** and **#303**.
2. **Roster to Kate on Telegram (part of #260, PR #302, merged, REQ-655).**
   - Vercel env **`ROSTER_CHANNEL=telegram`** is set and **required** (no default; unset or a typo → every notify run returns 500).
   - The roster goes to `TELEGRAM_ALERT_CHAT_ID` only. Staff numbers aren't used. **Intraday is off** on telegram (`channel_telegram`).
   - The image is rendered once, stored, then the same bytes are sent. No URL or token appears in any error.
   - The refresh alert goes through `alertAndLog`.
   - ops-watch counts a Telegram `notify-4am` row as delivered.
   - **Verified:**
     - the intraday dispatch → `skipped: channel_telegram`;
     - a manual `notify-4am` at 16:01 UTC → `{"to":"telegram","status":"sent"}`. Kate got it.
   - The scheduled 4am ran at 15:34 UTC (GitHub ran it 4.5 h late) **before** the deploy, on old code: WhatsApp, `131031` locked, nothing delivered.
   - **Switching to Twilio** needs #260's full build (#291's reviewed design). The setting is only the cutover and the fallback.
3. **Merged and deployed:** #300, #297 (session 36 handoff; a missed client surname was removed from the file; Kate chose to leave it in history), #296 (#275 sync silent failures), #302. Each was confirmed with `check:deploy`.
4. **Security (Kate, 2026-10-20):**
   - **Supabase sign-up was open** (`disable_signup: false`, `mailer_autoconfirm: true`; the invite code was checked only in the browser). **Kate turned it off** (verified via `/auth/v1/settings`).
   - She checked the user list: no strangers.
   - Vercel Deployment Protection is Standard.
   - New staff accounts are added by Kate in Supabase.
5. **#301 (filed):** `VITE_SYNC_PROXY_TOKEN` is built into the public JS bundle and guards internal endpoints. The architect reviewed a design; the result is on a **LOCAL-ONLY branch `fix/301-browser-auth`** (commit `21b70c7`, deliberately not pushed: it describes how the still-valid token can be abused). Read `docs/specs/browser-auth-design-note.md` there. The plan:
   - Supabase user JWT on `send-question` and `sync-proxy`.
   - Rename the server token to `INTERNAL_API_TOKEN`.
   - Delete `run-sync`; GET-only proxy; remove the invite-code page.
   - Kate rotates the token in the documented order.
6. **WhatsApp timeline (from the tables):** last delivery 08-24, when GitHub disabled the schedules. Then the friday-pm roster delivered on **Fri 10-16 22:58 UTC** (Kate's "Friday" message) and a cron-health alert at 10-17 04:49. **Locked from 10-17 11:53 UTC.**
7. **#304 (dev dependencies, 9 updates):**
   - eslint 10 raised 4 errors. I fixed them:
     - `d5f4e94` drops two dead initialisers in `extraction.js`;
     - `d4e793f` merges main and adds reasoned `preserve-caught-error` disables in `rosterChannel.js` (the caught fetch error is dropped on purpose, because it can carry the token URL).
   - Locally on that merged state: lint 0 errors, 1585 tests pass. Stryker on vitest 4.1.12: 3.77 tests per mutant (OK).
   - **Not merged:** check that CI is green on `d4e793f`, run the reviewer, then merge and `check:deploy`.
   - **#303** (Actions: upload-artifact 7, cache 6): green, needs a reviewer run.
8. **Follow-ups filed:** #299 (alert when a merge doesn't reach production; needs the architect gate), #301.

### Production (checked 2026-10-20 ~16:05 UTC)
- main `545a95d` (#302) is live: home 200, roster image 200 `image/png`.
- `sync_queue`: 0 pending, 0 failed.
- **The 00:05 UTC 10-21 `schedule` run is the first on #292's queue-churn fix** (everything deployed 15:30–16:00 UTC 10-20).
- The Mutation run on `545a95d` (full, seeds the cache) was still running at handoff.

## Current reference (still true after session 37)

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
- **CI on main:** 47.94% after #292 (2026-10-19), ratchet 47. The next score (after #296 and #302) comes from the first `mutation.yml` run on `545a95d`. Log it, and raise the ratchet if it goes up.
- **Scoped, local, TZ=UTC:**
  - `rosterChannel.js`, `opsWatch.js`, `syncSettingsRow.js`, `deployCheck.js`: 100%
  - `cron-schedule.js` 98.7%
  - `syncRunner.js` 83.6%
  - `notify.js` 81.2%
  - `sessionCache.js` 71.8%
  - `syncQueue.js` 69.3%
  - `notify-intraday.js` 66.9%
  - `send-question` 87.9%
  - `alertKate` 82%
- **Never bump vitest to 5** until the Stryker runner ships #6214 (it's held in Dependabot's `ignore`). Check "tests per mutant" > 0 after any test-runner change.
- **#239 `pictureOfDay.js`** (51.13% in CI) is **parked by Kate until UAT starts**. Revisit then.

### Issues
- **#304 / #303:** Dependabot groups, waiting for a reviewer run plus merge (see Session 37 item 7).
- **#301:** browser token. The local branch `fix/301-browser-auth` holds the design; build it next.
- **#260:** Twilio SMS roster. **Kate starts the Twilio upgrade (A2P needs a paid account).** PR #291 holds the reviewed design and Kate's open decisions.
- **#299:** deploy-failure alert. **#294:** `checkHungCron` never called. Both are small; Kate OK'd them after #301.
- **#257:** ops-watch notify-failure rule (fold into #260).
- **#293, #295:** follow-ups from #275 (low).
- **#285** (vitest 5 draft) and **#284** (vite 8): parked.
- **#246:** close once a scheduled roster is delivered to staff (after #260).
- **January issues #6–#24:** triage with the end user at UAT, not before.

## Immediate Next Steps
1. **Sync:** `git fetch --prune && git checkout main && git pull --ff-only`. The #301 work is on the local branch `fix/301-browser-auth`. Don't push it until the fix is ready, and rebase it on main first.
2. **Check last night's run and this morning's:**
   - the `schedule` cron_health row: `requeuedEdited` near 0, `urlChangesIgnored` > 0, `found` > 0;
   - `sync_queue` pending < 30;
   - ops-watch's 17:00 UTC row, and that its findings reached Kate on Telegram;
   - the next scheduled `notify-4am` sent `{"to":"telegram","status":"sent"}`.

   cron_health columns are `cron_name, last_ran_at, status, result, error_msg, updated_at` (no `started_at`).
3. **Every Integration Check run since the last session:** read each red one's log before assuming. `C63QhKpW` is an evaluation until 10/22.
4. **Mutation:** log the `545a95d` score; raise the ratchet if it went up.
5. **#304, then #303:** run the reviewer, wait for green, squash-merge one at a time, `npm run check:deploy` after each. #304 changes build tools (vite, vite-plugin-pwa), so also check the next scheduled roster.
6. **#301:** build to the design note on `fix/301-browser-auth` (architect done). Then the reviewer, then a PR. **Kate adds `INTERNAL_API_TOKEN` to Vercel and GitHub before the merge.** Rotate in the note's order, in the evening.
7. **Then #294 and #299** (small).
8. **UAT:** with Kate, write 3–5 acceptance criteria with the end user (sprint plan G-5 / #13). Then triage the January issues with them.
9. **#260** once Kate has upgraded Twilio and decided #291's points (the image label replacing "Q Boarding", opt-in, trigger). Fold the architect's changes into the note before building.

## Open TODOs
- [ ] #304, #303 (Dependabot groups)
- [ ] #301 browser token (local branch), then Kate's token rotation
- [ ] #294, #299
- [ ] UAT acceptance criteria with the end user; triage #6–#24 at UAT
- [ ] #260 Twilio (Kate: upgrade + A2P; #291 decisions)
- [ ] #239 backfill: parked until UAT (Kate revisits)
- [ ] #257, #293, #295
- [ ] #285 vitest 5: wait for stryker-js #6214; #284 vite 8
- [ ] Integration Check: skip same-day-visit candidates (`C63QhKpW` pattern), like N/C evals
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

- **VITE_SYNC_PROXY_TOKEN**: used for `Authorization: Bearer` auth on internal API endpoints (`/api/send-question`, `/api/run-sync`, etc.)
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
