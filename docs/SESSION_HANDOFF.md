# Dog Boarding App — Session Handoff (v5.3.0 LIVE)
**Last updated:** March 25, 2026

---

## Current State

- **v5.3.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) — latest release
- **873 tests, 52 files, 0 failures**
- PR #125 merged — fix: sanitize newlines in `sendTextMessage` template parameter (#124)
- PR #121 merged — fix: `'en'` locale for Meta message templates
- PR #120 merged — fix: shared appointment filter pipeline (#117)
- PR #119 merged — fix: single-source `nonBoardingPatterns` in `config.js`; fix `syncRunner.js` cron PG filter (#117)
- PR #118 merged — fix: cascade `cancelled_at` to boarding on reconcile archive; BoardingMatrix shows grey ✕ + strikethrough for cancelled dogs (#117)
- PR #115 merged — fix: PG boarding filter (#114) — `\bpg\b` removed from sync.js + integration-check.js
- PR #112 merged — M3-12: Meta message templates deployed
- PR #108 merged — M3-11 done: all alerting jobs migrated from Twilio to Meta Cloud API; `twilio` package removed

### v5.3 — WhatsApp fully verified ✅

- **Locale fix** (PR #121) — `en_US` → `en`; resolved error 132001
- **Newline fix** (PR #125) — sanitize `\n` → ` | ` in `sendTextMessage`; resolved error 132018
- **Verified live** (run 23567958341, March 25, 2026): `wamid.HBgLMTgz...` — 1/1 sent. WhatsApp alert delivered to Kate's phone.

### Pending (Kate)
- **Backfill Maverick cancelled boarding** — existing DB row predates the cascade fix (PR #118). Run: `UPDATE boardings SET cancelled_at = NOW(), cancellation_reason = 'appointment_archived' WHERE external_id = 'C63QgVl9';`
- **Second WhatsApp recipient** — Kate to provide second number → add to `NOTIFY_RECIPIENTS` secret (comma-separated E.164)
- **Anthropic credits** — Step 3 of integration check (Claude vision name-check) still silently skipped
- **Tula — N/C Tula 3/23-26 (C63Qga3r)** — appeared as "Missing from DB" in integration check. Unclear if it's a real boarding that should sync or a no-charge visit that should be filtered. Kate to investigate.

### Known integration-check false positives
PG daycare-only appointments (e.g. "Fergus Stevens — P/G TWTH") show as "Missing from DB" in every integration-check run. This is expected: they pass the title filter (PG is not title-filtered because "PG 3/23-30" style are real boardings) but are correctly excluded by the pricing filter in the sync pipeline. The check can't run the pricing filter without fetching detail pages. Not a bug — ignore these in the report.

---

## IMMEDIATE NEXT (next session)

**M3 remaining tickets** — operational system is complete and portfolio docs are live. These are enhancements:

1. **M3-4** — "As of" timestamp in roster image (e.g. `as of 6:04 PM, Mon 3/16`)
2. **M3-5** — DST-aware scheduling + code polish (timing-safe equal in `roster-image.js`, regex precompile in `daytimeSchedule.js`)
3. **M3-6** — Doc staleness CI check (non-blocking — detects when `api/` or `src/lib/scraper/` changed but `docs/job_docs/` wasn't touched)
4. **M3-7** — Screen recording of WhatsApp roster image arriving on phone (most impactful portfolio artifact; embed in README)
5. **M3-8** — App screenshots in README (boarding matrix, roster image — currently no visuals)
6. **M3-9** — CHANGELOG.md documenting v1.0 → v5.0.0 release history
7. **M3-10** — WhatsApp delivery receipts (Meta Webhooks) — post-acceptance delivery failures still invisible; templates (M3-12) close the 24h window gap but not the delivery-receipt gap
8. ~~**M3-11** — Consolidate WhatsApp sender~~ ✅ DONE (#108)
9. ~~**M3-12** — Meta message templates~~ ✅ DONE (#112)

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
  → /api/roster-image → PNG → Meta Cloud API → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
```

### Cron health check flow (M1-1, new)
```
GitHub Actions (daily 00:30 UTC)
  → scripts/cron-health-check.js
  → Supabase: check cron_health for auth/schedule/detail
  → Alert if: any cron didn't run tonight, or 2+ consecutive failures
  → Meta Cloud API WhatsApp → INTEGRATION_CHECK_RECIPIENTS
```

### Gmail monitor flow (M2, new)
```
GitHub Actions (hourly at :15)
  → scripts/gmail-monitor.js
  → OAuth2 refresh → Gmail REST API (unread from known senders)
  → Subject-pattern filter (GitHub "run failed", Vercel "Failed", any Supabase)
  → Supabase gmail_processed_emails dedup check
  → Meta Cloud API WhatsApp alert → INTEGRATION_CHECK_RECIPIENTS
  → Mark processed in Supabase
```

### Key files
| File | Purpose |
|---|---|
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic (v4.5) |
| `scripts/integration-check.js` | Integration check script (GH Actions) |
| `.github/workflows/integration-check.yml` | 3×/day + on-demand |
| `docs/job_docs/integration-check.md` | Full reference doc for the integration check |
| `src/lib/pictureOfDay.js` | getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint |
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
| `EXTERNAL_SITE_USERNAME` | ✅ Set (v4.5 Step 0 re-auth) |
| `EXTERNAL_SITE_PASSWORD` | ✅ Set (v4.5 Step 0 re-auth) |
| `ANTHROPIC_API_KEY` | ✅ Set (no credits — Step 3 silently skipped) |
| `NOTIFY_RECIPIENTS` | ✅ Set (1 number — second pending Kate) |
| `INTEGRATION_CHECK_RECIPIENTS` | ✅ Set (Kate's number only) |
| `APP_URL` | ✅ Set (not used in integration-check workflow) |
| `VITE_SYNC_PROXY_TOKEN` | ✅ Set (not used in integration-check workflow) |
| `META_PHONE_NUMBER_ID` | ✅ Set |
| `META_WHATSAPP_TOKEN` | ✅ Set (system user token — must be assigned to both QApp AND WhatsApp Business Account) |
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

- **F-1: Message delivery observability** — verify a message was actually received. Meta Webhooks POST a delivery status for each wamid. Store wamids at send time, alert if no delivered status within N minutes. See SPRINT_PLAN.md F-1.
- **F-2: Message log page** — store every outbound message (recipient, content, timestamp, type) to a `message_log` table at send time. New app page: last 5 days of messages, latest first. Decouples "did the job run and compile the message" from "did the delivery work" — Kate can check the app to see what *should* have been sent. See SPRINT_PLAN.md F-2.

---

## Carry-Forward (low priority, not blocking v5)

- **`cron-schedule.js` ADD filter case-sensitive** — `/\badd\b/` doesn't match uppercase `ADD`. Low priority — sync pipeline's post-filter catches these downstream anyway.
- **Claude credits for integration check name-check** — Step 3 silently skipped (no credits). Add at console.anthropic.com if needed.
- **Polish** (from v4.1.2):
  - Fix misleading "constant-time" comment in `roster-image.js` — use `crypto.timingSafeEqual` or remove claim
  - Pre-compile `attr()` regexes in `daytimeSchedule.js` — `new RegExp(name + ...)` inside hot loop
- **DST-flaky test** in `DateNavigator.test.jsx` — fix or remove

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

-- Notify state (last image sent + hash)
SELECT result FROM cron_health WHERE cron_name = 'notify';

-- Integration check window query (what the check uses)
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
- v4.1.1 session: `docs/archive/SESSION_HANDOFF_v4.1.1_final.md`
- v4.0 session: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 session: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 session: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
