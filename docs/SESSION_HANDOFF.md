# Dog Boarding App — Session Handoff (v4.2 live)
**Last updated:** March 8, 2026 (end of session — v4.2 shipped, Goose boarding fixed)

---

## Current State

- **v4.2 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **743 tests, 46 files, 0 failures** (3 new extraction tests added this session)
- **NOTIFY_RECIPIENTS** has 1 number — second number still pending (Kate to provide)
- **Main branch clean**
- **Local branch `fix/goose-boarding-tests`** — extraction test commit exists locally, not yet pushed or PRed

---

## IMMEDIATE NEXT

1. Push and PR the goose extraction test:
   ```bash
   git checkout fix/goose-boarding-tests
   git push -u origin fix/goose-boarding-tests
   # then create PR
   ```
2. Archive this handoff: `cp docs/SESSION_HANDOFF.md docs/archive/SESSION_HANDOFF_v4.2_final.md`
   (Also archive the v4.1.2 one that was never archived: `cp docs/archive/SESSION_HANDOFF_v4.1.2_final.md` — if it exists)

---

## What Was Done This Session (v4.2)

### Staff dog boarding sync — Goose (PR #49, merged)

Three bugs fixed in `sync.js` and `extraction.js`:

| Bug | Root cause | Fix |
|---|---|---|
| Staff boarding filtered out | `hasStaffService` check blocked all "Staff Boarding (nights)" appts | Removed filter — staff dogs are real boardings |
| Dog name "Unknown" | No `.event-pet` on schedule page → `appt.petName = ''` → null fallback | Added `nameFromTitle`: strip date from schedule title ("Goose 3/7-8(Sun)" → "Goose") |
| Midnight dates | Title parsed to midnight; cross-validation (20-day threshold) didn't override same-month titles | Changed: always prefer system timestamps when `tsReasonable` — they have actual time-of-day precision |

**Confirmed working via Supabase:**
```sql
SELECT d.name, b.arrival_datetime, b.departure_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.external_id = 'C63QgTXx';
-- → Goose | 2026-03-07 17:15:00+00 | 2026-03-08 23:00:00+00  ✓
```

### Extraction test added (local, not yet PRed)
- `fix/goose-boarding-tests` branch — adds 3 tests to `extraction.test.js`:
  1. Renamed existing misleading test: "falls back to title dates when system timestamps are unreasonably far in future"
  2. Kept existing stale-month test (20-day gap → timestamps)
  3. **NEW — Goose case**: `"Goose 3/7-8(Sun)"` title with real timestamps → expects `2026-03-07T17:15:00.000Z` (not midnight)

