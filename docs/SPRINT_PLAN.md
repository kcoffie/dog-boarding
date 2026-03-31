# Q Boarding — Sprint Plan (v5.0)

_Last updated: March 24, 2026 — M3-11 done: all alerting jobs migrated from Twilio to Meta Cloud API; twilio package removed_

---

## Product Goal — v5.0

**Theme:** Fully autonomous. Production-hardened. Interview-ready.

This app serves two simultaneous audiences:

1. **A real client** — a dog boarding operator who receives WhatsApp notifications, relies on the system to run autonomously, and needs to trust that failures surface before they cause problems.
2. **A portfolio audience** — a technical interviewer or potential client who should be able to understand what this is, how it works, and why the architecture decisions were made, within 10 minutes of landing on the repo.

Both bars must be cleared for v5.0 to be done. They are not in conflict — a system hardened enough for a real client is impressive in an interview.

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

## Architecture Decision (Closed)

Current stack (React/Vite on Vercel Hobby + Supabase + GH Actions) is correct for this scale.

- **Vercel Pro upgrade:** Not needed. `cron-detail-2.js` path-splitting achieves double throughput for free.
- **Gmail monitoring:** Adds one lightweight GH Actions hourly poller — same architecture, no new infrastructure.
- **Gmail OAuth:** Personal Gmail account (not a dedicated system account). Read-only scope. Queries by known sender only — never scans arbitrary inbox content. This is a deliberate privacy constraint, not a limitation.

---

## The Critical Path Risk (Resolved)

**Twilio sandbox was the single biggest credibility gap.** The entire notification pipeline — WhatsApp roster images, integration check alerts, Gmail failure alerts — was undeliverable to anyone except pre-approved sandbox numbers. A real client couldn't receive a message. A live portfolio demo would fail for anyone in the room whose number wasn't pre-approved.

Twilio sandbox → production is Milestone 0. Everything else unblocks after it.

---

## Feature Build Status

