# Dog Boarding App — Session Handoff (v6 — UAT restart)
**Last updated:** October 19, 2026, ~22:30 UTC (session 36, end). **Production is behind main:** Vercel hit Hobby's daily deploy limit at 20:31 UTC ("retry in 24 hours"), so #292 (#278 queue churn) is merged but **not deployed**; production runs #283. **First job next session:** after ~20:35 UTC on 10-20, merge the waiting PRs one at a time and confirm each one deploys (`Vercel – qboard` status on main = "Deployment has completed"). Git history was rewritten (#264/#281 personal data removed); re-clone or reset before working.

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
3. **Shell:** `gh` is aliased to `history | grep`, so always type `command gh …`. Production is **`https://qboarding.vercel.app`** (Vercel project `qboard`; the duplicate `dog-boarding` Vercel project was **disconnected from GitHub by Kate on 2026-10-19** and no longer deploys; since then qboard's commit status is named plain `Vercel`). Claude can't read Vercel env or logs (no CLI; Hobby logs keep 1 h). Use Kate's Chrome, the Supabase tables, or ask Kate.
4. **Gates:** run the `architect` agent on the design note before a new job, service, secret or table. Run the `reviewer` agent before every PR. A new scheduled job ships with its failure alert, and that alert must run outside the job's own scheduler.
5. **New code only:** the gates cover code written from 2026-10-16 on. Bringing older code up to the same bar is #239.

---

## Current State (2026-10-19, end of session 36)

### Session 36: what happened
1. **ops-watch's first scheduled run (17:00 UTC 10-20) hasn't happened yet.** There's no `ops-watch` row in `cron_health`. Check it first thing (Immediate Next Steps 2).
2. **Integration Check:** no runs after 10-19 19:00 UTC by session end. `sync_queue` had 0 pending, done 3529.
   - **`C63QhKpW` ("10/19-22") is an evaluation, not a stay.** On the live schedule it's three separate 10am–4pm day visits on 10/20–22, and its detail page is an Initial Evaluation. The check will report it "Missing from DB" until 10/22; ignore it.
   - Kate confirmed `C63QhKs0` and `C63QhKph` are evaluations. Their "N/C Eval" titles are already filtered.
3. **Mutation on main after #276: 47.02% (3760/7996).** Ratchet 44 → 47 (PR #280).
4. **#278 queue churn: merged as PR #292, NOT deployed** (see the header).
   - **Root cause, read from live AGYD week pages:**
     - A boarding stay's links all carry its start timestamp.
     - A recurring daycare/PG series carries one timestamp per visit, so its first visible timestamp moves with the date and the rotating cursor week.
     - All 32 "modified" re-queues on 10-19 were PG series.
   - **New rule (REQ-109):**
     - A done item is re-queued when its title changed, or its URL changed and the detail step didn't skip it. The detail step now records `meta.detail_skip`.
     - Re-queues merge meta, keep the pet ID, never blank a title, and store the scan's URL and title (failed items too).
   - **Measured:** 6 of 191 done rows have real title edits, so expect a 6-item wave on deploy.
   - **ops-watch:** oldest pending 48 h → **16 h**, and new: **more than 30 pending**.
   - The `schedule` cron_health row now has `requeuedEdited` (should be near 0) and `urlChangesIgnored`.
5. **#275 sync silent failures: PR #296, open, green except Vercel (quota).** Reviewer done; findings fixed.
   - `readSettingsRow` (`order('id')`) for every `sync_settings` reader. Read and write errors fail the scan.
   - `enqueue_failed` is red, but the cursor still advances; a 23505 race counts as unchanged.
   - `ensureSession` keeps fresh cookies when caching fails.
   - New ops-watch schedule-scan rule.
   - **Fixed a real bug:** `cron-health-check` never alerted on 2 consecutive failures, because the `started` rows sat between them, and it never read `error_msg`.
6. **Worker names out of the public repo (#281, PR #282, merged).** Names live only in the Supabase `workers` table. `workers.js` holds the UIDs and column order.
7. **Dependencies:**
   - **#283 merged** (minor bumps, jest-dom 7, Anthropic SDK removed). satori stays at 0.26.0, and Dependabot now ignores it (#246).
   - **#285 (vitest 5) is a DRAFT, on hold:** vitest 5 makes Stryker run 0 tests per mutant (stryker-js #6210, fix #6214 unreleased).
   - **vite 8 is blocked by a Babel peer conflict:** #284.
   - **New Dependabot majors #286 (vite-plugin-pwa 2), #289 (jsdom 30), #288 (lint-staged 17) and #287 (eslint 10)** were reviewed and are safe. Merge them one at a time in that order; their lockfiles conflict, so let Dependabot rebase in between.
8. **History rewrite done (Kate pushed 2026-10-19):**
   - Client names, phone numbers, emails, the street address and the 5 staff names were removed from all history, tags and branches. **One client surname was missed** (in the Session 31 table here; replaced 2026-10-20, but still in history). Kate decides whether to scrub again.
   - Kept: dog names and AGYD IDs (they collide with ordinary text).
   - Backups in `a local backup folder (ask Kate)`: `dog-boarding-before-content-rewrite.bundle`, plus `dog-boarding-deleted-branches-2026-10-19.bundle`.
   - GitHub's `refs/pull/*` still hold old commits; only GitHub Support can purge them.
   - The script and values list were in a session scratchpad; they may be gone, and must never be committed.
9. **70 stale remote branches deleted** (all backed up in the bundle above). Only main and the open-PR branches remain.
10. **#260 SMS roster: design note PR #291 (docs, architect reviewed).**
    - The Twilio account is still a **trial**; A2P registration needs an upgrade, which is Kate's payment.
    - The architect found **the roster and intraday images say "Q Boarding"** (the client's name). That must change before any SMS goes out.
    - The notify refresh alert goes to staff today, not to Kate.
    - Decisions for Kate are at the end of the note.
11. **Follow-ups filed:** #293 (re-login retry), #294 (`checkHungCron` never called; the 00:30 health check can race Vercel's cron jitter), #295 (`sync_settings` schema vs migrations).

### Session 35 (reference)
- The 10-19 false positive "Wknd DC" was fixed (#272/#273).
- Client data was scrubbed from tests (#264/#274, CI check REQ-653).
- syncRunner tests (#276).
- Telegram alerts were proven end to end.
- `GH_ACTIONS_TOKEN` expires 2027-10-19.
- Meta marks every WhatsApp send `failed 131031 Business Account locked`.

## Current reference (still true after session 36)

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
5. ~~Turn off the duplicate `dog-boarding` Vercel project~~: done 2026-10-19, disconnected from GitHub. Delete it later if nothing misses it.
6. Five Vercel variables show "Needs Attention". All five are secret-looking values stored as type **Config**, so the likely fix is to re-save them as type **Secret** (unconfirmed).

### Production (checked 2026-10-19 ~21:30 UTC)
- **qboard is serving #283 (8b6ca60's code).** The roster image returns 200 `image/png` and the home page 200.
- **Every deploy since 20:31 UTC failed with "Deployment rate limited — retry in 24 hours"**, including main (db4ae3d = #292). The cause was PR churn plus the history rewrite's 78 force-pushed branches, built on 2 projects.
- A rate-limited deploy is **not retried**. The next push to main after the reset deploys everything.
- **Always confirm a merge deployed:** `command gh api repos/kcoffie/dog-boarding/commits/<sha>/statuses --jq '.[]|select(.context=="Vercel – qboard")|.state+" "+.description'`.

### Mutation
- **CI on main:** 47.94% after #292 (2026-10-19). Ratchet 47. The run after #296 goes in the score log.
- **Scoped, local, TZ=UTC:**
  - `opsWatch.js` 100%
  - `syncSettingsRow.js` 100%
  - `cron-schedule.js` 98.7%
  - `syncRunner.js` 83.6%
  - `sessionCache.js` 71.8%
  - `syncQueue.js` 69.3% (the rest is log text and older functions)
  - notify/crons 83.27%
  - `send-question` 87.9%
  - `alertKate` 82%
- **Never bump vitest to 5** until the Stryker runner ships #6214. Check "tests per mutant" > 0 after any test-runner change.
- **Next #239 target:** `pictureOfDay.js` (51.13% in CI: 135 survived, 59 no coverage).

### Issues
- **#296 (#275):** open, ready to merge after the deploy reset.
- **#291 (#260 note):** open, docs.
- **#286–#289:** open Dependabot majors, reviewed.
- **#285:** draft, on hold (vitest 5).
- **#284:** vite 8 peer conflict.
- **#260:** SMS roster, blocked on Kate's Twilio upgrade, registration and decisions.
- **#257:** ops-watch rule for notify failures in every window.
- **#246:** close only after a scheduled roster is sent **and** delivered (after #260).
- **#239:** backfill. Next is `pictureOfDay.js` tests from REQ-610/611.
- **#293, #294, #295:** follow-ups from #275.
- **#238:** dependency triage; #145 (eslint 10, now in #287 and safe on its own).

## Immediate Next Steps
1. **Sync first.** History was rewritten, so on an old clone run `git fetch --prune && git checkout main && git reset --hard origin/main`.
2. **ops-watch's first scheduled run (17:00 UTC 10-20):** confirm a `cron_health` row for `ops-watch` and that Kate got its findings on Telegram.
   - Expect "no 4am roster delivered" until #260.
   - It runs #283's code, so the old thresholds apply.
   - No row means checking Vercel logs (Hobby keeps 1 h), or Kate re-runs the dry-run curl.
3. **After the deploy limit resets (~20:35 UTC 10-20)**, merge one at a time, confirming each `Vercel – qboard` deploy completes:
   - **#296** (#275). This also deploys #278. Before merging, update the branch (`command gh pr update-branch 296`) and wait for green.
   - **#286 → #289 → #288 → #287.** Comment `@dependabot rebase` on the next one after each merge.
   - **#291** (the docs note).
   - After the first deploy, check:
     - the roster image endpoint;
     - the next `schedule` cron_health row: `requeuedEdited` near 0, `urlChangesIgnored` > 0, `found` > 0;
     - `sync_queue` pending under 30.
4. **Read every Integration Check run since 10-19 19:00 UTC.** For red runs, read the log before assuming. Expect `C63QhKpW` until 10/22 (an evaluation).
5. **Add the main Mutation score** after #296 to the score log (#292's is in: 47.94%), and raise the ratchet if it goes up.
6. **#239:** `pictureOfDay.js` tests from REQ-610/611, with mutation scores. Also #257.
7. **#260** once Kate has upgraded Twilio and decided the note's points (the image label replacing "Q Boarding", opt-in method, trigger). Fold the architect's changes into the note's body before building.

## Open TODOs
- [ ] Merge queue above (#296, #286–#289, #291) once Vercel deploys again
- [ ] #239 backfill (`pictureOfDay.js` next), #257, #293, #294, #295
- [ ] #285 vitest 5: wait for stryker-js #6214 in a vitest-runner release
- [ ] #284 vite 8 + plugin-react 6 (Babel peer conflict)
- [ ] `@eslint/js` 10 (after #287): fix 2 `no-useless-assignment` errors in `src/lib/scraper/extraction.js:77-78` first
- [ ] Kate: Twilio upgrade + Sole Proprietor registration; #291's decisions
- [ ] Kate: optionally delete the disconnected `dog-boarding` Vercel project
- [ ] Kate: `GH_ACTIONS_TOKEN` expires 2027-10-19 (calendar reminder)
- [ ] Kate: remove `INTEGRATION_CHECK_RECIPIENTS` and the stale `TWILIO_*` GitHub secrets
- [ ] Kate (optional): ask GitHub Support to purge cached PR refs (`refs/pull/*`) holding pre-rewrite commits
- [ ] `mutate:changed` (80% on changed lines) as a PR check; a PR check that `thresholds.break` never goes down
- [ ] Integration Check: skip candidates whose schedule entries are same-day visits (`C63QhKpW` pattern), like N/C evals

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
