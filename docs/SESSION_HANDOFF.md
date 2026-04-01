# Dog Boarding App — Session Handoff (v5.3.0 LIVE)
**Last updated:** April 1, 2026 (end of session — roster-image fixed, Meta URL fetch failure diagnosed, media upload fix needed)

---

## Current State

- **v5.3.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app) — latest release
- **941 tests, 54 files, 0 failures**
- PR #147 merged — fix: roster-image weekend query + 18 new tests (#148)
- PR #146 merged — chore: bump dev group (anthropic-sdk, vitest + 2 others)
- PR #143 merged — docs: CHANGELOG.md (M3-9)
- PR #140 merged — feat: DST-aware scheduling + code polish (M3-5)
- PR #137 merged — feat: add "as of" timestamp to roster image (M3-4)

### WhatsApp verification status

| Job | Send function | Result |
|---|---|---|
| integration-check | `sendTextMessage` | ✅ delivered to Kate's phone (March 25) |
| cron-health-check | `sendTextMessage` | ✅ same code path |
| gmail-monitor | `sendTextMessage` | ✅ same code path |
| notify 4am/7am/830am | `sendRosterImage` | ❌ failing — see K-1b below |
| notify friday-pm | `sendRosterImage` | ❌ wamid returned but image never arrives — see K-1b below |

### K-1 deep-dive (April 1, 2026)

