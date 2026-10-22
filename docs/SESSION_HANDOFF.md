# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 21, 2026, ~22:55 UTC (session 42, end). **Production = main (`aa4c3da`, #331).** The roster reaches Kate on **Telegram**. WhatsApp is locked (since 2026-10-17). **Sync redesign (#318): #322 and #324 parts A and B are live. The first night on A + B (10-22) was clean (checked 04:07 UTC); finish the daytime checks, then the on-time roster trigger.**

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

## Current State (2026-10-21 ~22:55 UTC, end of session 42)

### Session 42: what happened
1. **The first night on PR A could not be checked yet:** the session ran 21:20–22:55 UTC on 10-21, before the 10-22 00:00 UTC crons.
2. **#324 PR B merged** (PR #331, `aa4c3da`, 22:40 UTC; `check:deploy` OK; `/api/site-access` and `/api/sync-proxy` answer 401 without sign-in, so both are live). What it does:
   - **`site_access` table** (migration 028, **run by Kate in the Supabase SQL editor 10-21 ~22:30 UTC**): one row (boolean PK, RLS on, no policies, service key only). It holds the booking-site session (moved from `sync_settings`, whose session columns are now NULL) and the breaker (`blocked_at`, `blocked_reason`, `cleared_at`, `cleared_by`). Verified: row present, session copied (stamp 10-22 00:37 UTC), not blocked, anon key reads 0 rows.
   - **One login:** `loginToSite()` in `src/lib/scraper/siteLogin.js`, used only by `cron-auth` and Clear. It reads the breaker first and never logs in while blocked. A rejected login (incl. a redirect back to /login) or a 429/403 trips the breaker; a 5xx or missing credentials fails without tripping. Session stamp 30 h.
   - **Everything else reads the session** with `getSiteSession()` (`src/lib/scraper/siteAccess.js`), which fails closed (`SiteAccessError` SITE_BLOCKED / NO_SESSION; a missing row throws). A 429/403 anywhere (Node fetch, `sync-proxy`, the Integration Check's Playwright load) trips the breaker. `tripBreaker` never throws and alerts once per trip (first trip wins).
   - **The browser never logs in or sees the cookie:** `api/sync-proxy.js` (Edge) adds the cookie server-side, allows only the sync paths (anchored allowlist; https, no port, no userinfo), `redirect: 'manual'`, answers 423 when blocked and 503 with no session.
   - **Clear** on Settings (`SiteAccessCard`, `GET`/`POST /api/site-access`): one conditional update (two presses clear once), records who, then logs in at once. A refused login re-trips and alerts.
   - **ops-watch** reports a tripped breaker; `site-access` is in `ALERT_JOBS`. A blocked run records `site_blocked` as success (no red cron, no alert storm: the one breaker alert is the signal).
   - Runbook: `docs/RUNBOOK.md` "Booking site blocked". REQ-657 part B criteria in `docs/REQUIREMENTS.md`; REQ-641 superseded.
   - Gates: reviewer agent (10 findings, all fixed in the PR). Suite 1817 passed / 1 skipped. **Scoped Stryker (TZ=UTC):** `siteAccess.js` 96.5%, `siteLogin.js` 87.5%, `api/site-access.js` 82.35%, `api/sync-proxy.js` 75.88%, `opsWatch.js` 100%, `cron-auth.js` 93.65%.
3. **Not done (Kate):** `src/lib/scraper/sessionCache.js` and `src/__tests__/scraper/sessionCache.test.js` are dead code since PR B. The hook blocks Claude from deleting them, and Kate's `! git rm` didn't take; she deletes them from a normal terminal later, then they're committed on a branch.
4. **First night on PR A + B, checked 10-22 04:07 UTC (all good):**
   - `schedule` 00:14:59 success (236 found, 115 queued, 2 pages), on the session the migration copied.
   - `detail` 00:16 and 00:50 success (`skipped`; queue 94 → 93).
   - `auth` 00:37:54 success, `refreshed`: the first `loginToSite()` login. `site_access.session_expires_at` = 10-23 06:37:53 UTC (30 h). `blocked_at` NULL, never tripped.
   - Integration Check 02:43 UTC success; its report reached Telegram 02:53.
   - **Not yet checkable at 04:07 UTC:** ops-watch's 10-22 row (~17:30 UTC), the 4am roster (11:00 UTC is 4am Pacific; it ran late at ~15:50 UTC on 10-21, #321), the first browser Sync Now on PR B.
5. **Open decision (Kate):** may any signed-in user press Clear, or only Kate? Today: any signed-in user (sign-up is off, so that's Kate, and later Charlie and her admin).

### Session 41: what happened
1. **Checks (UTC):** ops-watch 10-21 17:36: the old undelivered-alert finding is gone; two queue findings (45 pending, limit 30, oldest 17 h). **Kate: leave the limit** until the old sync paths retire (daily alert expected until then). `auth` 00:37, `schedule` 00:15, `detail` 00:16/00:50, Integration Check 02:45 and 13:19 green, 4am roster sent 15:51.
2. **#322 merged** (PR #327, 93dc821): a boarding with `cancelled_at` is left out of both rosters, payroll (night pay + daytime credit), and the matrix page's employee totals, summary cards and revenue table. Rows are never deleted. Rule in REQ-108. Two boardings are marked: `C63QhHuu` (off the roster from 10-22) and `C63QgVl9` (March; its pay period drops). Flagging past changes like that: **#326** (filed).
3. **#324 plan merged** (PR #328): code map of every booking-site path, evidence, Kate's decisions, two-PR plan. Architect ("proceed with changes") and reviewer passed. **Evidence (one request, Kate's OK): a removed booking's URL answers 302 → `/schedule`.**
4. **#324 PR A merged** (PR #329, e247638, live 20:15 UTC): one paced fetch (1.5 s, promise chain), `SiteThrottled` stop on 429/403 that loops can't swallow, `withRetry` removed, 0 appointments fails the run, reconciliation marks gone only on a redirect to `/schedule` on the site's host (>10 candidates: none opened; >3 gone: none marked; check all first), historical import and the dev login proxy removed, two old debug scripts deleted. New **REQ-657**. Scoped Stryker: 84% on changed lines. **Tonight's 00:00–01:00 UTC crons are the first on PR A.**
5. **Kate's #324 decisions:** only lockout risks trip the breaker (rejected login, 429/403); an unrecognised page stops without tripping; Clear lives on Settings and logs in at once; >10 candidates skip; mark at most 3; remove the historical import; session stamp 30 h.
6. **Accounts:** the booking site is still Charlie's business account (the load limit stands), but the app signs in as **its own user** on it, not with Charlie's personal login. Charlie's old sign-in to this app was blocked; Kate creates her a new account at UAT (sign-up is off).
7. Kate approved: **the on-time roster trigger** (a Vercel cron that dispatches the roster) right after PR B.

### Session 40 (reference)
Sync redesign decided (option 3, design note); #321–#324 filed; first overnight checks after #301. Details: git history of this file.

### Session 39 (reference)
#301 merged and rotated (PR #310); sync findings written; #311–#319 filed. Details: git history of this file.

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
1. **Sync:** `git fetch --prune && git checkout main && git pull --ff-only`. Read memory, this file, `docs/ENGINEERING_PROCESS.md`.
2. **Finish the first-day checks on PR A + B** (the overnight crons were clean; see Session 42 item 4). Use real timestamps:
   - `cron_health` / `cron_health_log` since the last check: `auth` `refreshed` each night, `schedule` / `detail` success. `site_blocked` means the breaker is tripped.
   - `site_access`: `blocked_at` still NULL. Use the service key (recipe in memory `supabase-local-queries`); the anon key sees nothing by design.
   - ops-watch's 10-22 row (no `site-access` finding; the queue findings are expected), Integration Check runs, the 4am roster (ask Kate).
   - The first browser **Sync Now** after PR B: Edge `redirect: 'manual'` should hand back a real 302 + `Location` (the removed-booking check depends on it). Ask Kate to press it once, then read `sync_logs`.
   - If the breaker tripped: read `blocked_reason`, follow `docs/RUNBOOK.md` "Booking site blocked". Kate presses Clear; don't clear it from code.
3. **The good night is in (10-22), so:** small PR, migration 029, dropping `sync_settings.session_cookies` and `session_expires_at` (Kate runs the SQL; outside 23:30–01:30 UTC). Grep first that no code reads them.
4. **Commit Kate's deletion** of `sessionCache.js` + its test on a branch once she's run it (`git status` shows `D`).
5. **On-time roster trigger** (Kate: yes): a Vercel cron that dispatches `notify-4am` on time (#321). Architect gate (new job). Ask before changing any schedule.
6. **#323 private job logs:** `job_logs` table (architect gate: new table), 30-day delete, Node entry point redirects `console.*` before imports, a test that fails if a fixture name reaches stdout. Deleting old public run logs needs Kate's OK.
7. Then the design note's build order: engine → full pass → near-term → retire old paths → button (#317/#311) → drift list (#313).
8. UAT prep (`docs/UAT_PLAN.md`): #312 before UAT; Kate creates the client's new account and her admin's.

## Open TODOs
- [ ] **#318 sync redesign: DECIDED 2026-10-21 (option 3), build in order:** ~~#322~~ → ~~#324~~ (A+B live; first night 10-22) → roster trigger → #323 → engine → full pass → near-term (+#321) → retire old paths → button (#317/#311) → drift list (#313). Covers #316, #294
- [ ] #324: A (#329) and B (#331) live. Left: first night clean (10-22); finish the daytime checks + Sync Now 302; migration 029 drops the old `sync_settings` session columns; commit Kate's `sessionCache.js` deletion; Kate decides who may press Clear; optionally delete the unused `EXTERNAL_SITE_*` GitHub secrets
- [ ] On-time roster trigger (Kate approved; next after the #324 first-night check)
- [ ] #326 flag past boardings that change after an employee worked them
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
