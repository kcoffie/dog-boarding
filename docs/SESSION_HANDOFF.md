# Dog Boarding App — Session Handoff (v4.4 + hotfix)
**Last updated:** March 18, 2026 (mid-session)

---

## Current State

- **v4.4.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) — tagged, latest release
- **746 tests, 46 files, 0 failures**
- **Main branch clean** — all PRs merged (latest: #79)
- **Integration check LIVE** — runs 3×/day, exits 0 (always green in Actions), dog names in alerts, 7-day DB window
- **Daytime refresh bug fixed (PR #75)** — `refreshDaytimeSchedule` was silently failing since March 16; see below
- **Dev dependencies bumped (PR #79)** — 6 packages updated, Dependabot PRs #59 and #63 resolved

---

## IMMEDIATE NEXT

1. ~~Trigger notify-4am workflow_dispatch to verify daytime refresh now works~~ ✅ Done — 198 rows upserted, all 13 dogs now in DB
2. ~~Run integration check manually~~ ✅ Done — 2 false positives (Tula, Lucy — canceled boarding requests, documented as known FP #6)
3. Add Anthropic API credits so the Claude name-check step in the integration check activates (console.anthropic.com → Plans & Billing)
4. Investigate 3 real missing boardings from integration check run (3/18): C63QgY32, C63QgYI8 ("3/16-19"), C63QgY4c ("3/17-19") — why didn't nightly cron pick these up?
5. "As of" timestamp in roster image — show date after time (e.g. `as of 6:04 PM, Mon 3/16`) so staleness is immediately obvious (backlog)

---

## What Was Done This Session

### PRs merged to main (all squash-merged)

| PR | Branch | What |
|---|---|---|
| #71 | `feat/friday-pm-notify` | Friday PM weekend boarding notify — workflow, endpoint, weekend image |
| #73 | `fix/integ-check-dog-name-exit-window` | Integration check: dog name in alerts, exit 0, 7-day DB window |
| #75 | `fix/notify-refresh-response-text` | Fix daytime refresh silent failure + WhatsApp alerts on refresh errors |
| #76 | `docs/integ-check-canceled-false-positive` | Document canceled booking requests as known integration check FP #6 |
| #79 | `chore/dev-deps-march-18` | Bump 6 dev dependencies (Dependabot PRs #59/#63 resolved) |

### Friday PM weekend notify (`api/notify.js`, `notify-friday-pm.yml`)
- New `window=friday-pm` path in `notify.js` — generates a weekend-themed PNG (arrivals + departures Sat–Sun) and always sends
- New workflow `notify-friday-pm.yml` — fires Fridays at 3pm PDT (22:00 UTC)
- Weekend image: forest green header with date range, "Arriving this weekend" + "Departing this weekend" sections, dog name · client last name · day+time · night count

### Integration check fixes (PR #73)
- **Dog name in alerts** — Playwright DOM step now extracts `.event-pet` text; issue messages read `Buddy — 3/16-19 (C63QgY32)` instead of just ID + raw title
- **Always exit 0** — job ran + delivered report = success; data issues are content of the report, not a job failure (GH Actions now shows ✅ green always)
- **7-day DB window** — boarding query lower bound extended from midnight today → 7 days ago; eliminates false positives for past-departed boardings still visible on the schedule page

### Daytime refresh silent failure fix (PR #75)
- **Root cause:** `refreshDaytimeSchedule` in `api/notify.js` was doing `html = await authenticatedFetch(url)` — assigning the `Response` object directly to `html` instead of calling `.text()`. `html.length` was `undefined`, parser got garbage, 0 events returned. The bug was completely silent: `refreshed=true, rowCount=0` logged with no error.
- **Impact:** Daytime appointments had not refreshed since the midnight cron on March 16. All notify runs (4am/7am/8:30am) on 3/17 and 3/18 were sending the roster from 2-day-old data. The integration check caught 13 dogs missing from DB.
- **Fix:** `const response = await authenticatedFetch(url); html = await response.text();` — matches every other caller in the codebase.
- **Added WhatsApp alerts** for all refresh failure paths: no session, session expired, fetch error, 0 events parsed, unexpected error. Previously these all silently fell through to stale DB data with a Vercel log that expires in 1 hour.
- **Backlog (separate ticket):** "as of" timestamp in roster image — show date after time (e.g. `as of 6:04 PM, Mon 3/16`) so staleness is immediately obvious to workers receiving the image.

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
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, **v4.4.0 (latest)**

## Archive
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
- v4.1.1 session: `docs/archive/SESSION_HANDOFF_v4.1.1_final.md`
- v4.0 session: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 session: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 session: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
