# Q Boarding — Sprint Plan

_Last updated: May 4, 2026 (session 28) — **B-2 fully done (PR #202). Check 3 removed from integration check. 1047 tests. Next: Kate picks G-1 or G-3.** Theme: Client-driven operational intelligence._

---

## Product Goal

**Theme:** Fully autonomous. Production-hardened. Interview-ready.

This app serves two simultaneous audiences:

1. **A real client** — a dog boarding operator who receives WhatsApp notifications, relies on the system to run autonomously, and needs to trust that failures surface before they cause problems.
2. **A portfolio audience** — a technical interviewer or potential client who should be able to understand what this is, how it works, and why the architecture decisions were made, within 10 minutes of landing on the repo.

Both bars must be cleared. They are not in conflict — a system hardened enough for a real client is impressive in an interview.

---

## UAT Definition — "Done" Criteria

Every milestone must clear both gates before it's complete:

| | Real Client Gate | Portfolio Gate |
|---|---|---|
| **Notifications** | Lands on their actual phone (not sandbox) | Live demo works for anyone in the room |
| **Autonomy** | Runs 7 days untouched without silent failure | README explains how without narration |
| **Failure handling** | Someone is alerted before the client notices | Code + docs show failure modes were considered |
| **Onboarding** | Client can verify the system is healthy | Stranger understands the system in 10 minutes |

---

## Architecture Decisions (Closed)

Current stack (React/Vite on Vercel Hobby + Supabase + GH Actions) is correct for this scale.

- **Vercel Pro upgrade:** Not needed. `cron-detail-2.js` path-splitting achieves double throughput for free.
- **Gmail monitoring:** Lightweight GH Actions hourly poller — same architecture, no new infrastructure.
- **Gmail OAuth:** Personal Gmail account (not a dedicated system account). Read-only scope. Queries by known sender only — never scans arbitrary inbox content. Deliberate privacy constraint.
- **Meta Cloud API:** Permanent production sender — no sandbox, no pre-approval list. Twilio fully removed.

---

## Feature Build Status

| Feature | Status | Notes |
|---------|--------|-------|
| Overnight boarding sync — DC filter fix | ✅ DONE | B-1 — anchor `^(d\/c\|dc)\b`; Peanut (C63QghzF) confirmed in DB May 1 (run 25239049354). |
| Integration check false positives — PT + Claude vision | ✅ DONE | B-2 — PR #201 (Fix 1: `^PT\b`) + PR #202 (removed Check 3 entirely). Verified clean run May 4: PASS ✅ 0 issues. |
| Overnight boarding sync | ✅ LIVE | 3-page scan + cron-detail-2 |
| Overnight daytime ingest | ✅ LIVE | cron-schedule.js handles this |
| Weekday morning notify (M-F 4am/7am/8:30am) | ✅ LIVE | |
| Friday PM notify (weekend boardings) | ✅ LIVE | K-1b complete. `dog_boarding_roster_3` (Utility) confirmed delivered April 2. |
| Integration check — boarding + daytime | ✅ LIVE | Step 0 sync-before-compare (v4.5) |
| Meta Cloud API (WhatsApp sender) | ✅ LIVE | M0 — confirmed March 20, 2026 |
| Direct cron failure alerting | ✅ LIVE | M1-1 — cron-health-check.yml at 00:30 UTC |
| Gmail monitoring agent | ✅ LIVE | M2 — hourly; confirmed March 20, 2026 |
| README overhaul | ✅ DONE | M3-1 — mermaid diagram, architecture, ADR links |
| Operator runbook | ✅ DONE | M3-2 — docs/RUNBOOK.md |
| Architecture Decision Records | ✅ DONE | M3-3 — docs/adr/001/002/003 |
| WhatsApp sender consolidation | ✅ DONE | M3-11 — twilio removed (#108) |
| Meta message templates | ✅ DONE | M3-12 — all sends use approved templates (#112) |
| Roster image "As of" timestamp | ✅ DONE | M3-4 — `formatAsOf`, ts param (#137) |
| DST-aware scheduling + code polish | ✅ DONE | M3-5 — timingSafeEqual, regex cache, flaky test fix (#140) |
| Doc staleness CI check | ✅ DONE | M3-6 |
| Screen recording (portfolio artifact) | ⏸ DEFERRED | M3-7 — existing recording has privacy concerns (WhatsApp inbox names visible). Re-record when time allows. Screenshots (M3-8) cover the portfolio gap in the meantime. Can be added anytime as a docs-only push. |
| README screenshots | ✅ DONE | M3-8 |
| K-6 — Docs direct-push to main | ✅ DONE | Admin bypass on ruleset (April 3, 2026) |
| CHANGELOG.md | ✅ DONE | M3-9 — merged PR #143 |
| WhatsApp delivery receipts | ✅ DONE | F-1 — merged #165, verified Apr 3. Delivery events confirmed flowing April 21. |
| Integration check smart-send | ✅ DONE | I-1 — merged #167. Run 1 always sends; runs 2+3 silent when passed. |
| Second notify recipient | ✅ DONE | G-6 resolved April 21 — typo in NOTIFY_RECIPIENTS fixed (`4562`→`5462`). Both numbers confirmed in DB. |
| Privacy + Terms pages | ✅ DONE | PR #180 + direct push — `/privacy` and `/terms` live at qboarding.vercel.app |
| Message log page | ✅ DONE | F-2 — v5.5.0 live Apr 23. `message_log` table, `roster-images` Storage, `/messages` page with inline PNGs. |

---

## Pending Kate Actions (Non-Code Blockers)

These are not code tickets. They block specific milestones. Track them here so nothing slips.

| #                | Action                                                                                                                                                                                         | Blocks                                               | Priority  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------- |
| ~~K-1b confirm~~ | ✅ Done April 2 — image confirmed on phone, v5.4.0 released                                                                                                                                     | —                                                    | —         |
| ~~K-2~~          | ✅ Done April 3 — Maverick backfilled                                                                                                                                                           | —                                                    | —         |
| ~~K-3~~          | ✅ Done April 3 — N/C = new client initial eval; PR #161 merged                                                                                                                                 | —                                                    | —         |
| ~~K-4~~          | ✅ Done April 5 — second number added to `NOTIFY_RECIPIENTS` Vercel env var                                                                                                                   | —                                                    | —         |
| ~~K-7~~          | ✅ Closed April 21 — publishing not needed. App uses Meta test phone in dev mode (≤5 recipients). Dev mode is the correct long-term model. No registered business required.                    | —                                                    | —         |
| ~~K-5~~          | ✅ Closed May 4 — Check 3 (Claude vision) removed entirely in PR #202. ANTHROPIC_API_KEY no longer used by integration check. | — | — |
| K-8              | **Replace Meta test phone number before ~July 2, 2026.** Test number (+1 555 153 3723) expires 90 days from ~April 3. Get a number not on WhatsApp (Google Voice is easiest). Add via Meta API Setup → Step 5 → verify → update `META_PHONE_NUMBER_ID` in Vercel. | WhatsApp continuity | 🟡 Medium — ~10 weeks |

---

## Sprint Focus — v6 Tickets (Start Here)

**Why this order:**

1. **R-1** ✅ Q Boarding 6th box — PR #187 + bug fix PR #189
2. **J-1** ✅ PR #191 merged — Intraday change notification job. v6.0.0 released.
3. **P-1** ✅ PR #193 merged — Employee pay daytime follow-on. Bug fix PR #195 (wrong data source). v6.1.0 released. Migration 027 live in Supabase. **All v6 tickets done.**
4. **B-1** ✅ PR #199 merged — DC filter false positive. Peanut (C63QghzF) confirmed in DB May 1.
5. **B-2** ✅ PR #201 + PR #202 merged May 4 — Fix 1 (`^PT\b`) + removed Check 3 entirely. Verified clean run. **Next: Kate picks G-1 or G-3.**

---

## Milestone 3 — Portfolio Polish

**Gate:** A technical stranger understands the system in 10 minutes from the GitHub repo alone.

---

### M3-4 — "As of" timestamp in roster image

**Status:** ✅ DONE — PR #137 merged April 1, 2026.

**Definition of Done:**
- [x] Roster image PNG includes "as of [time], [day abbr] [M/D]" line, formatted in PST
- [x] `as of` uses the timestamp from when the notify job ran (not a hardcoded or UTC value)
- [x] Unit test: given a known timestamp input, rendered "as of" line matches expected string
- [x] Integration test: roster image renders without error end-to-end ← triggered April 2, 2026
- [x] All 943 tests pass (0 regressions)
- [x] Deployed to Vercel + notify triggered manually, "as of" timestamp confirmed on Kate's phone April 2, 2026

**Implementation:** `notify.js` captures `jobRunAt` at start, appends `&ts=<iso>` to image URL. `roster-image.js` new `formatAsOf()` formats as `"6:04 PM, Mon 3/16"` PST/PDT; reads `req.query.ts` (falls back to `lastSyncedAt`). `buildLayout(data, asOfStr)` receives pre-formatted string.

---

### M3-5 — DST-aware scheduling + code polish

**Status:** Not started.

**What:** Three targeted fixes:
1. **DST-aware scheduling** — cron run times shift by 1h when DST changes. Verify the GH Actions cron times are intentional in PDT vs. PST. Document the decision.
2. **Remove misleading comment in `roster-image.js`** — the "constant-time" comparison comment is incorrect. Either use `crypto.timingSafeEqual` or just remove the claim.
3. **Pre-compile `attr()` regexes in `daytimeSchedule.js`** — `new RegExp(name + ...)` is rebuilt on every iteration inside a hot loop. Pre-compile once.

**Definition of Done:**
- [ ] `roster-image.js` token check: uses `crypto.timingSafeEqual` (preferred) or comment removed — no misleading claim remains
- [ ] `daytimeSchedule.js` regex precompiled outside the loop
- [ ] DST cron behavior documented (even if decision is "UTC crons are intentional" — write it down in a comment or ADR addendum)
- [ ] DST-flaky `DateNavigator.test.jsx` test: fixed or explicitly removed with a comment explaining why
- [ ] All tests pass

**Files to read before coding:**
- `api/roster-image.js` — token validation
- `src/lib/scraper/daytimeSchedule.js` — regex in hot loop
- `.github/workflows/*.yml` — cron schedules in UTC
- `src/components/DateNavigator.test.jsx` — flaky DST test

---

### M3-6 — Doc staleness CI check

**Status:** ✅ DONE — PR #163 merged (`e0ae675`) April 3, 2026.

**What:** Non-blocking GitHub Actions check that detects when `api/` or `src/lib/scraper/` files change in a PR but no file in `docs/job_docs/` was touched. Outputs a warning, not a failure.

**Definition of Done:**
- [x] New `doc-staleness` job in `ci.yml` that runs on PRs only
- [x] Detects: `api/*.js` or `src/lib/scraper/*.js` changed AND `docs/job_docs/` not touched
- [x] Outputs `::warning::` annotation (does not fail the build — `continue-on-error: true`)
- [ ] Tested via a PR that modifies `api/notify.js` without touching `docs/job_docs/` — warning appears ← **pending separate verification PR**
- [x] Does not trigger false positives on doc-only PRs (confirmed on PR #163 itself)

**Architect note:** Use `git diff --name-only` on the PR diff. Keep it in bash — no new dependencies. This is a one-step shell script in the workflow YAML.

---

### M3-7 — Screen recording (WhatsApp roster image arriving on phone)

**Status:** 🔄 IN PROGRESS — recording file on hand, blocked on Kate's edit decision.

**Recording file:** `/Users/kcoffie/Downloads/ScreenRecording_04-03-2026 11-10-42_1.MP4` — 22 MB MP4. No ffmpeg installed yet.

**Decision gate (ask Kate at session start):**
- **Option A — Use as-is (fastest):** 22 MB MP4, copy to `docs/screenshots/roster-delivery.mp4`, embed with `<video>` tag. GitHub renders it inline.
- **Option B — Trim via ffmpeg:** `brew install ffmpeg` first, then Kate specifies start/end times, agent runs trim. Smaller file.
- **Option C — Kate trims in QuickTime:** File → Trim → Export. Drop trimmed file, agent embeds.

**What:** 30–60 second screen recording showing the Friday PM roster image arriving as a WhatsApp message on Kate's phone. End-to-end flow: notify job fires → WhatsApp message received on phone → image opens with "as of" timestamp visible.

**Definition of Done:**
- [x] K-1b confirmed April 2 — image arrived on phone ✅
- [ ] Recording embedded in README after the two screenshots under "What it looks like"
- [ ] Caption: "End-to-end flow: notify job fires → WhatsApp message received → image opens with 'as of' timestamp"
- [ ] Recording is clean: no sensitive data visible (dog names OK; no phone number, account info)
- [ ] Pushed direct to main (K-6 bypass)
- [ ] SESSION_HANDOFF.md + SPRINT_PLAN.md updated

**README embed (once file is ready):**
```html
<video src="docs/screenshots/roster-delivery.mp4" controls width="400"></video>
```
Insert after line 17 in README (after `![Roster image](...)`), before the `---` separator.

---

### M3-8 — App screenshots in README

**Status:** ✅ DONE — pushed direct to main (`7222568`) April 3, 2026.

**What:** Add static screenshots to the README showing: (1) the boarding matrix UI, (2) a roster image (the PNG the app generates). Currently there are zero visuals — the README describes the system without showing it.

**Definition of Done:**
- [x] Boarding matrix screenshot: captures the main app view with representative data (not blank)
- [x] Roster image screenshot: the PNG generated by `api/roster-image.js` with the M3-4 "as of" timestamp visible
- [x] Both embedded in README under a "What it looks like" section
- [x] Screenshots are not stale — taken after M3-4 is deployed so the timestamp appears

**Order dependency:** Take screenshots after M3-4 is live. Do M3-4 → M3-8, not M3-8 → M3-4.

---

### M3-9 — CHANGELOG.md

**Status:** ✅ DONE — PR #143 merged April 1, 2026.

**What:** Add a `CHANGELOG.md` documenting the release history from v1.0 → v5.3.0. This signals production-minded development discipline to any interviewer reading the repo.

**Definition of Done:**
- [ ] `CHANGELOG.md` in repo root
- [ ] Covers every GitHub release (v1.0, v1.2.0, v2.0.0 ... v5.3.0) with a one-line summary per release
- [ ] Major architectural decisions called out (e.g., v4.0: Vercel Hobby path-splitting; v5.0: Meta Cloud API)
- [ ] Format follows [Keep a Changelog](https://keepachangelog.com/) conventions (or close enough)
- [ ] Linked from README

**Note:** Git log + GitHub releases list is the source of truth. Don't invent history.

---

### M3-10 — WhatsApp delivery receipts (Meta Webhooks)

**Status:** Not started. **Higher complexity — plan carefully.**

**What:** Meta POSTs a webhook event to a registered endpoint whenever a message is delivered, read, or fails. Currently: we get a `wamid` at send time but have no visibility into what happens after. If Meta accepts the message but the carrier fails delivery, we never know.

This is distinct from:
- **M1-1** (cron failure alerting — did the job crash?)
- **M2-1** (Gmail monitor — did the GH workflow fail?)
- **M3-10** covers: job ran, Meta accepted the message, but message never arrived on the phone.

**Definition of Done:**
- [ ] Webhook endpoint registered with Meta Business Manager (verified token handshake)
- [ ] Incoming delivery status events stored to DB (new table: `message_delivery_status` with `wamid`, `status`, `timestamp`, `recipient`)
- [ ] `wamid` stored at send time in `notifyWhatsApp.js` (currently discarded after logging)
- [ ] Alert fires if any `wamid` has no `delivered` status within N minutes (configurable)
- [ ] Test: fake delivery status POST to local endpoint → row inserted → alert logic exercises correctly
- [ ] Deployed + manual end-to-end verified

**Architect note:** This requires a new `POST /api/webhooks/meta` endpoint on Vercel. The Meta webhook verification challenge (`hub.verify_token`) must match before registering. Do not start without reading Meta's webhook documentation and confirming the verification flow. See F-1 for the simplified version (observability-only, no alerting).

---

## Future / Post-M3 Backlog

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| ~~N-1~~ | ✅ **Done** — PR #197 merged May 1, 2026. Badge suppressed on 4am; blue intra-day overlay on 7am/8:30am. | — | — |
| #145 | **Tooling upgrade** — eslint 9→10 + @vitejs/plugin-react 5→6. Dependabot PRs #106/#107 closed (CI failed — breaking changes). Needs intentional upgrade. | Low | Dev tooling only, no prod impact |
| F-1 | **Message delivery observability** — webhook + wamid storage, no alerting layer. PR #165 open. | Medium | ✅ Built April 3, 2026. Pending: migration 024 + META_WEBHOOK_VERIFY_TOKEN + Meta Business Manager webhook registration. |
| F-2 | **Message log page** — ✅ DONE Apr 23 (v5.5.0). `message_log` table + `roster-images` Storage + 6 write sites + `/messages` page. | High | — |

**If M3-10 feels too large:** Do F-1 first (webhooks + storage, no alert), then add alerting as a follow-on. The webhook infrastructure is shared.

---

### N-1 — Notify diff UX: suppress UPDATED! on 4am; blue intra-day diff on 7am/8:30am

**Status:** ✅ DONE — PR #197 merged May 1, 2026 (session 24).

**What:** Three behavioral changes to the roster notify job:

**1. 4am — suppress UPDATED! badge.**
The 4am image is the day's baseline. No prior send exists to compare against, so the badge has no meaning. Suppress it unconditionally on the 4am window.

**2. 7am/8:30am — keep existing today-vs-yesterday green/red diff.**
No change to current behavior. Green `+` = new vs yesterday. Red strikethrough = removed vs yesterday. This stays.

**3. 7am/8:30am — overlay blue for intra-day changes since previous send.**
Dogs whose state changed between the previous send and the current one are shown in blue instead of green/red. Blue answers "what's new since the last image you received?"

Color rules (blue takes priority over green/red):

- **Blue `+`** — dog added to today's roster since the previous send (wasn't in 4am, appears in 7am)
- **Blue strikethrough** — dog removed from today's roster since the previous send (was in 4am, gone in 7am — appointment cancelled)
- **Blue `+` or blue strikethrough** — dog whose +/- status flipped between sends (e.g., was `– Mabel` red in 4am, now `+ Mabel` in 7am → show as blue `+`)
- **Green/red (unchanged)** — dog whose state did not change since the previous send

Example from April 7:

- 7am image: Mabel was `– Mabel` (red) in 4am, flipped to `+ Mabel` (green) by 7am → renders **blue `+`**
- 8:30am image: Mabel unchanged since 7am → renders green `+` (normal). Oskar flipped → renders **blue `+`**

**4am has no previous send → no blue shown. Falls back to green/red only.**

**Technical approach (architect-verified, May 1 session 23):**

**Item 1 — Badge suppression:**
- `notify.js`: append `&sendWindow=${sendWindow}` to image URL (sendWindow already in scope at URL construction)
- `roster-image.js`: parse `req.query.sendWindow`; pass to `buildLayout()`; suppress badge: `data.hasUpdates && sendWindow !== '4am'`
- `hasUpdates` stays semantically correct — renderer controls display policy

**Item 2 — Snapshot storage:**
- `cron_health.result` is already a free-form JSON object (no schema change needed)
- Extend `readLastSentState()` in `notify.js` to return `lastSnapshot: data.result.snapshot || null`
- Extend `persistSentState()` in `notify.js` to write `snapshot: workers` alongside `lastHash`
- `workers` is the array returned by `getPictureOfDay()`, already in scope at call site

**Item 2 — Blue overlay delivery:**
- For 7am/8:30am: after reading `lastSnapshot` and before building image URL, base64-encode snapshot: `Buffer.from(JSON.stringify(lastSnapshot)).toString('base64')`
- Append `&lastSnapshot=<base64>` to image URL
- For 4am: omit `lastSnapshot` param entirely
- `roster-image.js`: parse param (try/catch, graceful on missing/malformed), build `changedDogs` Set
- Key per dog: `${workerId}:${series_id}` if series_id non-null, else `${workerId}:${pet_names[0]}`
- Flag as changed if: dog appeared, disappeared, or flipped `isAdded`/`isRemoved` state vs snapshot
- Add `COLORS.intraday = '#2563eb'` (blue-600) to color palette
- In `workerCard()`: blue takes priority over green/red — check `changedDogs` first

**Key facts (from architect read):**
- `hasUpdates` set in `pictureOfDay.js` lines 392/417-419; Monday override at 429-431
- Badge rendered in `roster-image.js` at ~line 525-539
- Dog color set in `workerCard()` at ~line 212-216
- `cron_health.result` currently stores: `{ lastHash, lastDate, window, sentAt, recipients, results }`
- `workers` array shape: `{ workerId, name, dogs[], addedCount, removedCount }` where each dog has `{ pet_names[], client_name, series_id, title, isAdded, isRemoved }`
- Existing pictureOfDay tests are pure function unit tests (no notify handler coverage)

**Definition of Done:**

- [x] 4am image: no UPDATED! badge
- [x] 7am/8:30am image: UPDATED! badge present; green/red today-vs-yesterday diff unchanged; blue overlay on any dog whose state changed since the previous send
- [x] Blue strikethrough for dogs removed intra-day (appointment cancelled since last send)
- [x] Blue `+` for dogs added intra-day (new appointment since last send)
- [x] If no prior snapshot for today, gracefully renders green/red only (no crash, no missing dogs)
- [x] Unit tests: (a) 4am badge suppression (3), (b) blue overlay with a stored snapshot (3), (c) fallback when no snapshot (3)
- [ ] Deployed + verified on a real 3-send morning cycle ← **pending Kate's morning observation**

---

### B-1 — DC filter false positive drops "Boarding discounted nights for DC full-time"

**Status:** ✅ DONE — PR #199 merged (session 25, May 1, 2026). Peanut (C63QghzF) confirmed in DB May 1.

**What:** The `nonBoardingPatterns` filter `/(d\/c|\bdc\b)/i` matched `DC` as a standalone word mid-title in "Boarding discounted nights for DC full-time". That service name uses "DC full-time" as a client membership tier (full-time daycare client gets discounted boarding rate), not as an appointment type indicator. The appointment was silently dropped in every sync scan all day and never reached the DB.

**Confirmed instance:** Peanut (Leo Garver, client 151589, pet 138053), appointment C63QghzF, May 1–5 2026, $270 ($55×4 nights + $50×1 day), assigned to Charlie (worker 61023). Skipped at 1am, 9am, and 5pm integration checks. Zero WhatsApp notifications sent.

**Root cause:** All real daycare appointment titles start with "D/C" or "DC" (e.g., "DC full-time", "D/C M/T/W/TH"). The false positive comes from a boarding service whose name references a "DC full-time" membership tier mid-title.

**Fix:** Anchor the pattern to start-of-title: `/^(d\/c|dc)\b/i`. Also adds title to the SKIP log (previously omitted — made this class of bug invisible).

**Files changed:**
- `src/lib/scraper/config.js` — pattern change
- `src/lib/scraper/syncRunner.js` — SKIP log adds `title="..."`
- `src/__tests__/scraper/appointmentFilter.test.js` — mock updated + new case
- `src/__tests__/scraper/syncRunner.test.js` — new regression test

**Definition of Done:**
- [x] `/(d\/c|\bdc\b)/i` → `/^(d\/c|dc)\b/i` in config.js
- [x] SKIP log includes title
- [x] `appointmentFilter.test.js`: "Boarding discounted nights for DC full-time" → `skip: false`
- [x] `syncRunner.test.js`: C63QghzF with that title → enqueued, skipped=0
- [x] Existing DC/D/C skip tests still pass (start-of-title anchor still catches pure daycare titles)
- [x] 1045 tests, 0 failures
- [x] PR #199 merged
- [x] Integration Check run 25239049354 completes → Peanut (C63QghzF) appears in app ← ✅ Verified May 1 (5:32pm PDT): in DB, $270, May 1–5, confirmed.

---

## Gap Investigation — Needs Decision Before Ticketing

These were surfaced in the April 5, 2026 status review. Each needs a "do it / skip it / scope it" decision before any code is written.

| # | Gap | What to Investigate | Priority |
|---|-----|---------------------|----------|
| G-1 | **Alert on failed wamid** — F-1 stores delivery events but nothing reads the table and fires an alert when status=`failed`. A message can silently fail delivery after Meta accepts it. | Is a lightweight cron or webhook-triggered check sufficient? What N-minute threshold is right? How does this interact with F-2? | Medium |
| ~~G-2~~ | ✅ **Done** — `::warning::` already fires on Step 3 skip (integration-check.js:621). Was in the code; sprint plan not updated. Closed May 1. | — | — |
| G-3 | **Client-facing status page** — no self-serve way for the operator to check system health. They rely entirely on WhatsApp alerts. The "client can verify health" UAT gate is partially uncleared. | What does "verify health" mean to this operator? A simple read-only page (last cron run, last notify sent, last delivery status) vs. documented manual steps in the runbook. Decide scope before building. | Medium |
| G-4 | **UAT gate 4 — operator self-serve health check** — once M3-7 (screen recording) is done, Milestone 3 is complete and three of four UAT gates are cleared. The fourth gate ("client can verify the system is healthy") is the only one not fully resolved. | Does G-3 (status page) close this gate, or is the runbook + GitHub Actions visibility sufficient? Decide before declaring UAT done. | Medium |
| G-5 | **No defined client acceptance criteria** — the system is live and serving a real client, but there is no documented "client sign-off" definition. What does the operator need to see, do, or confirm before the engagement is complete? | Short conversation with the operator (or internally) to write down 3–5 acceptance criteria. Not a code ticket — a process/doc item. | Low |
| G-6 | **Second number not receiving messages — partial fix applied April 8.** DB confirmed only 7375 received (zero rows for second number). Root cause: dev-mode app (K-7 unpublished) requires each recipient to opt in. Kate added second number to Meta API Setup → To → Add phone number on April 8. | Verify: check `message_delivery_status` for second number's wamid after next notify run (next morning, ~4am PDT). Permanent fix: K-7 publish removes test-recipient restriction entirely. | 🟡 Monitor |

---

## Completed Work

### Milestone 0 — Unblock ✅

| # | Ticket | Status |
|---|--------|--------|
| M0-1 | Twilio sandbox → Meta Cloud API WhatsApp sender | ✅ LIVE |
| M0-2 | Second WhatsApp recipient | ⏳ Pending Kate (K-4) |
| M0-3 | Verify all 4 notify + integration check alerts on both numbers | ⏳ Blocked on K-4 |

### Milestone 1 — Operational Maturity ✅

| # | Ticket | Status |
|---|--------|--------|
| M1-1 | Direct cron failure alerting (2+ consecutive errors → WhatsApp) | ✅ LIVE |
| M1-2 | `refreshDaytimeSchedule` unit tests — 7+ exit paths | ✅ LIVE |
| ~~M1-3~~ | ✅ Closed — Check 3 (Claude vision) removed entirely in PR #202. Not needed. |

### Milestone 2 — Gmail Monitor ✅

| # | Ticket | Status |
|---|--------|--------|
| M2-1 | Gmail monitoring agent — GH Actions hourly + Gmail API + WhatsApp alert | ✅ LIVE |

### Milestone 3 (Completed Portions) ✅

| # | Ticket | Status |
|---|--------|--------|
| M3-1 | README overhaul — mermaid diagram, architecture, ADR links | ✅ DONE |
| M3-2 | Operator runbook — docs/RUNBOOK.md | ✅ DONE |
| M3-3 | ADRs — 001/002/003 | ✅ DONE |
| M3-11 | Consolidate WhatsApp sender — twilio removed (#108) | ✅ DONE |
| M3-12 | Meta message templates — all sends use approved templates (#112) | ✅ DONE |

---

## Per-Ticket Execution Process

Every ticket follows this sequence, no shortcuts:

1. **Definition of Done** — agree upfront: what tests pass, what DB state proves it. Agreed before any code.
2. **Architect review** — read every file being touched. Trace data flow. Identify gotchas. Implementation plan approved before coding starts.
3. **Build + targeted test** — write a specific test proving THIS feature works. Run locally. Debug against structured logs.
4. **General test coverage** — add regression test to permanent suite. All existing tests still pass.
5. **PR → CI → merge** — CI must be green. PR body references the issue number. Merge.
6. **Verify Vercel deployment** — confirm deploy succeeded. If the ticket changes job behavior, trigger the job and confirm the output.

**Standing process rules:**

- HTML fixture added for every new scraper behavior
- GH Issue created per ticket; commit messages reference issue number
- SESSION_HANDOFF.md updated in each PR (not saved for end of session)
- If a PR changes a job's behavior, update the relevant `docs/job_docs/` file in the same PR
- `gh pr create` and `gh issue create` always use `--body-file`, never inline `--body`
- Post-merge deploy verification before calling a ticket done

---

## Key Constraints (Reference)

- Vercel Hobby plan: 1 cron/path/day, 10s timeout. Solved via path-splitting (new Vercel route = new slot).
- DOMParser unavailable in Node.js runtime — all cron scrapers use regex-based parsing.
- AGYD session TTL: 24h. `cron-auth` refreshes once at midnight UTC.
- `sync_queue` has no `created_at` — order by `id`.
- Always `new Date(year, month, day)` for local dates — never `new Date('YYYY-MM-DD')` (UTC trap).
- `maybeSingle()` not `single()` in Supabase queries — `single()` throws on 0 rows.
- `externalPetId` (not `petId`) is the external system's dog identifier — do not confuse with internal `dog_id`.
- HASH_FIELDS controls what triggers a re-render in the roster image — changing fields outside this set won't update the image.
