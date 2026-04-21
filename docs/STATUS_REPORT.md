# Q Boarding — Project Status Report
**As of April 21, 2026 | v5.4.0 LIVE**

---

## Executive Overview

Q Boarding is a production-deployed automation system built for a dog boarding operator. It:

- **Scrapes a third-party scheduling platform nightly** to maintain a live database of upcoming dog boarding appointments.
- **Sends WhatsApp notifications** to the operator each morning (M–F at 4am/7am/8:30am) and each Friday afternoon — a visual roster image showing which dogs are arriving, boarding, and departing.
- **Monitors its own health** across three independent layers and alerts the operator immediately if anything breaks.

The system runs fully autonomously, 7 days a week, without manual intervention. It is live at [qboarding.vercel.app](https://qboarding.vercel.app).

**Current status: production-hardened and serving a real client.** The system has been running autonomously since v5.4.0. The main open item is a Meta platform compliance action (K-7, described below) — App Review + Business Verification started April 8. As of April 21 (~9 business days in), this should be near completion. **Check Meta dashboard for pending actions or approvals.**

---

## System Architecture (Quick Reference)

```
Nightly (midnight UTC):
  cron-auth → authenticate to external scheduling site
  cron-schedule → scrape 3 weeks of appointments → enqueue boarding candidates
  cron-detail × 2 → fetch each appointment's details → save to database

Each weekday morning (4am / 7am / 8:30am PDT) + every Friday (3pm PDT):
  GitHub Actions → GET /api/notify
  → read database → generate PNG roster image
  → upload to Meta Cloud API → send WhatsApp to operator (2 recipients)
  → store wamid (message ID) in message_delivery_status table

Continuous monitoring:
  1am PDT: integration check (Playwright + DB compare → alert on mismatch)
  9am + 5pm PDT: integration check (silent if passed, alerts immediately on failure)
  00:30 UTC: cron health check (alerts on consecutive failures or hung jobs)
  Hourly: Gmail monitor (alerts on infrastructure warning emails)
```

---

## What We've Built — v5 Forward

> Pre-v5 work (the scraper, the notify pipeline, the React UI) is stable and not covered here. This section covers all work done since v5.0.0 (March 20, 2026).

### v5.0 — Infrastructure Monitoring Layer (March 20, 2026)

The biggest architectural addition of this phase. Before v5, the system had no self-monitoring — a failed sync or a broken job would be invisible until the operator noticed missing notifications.

**What was built:**

| Component | What it does |
|---|---|
| **Meta Cloud API sender** | Replaced Twilio with Meta's own Cloud API. More reliable, permanent production sender, no sandbox. All WhatsApp sends (notifications + alerts) go through one code path. |
| **Cron health check** | Runs at 00:30 UTC. If any cron job fails 2+ consecutive times, or gets stuck in "started" for >20 min, the operator gets a WhatsApp alert with the error message. |
| **`refreshDaytimeSchedule` extraction** | Pulled the notify helper into its own module for testability. Added 7 unit tests covering every exit path. |
| **Gmail monitor** | Hourly GitHub Actions job. Watches for Vercel/Supabase infrastructure warning emails. Alerts the operator if one arrives. Deduplicates so each email only triggers one alert. |

---

### v5.1–5.3 — Meta API Bug Fixes (March 20–25, 2026)

Three rapid releases hardening the Meta Cloud API integration:

- **v5.1** — Removed Twilio entirely. All alerts (integration check, cron health, Gmail monitor) migrated to Meta. Single sender, simpler codebase.
- **v5.2** — Fixed a silent send failure: Meta requires locale `en`, not `en_US`. Every alert type was failing silently.
- **v5.3** — Fixed Meta error 132018: template body parameters can't contain newlines. Added sanitization at the API boundary.

---

### v5.4 — Delivery Observability + Portfolio Polish (April 1–5, 2026)

Multiple tickets completed across two sessions.

#### F-1 — WhatsApp Delivery Observability (merged Apr 3, PR #165)

Before this: we knew the job ran and Meta accepted the message. We had no visibility into whether it actually arrived on the operator's phone.

**What was built:**
- `message_delivery_status` table in the database (migration 024)
- `POST /api/webhooks/meta` endpoint on Vercel — HMAC-SHA256 verified, handles Meta's delivery event callbacks
- At send time, the `wamid` (Meta's message ID) is stored with status `sent`
- When Meta fires a delivery event (delivered/read/failed), the row is updated

**Current limitation:** Real delivery events (delivered/read/failed) are blocked until the Meta app is published (K-7 below). The webhook is wired and verified — we just need the platform approval.

#### I-1 — Integration Check Smart-Send (merged Apr 5, PR #167)

The integration check runs 3x daily. Previously it sent a WhatsApp alert on every run, even when everything was fine. This caused noise.

**What was built:** Run 1 (1am PDT) always sends — daily baseline confirmation. Runs 2+3 (9am, 5pm) are silent when the check passes, and alert immediately when anything fails. No change to failure behavior.

#### M3 — Portfolio Polish (multiple PRs, Apr 1–5)

| Item | What |
|---|---|
| **M3-4** — "As of" timestamp | Roster image now includes the exact time the notify job ran ("6:04 PM, Mon 3/16" PST/PDT). Confirmed on phone April 2. |
| **M3-5** — Code hardening | `crypto.timingSafeEqual` for token auth; regex precompiled outside hot loop; DST-flaky test fixed. |
| **M3-6** — Doc staleness CI | GitHub Actions check warns on PRs that change `api/` or `src/lib/scraper/` without touching `docs/job_docs/`. Non-blocking warning. |
| **M3-8** — README screenshots | Boarding matrix UI and roster image PNG now embedded in README. Zero screenshots → two before/after. |
| **M3-9** — CHANGELOG.md | Complete release history v1.0 → v5.4.0. Follows Keep a Changelog conventions. |
| **M3-1/2/3** — Docs foundation | README overhaul with Mermaid architecture diagram; operator runbook (`docs/RUNBOOK.md`); 3 Architecture Decision Records. |
| **K-4** — Second notify recipient | Second WhatsApp number added to `NOTIFY_RECIPIENTS`. Both numbers receive roster images from 4am Apr 6 onward. |

---

## What's In Progress

### M3-7 — Screen Recording (PARKED — Kate editing)

A 22MB MP4 recording exists showing the Friday PM roster image arriving as a WhatsApp message on the operator's phone. This is the single most impactful portfolio artifact — it closes the loop visually for any interviewer or client reviewing the repo.

**Blocked on:** Kate's decision on how to trim/edit the file. Three options: use as-is, trim via ffmpeg, or trim in QuickTime and drop the file.

**Once ready:** Copy to `docs/screenshots/roster-delivery.mp4`, embed in README with a `<video>` tag, push direct to main.

---

## What's Left (Prioritized)

### 🔴 K-7 — Publish Meta App (URGENT — Kate action — IN PROGRESS ~9 business days)

**This is the highest-priority item in the entire project.** The Meta developer account is running on test credentials. Test accounts expire. If the account expires before the app is published, **every WhatsApp send fails silently** — no notifications, no alerts. The operator goes dark.

The approval process (App Review + Business Verification) takes **5–10+ business days** each and were started in parallel on April 8, 2026. As of April 21, both reviews are ~9 business days in — check Meta dashboard immediately for pending actions, approval/rejection status, or token expiry warnings.

**What to check now:**
1. `developers.facebook.com` → QApp → App Review — any pending review decisions?
2. `business.facebook.com` → Settings → Business info → Verification — any documents requested?
3. Tools → Access Token Debugger → paste `META_WHATSAPP_TOKEN` — check expiry. If < 2 weeks, fire drill.

**After approval:** Generate permanent System User token → update `META_WHATSAPP_TOKEN` in Vercel → real `delivered`/`read`/`failed` events will start flowing into `message_delivery_status`.

**No code needed.** This is a platform compliance action. The webhook is already wired. Once published, real `delivered`/`read`/`failed` events will start flowing into `message_delivery_status`.

---

### F-2 — Message Log Page (next code ticket)

**What:** Every outbound WhatsApp message (recipient, content, timestamp, type, wamid) stored to a `message_log` table at send time. New app page showing last 5 days of sends.

**Why:** Right now, when delivery is in question, you have to cross-reference GitHub Actions logs, Vercel logs, and the `message_delivery_status` table separately. A message log page answers "did this message go out?" in one place.

**Complexity:** High — 7 write sites in `notifyWhatsApp.js`, new table schema, new app route, new page UI.

---

### K-5 — Anthropic API Credits (low priority)

Step 3 of the integration check uses Claude vision to visually verify that the dog names in the roster image match the database. This step is silently skipped because the Anthropic account has no credits loaded.

**Impact:** Integration check still runs steps 1 and 2. This is a gap in coverage, not a failure. Low urgency but worth closing before demo/interview season.

**Action:** Add credits at `console.anthropic.com`.

---

## Backlog / Tech Debt

| Item | Priority | Notes |
|---|---|---|
| Tooling upgrade (#145) | Low | eslint 9→10, @vitejs/plugin-react 5→6. Dev tooling only — no prod impact. |
| `cron-schedule.js` ADD filter case-sensitivity | Low | `/\badd\b/` doesn't match uppercase `ADD`. Known bug, carry-forward. |
| Store datetimes in PST instead of UTC | Low | Tech debt, no current user impact. |

---

## Gaps and Things Not Currently in the Plan

These are items that aren't on any ticket yet. Worth awareness.

### 1. No automated alert when a delivered message shows `failed` status

F-1 stores delivery events. But nothing currently reads that table and fires an alert when a `wamid` ends up with `failed` status. If a message fails delivery, the operator doesn't know. This was scoped as M3-10 (full alerting) in the original plan but was descoped to F-1 (observability only). A lightweight follow-on — read the table, alert if any send shows `failed` within N minutes — would close this gap without F-2.

### 2. Integration check coverage gap (Step 3 is silently skipped)

Noted above under K-5. The check passes even when Step 3 is skipped, which means a failure in Step 3 logic is invisible. Worth a low-priority ticket to at least log a warning when Step 3 is skipped rather than silently proceeding.

### 3. No client-facing status dashboard

The operator receives WhatsApp notifications and alerts. But there's no way for the operator to self-serve — to check "is the system healthy?" without asking Kate. A simple read-only status page (last cron run, last notify sent, last delivery status) would close the "can the client verify health?" UAT gate without requiring operator access to GitHub or Vercel.

### 4. M3-7 is the last portfolio gate — then what?

Once the screen recording is embedded, Milestone 3 is done. The SPRINT_PLAN's UAT definition has four gates:
- Notifications land on phone ✅
- Runs 7 days untouched without silent failure ✅
- Someone is alerted before the client notices ✅ (pending K-7)
- Client can verify the system is healthy ⚠️ (partial — no self-serve status page)

The fourth gate is the only one not fully cleared. Worth a decision: is a status page in scope, or does the operator's ability to see GitHub Actions logs count as "verify"?

### 5. No defined end state for the client engagement

The system is serving a real client now. But there's no documented "client acceptance criteria" — what would the client need to see, do, or confirm before this engagement is considered complete? That's worth a short conversation to define, even informally.

---

## Test Coverage

**978 tests, 56 files, 0 failures** as of v5.4.0.

---

## Live Infrastructure

| System | Status |
|---|---|
| App | ✅ LIVE at qboarding.vercel.app |
| Nightly sync | ✅ Running |
| Weekday morning notify (4am/7am/8:30am) | ✅ Running — 2 recipients |
| Friday PM notify | ✅ Running — 2 recipients |
| Integration check | ✅ Running — smart-send live |
| Cron health check | ✅ Running |
| Gmail monitor | ✅ Running |
| WhatsApp delivery observability | ✅ Table live, webhook wired — real events pending K-7 |
| Meta app (production) | ⚠️ Under review — K-7 started April 8, check dashboard for status |
| Second notify recipient (G-6) | 🟡 Needs DB verify — fix applied April 8, not yet confirmed |
