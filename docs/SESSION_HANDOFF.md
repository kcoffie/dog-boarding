# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 21, 2026, ~00:00 UTC (session 39, end). **Production = main (`e0fe16a`, #310: token out of the browser, rotated).** The roster reaches Kate on **Telegram**. WhatsApp is locked (since 2026-10-17). Staff get the roster again when Twilio SMS (#260) ships. **Top priority: the sync redesign (#318). Research and design first; no sync code until Kate decides.**

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

## Current State (2026-10-21 ~00:00 UTC, end of session 39)

### Session 39: what happened
1. **#301 merged and rotated (PR #310, `e0fe16a`, live 21:05 UTC 10-20).** Kate chose to do it mid-afternoon instead of after 03:00 UTC: intraday sends nothing while `ROSTER_CHANNEL=telegram`, so the real constraint was Kate being present for the rotation.
   - The first `check:deploy` got a **401**: Vercel's `INTERNAL_API_TOKEN` didn't match `.env.local`. Fixed by copying `.env.local`'s value into Vercel (qboard, Production) and the GitHub secret, then redeploying. **If a token 401s again, suspect Vercel's project, environment scope or a pasted value first.**
   - Checks (21:13–21:14 UTC): `check:deploy` OK; roster image NEW → 200, OLD → 401; sync-proxy OLD → 401, none → 401; send-question signed out → 401; the live JS (1 MB) holds neither token; `notify-intraday` dispatch → `{"ok":true,"action":"skipped","reason":"channel_telegram"}`.
   - Kate deleted `VITE_SYNC_PROXY_TOKEN` from GitHub and `.env.local` (21:16 UTC); `check:deploy` still OK after. **Not confirmed: deleted in Vercel** (ask Kate).
   - **Send a Question returned "Unauthorized" in Kate's already-open tab** (old JS sent the old token). A reload fixed it, and Send a Question works signed in. **Anyone with the app open from before 21:05 10-20 (or the installed PWA) needs to reload once.**
   - Sync Now works through the new signed-in proxy. #11 closed (moot).
   - Mutation on `e0fe16a` (incremental): **52.06%**, ratchet 50.
2. **Sync turned out to be the real problem. Kate's top priority is now the sync redesign (#318).** Findings: `docs/specs/sync-redesign-findings.md` (every sync path, two implementations, 19 problems with evidence, constraints, 10 open questions, a direction that's **not decided**). Kate: "before we make any changes we need to make good, informed design decisions and take in our whole universe of sync knowledge". **#294 is parked into it.**
   - Each Vercel `cron-detail` run processes **one** booking (2/day). The Integration Check's sync-before-compare does most of the real syncing. Only browser Sync Now removes bookings that are gone from the site. The Integration Check compares one way only.
   - **Bug found and fixed for one booking:** a boarding removed on the booking site (`C63QhHuu`, 10/19–10/25) was on the 10-20 4am roster. Kate's Sync Now archived it at 21:50:23 UTC. The bug itself is #316.
   - Sync Now on 10-20: the first run (10/20–11/20) reached reconciliation but died when the page was reloaded, before writing its counts; its log row stayed `running` and locked the button for 30 min. The second run (10/20–12/19) took **47 m 49 s**: found 519, skipped 500, updated 17, failed 2 (playgroup pages crash the parser, P18). #317 (high).
