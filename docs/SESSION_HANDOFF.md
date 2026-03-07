# Dog Boarding App — Session Handoff (v4.1.2 in PR, v4.2 next)
**Last updated:** March 7, 2026 (end of session — v4.1.2 fully implemented, PR #48 open)

---

## Current State

- **v4.1.1 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **PR #48 open** — `fix/v4.1.2-polish` — all 6 v4.1.2 tasks complete, CI pending
- **741 tests, 46 files, 0 failures** (was 738 before this session — 3 new Monday tests added)
- **NOTIFY_RECIPIENTS** has 1 number — second number still pending (Kate to provide)
- **Main branch clean** — no uncommitted changes on main

---

## IMMEDIATE NEXT: Merge PR #48 + Tag v4.1.2

1. Let CI pass on PR #48
2. Merge PR #48 via GitHub (squash merge)
3. Reset local main: `git reset --hard origin/main`
4. Tag GitHub Release `v4.1.2`:

```bash
cat > /tmp/release-v412.md << 'EOF'
## v4.1.2 — Monday Roster, Blank-Image Guard, Shared Utils

### Changes
- **Monday clean roster** — no +/- diff markers or UPDATED! badge on Mondays (no weekend baseline)
- **Blank image guard** — notify skips send when 0 workers returned (prevents header-only image)
- **Shared `decodeEntities`** — extracted to `src/lib/htmlUtils.js`; local copies removed
- **Worker source of truth** — `src/lib/workers.js` owns WORKERS/WORKER_ORDER/KNOWN_WORKERS
- **HTML preview log** — 0-events + large HTML now logs first 150 chars for redirect detection
- **Per-worker diff log** — computeWorkerDiff logs series counts + added/removed before returning
EOF
/usr/local/bin/gh release create v4.1.2 --title "v4.1.2 - Monday Roster Polish" --notes-file /tmp/release-v412.md --latest
```

5. Archive this handoff: `cp docs/SESSION_HANDOFF.md docs/archive/SESSION_HANDOFF_v4.1.2_final.md`

---

## What Was Done This Session (v4.1.2)

### All 6 tasks shipped in PR #48 (`fix/v4.1.2-polish`)

| Task | Status | Key detail |
|---|---|---|
| Monday clean roster | Done | `skipDiff` param in `computeWorkerDiff`; `hasUpdates` forced false |
| Blank image guard | Done | Early return in `notify.js` when `data.workers.length === 0` |
| Extract `decodeEntities` | Done | `src/lib/htmlUtils.js` — null-safe; both callers updated |
| Worker source of truth | Done | `src/lib/workers.js` — WORKERS, WORKER_ORDER, KNOWN_WORKERS |
| HTML preview log | Done | One line in `refreshDaytimeSchedule` 0-events block |
| Per-worker diff log | Done | Added before `return deduped` in normal path |

**CRITICAL gotcha (documented in code):** Never implement Monday skipDiff by passing empty `yestAppts`. An empty `yestSeries` causes every dog with a `series_id` to show `isAdded: true`. The `skipDiff = true` flag is the correct approach.

### Test additions
- `buildSupaMock` now accepts `yestDateStr` param (was hardcoded to `YEST = '2026-03-04'`)
- 3 new Monday tests: all-unchanged, hasUpdates=false, Tuesday control shows isAdded=true

### Lower-priority items NOT done (carry to v4.2 or later)
- **Fix misleading "constant-time" comment** in `roster-image.js` token check — use `crypto.timingSafeEqual` or remove the claim
- **Rename `window` param** in `shouldSendNotification` → `sendWindow` (shadows browser global)
- **Pre-compile `attr()` regexes** in `daytimeSchedule.js` — `new RegExp(name + ...)` inside hot loop, called 1,400+ times per parse run

---

## v4.2 Backlog

1. **Second WhatsApp recipient** — Kate to provide number; add to Vercel `NOTIFY_RECIPIENTS` as `+18312477375,+1XXXXXXXXXX`. No code change needed.
2. **Production WhatsApp sender** — move off Twilio sandbox to registered WhatsApp Business number. Eliminates the "text sandbox within 24hrs" requirement.
3. **DST-aware cron scheduling** — currently must manually update UTC cron times each March/November DST transition.
4. **Group chat delivery** — send to a WhatsApp group instead of individual numbers.

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
| `src/lib/workers.js` | **NEW v4.1.2** — single source of truth for WORKERS/WORKER_ORDER/KNOWN_WORKERS |
| `src/lib/htmlUtils.js` | **NEW v4.1.2** — shared decodeEntities (null-safe) |
| `api/roster-image.js` | Token-gated PNG endpoint (satori + resvg) |
| `api/notify.js` | Orchestrator: window gate, 0-workers guard, refresh, send, hash |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper |
| `src/lib/scraper/daytimeSchedule.js` | DC/PG/Boarding schedule parse + upsert |
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

-- Null FK before deleting a boarding
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id = (SELECT id FROM boardings WHERE external_id = 'REPLACE_ME');
DELETE FROM boardings WHERE external_id = 'REPLACE_ME';
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, **v4.1.2 (pending PR #48 merge)**
- v4.2.0 will be next after v4.1.2

## Archive
- v4.1.1 session: `docs/archive/SESSION_HANDOFF_v4.1.1_final.md`
- v4.0 session: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 session: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 session: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
