# Dog Boarding App — Session Handoff (v4.4 in progress)
**Last updated:** March 17, 2026 (end of session)

---

## Current State

- **v4.3.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) — tagged, latest release
- **746 tests, 46 files, 0 failures**
- **Main branch clean** — all v4.3 PRs merged
- **PR #69 merged** — integration check daytime + Step 0 removal + ADD filter fix
- **feat/friday-pm-notify OPEN** — PR not yet created, branch pushed
- **Integration check LIVE** — runs 3×/day, now reports daytime count alongside boarding count

---

## IMMEDIATE NEXT

1. Merge PR for `feat/friday-pm-notify` (v4.4 Friday PM weekend notify) — in progress
2. Add Anthropic API credits so the Claude name-check step in the integration check activates (console.anthropic.com → Plans & Billing)

---

## What Was Done This Session

### PRs merged to main (all squash-merged)

| PR | Branch | What |
|---|---|---|
| #51 | `fix/goose-boarding-tests` | Extraction tests for Goose staff boarding case (OPEN — ready to merge) |
| #52 | `fix/delete-boarding-fk` | Delete boarding FK fix + integration check initial implementation |
| #53 | `fix/integration-check-skip-sync` | SKIP_SYNC flag — Step 0 disabled by default, workflow_dispatch input |
| #54 | `fix/integ-check-window-and-add-filter` | DB query window fix (midnight UTC lower bound) + `/\badd\b/i` case fix |
| #55 | `docs/integration-check-job-doc` | `docs/job_docs/integration-check.md` reference doc + handoff TODO |

### Delete boarding fix (`useBoardings.js`)
- `deleteBoarding`: nulls `sync_appointments.mapped_boarding_id` FK before DELETE → fixes 23503 error
- `deleteBoardingsForDog`: fetches boarding IDs first → nulls FKs via `.in()` → deletes

### Integration check (`scripts/integration-check.js`)
Live and passing. Runs 3×/day (1am, 9am, 5pm PDT) in GH Actions. Steps:
1. *(Step 0 — skipped, broken — see below)*
2. Load session cookies from `sync_settings`
3. Playwright renders AGYD schedule, extracts appointment IDs from DOM + screenshots
4. Claude vision reads screenshot → dog names (currently inactive — no API credits)
5. DB query: boardings overlapping midnight UTC today → today+7d
6. Compare: missing IDs, Unknown names, Claude name mismatches
7. WhatsApp to `INTEGRATION_CHECK_RECIPIENTS` (Kate only)

**First live run results (3/8 at 21:44 UTC):**
- Found 74 DOM links, 11 boarding candidates
- DB returned 15 boardings in window
- ✅ PASS — 0 issues

### Session archiving
- `docs/archive/SESSION_HANDOFF_v4.2_final.md` — created
- `docs/job_docs/integration-check.md` — new comprehensive reference doc

---

## v4.3 Open TODO

### Bugs
- [ ] **`cron-schedule.js` ADD filter case-sensitive** — `/\badd\b/` doesn't match uppercase `ADD`. Fixed in `integration-check.js` (PR #54) but `cron-schedule.js` has its own copy. Low priority — sync pipeline's post-filter catches these downstream anyway.

### Integration check — Step 0 sync (broken, needs fix)
`api/run-sync.js` calls `runSync()` from `sync.js`, which calls `fetchAllSchedulePages()` from `schedule.js`. That uses `DOMParser` — browser-only, unavailable in Vercel Node.js runtime. Vercel Hobby 10s timeout also too short for a full sync.

Fix options (documented in detail in `docs/job_docs/integration-check.md`):
- **Option A (recommended):** Have `api/run-sync.js` call the existing cron endpoints via HTTP using `CRON_SECRET` (already a Vercel env var). Call `cron-schedule` once to enqueue, then loop `cron-detail` until queue depth = 0.
- **Option B:** Remove Step 0 entirely — the check already verifies DB state vs live site. If the midnight cron is broken, missing boardings surface in Step 5 anyway.