3. **Issues filed:** #311 Sync History page, #312 silent $0 rate, #313 hand edits survive the sync, #314 pay breakdown image, #315 Integration Check same-day visits, #316 vanished bookings, #317 Sync Now behaviour (high), #318 sync redesign (umbrella), #319 Sync Details window cut off (UAT bug; likely needs a portal like REQ-506). Kate: todos should be issues.
4. **Not done (by Kate's choice or blocked):** #294 (parked into #318), #299, the UAT design notes for #312/#314, and the overnight checks (session 39 started at 20:52 UTC, before any overnight run).

### Production (checked 2026-10-20 ~21:17 UTC)
- main `e0fe16a` (#310) is live: home 200, roster image 200 `image/png` with `INTERNAL_API_TOKEN`.
- **Tonight's runs are the first after #301:** `schedule` cron 00:05 UTC 10-21 (also the first on #292's queue fix); **`notify-4am` 11:00 UTC 10-21 is the first scheduled roster on the new token**; ops-watch 17:00 UTC 10-21 (its roster-image read uses the new token).

### Session 38 (reference)
#304/#303/#306/#308 merged; ops-watch's first run (10-20 17:36); #301 built locally; UAT plan. Details: git history of this file.

## Current reference (still true after session 39)

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
- **UAT fixes:** #312 ($0 rate, before UAT), #314 (pay breakdown image), #313 (hand edits; after the redesign decides who wins), #319 (Sync Details cut off).
- **#299** (alert when a merge doesn't reach production; architect gate; needs `INTERNAL_API_TOKEN` in the workflow since #301).
- **#260:** Twilio SMS roster. Kate starts the Twilio upgrade (A2P needs a paid account; no registered business, and messages can't be tied to Charlie's, so check the sole-proprietor or toll-free route). PR #291 holds the design and Kate's open decisions.
- **#307:** remove invite-code management from Settings (sign-up is gone since #301).
- **#257** (fold into #260), **#293, #295** (low), **#285** vitest 5 / **#284** vite 8 (parked), **#246** (close after #260).
- **January issues #6–#24:** triage with Charlie at the first UAT check-in (`docs/UAT_PLAN.md`).

## Immediate Next Steps
1. **Sync:** `git fetch --prune && git checkout main && git pull --ff-only`. Read memory, this file, `docs/ENGINEERING_PROCESS.md`, `docs/specs/sync-redesign-findings.md`, `docs/UAT_PLAN.md`. Baseline: `git status`, `npm run test:run`, open PRs and issues.
2. **Overnight checks (first runs after #301), with real timestamps** (`date -u`, run `createdAt`):
   - `notify-4am` (scheduled 11:00 UTC, often hours late) → `{"to":"telegram","status":"sent"}` in its log and the `notify` cron_health row; **ask Kate it arrived.** A 401 here means the GitHub secret and Vercel disagree.
   - `schedule` cron_health row: `found` > 0, `requeuedEdited` near 0, `urlChangesIgnored` > 0. `auth` and `detail` rows succeeded.
   - `sync_queue` pending < 30.
   - ops-watch's 17:00 UTC row: expected **no findings**.
   - Every red Integration Check: read the log. `C63QhKpW` should drop out after 10/22 (#315 otherwise).
   - Ask Kate: did she delete `VITE_SYNC_PROXY_TOKEN` in Vercel?
3. **#318 sync redesign: research the open questions (findings section 6), read-only.** Start with: can `runSync` (`src/lib/scraper/sync.js`) run unchanged in Node on GitHub Actions, and where do a full sync's 48 minutes go (pages fetched vs skipped; the 1.5 s delay)? Add answers to the findings doc as you go. Then write the design note (problem → options → choice → what breaks → threat → how we'll know), run the `architect` agent, and **get Kate's decision before any code.** No piecemeal sync fixes meanwhile.
4. **UAT prep (`docs/UAT_PLAN.md`, "Before UAT starts"):** design notes for #312 (silent $0 rate) and #314 (pay breakdown image; Charlie sends it from her phone, the app never does). Ask Kate about accounts before building anything that depends on them (who gets accounts; every signed-in user sees everyone's pay, REQ-005). The admin's account, the invite dry-run (#23, #24) and the "watch first" session are Kate's.
5. **#299** after the redesign's direction is set (it may change what "production" checks look like).
6. **#260** once Kate has upgraded Twilio and decided #291's points.

## Open TODOs
- [ ] **#318 sync redesign (top priority, Kate 2026-10-20):** findings in `docs/specs/sync-redesign-findings.md`. Research → design note → architect → Kate decides → build. Covers #316, #317 (high), #311, #294 (parked into it)
- [ ] #299
- [ ] UAT: Kate reviews `docs/UAT_PLAN.md` decisions, creates the admin account, runs "watch first" with Charlie and her admin; triage #6–#24 at the first check-in
- [ ] #312 a dog with no rate counts as $0, silently (before UAT)
- [ ] #313 a correction by hand must survive the next sync
- [ ] #314 pay breakdown image per employee (Charlie sends it; the app never does)
- [ ] Maybe: notify Charlie when her admin adds or changes boarding info
- [ ] Maybe: a clear "something looks wrong at 9pm" path (Send a Question, made obvious, with what happens next)
- [ ] #307 invite-code management
- [ ] #319 Sync Details window cut off (UAT bug)
- [ ] Kate: confirm `VITE_SYNC_PROXY_TOKEN` deleted in Vercel
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
