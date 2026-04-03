# Dog Boarding App — Session Handoff (v5.4.0 LIVE)
**Last updated:** April 3, 2026 (session 4) — M3-8 complete: screenshots added to README; next is M3-6 doc staleness CI check.

---

## Current State

- **v5.4.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **946 tests, 54 files, 0 failures**
- PR #161 merged (`cbd0838`) — fix: integration-check false positive for N/C (new client) titles; also syncs missing `/\bdaycare\b/i` in test mirror
- PR #159 merged (`ed85338`) — fix: integration-check false positive for "Weekend Daycare" + chore: add `scripts/get-gmail-refresh-token.js`
- PR #150 merged — feat: Meta media upload in `sendRosterImage` (K-1b)
- PR #147 merged — fix: roster-image weekend query + 18 new tests (#148)

### WhatsApp verification status

| Job | Send function | Result |
|---|---|---|
| integration-check | `sendTextMessage` | ✅ delivered to Kate's phone (March 25) |
| cron-health-check | `sendTextMessage` | ✅ same code path |
| gmail-monitor | `sendTextMessage` | ✅ same code path |
| notify friday-pm | `sendRosterImage` | ✅ confirmed delivered to Kate's phone (April 2) |
| notify 4am/7am/830am | `sendRosterImage` | ✅ 4am window triggered manually April 2, "as of" timestamp confirmed on Kate's phone |

### Root cause (April 2, 2026)

**Why the image never arrived:**