Everything that has been completed:
- `dog_boarding_roster_2` template approved by Meta ✅
- `META_ROSTER_TEMPLATE=dog_boarding_roster_2` set in Vercel ✅
- `api/roster-image?type=weekend` 500 fixed (PR #147 — `client_name` column bug) ✅
- friday-pm triggered post-fix → wamid returned, image URL returns 200 PNG ✅

**Still broken:** Image never arrives on phone despite valid wamid.

**Root cause (confirmed):** Meta accepts the template message and returns a wamid, but silently fails to deliver when it cannot successfully fetch the image URL from our Vercel endpoint. This is a known Meta behavior — they accept the API request before fetching the media, and without delivery webhooks (M3-10) we get no failure signal.

Evidence:
- Direct requests to image URL: `200 image/png 22877 bytes` ✓
- No redirects, clean HTTP/2 ✓
- Two separate triggers, both got wamid, neither delivered ✓
- `sendTextMessage` (no image) delivers fine ✓ — confirms the number/account is healthy

**Fix (K-1b, next session):** Switch from URL-based image delivery to **Meta media upload**. Fetch the PNG from our endpoint, upload it to Meta's media API (`POST /v18.0/{PHONE_NUMBER_ID}/media`), get a `media_id`, then send the template with `{ "image": { "id": "media_id" } }` instead of `{ "image": { "link": url } }`. This eliminates the Meta→Vercel fetch dependency entirely.

Affects: `src/lib/notifyWhatsApp.js` → `sendRosterImage()`. Both the friday-pm path and the daily 4am/7am/8:30am paths use this function.

**Note on daily notify (4am/7am/8:30am):** The 8am cron_health row shows error 132012 "expected TEXT, received IMAGE" — this ran on an old Lambda instance before `META_ROSTER_TEMPLATE` env var took effect (defaulted to old `dog_boarding_roster` template which had TEXT header). After PR #147 redeploy, those windows will use `dog_boarding_roster_2` (IMAGE header) — but they'll also hit the same Meta URL fetch failure. K-1b fixes all paths at once.

---

## IMMEDIATE NEXT (next session)

1. **K-1b** — Implement Meta media upload in `sendRosterImage()`. See spec below.
2. **Verify friday-pm end-to-end** — after K-1b deployed, trigger friday-pm and confirm image on phone.
3. **Verify M3-4** — trigger 7am and confirm "as of" timestamp visible in roster image on phone.
4. **M3-8** — README screenshots. Unblocked — can start any time.
5. **M3-6** — Doc staleness CI check. Unblocked — can start any time.
6. **M3-7** — Screen recording. Blocked on K-1b + M3-4 verified.

**M3 remaining (ordered):**

| # | Ticket | Gate |
|---|--------|------|
| K-1b | Meta media upload in `sendRosterImage` | Next — blocks everything below |
| M3-8 | README screenshots (boarding matrix + roster image with M3-4 timestamp) | Unblocked |
| M3-6 | Doc staleness CI check (non-blocking PR warning) | Unblocked |
| M3-7 | Screen recording — WhatsApp roster image arriving on phone | After K-1b + M3-4 verified |
| M3-10 | WhatsApp delivery receipts (Meta Webhooks) | Last — highest complexity |

---

## K-1b Spec — Meta Media Upload

**File:** `src/lib/notifyWhatsApp.js`

**Current behavior:** `sendRosterImage(imageUrl, recipients)` passes the URL directly to Meta:
```javascript
{ type: 'header', parameters: [{ type: 'image', image: { link: imageUrl } }] }
```
Meta must then fetch the URL itself — this is failing silently.

**New behavior:** Before sending the template, fetch the image and upload it to Meta:
```
1. GET imageUrl → PNG buffer
2. POST /v18.0/{PHONE_NUMBER_ID}/media
     Content-Type: multipart/form-data
     Body: { messaging_product: 'whatsapp', file: <png buffer>, type: 'image/png' }
   → returns { id: 'MEDIA_ID' }
3. Send template with { type: 'image', image: { id: 'MEDIA_ID' } }
```

**New signature:** `sendRosterImage(imageUrl, recipients)` — same external interface, media upload is internal.

**Observability:** Log the media_id at upload time. Log "using media_id: X" before each send. On media upload failure, throw with full context so the caller can handle.

**Tests to write:**
- Mock the fetch + Meta media upload call; assert template is sent with `{ id }` not `{ link }`
- Assert media upload failure surfaces as a thrown error (not silent)
- Assert media_id is logged

**DoD:**
- [ ] `sendRosterImage` uploads PNG to Meta media API before sending template
- [ ] Template payload uses `{ image: { id } }` not `{ image: { link } }`
- [ ] Unit tests pass (mock fetch + mock Meta media API)
- [ ] All 941 tests still pass
- [ ] Deployed to Vercel
- [ ] friday-pm triggered manually → wamid returned → roster image arrives on Kate's phone

---

## This Session — What Was Done

- **K-6 resolved:** Branch protection is absent on main — Kate authorized direct push to main for docs-only changes. No formal branch protection needed.
- **K-1 progress:** `dog_boarding_roster_2` approved. Env var set. Roster-image 500 fixed (PR #147). Deep investigation confirmed Meta URL fetch failure as root cause of non-delivery. K-1b spec written.
- **Bug #148 found + fixed (PR #147):** `getWeekendBoardings` selected `client_name` from `boardings` (column doesn't exist) → 500 on every weekend image request. Fixed + 18 new tests added for entire untested weekend path.
- **Docs-to-main workflow enabled:** Kate authorized direct-to-main for doc commits; no PR needed.

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
  → PNG → [K-1b: upload to Meta media API → media_id] → Meta Cloud API → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
```

### Template name config
```
notifyWhatsApp.js:28  ALERT_TEMPLATE  = process.env.META_ALERT_TEMPLATE  || 'dog_boarding_alert'
notifyWhatsApp.js:29  ROSTER_TEMPLATE = process.env.META_ROSTER_TEMPLATE || 'dog_boarding_roster'
```
Override via Vercel env var only. `META_ROSTER_TEMPLATE=dog_boarding_roster_2` is set in Vercel.

### Key files
| File | Purpose |
|---|---|
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic (v4.5) |
| `scripts/integration-check.js` | Integration check script (GH Actions) |
| `src/lib/pictureOfDay.js` | getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf` (M3-4); `timingSafeEqual` auth (M3-5); weekend path fixed (#148) |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) |
| `src/lib/notifyWhatsApp.js` | Meta Cloud API wrapper (`sendRosterImage` ← needs K-1b media upload, `sendTextMessage`) |
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
| `META_ROSTER_TEMPLATE` | `dog_boarding_roster_2` |
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

## Pending Kate Actions

| # | Action | Blocks | Priority |
|---|--------|--------|----------|
| K-1b | After K-1b code is built + deployed: trigger friday-pm manually and confirm image on phone | M3-7; all image notify paths | 🔴 High |
| K-2 | Backfill Maverick: `UPDATE boardings SET cancelled_at = NOW(), cancellation_reason = 'appointment_archived' WHERE external_id = 'C63QgVl9';` | Data integrity | 🟡 Medium |
| K-3 | Investigate Tula N/C 3/23-26 (C63Qga3r) — real boarding or no-charge non-boarding? | Integration check accuracy | 🟡 Medium |
| K-4 | Provide second WhatsApp recipient → add to `NOTIFY_RECIPIENTS` secret (comma-separated E.164) | M0-3 full verification | 🟡 Medium |
| K-5 | Add Anthropic API credits at console.anthropic.com | Step 3 vision name-check | 🟢 Low |

---

## Future Backlog (post-M3)

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| #145 | **Tooling upgrade** — eslint 9→10 + @vitejs/plugin-react 5→6 | Low | Dev tooling only |
| F-1 | **Message delivery observability** — Meta Webhooks + wamid storage, no alert layer | Medium | Lighter version of M3-10 |
| F-2 | **Message log page** — store every outbound message, new app page | High | Table + 7 write sites + UI |

---

## Carry-Forward (low priority)

- `cron-schedule.js` ADD filter case-sensitive — `/\badd\b/` doesn't match uppercase `ADD`. Low priority.
- Claude credits for integration check name-check — Step 3 silently skipped.
- Store datetimes in PST instead of UTC — tech debt, no user impact yet.

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
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0 **(latest)**

## Archive
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
