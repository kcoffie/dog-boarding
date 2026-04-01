# Dog Boarding App — Session Handoff (v5.3.0 LIVE → v5.4.0 pending)
**Last updated:** April 1, 2026 (end of session — K-1b code merged, friday-pm triggered with clean wamid, awaiting Kate phone confirmation)

---

## Current State

- **v5.3.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **943 tests, 54 files, 0 failures**
- PR #150 merged — feat: Meta media upload in `sendRosterImage` (K-1b)
- PR #147 merged — fix: roster-image weekend query + 18 new tests (#148)

### WhatsApp verification status

| Job | Send function | Result |
|---|---|---|
| integration-check | `sendTextMessage` | ✅ delivered to Kate's phone (March 25) |
| cron-health-check | `sendTextMessage` | ✅ same code path |
| gmail-monitor | `sendTextMessage` | ✅ same code path |
| notify friday-pm | `sendRosterImage` | ⏳ wamid clean, **awaiting Kate phone confirm** |
| notify 4am/7am/830am | `sendRosterImage` | ⏳ same fix applied — will confirm on next scheduled run |

### K-1b status (April 1, 2026)

**Code: DONE. Phone confirmation: pending Kate.**

What was done this session:
- `metaMediaUpload(phoneNumberId, token, imageUrl)` added to `src/lib/notifyWhatsApp.js`
  - Fetches PNG buffer from image URL
  - POSTs `multipart/form-data` to `POST /v18.0/{PHONE_NUMBER_ID}/media`
  - Returns `media_id`; throws on failure (not swallowed)
- `sendRosterImage` now calls `metaMediaUpload` once before the per-recipient loop, uses `{ image: { id: mediaId } }` instead of `{ image: { link: url } }`
- 5 new tests: `{ id }` not `{ link }` assertion, upload failure throws, image fetch failure throws, upload-once-for-N-recipients, new URL-aware `makeImageFetchMock`
- PR #150 merged → deployed to Vercel
- `friday-pm` triggered manually: **HTTP 200, sentCount 1, failedCount 0, wamid: `wamid.HBgLMTgzMTI0NzczNzUVAgARGBJBRTRCRTZBMDBDRTBEMTk1REUA`**
- Kate left before confirming image on phone

**Next agent:** Do NOT re-trigger friday-pm. Wait for Kate to confirm image arrived, then proceed.

---

## IMMEDIATE NEXT (next session)

1. **Kate confirms** friday-pm roster image arrived on phone → K-1b DoD complete
2. **v5.4.0 release** — tag and GitHub release after phone confirmation
3. **M3-4 verify** — trigger 7am notify manually, confirm "as of" timestamp visible in image on phone
4. **M3-8** — README screenshots (boarding matrix + roster image with M3-4 timestamp). Unblocked now.
5. **M3-6** — Doc staleness CI check. Unblocked now.
6. **M3-7** — Screen recording. Blocked on K-1b phone confirm + M3-4 verified.

**M3 remaining (ordered):**

| # | Ticket | Gate |
|---|--------|------|
| K-1b phone confirm | Kate confirms image on phone | Blocks v5.4.0 release + M3-7 |
| M3-4 verify | Trigger 7am, confirm "as of" on phone | After K-1b confirmed |
| M3-8 | README screenshots | Unblocked |
| M3-6 | Doc staleness CI check | Unblocked |
| M3-7 | Screen recording | After K-1b + M3-4 verified |
| M3-10 | WhatsApp delivery receipts (Meta Webhooks) | Last — highest complexity |

---

## K-6 — Docs direct-push to main

Branch protection is active via GitHub rulesets — all pushes (including docs) require a PR. K-6 is the ticket to enable docs-only direct push to main. Until K-6 is done, doc updates need a PR like any other change.

---

## Architecture Reference

### Notify flow (updated for K-1b)
```
GitHub Actions (4 workflows: M-F 4am/7am/8:30am + Fri 3pm PDT)
  → GET /api/notify?window=4am|7am|830am|friday-pm
  → refreshDaytimeSchedule (src/lib/notifyHelpers.js) → getPictureOfDay → computeWorkerDiff
  → /api/roster-image?date=YYYY-MM-DD&token=...&ts=<jobRunAt ISO>
  → PNG buffer → POST /v18.0/{PHONE_NUMBER_ID}/media → media_id
  → Meta Cloud API template send: { image: { id: media_id } } → NOTIFY_RECIPIENTS
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
```

### Sync pipeline
```
cron-auth.js (00:00 UTC)    → authenticate + store session in sync_settings
cron-schedule.js (00:05)    → runScheduleSync() → scan 3 pages, enqueue boarding candidates
cron-detail.js (00:10)      → runDetailSync() × 1 item → fetch detail, map + save to DB
cron-detail-2.js (00:15)    → re-exports cron-detail (second Vercel path = double throughput)
```

### Template name config
```
notifyWhatsApp.js:28  ALERT_TEMPLATE  = process.env.META_ALERT_TEMPLATE  || 'dog_boarding_alert'
notifyWhatsApp.js:29  ROSTER_TEMPLATE = process.env.META_ROSTER_TEMPLATE || 'dog_boarding_roster'
```
`META_ROSTER_TEMPLATE=dog_boarding_roster_2` is set in Vercel (IMAGE header template).

### Key files
| File | Purpose |
|---|---|
| `src/lib/notifyWhatsApp.js` | Meta Cloud API wrapper — `metaMediaUpload` (new, K-1b), `sendRosterImage`, `sendTextMessage` |
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic (v4.5) |
| `scripts/integration-check.js` | Integration check script (GH Actions) |
| `src/lib/pictureOfDay.js` | getPictureOfDay, computeWorkerDiff, hashPicture |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf` (M3-4); `timingSafeEqual` auth (M3-5); weekend path fixed (#148) |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) |
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
| K-1b confirm | Confirm friday-pm roster image arrived on phone (already triggered — just look at WhatsApp) | v5.4.0 release; M3-7 | 🔴 High — first thing next session |
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
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0 **(latest — v5.4.0 pending K-1b phone confirm)**

## Archive
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