### Integration check — Claude credits needed
Step 3 (name-check) is silently skipped because the Anthropic API key has no credits. Add credits at console.anthropic.com.

### Polish (low priority, carried from v4.1.2)
- [ ] Fix misleading "constant-time" comment in `roster-image.js` token check — use `crypto.timingSafeEqual` or remove the claim
- [ ] Rename `window` param in `shouldSendNotification` → `sendWindow` (shadows browser global)
- [ ] Pre-compile `attr()` regexes in `daytimeSchedule.js` — `new RegExp(name + ...)` inside hot loop, 1,400+ calls per parse run

### Post v4.3 backlog
- Second WhatsApp recipient (Kate to provide number — no code change, just Vercel `NOTIFY_RECIPIENTS`)
- Move off Twilio sandbox → production WhatsApp Business sender
- Friday afternoon weekend WhatsApp job (`notify-friday-pm.yml`)
- DST-aware cron scheduling (manual UTC update required each March/November)
- Group chat delivery
- Gmail monitoring agent — scans `notifications@github.com` from kcoffie/vercel[bot]; if not routine → WhatsApp Kate

---

## Architecture Reference

### Integration check flow
```
GitHub Actions (3×/day + on-demand, SKIP_SYNC=true)
  → [Step 0 disabled — see above]
  → Load session cookies from sync_settings (Supabase)
  → Playwright: render /schedule, screenshot + DOM link extraction
  → Claude vision: screenshot → dog names[] (needs API credits)
  → Supabase: boardings JOIN dogs WHERE departure >= midnight UTC AND arrival <= today+7d
  → compareResults: missing IDs, Unknown names, name mismatches
  → Twilio WhatsApp → INTEGRATION_CHECK_RECIPIENTS
```

### Notify flow (unchanged)
```
GitHub Actions (3 workflows, Mon-Fri) → GET /api/notify?window=4am|7am|8:30am
  → refreshDaytimeSchedule → getPictureOfDay → computeWorkerDiff
  → /api/roster-image → PNG → Twilio WhatsApp → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change)
```

### Key files
| File | Purpose |
|---|---|
| `scripts/integration-check.js` | Integration check script (GH Actions) |
| `api/run-sync.js` | On-demand sync endpoint (Step 0 — currently broken) |
| `.github/workflows/integration-check.yml` | 3×/day + on-demand, SKIP_SYNC env var |
| `docs/job_docs/integration-check.md` | Full reference doc for the integration check |
| `src/hooks/useBoardings.js` | DELETE boarding with FK null pre-step (fixed this session) |
| `src/lib/pictureOfDay.js` | getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint |
| `api/notify.js` | Notify orchestrator |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper |
| `src/lib/scraper/sync.js` | runSync, 6-layer filter |
| `src/lib/scraper/extraction.js` | parseAppointmentPage |

### GitHub Actions repo secrets (all must be Repository secrets, NOT environment secrets)
| Secret | Status |
|---|---|
| `VITE_SUPABASE_URL` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `ANTHROPIC_API_KEY` | ✅ Set (no credits) |
| `TWILIO_ACCOUNT_SID` | ✅ Set |
| `TWILIO_AUTH_TOKEN` | ✅ Set |
| `TWILIO_FROM_NUMBER` | ✅ Set |
| `INTEGRATION_CHECK_RECIPIENTS` | ✅ Set (Kate's number) |
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

-- Null FK before deleting a boarding (now handled automatically in useBoardings.js)
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id = '<boarding-uuid>';
DELETE FROM boardings WHERE id = '<boarding-uuid>';

-- Integration check window query (what the check uses)
SELECT b.external_id, d.name, b.arrival_datetime, b.departure_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.arrival_datetime <= NOW() + INTERVAL '7 days'
  AND b.departure_datetime >= DATE_TRUNC('day', NOW());
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, **v4.2 (latest)**
- Note: no v4.3 release yet — PRs #52-55 are incremental fixes, not a versioned feature release

## Archive
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
- v4.1.1 session: `docs/archive/SESSION_HANDOFF_v4.1.1_final.md`
- v4.0 session: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 session: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 session: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
