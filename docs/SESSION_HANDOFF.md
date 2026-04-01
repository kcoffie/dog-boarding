# Dog Boarding App — Session Handoff (v5.3.0 LIVE)
**Last updated:** April 1, 2026 (K-1 template approved; roster-image 500 bug found + fixed; #148)

---

## Current State

- **v5.3.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) — latest release
- **923 tests, 54 files, 0 failures**
- PR #146 merged — chore: bump dev group (anthropic-sdk, vitest + 2 others)
- PR #143 merged — docs: CHANGELOG.md (M3-9)
- PR #140 merged — feat: DST-aware scheduling + code polish (M3-5)
- PR #137 merged — feat: add "as of" timestamp to roster image (M3-4)

### v5.3 — WhatsApp alert sends verified ✅ / roster image end-to-end verification in progress

**WhatsApp job verification (March 25 – April 1, 2026):**

| Job | Send function | Result |
|---|---|---|
| integration-check | `sendTextMessage` | ✅ `wamid.HBgLMTgz...` — delivered to Kate's phone |
| cron-health-check | `sendTextMessage` | ✅ Same code path |
| gmail-monitor | `sendTextMessage` | ✅ Same code path |
| notify 4am/7am/830am | `sendRosterImage` | ⏭️ `no_change` — image path not yet end-to-end verified |
| notify friday-pm | `sendRosterImage` | ⏳ **wamid confirmed April 1** — image 500 bug fixed in #148; verify after deploy |

**K-1 status (April 1, 2026):**
- `dog_boarding_roster_2` template approved by Meta ✅
- `META_ROSTER_TEMPLATE=dog_boarding_roster_2` set in Vercel ✅
- friday-pm triggered manually → wamid returned → Meta accepted message ✅
- Image NOT received on phone — root cause: `api/roster-image?type=weekend` returning 500
- Root cause: `getWeekendBoardings` selected `client_name` from `boardings` — column does not exist
- Fix: PR #147 (`api/roster-image.js` + 18 new tests) — pending deploy

### Pending (Kate)
- **🔴 K-1 final verification** — after PR #147 merges + Vercel deploys, re-trigger friday-pm: `curl -s "https://qboarding.vercel.app/api/notify?window=friday-pm&token=$VITE_SYNC_PROXY_TOKEN"`. Confirm roster image arrives on phone.
- **🔴 Verify M3-4** — after K-1 approved, trigger 7am manually: `curl -s "https://qboarding.vercel.app/api/notify?window=7am&token=$VITE_SYNC_PROXY_TOKEN"`. Confirm `as of [time], [day] [M/D]` visible in roster image on phone.
- **K-2: Backfill Maverick** — `UPDATE boardings SET cancelled_at = NOW(), cancellation_reason = 'appointment_archived' WHERE external_id = 'C63QgVl9';`
- **K-3: Investigate Tula N/C 3/23-26 (C63Qga3r)** — real boarding or no-charge non-boarding?
- **K-4: Second WhatsApp recipient** → add to `NOTIFY_RECIPIENTS` secret (comma-separated E.164)
- **K-5: Anthropic credits** at console.anthropic.com (Step 3 vision in integration check)
- **K-6: Branch protection** — Settings → Branches → main rule → "Allow specified actors to bypass required pull requests" → add `kcoffie`

---

## IMMEDIATE NEXT (next session)

1. **K-1 final** — Merge PR #147 → confirm Vercel deploy → re-trigger friday-pm → confirm roster image arrives on phone.
2. **Verify M3-4** — after K-1 confirmed, trigger 7am manually and confirm "as of" timestamp in roster image on phone.
3. **M3-8** — README screenshots (boarding matrix + roster image with M3-4 timestamp). Unblocked — can start now.
4. **M3-6** — Doc staleness CI check. Unblocked — can start any time.
5. **M3-7** — Screen recording. Blocked on K-1 + M3-4 verified on phone.

**M3 remaining (ordered):**

| # | Ticket | Gate |
|---|--------|------|
| M3-8 | README screenshots (boarding matrix + roster image with M3-4 timestamp) | Unblocked |
| M3-6 | Doc staleness CI check (non-blocking PR warning) | Unblocked |
| M3-7 | Screen recording — WhatsApp roster image arriving on phone | After K-1 + M3-4 verified |
| M3-9 | CHANGELOG.md (v1.0 → v5.3.0) | ✅ DONE — merged PR #143 |
| M3-10 | WhatsApp delivery receipts (Meta Webhooks) | Last — highest complexity |

---

## This Session — What Was Done

