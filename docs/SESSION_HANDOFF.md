# Dog Boarding App — Session Handoff (v4.4.1 live, ready for v5)
**Last updated:** March 19, 2026

---

## Current State

- **v4.4.1 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) — tagged, latest release
- **756 tests, 46 files, 0 failures**
- **Main branch clean** — all PRs merged (latest: #83)
- **Integration check LIVE** — runs 3×/day, consistently green, dog names in alerts, 7-day DB window
- **v4 complete** — all tickets done including v4.4.1 session self-healing hotfix
- **`cron_health_log` verified** — table live, first row written (manual trigger March 19); tonight's midnight cron will confirm unconditional re-auth end-to-end

---

## IMMEDIATE NEXT (next session)

1. **Start v5.0** — see `docs/SPRINT_PLAN.md`. First ticket: Gmail monitoring agent
2. **Optional: code review v4** — large sprint; good to audit before v5 adds more surface area
3. **Tomorrow: confirm tonight's cron** — `cron_health.auth.result.action` should be `refreshed` (not `skipped`) and new rows in `cron_health_log`

---

## What Was Done This Session (March 19, session self-healing fix + docs)

**Triaged 8:30am WhatsApp refresh alert** (`No cached session — cron-auth may not have run`). Root cause confirmed from DB: `cron-auth` ran at 00:12 UTC on March 19, saw session as "still valid", skipped re-auth. Session expired at 00:27 UTC (stored ~00:27 the prior day — 15-min race). All three notify windows (4am/7am/8:30am PST = 12:00/15:00/16:30 UTC) ran with no valid session.

**Session also interrupted mid-implementation** — picked up and completed in new session.

**PR #83 (fix/session-self-healing) — merged March 19, tagged v4.4.1:**
- `cron-auth.js` — always re-auth, removed skip-if-valid logic (was the race condition)
- `sessionCache.js` — added `ensureSession()`: fast-path cache hit or re-authenticates on miss/expiry
- `cron-schedule.js`, `cron-detail.js` — use `ensureSession` (self-healing); cron-detail: session before dequeue (no more put-back dance)
- `notify.js` — use `ensureSession` in refresh; `sendRefreshAlert` deduplicates (1 alert/day, not 3)
- `api/_cronHealth.js` — also appends to new `cron_health_log` table on every write
- Migration 021 — `cron_health_log` append-only history table
- 10 new tests (8 `ensureSession`, 2 `writeCronHealth`); 756 total, 0 failures
- README: fixed wrong curl command (integration check has no HTTP endpoint); added `INTEGRATION_CHECK_RECIPIENTS` to env var table

**Verified post-merge (March 19):**
- Manual `curl /api/cron-auth` → `{"ok":true,"action":"refreshed"}` ✅
- `cron_health.auth.result.action = 'refreshed'` (was `skipped` pre-fix) ✅
- `cron_health_log` table live, first row (id=1) written ✅
- Tonight's midnight cron will confirm unconditional re-auth in production

### Prior session PRs (all squash-merged to main)

| PR | Branch | What |
|---|---|---|
| #65 | `fix/request-appointment-type` | Handle request/canceled-request types; booking_status field; Layer 3b filter |
| #67 | `fix/cron-throughput` | 3-page nightly scan + cron-detail-2.js second Vercel path |
| #71 | `feat/friday-pm-notify` | Friday PM weekend boarding notify — workflow, endpoint, weekend image |
| #73 | `fix/integ-check-dog-name-exit-window` | Integration check: dog name in alerts, exit 0, 7-day DB window |
| #75 | `fix/notify-refresh-response-text` | Fix daytime refresh silent failure + WhatsApp alerts on refresh errors |
| #76 | `docs/integ-check-canceled-false-positive` | Document canceled booking requests as known FP #6 |
| #79 | `chore/dev-deps-march-18` | Bump 6 dev dependencies |
| #80 | `docs/session-handoff-v4.4` | SPRINT_PLAN + SESSION_HANDOFF session close |
| #83 | `fix/session-self-healing` | Session self-healing, ensureSession, always re-auth, cron_health_log |

---

## Carry-Forward (low priority, not blocking v5)

- **`cron-schedule.js` ADD filter case-sensitive** — `/\badd\b/` doesn't match uppercase `ADD`. Low priority — sync pipeline's post-filter catches these downstream anyway. (`integration-check.js` already fixed in PR #54.)
- **Integration check Step 0 sync broken** — `api/run-sync.js` uses `DOMParser` (browser-only) and hits Vercel 10s timeout. Step 0 removed from check; missing boardings still surface in compare step. Fix options in `docs/job_docs/integration-check.md` (Option A recommended: call cron endpoints via HTTP).
- **Claude credits for integration check name-check** — Step 3 silently skipped (no credits). Checks 1 + 2 still work (missing IDs, Unknown names). Only name mismatches missed — narrow failure mode. Add credits at console.anthropic.com if needed.
- **Polish** (from v4.1.2, moved to v5):
  - Fix misleading "constant-time" comment in `roster-image.js` — use `crypto.timingSafeEqual` or remove claim
  - Rename `window` param in `shouldSendNotification` → `sendWindow` (shadows browser global)
  - Pre-compile `attr()` regexes in `daytimeSchedule.js` — `new RegExp(name + ...)` inside hot loop

---

## Architecture Reference

### Integration check flow
```
GitHub Actions (3×/day + on-demand, SKIP_SYNC=true)
  → Load session cookies from sync_settings (Supabase)
  → Playwright: render /schedule, screenshot + DOM link extraction
  → Claude vision: screenshot → dog names[] (silently skipped — no API credits)
  → Supabase: boardings JOIN dogs (past 7d → today+7d); daytime_appointments (today)
  → compareResults: missing IDs, Unknown names, name mismatches (boarding); missing daytime events
  → Twilio WhatsApp → INTEGRATION_CHECK_RECIPIENTS
```

### Notify flow
```
GitHub Actions (4 workflows: M-F 4am/7am/8:30am + Fri 3pm PDT)
  → GET /api/notify?window=4am|7am|830am|friday-pm
  → refreshDaytimeSchedule → getPictureOfDay → computeWorkerDiff
  → /api/roster-image → PNG → Twilio WhatsApp → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
```

### Key files
| File | Purpose |
|---|---|
| `scripts/integration-check.js` | Integration check script (GH Actions) |
| `api/run-sync.js` | On-demand sync endpoint (Step 0 — currently broken) |
| `.github/workflows/integration-check.yml` | 3×/day + on-demand, SKIP_SYNC env var |
| `docs/job_docs/integration-check.md` | Full reference doc for the integration check |
| `src/lib/pictureOfDay.js` | getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper |
| `src/lib/scraper/sync.js` | runSync, 6-layer filter |
| `src/lib/scraper/extraction.js` | parseAppointmentPage + booking_status |

### GitHub Actions repo secrets (all must be Repository secrets, NOT environment secrets)
| Secret | Status |
|---|---|
| `VITE_SUPABASE_URL` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `ANTHROPIC_API_KEY` | ✅ Set (no credits — Step 3 silently skipped) |
| `TWILIO_ACCOUNT_SID` | ✅ Set |
| `TWILIO_AUTH_TOKEN` | ✅ Set |
| `TWILIO_FROM_NUMBER` | ✅ Set |
| `NOTIFY_RECIPIENTS` | ✅ Set (1 number — second pending Kate) |
| `INTEGRATION_CHECK_RECIPIENTS` | ✅ Set (Kate's number only) |
| `APP_URL` | ✅ Set |
| `VITE_SYNC_PROXY_TOKEN` | ✅ Set |

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

-- If sync gets stuck
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';

-- Null FK before deleting a boarding (handled automatically in useBoardings.js)
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id = '<boarding-uuid>';
DELETE FROM boardings WHERE id = '<boarding-uuid>';

-- Integration check window query (what the check uses)
SELECT b.external_id, d.name, b.arrival_datetime, b.departure_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.arrival_datetime <= NOW() + INTERVAL '7 days'
  AND b.departure_datetime >= DATE_TRUNC('day', NOW()) - INTERVAL '7 days';
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, **v4.4.1 (latest)**

## Archive
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
- v4.1.1 session: `docs/archive/SESSION_HANDOFF_v4.1.1_final.md`
- v4.0 session: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 session: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 session: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
