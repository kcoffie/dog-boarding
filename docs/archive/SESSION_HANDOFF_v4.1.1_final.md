# Dog Boarding App — Session Handoff (v4.1.1 live; wrapping up)
**Last updated:** March 7, 2026 (end of v4.1.1 session — 2 PRs left to merge, then ready for v4.2)

---

## Current State

- **v4.1.1 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) ✅
- **v4.1.1 GitHub Release** tagged as latest ✅ (v4.1.0 demoted to `--latest=false`) ✅
- **Migration 019** (`updated_at` on `daytime_appointments`) — applied to production ✅
- **738 tests, 46 files, 0 failures** ✅
- **Local branch:** `fix/notify-weekdays-only` — needs reset to main after merging open PRs

---

## IMMEDIATE NEXT ACTIONS (in order)

### 1. Merge PR #46 — README update
```
https://github.com/kcoffie/dog-boarding/pull/46
```
Branch: `docs/update-readme-v4.1.1` — docs-only, no code risk.

### 2. Merge PR #47 — Notify weekdays only
```
https://github.com/kcoffie/dog-boarding/pull/47
```
Branch: `fix/notify-weekdays-only` — changes `* * *` → `* * 1-5` in all 3 notify workflows.

### 3. Add second WhatsApp recipient
In **Vercel → qboarding → Settings → Environment Variables**, update `NOTIFY_RECIPIENTS`:
```
+18312477375,+1XXXXXXXXXX
```
Kate had not yet provided the second number at end of session — ask her.
No code change needed; `notifyWhatsApp.js` already splits on commas.

### 4. Reset local main
```bash
git checkout main && git fetch origin && git reset --hard origin/main
```

### 5. Archive this SESSION_HANDOFF
```bash
cp docs/SESSION_HANDOFF.md docs/archive/SESSION_HANDOFF_v4.1.1_final.md
```
Then reset this file for v4.2 planning.

---

## What Was Done This Session (March 6–7, 2026)

### Bug fixes shipped (PR #45, merged)
1. **Migration 019** — added `updated_at TIMESTAMPTZ` column + `set_updated_at()` trigger to `daytime_appointments`. Required for "as of" timestamp in roster image header. Without it, `pictureOfDay.js` threw a 500 on every request.
2. **Duplicate dog names fix** — `computeWorkerDiff` in `pictureOfDay.js` now deduplicates by canonical `pet_names` key before returning. Same dog with multiple appointment slots (e.g., morning + afternoon DC) appeared twice in the worker column. Fix: post-diff dedup with priority `added > removed > unchanged`.

### Housekeeping shipped
- PR #43 (v4.1.1 main features) was already merged. PR #45 was the post-merge bug fix branch.
- README updated for v4.1 and v4.1.1 (PR #46, pending merge)
- `.obsidian/` added to `.gitignore`
- `NOTES.md` confirmed as personal testing file at project root (gitignored)
- GitHub Contributors mystery solved: it's just `github-actions[bot]` — expected for any repo with CI, no action needed

### PRs in this session
| PR | Branch | Status |
|---|---|---|
| #43 | `fix/v4.1.1-image-polish` (original) | Merged to main ✅ |
| #44 | `fix/v4.1.1-image-polish` | Closed (conflicting branch, replaced by #45) |
| #45 | `fix/v4.1.1-post-merge` | Merged to main ✅ |
| #46 | `docs/update-readme-v4.1.1` | **Open — merge next** |
| #47 | `fix/notify-weekdays-only` | **Open — merge next** |

---

## v4.2 Backlog (next feature)

Priorities discussed (in rough order):
1. **Second WhatsApp recipient** — add number to `NOTIFY_RECIPIENTS` in Vercel (Vercel env var only, no code change)
2. **Weekdays-only notify** — done (PR #47, pending merge)
3. **Production WhatsApp sender** — move from Twilio sandbox to registered WhatsApp Business number
4. **DST-aware cron scheduling** — or a single cron that checks wall-clock time and picks its own window
5. **Group chat delivery** — send to a WhatsApp group instead of individual numbers

---

## v4.1.1 — What Was Shipped

### PR #43 (main features)
- AGYD brand colors: forest green header (`#4A773C`), sage green worker names (`#78A354`)
- Live schedule refresh in `notify.js` before building image (`refreshDaytimeSchedule`)
- "As of H:MM AM" timestamp in image header (`max(updated_at)` from `daytime_appointments`)
- HTML entity decode for dog/client names in image
- Remove boarders section from roster image
- `formatTime` timezone fix (`America/Los_Angeles` explicit)
- SESSION_EXPIRED clearing in `refreshDaytimeSchedule`

### PR #45 (post-merge bug fixes)
- Migration 019: `updated_at` column on `daytime_appointments`
- `computeWorkerDiff` dedup: same dog with multiple slots → one entry per worker column

### PR #42 (DST cron shift, same release window)
- GitHub Actions notify crons shifted from PST to PDT schedules (UTC-7)

---

## Architecture Reference

### Notify flow
```
GitHub Actions (3 workflows, Mon–Fri) → GET /api/notify?window=4am|7am|8:30am
  → refreshDaytimeSchedule (live schedule fetch + upsert)
  → getPictureOfDay (DB query: today + yesterday DC/PG, workers, boarders)
  → computeWorkerDiff per worker (series_id set-diff + pet_names dedup)
  → /api/roster-image → PNG (satori + resvg)
  → Twilio WhatsApp → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change)
```

### Key files
| File | Purpose |
|---|---|
| `src/lib/pictureOfDay.js` | Data layer: getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint (satori + resvg) |
| `api/notify.js` | Orchestrator: window gate, refresh, send, hash |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper |
| `src/lib/scraper/daytimeSchedule.js` | DC/PG/Boarding schedule parse + upsert |
| `.github/workflows/notify-*.yml` | GitHub Actions schedulers (Mon–Fri after PR #47) |

### Env vars (all set in Vercel + GitHub Actions)
| Var | Where |
|---|---|
| `TWILIO_ACCOUNT_SID` | Vercel |
| `TWILIO_AUTH_TOKEN` | Vercel |
| `TWILIO_FROM_NUMBER` | Vercel |
| `NOTIFY_RECIPIENTS` | Vercel (comma-separated — **add second number**) |
| `VITE_SYNC_PROXY_TOKEN` | Vercel + GitHub Actions secret |
| `APP_URL` | GitHub Actions secret |

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
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, **v4.1.1 (Latest)**

## Archive
- v4.0 full session log: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 full session log: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 full session log: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