| Feature | Status | Notes |
|---------|--------|-------|
| Overnight boarding sync | ✅ LIVE | 3-page scan + cron-detail-2 |
| Overnight daytime ingest | ✅ LIVE | cron-schedule.js handles this |
| Weekday morning notify (M-F 4am/7am/8:30am) | ✅ LIVE | |
| Friday PM notify (weekend boardings) | ✅ LIVE | PR #71 |
| Integration check — boarding + daytime | ✅ LIVE | Step 0 sync-before-compare (v4.5, PR #88) |
| Meta Cloud API (WhatsApp sender) | ✅ LIVE | M0 — confirmed working March 20, 2026 |
| Direct cron failure alerting | ✅ LIVE | M1-1 — cron-health-check.yml at 00:30 UTC |
| Gmail monitoring agent | ✅ LIVE | M2 — hourly, first run confirmed March 20, 2026 |
| README overhaul | ✅ DONE | M3-1 — mermaid diagram, architecture, testing, security, ADR links |
| Operator runbook | ✅ DONE | M3-2 — docs/RUNBOOK.md |
| Architecture Decision Records | ✅ DONE | M3-3 — docs/adr/001/002/003 |

---

## v4 — Complete ✅

All v4 work is done. See `docs/archive/SESSION_HANDOFF_v4.5_final.md` for full history.

---

## v5.0 Milestone Plan

### Milestone 0 — Unblock (do first, non-negotiable)

**Gate:** A person who has never touched this codebase receives a real WhatsApp message.

| # | Ticket | Status |
|---|--------|--------|
| M0-1 | Twilio sandbox → Meta Cloud API WhatsApp sender | ✅ LIVE |
| M0-2 | Second WhatsApp recipient (Kate provides number) | ⏳ Pending Kate |
| M0-3 | Verify all 4 notify workflows + integration check alerts land on both numbers end-to-end | ⏳ Blocked on M0-2 |

**Why first:** Every other milestone depends on this. You can't demo notifications, hand off to a client, or verify Gmail alerting end-to-end while in sandbox mode.

---

### Milestone 1 — Operational Maturity

**Gate:** System runs 7 days autonomously with no silent failures.

| # | Ticket | Status |
|---|--------|--------|
| M1-1 | Direct cron failure alerting — when a cron errors 2+ consecutive times, WhatsApp alert fires immediately | ✅ LIVE |
| M1-2 | `refreshDaytimeSchedule` unit tests — 7+ exit paths (session miss, fetch fail, SESSION_EXPIRED, parse-zero guard, upsert error, catch-all) | ✅ LIVE |
| M1-3 | Anthropic API credits → activate Claude vision name-check (Step 3) in integration check | ⏳ Pending credits |

**Why before the headline feature:** You don't add more autonomous agents to a system that has silent failure modes. The Gmail monitor will fail sometimes — the scaffolding to catch that needs to exist first.

**Note on M1-1:** This covers *application-level* failures (cron ran, something went wrong internally). This is distinct from the Gmail monitor, which catches *infrastructure-level* failures (workflow didn't run, deploy failed). Both are needed for complete coverage.

---

### Milestone 2 — Headline Feature: Gmail Monitor

**Gate:** Infrastructure-level failures surface as a WhatsApp alert within 1 hour.

| # | Ticket | Status |
|---|--------|--------|
| M2-1 | Gmail monitoring agent — GH Actions hourly cron + Gmail API (read-only) + known-sender filter + WhatsApp alert | ✅ LIVE |

**Design decisions (locked):**

- **Source:** Kate's personal Gmail. OAuth read-only scope. Never scans arbitrary inbox content.
- **Classifier:** Sender-based filtering only (closed list). Not LLM-based routing — the sender filter *is* the classifier.
- **Known senders to watch:** `noreply@github.com` (GH Actions failures), Vercel failure notifications, Supabase alerts, Twilio account alerts.
- **Claude's role:** Optional — extract a clean one-line summary from the email body for the WhatsApp message. Not required for routing.
- **Dedup:** Processed email IDs stored in Supabase so the same alert doesn't fire twice.
- **WhatsApp message answers:** "What broke, and where do I go to look?"

**What this covers (vs. M1-1):**

| Failure type | Caught by |
|---|---|
| Cron ran, got an internal error | M1-1 direct alerting |
| GH Actions workflow never triggered | M2-1 Gmail monitor |
| Vercel deployment failed | M2-1 Gmail monitor |
| Supabase quota warning | M2-1 Gmail monitor |

**OAuth note:** Gmail OAuth on a personal account in "testing" mode works indefinitely for a single authorized user. No Google app verification required for personal use. If this ever needs to be shared with another developer or transferred, Google's verification process for Gmail read scope applies.

---

### Milestone 3 — Portfolio Polish

**Gate:** A technical stranger understands the system in 10 minutes from the GitHub repo alone.

| # | Ticket | Status |
|---|--------|--------|
| M3-1 | README overhaul — architecture diagram, tech stack, "how it works," screenshots of WhatsApp output | ✅ DONE |
| M3-2 | Operator runbook — one doc: "something broke, here's how to diagnose it" | ✅ DONE |
| M3-3 | ADRs — document the 3 biggest architectural decisions (scraper strategy, GH Actions vs. Vercel crons, Meta vs. Twilio) | ✅ DONE |
| M3-4 | "As of" timestamp in roster image — e.g. `as of 6:04 PM, Mon 3/16` | — |
| M3-5 | DST-aware scheduling + code polish (timing-safe equal in `roster-image.js`, regex precompile in `daytimeSchedule.js`) | — |
| M3-6 | Doc staleness CI check — non-blocking: detects when `api/` or `src/lib/scraper/` changed but `docs/job_docs/` wasn't touched | — |
| M3-7 | Screen recording of WhatsApp roster image arriving on phone — most impactful portfolio artifact; embed in README | — |
| M3-8 | App screenshots in README — boarding matrix, roster image — currently no visuals | — |
| M3-9 | CHANGELOG.md — document iterative release history from v1.0 → v5.0.0; shows production-minded development discipline | — |
| M3-10 | WhatsApp delivery receipts (Meta Webhooks) — detect post-acceptance delivery failures; Friday PM wamid returned but message not received March 20 | — |
| M3-11 | Consolidate WhatsApp sender — migrate alerting jobs (integration check, cron health, Gmail monitor) from Twilio to Meta Cloud API; remove `twilio` package and all `TWILIO_*` secrets (#101) | ✅ DONE |
| M3-12 | Meta message templates — switch all WhatsApp sends to approved templates; fixes 24h customer service window; deduplicates getAlertRecipients() (#112) | ✅ DONE |

---

## Active Sprint Plan (started March 31, 2026)

### Sprint 1 — Hardening

**Theme:** Kill the noise. Harden resilience. Close silent failure gaps.

| # | Ticket | LOE | Status |
|---|--------|-----|--------|
| S1-1 | Fix integration check false positives — `isDaycareOnlyTitle()` filter (27 daycare appts misflagged) | Small | — |
| S1-2 | Graceful `invalid_grant` in `gmail-monitor.js` + `npm run reauth-gmail` script | Small | — |
| S1-3 | Redesign integration check WhatsApp message — professional formatting, phone-readable | Small | Blocked on Kate screenshot |
| M3-4 | "As of" timestamp in roster image | Small | Buildable now; end-to-end verify after Meta template fixed |

**S1-1 detail:** Add `isDaycareOnlyTitle(title)` local to `integration-check.js` only — NOT to `config.js`/nonBoardingPatterns. Apply after `isBoardingTitle()`. Patterns: PG daycare (`/\bP\/?G\b.*\b(M|T|W|Th|F|FT|OFF)\b/i`), make-up days, no charge. "PG 3/23-30" style must still sync.

**S1-2 detail:** Two deliverables: (1) `gmail-monitor.js` catches `invalid_grant` → WhatsApp alert "Gmail auth expired — run `npm run reauth-gmail`" instead of 4-day silent failure. (2) `npm run reauth-gmail` wraps existing `scripts/get-gmail-refresh-token.js` — browser opens, Kate approves, terminal prints exact `gh secret set` commands. Works from US or Mexico.

---

### Sprint 2 — Observability

**Theme:** "Is everything running?" answered from the app in 5 seconds.

| # | Ticket | LOE | Status |
|---|--------|-----|--------|
| S2-1 | System Health Dashboard — cron health strip + message log page | Medium | — |
| M3-5 | DST-aware scheduling + code polish | Small | — |
| M3-9 | CHANGELOG.md — v1.0 → v5.3.0 release history | Small | — |
| M3-6 | Doc staleness CI check (non-blocking) | Small | — |

**S2-1 detail:** One new app page. Two panels:
- **Cron health strip:** auth / schedule / detail — last ran, status (green/red), last error. Reads existing `cron_health` table. No new infra.
- **Message log:** Last 5 days of outbound WhatsApp messages (type, recipient, content, timestamp). Requires new `message_log` table; all alert scripts + notify jobs write a row at send time.
Kills the "it's been so silent, is anything working?" uncertainty permanently.

---

### Sprint 3 — Portfolio Finish (after roster image verified end-to-end)

| # | Ticket | LOE | Status |
|---|--------|-----|--------|
| M3-7 | Screen recording: roster image arriving on phone — embed in README | Kate's time | Blocked: needs working send |
| M3-8 | App screenshots in README — boarding matrix + roster image | Kate's time | — |
| M3-10/F-1 | WhatsApp delivery receipts (Meta Webhooks) | Large | After S2-1 done |

---

## Post-Sprint Backlog

| # | Ticket | Notes |
|---|--------|-------|
| F-1 | **WhatsApp delivery receipts** — Meta POSTs delivery status per `wamid`. Store wamids at send time; alert if no delivered status within N minutes. Pairs with S2-1 message log. | Medium — needs webhook endpoint |

---

## Per-Ticket Execution Process

1. **Definition of Done** — define upfront: what tests pass, what DB state proves it. Agreed before any code.
2. **Architect review** — read every file being touched, trace data flow, identify gotchas. Implementation plan approved before coding.
3. **Build + targeted test** — write a specific test proving THIS feature works. Run locally. Debug against structured logs.
4. **General test coverage** — add regression test to permanent suite. Retire targeted test (or keep as fixture).
5. **PR → CI → merge** — CI must be green. Once merged, verify DB state directly (Supabase query).
6. **Verify Vercel deployment** — confirm deploy succeeded via GH Actions run list.

**Process improvements in effect:**
- HTML fixture added for every new scraper behavior
- GH Issue created per ticket (commit messages reference issue number)
- SESSION_HANDOFF.md updated in each PR, not saved for session end
- If the PR changes a job's behavior, update the relevant `docs/job_docs/` file in the same PR
- Post-merge deploy verification before calling ticket done
- `.env.local` available locally for direct DB verification
- Senior Staff Engineer design review required before implementation on complex tickets

---

## Key Constraints

- Vercel Hobby plan: 1 cron/path/day, 10s timeout. Solved via path-splitting (new Vercel route = new slot).
- DOMParser unavailable in Node.js runtime — all cron scrapers use regex-based parsing.
- AGYD session TTL: 24h. cron-auth refreshes once at midnight UTC.
- `sync_queue` has no `created_at` — order by `id`.
- Always `new Date(year, month, day)` for local dates — never `new Date('YYYY-MM-DD')` (UTC trap).
