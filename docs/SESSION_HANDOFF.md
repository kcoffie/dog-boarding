# Dog Boarding App — Session Handoff (v5.0 in progress)
**Last updated:** March 20, 2026

---

## Current State

- **v4.4.3 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) — tagged, latest release
- **799 tests, 49 files, 0 failures**
- **v5.0 PR open** — M0, M1-1, M1-2, M2 all implemented (see PR for details)

### v5.0 milestones in this PR

- **M0 DONE** — `notifyWhatsApp.js` rewritten from Twilio to Meta Cloud API (`sendRosterImage`, `sendTextMessage`). `notify.js` updated accordingly. **Kate still needs to:** set up Meta app + register phone number + add `META_PHONE_NUMBER_ID` + `META_WHATSAPP_TOKEN` to GH secrets + Vercel env.
- **M1-1 DONE** — Cron failure alerting: `'started'` status added to `cron_health` (migration 022), each cron (auth/schedule/detail) writes 'started' at top of run, `scripts/cron-health-check.js` + `.github/workflows/cron-health-check.yml` run at 00:30 UTC.
- **M1-2 DONE** — `refreshDaytimeSchedule` extracted to `src/lib/notifyHelpers.js` (testable); 14 new tests covering all 7 exit paths + new notifyWhatsApp tests = 24 new tests total.
- **M2 DONE** — Gmail monitor implemented: `scripts/gmail-monitor.js` + `.github/workflows/gmail-monitor.yml` (hourly at :15). **Kate still needs to:** create Google Cloud project, enable Gmail API, create OAuth2 creds, run one-time auth script → GMAIL_REFRESH_TOKEN, add `GMAIL_CLIENT_ID` + `GMAIL_CLIENT_SECRET` + `GMAIL_REFRESH_TOKEN` to GH secrets.

---

## IMMEDIATE NEXT (next session)

1. **Merge v5.0 PR** — after CI passes
2. **Kate actions for M0**: Create Meta app, register phone number, get `META_PHONE_NUMBER_ID` + `META_WHATSAPP_TOKEN`
3. **Kate actions for M2**: Google Cloud project + Gmail API + OAuth2 refresh token
4. **Tag v5.0.0** GitHub release after merging
5. **Deploy migration 022 + 023** via Supabase dashboard (ALTER TABLE + CREATE TABLE)

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
  → Step 6: Twilio WhatsApp → INTEGRATION_CHECK_RECIPIENTS
```

### Notify flow
```
GitHub Actions (4 workflows: M-F 4am/7am/8:30am + Fri 3pm PDT)
  → GET /api/notify?window=4am|7am|830am|friday-pm
  → refreshDaytimeSchedule (src/lib/notifyHelpers.js) → getPictureOfDay → computeWorkerDiff
  → /api/roster-image → PNG → Meta Cloud API (not Twilio) → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
```

### Cron health check flow (M1-1, new)
```
GitHub Actions (daily 00:30 UTC)
  → scripts/cron-health-check.js
  → Supabase: check cron_health for auth/schedule/detail
  → Alert if: any cron didn't run tonight, or 2+ consecutive failures
  → Twilio WhatsApp → INTEGRATION_CHECK_RECIPIENTS
```

### Gmail monitor flow (M2, new)
```
GitHub Actions (hourly at :15)
  → scripts/gmail-monitor.js
  → OAuth2 refresh → Gmail REST API (unread from known senders)
  → Subject-pattern filter (GitHub "run failed", Vercel "Failed", any Supabase)
  → Supabase gmail_processed_emails dedup check
  → Twilio WhatsApp alert → INTEGRATION_CHECK_RECIPIENTS
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
| `TWILIO_ACCOUNT_SID` | ✅ Set |
| `TWILIO_AUTH_TOKEN` | ✅ Set |
| `TWILIO_FROM_NUMBER` | ✅ Set |
| `NOTIFY_RECIPIENTS` | ✅ Set (1 number — second pending Kate) |
| `INTEGRATION_CHECK_RECIPIENTS` | ✅ Set (Kate's number only) |
| `APP_URL` | ✅ Set (not used in integration-check workflow) |
| `VITE_SYNC_PROXY_TOKEN` | ✅ Set (not used in integration-check workflow) |
| `META_PHONE_NUMBER_ID` | ⏳ Pending Kate — from Meta app dashboard |
| `META_WHATSAPP_TOKEN` | ⏳ Pending Kate — system user access token from Meta app |
| `GMAIL_CLIENT_ID` | ⏳ Pending Kate — from Google Cloud OAuth2 credentials |
| `GMAIL_CLIENT_SECRET` | ⏳ Pending Kate — from Google Cloud OAuth2 credentials |
| `GMAIL_REFRESH_TOKEN` | ⏳ Pending Kate — from one-time local auth flow |

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
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3 **(latest)**

## Archive
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
- v4.1.1 session: `docs/archive/SESSION_HANDOFF_v4.1.1_final.md`
- v4.0 session: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 session: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 session: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
