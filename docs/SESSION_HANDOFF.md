# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 20, 2026, ~19:20 UTC (session 38, end). **Production = main (`66aa710`, #308).** The roster reaches Kate on **Telegram** (proven again 17:27 UTC 10-20 on the new build). WhatsApp is locked (since 2026-10-17). Staff get the roster again when Twilio SMS (#260) ships. **#301 (token out of the browser) is built, reviewed and green on the LOCAL branch `fix/301-browser-auth`, waiting for Kate to add `INTERNAL_API_TOKEN`.**

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

## Current State (2026-10-20, end of session 38)

### Session 38: what happened
1. **Checks (10-20 afternoon; the overnight ones hadn't run yet, the session started 15 min after session 37 ended):**
   - Integration Check: no run since session 37. Every run since 10-19 18:57 found only `C63QhKpW` (known evaluation until 10/22), alert delivered. The two red runs (10-19 15:07, 18:44) were the Telegram setup (secrets missing, then a 403 chat ID); `C63QhIww` in the first was synced after.
   - **ops-watch had never run in production** (cron-health-check said so daily since 10-17; most likely cause: `CRON_SECRET` was added to Vercel on 10-19 after that day's 17:00 run). **First run: 10-20 17:36 UTC**, `success`, finding "Alerts not delivered in the last 24h: 1 (integration-check)" (the 10-19 18:47 403, ages out at 18:47 10-20). Kate got it on Telegram **and** the GitHub email (ops-alert). Vercel Hobby crons fire any time within their hour.
   - `sync_queue`: 0 pending / 0 failed.
2. **Mutation:** full CI run on 0239e22 **50.64% (4226 / 8345)**, 9.61 tests per mutant; the same 50.64% on d5a1259 after #304, and on 8f15b94 and 66aa710 under ratchet 50. All 14 timeouts read and genuine. **Ratchet 47 → 50 (#306).** The first run whose incremental cache was saved (every earlier main run had been cancelled by the next push).
3. **Merged and deployed (each `check:deploy` OK):**
   - **#304** dev dependencies (eslint 10, jsdom 30, vite-plugin-pwa 2, lint-staged 17): plus a test that the roster fetch error carries no `cause` (REQ-655). **Kate dispatched `notify-4am` on the new build at 17:27 UTC: `{"to":"telegram","status":"sent"}`, image arrived and looked normal.**
   - **#303** actions/upload-artifact 7, actions/cache 6.
   - **#306** mutation ratchet 50.
   - **#308** `docs/UAT_PLAN.md` (below).
   - The ruleset requires branches up to date with main: `command gh pr update-branch <n>` then wait for CI (~2 min) before merging.
4. **#301 built on the LOCAL branch `fix/301-browser-auth` (7 commits on top of `8f15b94`, not pushed):**
   - New `src/lib/verifyUser.js` (REQ-656): Supabase user JWT via `GET /auth/v1/user`, 5 s timeout, fails closed (500 missing env, 401, 503 outage).
   - `send-question` and `sync-proxy` accept only a signed-in user; sender = verified email; `sync-proxy` fetches are GET-only.
   - `scraper/auth.js` sends `getSession()`'s token on every proxy call; `supabase.js` loaded only in the browser path.
   - Server token renamed `INTERNAL_API_TOKEN` (5 notify workflows, notify, notify-intraday, roster-image, intraday-image, ops-watch, check-deploy, docs).
   - Deleted `api/run-sync.js`, the invite-code sign-up page and its test (Kate ran the `git rm`); `/signup` redirects to `/login`; REQ-001 rewritten ("No Self Sign-Up").
   - **Checks:** lint 0 errors; 1617 tests; 78/78 REQs; build OK. Scoped Stryker: `verifyUser` 98.3%, `send-question` 87.8%; remaining changed-line survivors equivalent. **Canary build:** with both tokens set, the bundle holds neither (main's bundle does hold the old one).
   - **Reviewer: OK to open the PR.** Its pre-merge items are done (rotation steps for a failed deploy and merge timing; an extra old-token check; tests for Send a Question's browser half, the proxied fetch body, the no-email sender).
   - **The rotation order** is item 8 of `docs/specs/browser-auth-design-note.md` **on that branch** (updated: the new token goes into `.env.local` too before the merge, because `check:deploy` reads it; no redeploy after deleting the old one).
   - While the #301 branch is checked out, its `check:deploy` needs `INTERNAL_API_TOKEN` in `.env.local`. Run `check:deploy` from main (or a main worktree) until #301 merges.
5. **UAT plan (#308, merged): `docs/UAT_PLAN.md`.** Centred on Charlie's real job, paying the overnight staff (today: a spreadsheet, dates and dogs ticked by hand). Watch first, then two pay periods side by side, five criteria in her words, keep/fix/wish after every pay period, adoption measured from `payments`. Kate's answers: her admin has no account yet (Kate creates it in Supabase); the pay breakdown is printable **and** a picture Charlie sends from her own phone (the app never sends it); Kate decides when a criterion is met, consulting Charlie. Still open: what staff may see once they have accounts (#6).
6. **Found on the way:** the sync silently overwrites hand edits to synced boardings and re-creates deleted ones (`src/lib/scraper/mapping.js`), so a correction in the app doesn't stick. A dog with no rate counts $0 toward the night's pay, silently (workaround: set the dog's own night rate, REQ-011).
7. **Filed:** #307 (remove invite-code management from Settings now that sign-up is gone).
8. **Kate:** removed `VITE_EXTERNAL_SITE_USERNAME/PASSWORD` from `.env.local` (not in Vercel).

### Production (checked 2026-10-20 ~19:20 UTC)
- main `66aa710` (#308) is live: home 200, roster image 200 `image/png`.
- **The 00:05 UTC 10-21 `schedule` run is the first on #292's queue-churn fix**; the 11:00 UTC 10-21 `notify-4am` is the first unattended roster on #304's build.

### Session 37 (reference)
Deploy/CI budget (#298/#300: Vercel builds only `main` and `preview/**`; `npm run check:deploy`; incremental mutation); roster to Kate on Telegram behind the required `ROSTER_CHANNEL` (#302, REQ-655); #275 sync silent failures (#296); Supabase sign-up turned off by Kate; #301 filed and designed. Details: git history of this file.

## Current reference (still true after session 38)

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
- **CI on main: 50.64%** (0239e22 and d5a1259, 2026-10-20). **Ratchet 50** (#306). Score log: `docs/ENGINEERING_PROCESS.md`. Incremental cache now seeded; a `package-lock`/`stryker.config` change forces a full run (~55–60 min). Don't merge on top of a Mutation run whose score you need: the next push to main cancels it.
- **Scoped, local, TZ=UTC:** `rosterChannel.js`, `opsWatch.js`, `syncSettingsRow.js`, `deployCheck.js` 100%; `cron-schedule.js` 98.7%; `verifyUser.js` 98.3% (#301 branch); `send-question` 87.8%; `syncRunner.js` 83.6%; `alertKate` 82%; `notify.js` 81.2%; `sessionCache.js` 71.8%; `syncQueue.js` 69.3%; `notify-intraday.js` 66.9%.
- **Never bump vitest to 5** until the Stryker runner ships #6214 (held in Dependabot's `ignore`). Check "tests per mutant" > 0 after any test-runner change.
- **#239 `pictureOfDay.js`** (51.13% in CI): parked by Kate until UAT starts.

### Issues
- **#301:** built on the local branch; waiting for Kate's step 1 (below).
- **#260:** Twilio SMS roster. **Kate starts the Twilio upgrade (A2P needs a paid account; she has no registered business and messages can't be tied to Charlie's, so check the sole-proprietor or toll-free route).** PR #291 holds the reviewed design and Kate's open decisions.
- **#294** (`checkHungCron` never called), **#299** (alert when a merge doesn't reach production; needs the architect gate): small, next after #301.
- **#307:** remove invite-code management (after #301). **#11:** close once #301 merges (moot).
- **#257** (fold into #260), **#293, #295** (low), **#285** vitest 5 / **#284** vite 8 (parked), **#246** (close after #260).
- **January issues #6–#24:** triage with Charlie at the first UAT check-in (`docs/UAT_PLAN.md`).

## Immediate Next Steps
1. **Sync:** `git fetch --prune && git checkout main && git pull --ff-only`. Read memory, this file, `docs/ENGINEERING_PROCESS.md`, `docs/UAT_PLAN.md`.
2. **Overnight checks (first on the new builds):** read real timestamps (`date -u`, run `createdAt`), don't assume.
   - `schedule` cron_health row: `requeuedEdited` near 0, `urlChangesIgnored` > 0, `found` > 0 (columns: `cron_name, last_ran_at, status, result, error_msg, updated_at`).
   - `sync_queue` pending < 30.
   - The scheduled `notify-4am` (11:00 UTC, often hours late) → `{"to":"telegram","status":"sent"}`; ask Kate it arrived.
   - ops-watch's 17:00 UTC row: expected **no findings** now; cron-health-check should no longer report "ops-watch has never run".
   - Every red Integration Check: read the log. `C63QhKpW` is an evaluation until 10/22; after that it should drop out (if it doesn't, that's the "skip same-day-visit candidates" TODO).
3. **#301 rotation (Kate does it in her evening; the note's item 8 on the branch is the source of truth):**
   1. Kate adds `INTERNAL_API_TOKEN` (`openssl rand -hex 32`) to **Vercel** (qboard → Production, Sensitive), **GitHub secrets** (`pbpaste | command gh secret set INTERNAL_API_TOKEN -R kcoffie/dog-boarding`) and **`.env.local`**. The old `VITE_SYNC_PROXY_TOKEN` stays everywhere until step 5.
   2. **Push only in the merge window** (just before step 3, so push → live is minutes): the branch's design note describes how the still-valid old token can be abused. Claude: `git checkout fix/301-browser-auth && git rebase origin/main`, full `npm run test:run`, lint; then push and open the PR (the reviewer already ran; re-run it only if the rebase changed code). Wait for green (~2 min).
   3. **Merge only after that day's last intraday run (03:00 UTC) has finished** (and on Fridays after friday-pm at 22:00 UTC). Then `npm run check:deploy`. **If it fails: redeploy or revert before 11:00 UTC.** Never leave main ahead of production overnight.
   4. Claude: the old/new token checks in item 8, step 3 of the design note on the branch (roster-image NEW → 200, OLD → 401, plus the sync-proxy check listed there). Dispatch `notify-intraday.yml` → 200 `channel_telegram` (sends nothing); if the classifier blocks it, give Kate `! command gh workflow run notify-intraday.yml -R kcoffie/dog-boarding --ref main`.
   5. Kate deletes `VITE_SYNC_PROXY_TOKEN` from Vercel, GitHub and `.env.local` (no redeploy needed). Kate checks: Send a Question works signed in and gets 401 signed out; manual sync works. A 500 "Server misconfigured" means Vercel functions can't see `VITE_SUPABASE_ANON_KEY`.
   6. Then close #11, update "Key Facts" below (the token line), and `memory`.
4. **#294 and #299** (architect gate for #299). #294 can be built on its own branch while #301 waits for Kate's evening; merge it before the #301 window, not during it.
5. **UAT prep (`docs/UAT_PLAN.md`, "Before UAT starts"):** Kate decides who gets accounts and creates the admin's; fix at least the silent $0 rate first, ideally the pay breakdown image too; dry-run the admin invite with a spare address (#23, #24); warn Charlie and her admin about the two traps (Settings → Invite Users; hand edits overwritten by the sync). Hand edits that survive the sync come after. Each fix needs a design note (+ architect for anything new) before code. Kate runs the "watch first" session with Charlie and her admin.
6. **#260** once Kate has upgraded Twilio and decided #291's points.

## Open TODOs
- [ ] #301: Kate adds `INTERNAL_API_TOKEN`; push, PR, merge after 03:00 UTC, rotate (Next Steps 3)
- [ ] #294, #299
- [ ] UAT: Kate reviews `docs/UAT_PLAN.md` decisions, creates the admin account, runs "watch first" with Charlie and her admin; triage #6–#24 at the first check-in
- [ ] Fix: a dog with no rate fails silently (counts as $0 toward the night's pay)
- [ ] Fix: a correction by hand (missed, odd or late booking) must survive the next sync; today the sync silently overwrites edited boardings and re-creates deleted ones
- [ ] Fix: a pay breakdown image per employee, printable and sendable to a phone (what they're paid, and how it was calculated). Charlie sends it from her phone; the app never does (Kate, 2026-10-20)
- [ ] Maybe: notify Charlie when her admin adds or changes boarding info
- [ ] Maybe: a clear "something looks wrong at 9pm" path (Send a Question, made obvious, with what happens next)
- [ ] #307 invite-code management; close #11 after #301
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

- **Tokens (until #301 merges):** `VITE_SYNC_PROXY_TOKEN` guards the internal endpoints and is in the public bundle. **After #301:** jobs use the server-only `INTERNAL_API_TOKEN`; browser calls (`send-question`, `sync-proxy`) need a signed-in Supabase user (REQ-656); `run-sync` is gone.
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
