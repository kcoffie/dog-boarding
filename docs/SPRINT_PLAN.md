# Q Boarding — Sprint Plan

_Last updated: April 1, 2026 — v5.3.0 LIVE. M3-4, M3-5, M3-9 done. K-1 in progress (Meta template approval pending). Next: M3-8, M3-6._

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
| Overnight boarding sync | ✅ LIVE | 3-page scan + cron-detail-2 |
| Overnight daytime ingest | ✅ LIVE | cron-schedule.js handles this |
| Weekday morning notify (M-F 4am/7am/8:30am) | ✅ LIVE | |
| Friday PM notify (weekend boardings) | ✅ LIVE | Template broken — Kate fix needed |
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
| Doc staleness CI check | — | M3-6 |
| Screen recording (portfolio artifact) | — | M3-7 — blocked on Kate's Meta template fix |
| README screenshots | — | M3-8 |
| CHANGELOG.md | ✅ DONE | M3-9 — merged PR #143 |
| WhatsApp delivery receipts | — | M3-10 / F-1 |
| Message log page | — | F-2 |

---

## Pending Kate Actions (Non-Code Blockers)

These are not code tickets. They block specific milestones. Track them here so nothing slips.

| # | Action | Blocks | Priority |
|---|--------|--------|----------|
| K-1 | ~~Fix `dog_boarding_roster` Meta template~~ → `dog_boarding_roster_2` approved ✅. Bug #148 fixed (roster-image 500). After PR #147 deploys: re-trigger friday-pm, confirm image on phone. | M3-7 screen recording; Friday PM roster image | 🔴 High (final verify pending) |
| K-2 | Backfill Maverick cancelled boarding (predates PR #118 cascade fix): `UPDATE boardings SET cancelled_at = NOW(), cancellation_reason = 'appointment_archived' WHERE external_id = 'C63QgVl9';` | Data integrity | 🟡 Medium |
| K-3 | Investigate Tula N/C 3/23-26 (C63Qga3r) — appeared as "Missing from DB" in integration check. Real boarding that should sync, or no-charge non-boarding visit to filter? | Integration check accuracy | 🟡 Medium |
| K-4 | Provide second WhatsApp recipient number → add to `NOTIFY_RECIPIENTS` secret (comma-separated E.164) | M0-3 full end-to-end verification | 🟡 Medium |
| K-5 | Add Anthropic API credits at console.anthropic.com | M1-3 — Step 3 vision name-check in integration check | 🟢 Low |

---

## Sprint Focus — Top 3 Tickets (Start Here)

These are the three tickets that move the Professional Quality needle most right now.

**Why this order:**

1. **M3-4** ✅ makes the roster image genuinely more useful. Needed before M3-7 screen recording.
2. **M3-5** ✅ cleans up real hardening issues (misleading auth comment, hot-loop regex, flaky test).
3. **M3-8** puts the roster image and boarding matrix in front of every person who visits the repo. Currently the README has zero screenshots — this is the most glaring portfolio gap after K-1 is resolved.

> **Note:** M3-7 (screen recording) is the single most impactful portfolio artifact but is gated on K-1 (Kate's Meta template fix). Unblock K-1 first, then M3-7 can be done at any time after M3-4 and M3-8 are complete.

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
- [ ] Integration test: roster image renders without error end-to-end ← **Kate: trigger 7am notify manually**
- [x] All 923 tests pass (0 regressions)
- [ ] Deployed to Vercel + 7am notify triggered manually to confirm live image on phone ← **Kate pending**

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

**Status:** Not started.

**What:** Non-blocking GitHub Actions check that detects when `api/` or `src/lib/scraper/` files change in a PR but no file in `docs/job_docs/` was touched. Outputs a warning, not a failure.

**Definition of Done:**
- [ ] New step in an existing workflow (or a new lightweight workflow) that runs on PRs
- [ ] Detects: `api/*.js` or `src/lib/scraper/*.js` changed AND `docs/job_docs/` not touched
- [ ] Outputs a clear warning message (does not fail the build — `continue-on-error: true`)
- [ ] Tested via a PR that modifies `api/notify.js` without touching `docs/job_docs/` — warning appears
- [ ] Does not trigger false positives on doc-only PRs

**Architect note:** Use `git diff --name-only` on the PR diff. Keep it in bash — no new dependencies. This is a one-step shell script in the workflow YAML.

---

### M3-7 — Screen recording (WhatsApp roster image arriving on phone)

**Status:** Blocked on K-1 (Meta template header fix).

**What:** 30–60 second screen recording showing the Friday PM roster image arriving as a WhatsApp message on Kate's phone. This is the single most impactful portfolio artifact — it shows the system working end-to-end in a way no README can.

**Definition of Done:**
- [ ] K-1 resolved: `dog_boarding_roster` template has IMAGE header, approved, verified via `notify-friday-pm`
- [ ] Screen recording: trigger → WhatsApp message received on phone → open → image visible
- [ ] Recording embedded in README (GIF or hosted video link)
- [ ] Recording is clean: no sensitive data visible (dog names OK; no phone number, account info)

**Do K-1 first.** Do not start this ticket until the template is approved and a test send is confirmed.

---

### M3-8 — App screenshots in README

**Status:** Not started.

**What:** Add static screenshots to the README showing: (1) the boarding matrix UI, (2) a roster image (the PNG the app generates). Currently there are zero visuals — the README describes the system without showing it.

**Definition of Done:**
- [ ] Boarding matrix screenshot: captures the main app view with representative data (not blank)
- [ ] Roster image screenshot: the PNG generated by `api/roster-image.js` with the M3-4 "as of" timestamp visible
- [ ] Both embedded in README under a "Screenshots" or "What it looks like" section
- [ ] Screenshots are not stale — taken after M3-4 is deployed so the timestamp appears

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
| #145 | **Tooling upgrade** — eslint 9→10 + @vitejs/plugin-react 5→6. Dependabot PRs #106/#107 closed (CI failed — breaking changes). Needs intentional upgrade. | Low | Dev tooling only, no prod impact |
| F-1 | **Message delivery observability** — lighter version of M3-10. Implement the webhook + wamid storage but without the alerting layer. Kate can check delivery status in the app instead of getting an automatic alert. Lower complexity, high value. | Medium | Can be done before M3-10 if alerting feels like too much scope |
| F-2 | **Message log page** — store every outbound message (recipient, content, timestamp, type) to a `message_log` table at send time. New app page: last 5 days, latest first. Decouples "did the job run?" from "did the delivery work?". | High | Table schema + 7 write sites + new app route + page UI |

**If M3-10 feels too large:** Do F-1 first (webhooks + storage, no alert), then add alerting as a follow-on. The webhook infrastructure is shared.

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
| M1-3 | Anthropic API credits → activate Claude vision Step 3 | ⏳ Pending Kate (K-5) |

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