1. `dog_boarding_roster` (text-only) — deleted Apr 1
2. `dog_boarding_roster_2` — created Apr 1 12:42 PM as **Marketing** category. Meta's phone number stats showed Marketing = 0 delivered across all of March. Meta accepted the API call (returned wamid) but never pushed Marketing messages to device — new/unrated Marketing templates are throttled until they have quality history.
3. `dog_boarding_roster_3` — created Apr 2 as **Utility** category (body text changed to operational language to pass Meta's classifier). `META_ROSTER_TEMPLATE` updated in Vercel. **Status: Active. Confirmed delivered April 2.**

**What "wamid clean" actually means:** Meta accepted the request. It does NOT mean the message was delivered. Marketing category + Quality pending = silent non-delivery.

### K-1b status

**COMPLETE. Phone confirmed April 2, 2026.**

- `metaMediaUpload` + `{ image: { id: mediaId } }` — correct
- `META_ROSTER_TEMPLATE=dog_boarding_roster_3` — active in Vercel ✓
- v5.4.0 released ✓

---

## Completed This Session (April 3, session 3)

### K-2 — Maverick backfill
Kate ran: `UPDATE boardings SET cancelled_at = NOW(), cancellation_reason = 'appointment_archived' WHERE external_id = 'C63QgVl9';`
✅ DONE.

### K-3 — Tula N/C 3/23-26 (C63Qga3r)
Investigated: **N/C = New Client**, not "No Charge". The appointment was an Initial Evaluation daytime visit (6h22m, $60 flat fee). The sync pipeline correctly excluded it via the detail-page service_type ("Initial Evaluation" → `/initial\s+eval/i`). The integration check only sees the schedule title and had no pattern for the "N/C" abbreviation → false positive.

Fix: added `/\bN\/C\b/i` to `DAYCARE_ONLY_PATTERNS` in `scripts/integration-check.js`. Also synced missing `/\bdaycare\b/i` in the test mirror. PR #161 merged.
✅ DONE.

---

## IMMEDIATE NEXT (next session)

### ~~M3-8 — README screenshots~~ ✅ DONE (April 3, session 4)
- `docs/screenshots/boarding-matrix.png` — main app UI, 7-day boarding matrix
- `docs/screenshots/roster-image.jpeg` — roster PNG with "as of 4:35 AM, Fri 4/3" timestamp visible
- "What it looks like" section added to README, badge updated to 946 tests / v5.4.0
- Pushed direct to main (`7222568`)

### Step 1 — M3-6: Doc staleness CI check
New GH Actions step (or lightweight workflow) on PRs: detects when `api/*.js` or `src/lib/scraper/*.js` changes without touching `docs/job_docs/`. Warning only, not a failure. Pure bash + `git diff --name-only`. No new dependencies.

### Step 3 — M3-7: Screen recording
30–60 second recording of the roster image arriving on Kate's phone. Trigger → WhatsApp message received → open → image visible with "as of" timestamp. Embed in README as GIF or hosted video link.

**M3 remaining (ordered):**

| # | Ticket | Gate |
|---|--------|------|
| ~~K-1b phone confirm~~ | ✅ Done April 2 | — |
| ~~job_docs audit~~ | ✅ PRs #153–156 merged April 3 | — |
| ~~M3-4 verify~~ | ✅ Done April 2 — "as of" confirmed on Kate's phone | — |
| ~~K-6~~ | ✅ Done April 3 — admin bypass on ruleset; docs push direct to main | — |
| ~~M3-8~~ | ✅ Done April 3 — screenshots added to README | — |
| M3-6 | Doc staleness CI check | Unblocked |
| M3-7 | Screen recording | Unblocked (M3-4 verified) |
| M3-10 | WhatsApp delivery receipts (Meta Webhooks) | Last — highest complexity |

---

## K-6 — Docs direct-push to main

**COMPLETE. April 3, 2026.**

Added admin role (RepositoryRole, actor_id=5) as bypass actor on the `protection` ruleset (id 13512551) with `bypass_mode: always`. Kate can now push directly to main without a PR. The CI requirements still apply to PRs from any branch — bypass only affects direct pushes by the repo admin.

---

## Architecture Reference

### Notify flow (updated for K-1b)
```
GitHub Actions (4 workflows: M-F 4am/7am/8:30am + Fri 3pm PDT)
  → GET /api/notify?window=4am|7am|830am|friday-pm
  → refreshDaytimeSchedule (src/lib/notifyHelpers.js) → getPictureOfDay → computeWorkerDiff
  → /api/roster-image?date=YYYY-MM-DD&token=...&ts=<jobRunAt ISO>
  → PNG buffer → POST /v18.0/{PHONE_NUMBER_ID}/media → media_id
  → Meta Cloud API template send: { image: { id: media_id } } → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
```

### Sync pipeline
```
cron-auth.js (00:00 UTC)    → authenticate + store session in sync_settings
cron-schedule.js (00:05)    → runScheduleSync() → scan 3 pages, enqueue boarding candidates
cron-detail.js (00:10)      → runDetailSync() × 1 item → fetch detail, map + save to DB
cron-detail-2.js (00:15)    → re-exports cron-detail (second Vercel path = double throughput)
```

### Template name config
```
notifyWhatsApp.js:28  ALERT_TEMPLATE  = process.env.META_ALERT_TEMPLATE  || 'dog_boarding_alert'
notifyWhatsApp.js:29  ROSTER_TEMPLATE = process.env.META_ROSTER_TEMPLATE || 'dog_boarding_roster'
```
`META_ROSTER_TEMPLATE=dog_boarding_roster_3` is set in Vercel (IMAGE header template, Utility category, confirmed delivered April 2).

### Key files
| File | Purpose |
|---|---|
| `src/lib/notifyWhatsApp.js` | Meta Cloud API wrapper — `metaMediaUpload` (new, K-1b), `sendRosterImage`, `sendTextMessage` |
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic (v4.5) |
| `scripts/integration-check.js` | Integration check script (GH Actions) |
| `src/lib/pictureOfDay.js` | getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf` (M3-4); `timingSafeEqual` auth (M3-5); weekend path fixed (#148) |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) |
| `src/lib/notifyHelpers.js` | `refreshDaytimeSchedule` (extracted from notify.js for testability) |
| `scripts/cron-health-check.js` | Midnight cron health checker (GH Actions 00:30 UTC) |
| `scripts/gmail-monitor.js` | Gmail infrastructure alert monitor (GH Actions hourly) |
| `src/lib/scraper/sync.js` | runSync, 6-layer filter |
| `src/lib/scraper/extraction.js` | parseAppointmentPage + booking_status |
| `src/lib/scraper/daytimeSchedule.js` | parseDaytimeSchedulePage; attr() regex cache (M3-5) |

### GitHub Actions repo secrets (all must be Repository secrets, NOT environment secrets)
| Secret | Status |
|---|---|
| `VITE_SUPABASE_URL` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `EXTERNAL_SITE_USERNAME` | ✅ Set |
| `EXTERNAL_SITE_PASSWORD` | ✅ Set |
| `ANTHROPIC_API_KEY` | ✅ Set (no credits — Step 3 silently skipped) |
| `NOTIFY_RECIPIENTS` | ✅ Set (1 number — second pending Kate) |
| `INTEGRATION_CHECK_RECIPIENTS` | ✅ Set |
| `META_PHONE_NUMBER_ID` | ✅ Set |
| `META_WHATSAPP_TOKEN` | ✅ Set |
| `GMAIL_CLIENT_ID` | ✅ Set |
| `GMAIL_CLIENT_SECRET` | ✅ Set |
| `GMAIL_REFRESH_TOKEN` | ✅ Set |

### Vercel env vars (production)
| Var | Value |
|---|---|
| `META_ROSTER_TEMPLATE` | `dog_boarding_roster_3` |
| `META_WHATSAPP_TOKEN` | ✅ Set |
| `META_PHONE_NUMBER_ID` | ✅ Set |
| `NOTIFY_RECIPIENTS` | ✅ Set |
| `VITE_SUPABASE_URL` | ✅ Set |
| `VITE_SUPABASE_ANON_KEY` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `EXTERNAL_SITE_USERNAME` | ✅ Set |
| `EXTERNAL_SITE_PASSWORD` | ✅ Set |
| `VITE_SYNC_PROXY_TOKEN` | ✅ Set |
| `APP_URL` | ✅ Set |

### Workers
| Name | External UID |
|---|---|
| Charlie | 61023 |
| Kathalyn Dominguez | 208669 |
| Kentaro Cavey | 141407 |
| Max Posse | 174385 |
| Sierra Tagle | 189436 |
| Stephen Muro | 164375 |

---

## Pending Kate Actions

| # | Action | Blocks | Priority |
|---|--------|--------|----------|
| ~~K-2~~ | ✅ Done April 3 — Maverick backfilled | — | — |
| ~~K-3~~ | ✅ Done April 3 — N/C = new client initial eval; PR #161 merged | — | — |
| K-4 | Provide second WhatsApp recipient → add to `NOTIFY_RECIPIENTS` secret (comma-separated E.164) | M0-3 full verification | 🟡 Medium |
| K-5 | Add Anthropic API credits at console.anthropic.com | Step 3 vision name-check | 🟢 Low |

---

## Future Backlog (post-M3)

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| #145 | **Tooling upgrade** — eslint 9→10 + @vitejs/plugin-react 5→6 | Low | Dev tooling only |
| F-1 | **Message delivery observability** — Meta Webhooks + wamid storage, no alert layer | Medium | Lighter version of M3-10 |
| F-2 | **Message log page** — store every outbound message, new app page | High | Table + 7 write sites + UI |

---

## Carry-Forward (low priority)

- `cron-schedule.js` ADD filter case-sensitive — `/\badd\b/` doesn't match uppercase `ADD`. Low priority.
- Claude credits for integration check name-check — Step 3 silently skipped.
- Store datetimes in PST instead of UTC — tech debt, no user impact yet.

---

## Useful SQL

```sql
-- Cron health
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;

-- Queue status
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;

-- Recent boardings
SELECT b.external_id, d.name, b.billed_amount, b.night_rate, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC LIMIT 20;
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0, **v5.4.0 (latest)**

## Archive
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