- **PR queue cleared:** Closed stale handoff PRs (#135, #126, #123). Closed broken major-version Dependabot PRs (#106 eslint 10, #107 plugin-react 6) — tracked as kcoffie/dog-boarding#145 for future upgrade. Merged safe Dependabot PRs (#127 codecov, #104 prod deps, #105 jsdom, #146 dev deps).
- **K-1 unblocked:** `dog_boarding_roster_2` template approved by Meta. `META_ROSTER_TEMPLATE=dog_boarding_roster_2` set in Vercel. friday-pm triggered manually → wamid confirmed.
- **Bug #148 found + fixed:** `api/roster-image?type=weekend` was returning 500 — `getWeekendBoardings` selected `client_name` from `boardings` (column does not exist; lives on `sync_appointments`). Fixed in PR #147: removed invalid column, added 18 new tests covering the entire untested weekend path (`formatWeekendDatetime`, `formatWeekendHeaderDates`, `getWeekendWindowISO`, `getWeekendBoardings`, `computeWeekendImageHeight`). This was the reason the roster image was never arriving on phone despite a valid wamid.
- **Vercel cleanup:** Removed stale `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` env vars.
- **GH issue #145 created:** Tooling upgrade backlog — eslint 9→10 + plugin-react 5→6.
- **Docs-to-main workflow:** Kate authorized direct push to main for docs-only changes (no PR needed).

---

## Architecture Reference

### Sync pipeline
```
cron-auth.js (00:00 UTC)    → authenticate + store session in sync_settings
cron-schedule.js (00:05)    → runScheduleSync() → scan 3 pages, enqueue boarding candidates
cron-detail.js (00:10)      → runDetailSync() × 1 item → fetch detail, map + save to DB
cron-detail-2.js (00:15)    → re-exports cron-detail (second Vercel path = double throughput)
```

### Integration check flow
```
GitHub Actions (3×/day + on-demand: 1am/9am/5pm PDT)
  → Step 0: runScheduleSync + drain runDetailSync (max 20 iters) — non-fatal
  → Step 1: Load session cookies from sync_settings (Supabase)
  → Step 2: Playwright: render /schedule, screenshot + DOM link extraction
  → Step 3: Claude vision: screenshot → dog names[] (silently skipped — no API credits)
  → Step 4: Supabase: boardings JOIN dogs (past 7d → today+7d); daytime_appointments (today)
  → Step 5: compareResults: missing IDs, Unknown names, name mismatches; missing daytime events
  → Step 6: Meta Cloud API WhatsApp → INTEGRATION_CHECK_RECIPIENTS
```

### Notify flow
```
GitHub Actions (4 workflows: M-F 4am/7am/8:30am + Fri 3pm PDT)
  → GET /api/notify?window=4am|7am|830am|friday-pm
  → refreshDaytimeSchedule (src/lib/notifyHelpers.js) → getPictureOfDay → computeWorkerDiff
  → /api/roster-image?date=YYYY-MM-DD&token=...&ts=<jobRunAt ISO>
  → PNG → Meta Cloud API → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
```

### Template name config
```
notifyWhatsApp.js:28  ALERT_TEMPLATE  = process.env.META_ALERT_TEMPLATE  || 'dog_boarding_alert'
notifyWhatsApp.js:29  ROSTER_TEMPLATE = process.env.META_ROSTER_TEMPLATE || 'dog_boarding_roster'
```
Override via Vercel env var only (GH Actions workflows just curl the Vercel endpoint — they don't pass env to the running code).

### Key files
| File | Purpose |
|---|---|
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic (v4.5) |
| `scripts/integration-check.js` | Integration check script (GH Actions) |
| `src/lib/pictureOfDay.js` | getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf` (M3-4); `timingSafeEqual` auth (M3-5) |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) |
| `src/lib/notifyWhatsApp.js` | Meta Cloud API wrapper (`sendRosterImage`, `sendTextMessage`) |
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
| `META_ROSTER_TEMPLATE` | `dog_boarding_roster_2` (set this session) |
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
| ~~TWILIO_ACCOUNT_SID~~ | Deleted this session |
| ~~TWILIO_AUTH_TOKEN~~ | Deleted this session |
| ~~TWILIO_FROM_NUMBER~~ | Deleted this session |

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

## Future Backlog (post-M3)

- **F-1: Message delivery observability** — Meta Webhooks POST delivery status per wamid. Store wamids at send time, alert if no `delivered` within N minutes.
- **F-2: Message log page** — store every outbound message to `message_log` table. New app page: last 5 days, latest first.
- **#145: Tooling upgrade** — eslint 9→10 + @vitejs/plugin-react 5→6. CI currently fails on both — needs intentional upgrade ticket.

---

## Carry-Forward (low priority, not blocking)

- **`cron-schedule.js` ADD filter case-sensitive** — `/\badd\b/` doesn't match uppercase `ADD`. Low priority — sync pipeline post-filter catches downstream.
- **Claude credits for integration check name-check** — Step 3 silently skipped (no credits).
- **Store datetimes in PST instead of UTC** — tech debt, no user impact yet.
- **Branch protection bypass** — K-6: add Kate as bypass actor so doc commits don't need a PR.

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

-- Integration check window query
SELECT b.external_id, d.name, b.arrival_datetime, b.departure_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.arrival_datetime <= NOW() + INTERVAL '7 days'
  AND b.departure_datetime >= DATE_TRUNC('day', NOW()) - INTERVAL '7 days';
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0 **(latest)**

## Archive
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
