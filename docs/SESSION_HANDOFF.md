# Dog Boarding App — Session Handoff (v5.3.0 LIVE)
**Last updated:** April 1, 2026 (end of session — M3-5 in PR)

---

## Current State

- **v5.3.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) — latest release
- **923 tests, 54 files, 0 failures**
- PR #140 open — feat: DST-aware scheduling + code polish (M3-5) (#139) ← pending merge
- PR #137 merged — feat: add "as of" timestamp to roster image header (M3-4) (#136)
- PR #133 merged — fix: catch concatenated PG day codes (MTWTH, TWTH, WTH) in daycare filter (#132)
- PR #131 merged — feat: graceful `invalid_grant` detection in `gmail-monitor.js` + `npm run reauth-gmail` (#130)
- PR #129 merged — fix: suppress 27 daycare false positives in integration check (#128)

### v5.3 — WhatsApp alert sends verified ✅ / roster image send BROKEN ❌

**WhatsApp job verification (March 25, 2026):**

| Job | Send function | Result |
|---|---|---|
| integration-check | `sendTextMessage` | ✅ `wamid.HBgLMTgz...` — delivered to Kate's phone |
| cron-health-check | `sendTextMessage` | ✅ Same code path |
| gmail-monitor | `sendTextMessage` | ✅ Same code path |
| notify 4am/7am/830am | `sendRosterImage` | ⏭️ `no_change` — image path not yet end-to-end verified |
| notify friday-pm | `sendRosterImage` | ❌ **Error 132012** — template has wrong header type (TEXT, needs IMAGE) |

**❌ BROKEN: `dog_boarding_roster` template has wrong header type.**
Code is correct — template needs fixing in Meta Business Manager (Kate action K-1).

### Pending (Kate)
- **🔴 K-1: Fix `dog_boarding_roster` Meta template** — change header type to IMAGE/MEDIA, re-submit for approval. Triggers M3-7.
- **🔴 Verify M3-4 deploy** — trigger 7am notify manually after PR #137 deploys; confirm `as of [time], [day] [M/D]` visible in image on phone.
- **K-2: Backfill Maverick** — `UPDATE boardings SET cancelled_at = NOW(), cancellation_reason = 'appointment_archived' WHERE external_id = 'C63QgVl9';`
- **K-3: Investigate Tula N/C 3/23-26 (C63Qga3r)** — real boarding or no-charge non-boarding?
- **K-4: Second WhatsApp recipient** → add to `NOTIFY_RECIPIENTS` secret (comma-separated E.164)
- **K-5: Anthropic credits** at console.anthropic.com (Step 3 vision in integration check)

### Known integration-check false positives
Suppressed by `DAYCARE_ONLY_PATTERNS` in `integration-check.js` (31 confirmed as of March 2026).

---

## Session summary (April 1, 2026) — M3-5

- **PR #140** — feat: DST-aware scheduling + code polish (#139)
  - `api/roster-image.js`: added `crypto.timingSafeEqual` for token auth; removed misleading "constant-time" comment on `!==`
  - `src/lib/scraper/daytimeSchedule.js`: `attr()` now uses a module-level `_attrRegexCache` Map — regexes compiled once per attribute name, not on every call in the hot parse loop
  - `src/components/DateNavigator.test.jsx`: "clicking Today" tests pinned with `vi.useFakeTimers()` + `vi.setSystemTime(2025-03-09T20:00Z)` (spring-forward day noon PDT) — eliminates midnight race + DST boundary flakiness
  - DST cron documentation: already present in all 4 notify workflows — no change needed
  - 923 tests, all green

## Session summary (April 1, 2026) — M3-4

- **PR #137** — feat: "as of" timestamp in roster image header (#136)
  - `api/notify.js`: capture `jobRunAt = new Date().toISOString()` at job start; append `&ts=<iso>` to daily + friday-pm image URLs
  - `api/roster-image.js`: new exported `formatAsOf(isoStr)` → `"6:04 PM, Mon 3/16"` in PST/PDT; reads `req.query.ts` (falls back to `data.lastSyncedAt` for direct hits); `buildLayout(data, asOfStr)` now receives pre-formatted string; `formatTime` removed (superseded, caught by lint hook)
  - `src/__tests__/rosterImage.test.js` (new): 5 tests for `formatAsOf` — PST, PDT, null, undefined, invalid date
  - 923 tests, all green

---

## IMMEDIATE NEXT (next session)

**Verify M3-4 deploy** — trigger 7am notify manually after notify job is fixed; confirm "as of [time], [day] [M/D]" in image on phone. Use:
`curl -s "https://qboarding.vercel.app/api/notify?window=7am&token=$VITE_SYNC_PROXY_TOKEN"`

**M3 remaining (ordered):**

| # | Ticket | Gate |
|---|--------|------|
| M3-8 | README screenshots (boarding matrix + roster image with M3-4 timestamp) | After M3-4 verified on phone |
| M3-9 | CHANGELOG.md (v1.0 → v5.3.0) | Any time |
| M3-6 | Doc staleness CI check (non-blocking PR warning) | Any time |
| M3-7 | Screen recording — WhatsApp roster image arriving on phone | After K-1 + M3-4 verified |
| M3-10 | WhatsApp delivery receipts (Meta Webhooks) | Last — highest complexity |

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

### Key files
| File | Purpose |
|---|---|
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic (v4.5) |
| `scripts/integration-check.js` | Integration check script (GH Actions) |
| `src/lib/pictureOfDay.js` | getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf` (M3-4) |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) |
| `src/lib/notifyWhatsApp.js` | Meta Cloud API wrapper (`sendRosterImage`, `sendTextMessage`) |
| `src/lib/notifyHelpers.js` | `refreshDaytimeSchedule` (extracted from notify.js for testability) |
| `scripts/cron-health-check.js` | Midnight cron health checker (GH Actions 00:30 UTC) |
| `scripts/gmail-monitor.js` | Gmail infrastructure alert monitor (GH Actions hourly) |
| `src/lib/scraper/sync.js` | runSync, 6-layer filter |
| `src/lib/scraper/extraction.js` | parseAppointmentPage + booking_status |

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

---

## Carry-Forward (low priority, not blocking)

- **`cron-schedule.js` ADD filter case-sensitive** — `/\badd\b/` doesn't match uppercase `ADD`. Low priority — sync pipeline post-filter catches downstream.
- **Claude credits for integration check name-check** — Step 3 silently skipped (no credits).
- **DST-flaky test** in `DateNavigator.test.jsx` — address in M3-5.

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