### GitHub Releases
- **v4.1.2** — tagged (Monday roster polish, PR #48)
- **v4.2** — tagged (staff dog boarding sync fix, PR #49)

---

## Full TODO List

### Bugs
- [ ] **Delete boarding button broken** — `23503` FK constraint: `sync_appointments.mapped_boarding_id` must be NULLed before DELETE. Fix in `useBoardings.js` delete path. SQL workaround already in Useful SQL section below.
- [ ] **`cron-schedule.js` ADD filter is case-sensitive** — `/\badd\b/` doesn't match uppercase `ADD` titles (e.g. "ADD Leo T/TH"). Same bug fixed in `integration-check.js` (PR #54) but `cron-schedule.js` has its own copy. Low priority — sync pipeline's post-filter catches these downstream anyway.

### Polish / Low-priority (carried from v4.1.2)
- [ ] Fix misleading "constant-time" comment in `roster-image.js` token check — use `crypto.timingSafeEqual` or remove the claim
- [ ] Rename `window` param in `shouldSendNotification` → `sendWindow` (shadows browser global)
- [ ] Pre-compile `attr()` regexes in `daytimeSchedule.js` — `new RegExp(name + ...)` inside hot loop, called 1,400+ times per parse run

### v4.3 Features
- [ ] **Second WhatsApp recipient** — Kate to provide number; add to Vercel `NOTIFY_RECIPIENTS` as `+18312477375,+1XXXXXXXXXX`. No code change needed.
- [ ] **Production WhatsApp sender** — move off Twilio sandbox to registered WhatsApp Business number. Eliminates the "text sandbox within 24hrs" requirement.
- [ ] **Friday afternoon weekend WhatsApp job** — new GitHub Actions workflow (e.g. `notify-friday-pm.yml`), `window=friday-pm` param, sends Sat–Sun boarding preview. Reuses `api/notify` or gets its own endpoint.
- [ ] **DST-aware cron scheduling** — currently must manually update UTC cron times each March/November DST transition.
- [ ] **Group chat delivery** — send to a WhatsApp group instead of individual numbers.

### v4.4 Feature: Integration smoke test job
- [ ] Runs a sync → scrapes live AGYD schedule → reads DB → compares: do they match?
- [ ] Sends WhatsApp to Kate with pass/fail + any mismatches (Unknown dogs, date discrepancies)
- [ ] Key checks: dog names match, dates match, no "Unknown" dogs for known appointments
- [ ] Can run on-demand or scheduled (e.g. daily after midnight cron)

---

## Architecture Reference

### Notify flow
```
GitHub Actions (3 workflows, Mon-Fri) -> GET /api/notify?window=4am|7am|8:30am
  -> refreshDaytimeSchedule (live schedule fetch + upsert)
  -> getPictureOfDay (DB query: today + yesterday DC/PG, workers, boarders)
  -> computeWorkerDiff per worker (series_id set-diff + pet_names dedup)
     [Monday: skipDiff=true — all dogs unchanged, hasUpdates forced false]
  -> /api/roster-image -> PNG (satori + resvg)
  -> Twilio WhatsApp -> NOTIFY_RECIPIENTS
  -> hash stored in cron_health (7am/8:30am skip if no change)
```

### Key files
| File | Purpose |
|---|---|
| `src/lib/pictureOfDay.js` | Data layer: getPictureOfDay, computeWorkerDiff (skipDiff), hashPicture |
| `src/lib/workers.js` | Single source of truth for WORKERS/WORKER_ORDER/KNOWN_WORKERS |
| `src/lib/htmlUtils.js` | Shared decodeEntities (null-safe) |
| `api/roster-image.js` | Token-gated PNG endpoint (satori + resvg) |
| `api/notify.js` | Orchestrator: window gate, 0-workers guard, refresh, send, hash |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper |
| `src/lib/scraper/daytimeSchedule.js` | DC/PG/Boarding schedule parse + upsert |
| `src/lib/scraper/sync.js` | runSync, 6-layer filter, nameFromTitle fallback |
| `src/lib/scraper/extraction.js` | parseAppointmentPage — timestamps always preferred over midnight title dates |
| `.github/workflows/notify-*.yml` | GitHub Actions schedulers (Mon-Fri) |

### Env vars
| Var | Where |
|---|---|
| `TWILIO_ACCOUNT_SID` | Vercel |
| `TWILIO_AUTH_TOKEN` | Vercel |
| `TWILIO_FROM_NUMBER` | Vercel |
| `NOTIFY_RECIPIENTS` | Vercel (comma-separated — add second number when Kate provides it) |
| `VITE_SYNC_PROXY_TOKEN` | Vercel + GitHub Actions Repository secrets |
| `APP_URL` | GitHub Actions Repository secrets ONLY (not environment secrets) |

### GitHub Actions secrets — critical gotcha
Secrets must be **Repository secrets**: Settings -> Secrets and variables -> Actions -> "Repository secrets" tab.
Previously set only as Environment secrets (under "Production" environment). Workflows don't declare `environment:` so they got null values -> curl exit code 3 -> workflow failure.

### DB tables (daytime)
- `daytime_appointments` — `external_id, series_id, appointment_date, worker_external_id, pet_names[], service_category, updated_at, synced_at, ...`
- `workers` — `external_id, name, active`
- `cron_health` — notify hash stored under `cron_name='notify'`

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

-- Last time daytime data was refreshed
SELECT MAX(updated_at) FROM daytime_appointments WHERE appointment_date = CURRENT_DATE;

-- If sync gets stuck
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';

-- Null FK before deleting a boarding (workaround for delete button bug)
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id = '<boarding-uuid>';
DELETE FROM boardings WHERE id = '<boarding-uuid>';

-- Verify staff dog boarding (Goose)
SELECT d.name, d.external_id, b.arrival_datetime, b.departure_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.external_id = 'C63QgTXx';
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, **v4.2 (latest)**

## Archive
- v4.1.2 session: `docs/archive/SESSION_HANDOFF_v4.1.2_final.md` (archive pending)
- v4.1.1 session: `docs/archive/SESSION_HANDOFF_v4.1.1_final.md`
- v4.0 session: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 session: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 session: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
