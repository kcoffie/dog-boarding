# Dog Boarding App — Session Handoff (v5.5.0 LIVE)
**Last updated:** April 23, 2026 (session 16) — F-2 fully verified live. v5.5.0 released.

---

## Current State

- **v5.5.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **999 tests, 57 files, 0 failures**
- **main clean at `a655810`**

### Recent merges (newest first)
| PR | What |
|---|---|
| #182 merged Apr 23 | feat: F-2 message log — record all WhatsApp sends + /messages page |
| #178 merged Apr 21 | fix: integration check false positive — Daycare Add-On Day bare-date titles |
| #167 merged Apr 5 | I-1: integration check smart-send — run 1 always sends; runs 2+3 silent on pass |
| #165 merged Apr 3 | F-1: Meta webhook + wamid storage + 32 new tests |
| #163 merged Apr 3 | M3-6: doc staleness CI check |

### WhatsApp delivery status (all confirmed live)
| Job | Send function | Status |
|---|---|---|
| notify 4am/7am/830am | `sendRosterImage` | ✅ Confirmed on phone Apr 2 — 2 recipients as of Apr 5 |
| notify friday-pm | `sendRosterImage` | ✅ Confirmed on phone Apr 2 — 2 recipients as of Apr 5 |
| integration-check | `sendTextMessage` | ✅ Confirmed Mar 25 — smart-send live (#167): run 1 always, runs 2+3 on fail only |
| cron-health-check | `sendTextMessage` | ✅ Same code path as integration-check |
| gmail-monitor | `sendTextMessage` | ✅ Confirmed Mar 20 |

### Meta template status
`META_ROSTER_TEMPLATE=dog_boarding_roster_3` set in Vercel — Utility category, confirmed delivered April 2.

---

## Completed This Session (April 23, session 16)

### F-2 — Message log page ✅ DONE — v5.5.0 live

- Migrations 025 (message_log table) + 026 (roster-images Storage RLS) applied
- PR #182 merged, Vercel deploy confirmed
- Triggered notify run — 2 rows in `message_log`, PNG in `roster-images` Storage, `/messages` page renders with inline image
- **Gotcha:** Private Supabase Storage buckets need an explicit `SELECT` policy on `storage.objects` for `authenticated` or `createSignedUrl` silently returns `null` on the client. Migration 026 adds this policy.
- GitHub release v5.5.0 cut

---

## Completed This Session (April 23, session 15)

### F-2 — Message log page ✅ BUILT
- `025_add_message_log.sql` — `message_log` table with RLS, two indexes
- `recordMessageLog` in `src/lib/messageDeliveryStatus.js` — non-fatal, records ALL sends (sent + failed)
- `storeRosterImage` in `api/notify.js` — fetches PNG post-send, uploads to `roster-images` bucket; non-fatal
- 6 send sites wired: `api/notify.js` (×3), `cron-health-check.js`, `integration-check.js`, `gmail-monitor.js`
- `src/hooks/useMessageLog.js` — last 5 days, generates signed URLs for image rows
- `src/pages/MessageLogPage.jsx` — `/messages` route, table with inline PNG rendering
- 15 new tests — 999 total, 0 failures
- **Key note:** `image_path` stored as `roster-images/{jobName}/{safeTimestamp}.png`. Hook strips `roster-images/` prefix before calling `createSignedUrl`.

---

## Completed This Session (April 21, sessions 12–13)

### G-6 — Second number receiving ✅ RESOLVED
- Root cause: typo in `NOTIFY_RECIPIENTS` — `4562` vs `5462`. Fixed in Vercel. Both numbers confirmed delivered in DB.

### K-7 — Closed: dev mode is correct long-term model ✅
- App uses Meta test phone number (+1 555 153 3723). Publishing requires registered business — not applicable.
- Dev mode (≤5 recipients) is correct for this use case.
- **Deadline: replace test number before ~July 2, 2026** → K-8.

### PR #178 — Integration check false positive fix ✅
- `DAYCARE_ONLY_PATTERNS` added `/^\d+\/\d+$/` to catch bare-date titles like `"4/21"`.

---

## Completed (April 3–8, sessions 3–11)

- **F-1** (#165): `message_delivery_status` table + Meta webhook + HMAC-SHA256 verify — delivery events flowing
- **I-1** (#167): Integration check smart-send — run 1 always; runs 2+3 silent on pass
- **M3-6** (#163): Doc staleness CI check
- **M3-7**: Screen recording — PARKED. File at `/Users/kcoffie/Downloads/ScreenRecording_04-03-2026 11-10-42_1.MP4`
- **M3-8**: Screenshots in README — pushed direct to main
- **K-6**: Admin bypass on ruleset — docs-only pushes go direct to main

---

## IMMEDIATE NEXT (next session)

### Step 1 — K-8: Replace test phone number (deadline ~July 2, 2026)

**Risk:** Meta test phone number (+1 555 153 3723) expires 90 days from ~April 3 = ~July 2. After that, all WhatsApp sends stop.

**What to do:** Get a phone number not currently on WhatsApp — easiest is Google Voice (voice.google.com, free). Then:
1. Meta API Setup → Step 5 "Add phone number" → enter the new number
2. Verify via SMS/call
3. Update `META_PHONE_NUMBER_ID` in Vercel to the new number's ID
4. Verify next notify run sends from the new number

**No registered business needed** — Meta only requires a verifiable phone number.

---

### Step 2 — M3-7: Screen recording (PARKED — Kate editing)

**Recording file:** `/Users/kcoffie/Downloads/ScreenRecording_04-03-2026 11-10-42_1.MP4` — 22 MB MP4.

**Once file is ready:**
1. Copy to `docs/screenshots/roster-delivery.mp4`
2. In README, after `![Roster image](docs/screenshots/roster-image.jpeg)`, before the `---` separator, add:
```html
<video src="docs/screenshots/roster-delivery.mp4" controls width="400"></video>
```
3. Caption: "End-to-end flow: notify job fires → WhatsApp message received → image opens with 'as of' timestamp"
4. Push direct to main (K-6 bypass — docs-only)

---

## Pending Kate Actions

| # | Action | Blocks | Priority |
|---|--------|--------|----------|
| K-5 | Add Anthropic API credits at console.anthropic.com | Integration check Step 3 vision name-check (currently silently skipped) | 🟢 Low |
| K-8 | **Replace Meta test phone number before ~July 2, 2026.** Get a number not on WhatsApp (Google Voice easiest). Add via Meta API Setup → Step 5 → verify → update `META_PHONE_NUMBER_ID` in Vercel. | WhatsApp continuity | 🟡 Medium — ~10 weeks |

---

## Future Backlog

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| N-1 | **Notify diff UX** — suppress UPDATED! on 4am; blue overlay for intra-day changes on 7am/8:30am | Medium | See SPRINT_PLAN.md for full spec |
| G-1 | **Alert on failed wamid** — F-1 stores delivery events but nothing fires an alert when status=`failed` | Medium | Needs N-minute threshold decision |
| G-3 | **Client-facing status page** — no self-serve health check for operator | Medium | UAT gate 4 |
| #145 | **Tooling upgrade** — eslint 9→10 + @vitejs/plugin-react 5→6 | Low | Dev tooling only |

---

## Carry-Forward (low priority)

- `cron-schedule.js` ADD filter case-sensitive — `/\badd\b/` doesn't match uppercase `ADD`
- Store datetimes in PST instead of UTC — tech debt, no user impact yet

---

## Architecture Reference

### Notify flow
```
GitHub Actions (4 workflows: M-F 4am/7am/8:30am + Fri 3pm PDT)
  → GET /api/notify?window=4am|7am|830am|friday-pm
  → refreshDaytimeSchedule (src/lib/notifyHelpers.js) → getPictureOfDay → computeWorkerDiff
  → /api/roster-image?date=YYYY-MM-DD&token=...&ts=<jobRunAt ISO>
  → PNG buffer → POST /v18.0/{PHONE_NUMBER_ID}/media → media_id
  → Meta Cloud API template send: { image: { id: media_id } } → NOTIFY_RECIPIENTS (2 numbers)
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
  → recordMessageLog → message_log table + roster-images Storage bucket
```

### Sync pipeline
```
cron-auth.js (00:00 UTC)    → authenticate + store session in sync_settings
cron-schedule.js (00:05)    → runScheduleSync() → scan 3 pages, enqueue boarding candidates
cron-detail.js (00:10)      → runDetailSync() × 1 item → fetch detail, map + save to DB
cron-detail-2.js (00:15)    → re-exports cron-detail (second Vercel path = double throughput)
```

### Integration check smart-send (I-1, #167)
```
integration-check.yml passes: INTEGRATION_CHECK_SCHEDULE: ${{ github.event.schedule }}
scripts/integration-check.js:
  FIRST_RUN_SCHEDULE = '0 8 * * *'  (1am PDT)
  alwaysSend = !INTEGRATION_CHECK_SCHEDULE || INTEGRATION_CHECK_SCHEDULE === FIRST_RUN_SCHEDULE
  → if (alwaysSend || !passed): send WhatsApp
  → else: log suppression, skip send
```

### Template name config
```
notifyWhatsApp.js:28  ALERT_TEMPLATE  = process.env.META_ALERT_TEMPLATE  || 'dog_boarding_alert'
notifyWhatsApp.js:29  ROSTER_TEMPLATE = process.env.META_ROSTER_TEMPLATE || 'dog_boarding_roster'
```
`META_ROSTER_TEMPLATE=dog_boarding_roster_3` set in Vercel (Utility category, confirmed delivered April 2).

### Key files
| File | Purpose |
|---|---|
| `src/lib/notifyWhatsApp.js` | Meta Cloud API wrapper — `metaMediaUpload`, `sendRosterImage`, `sendTextMessage` |
| `src/lib/messageDeliveryStatus.js` | `recordSentMessages` + `recordMessageLog` — writes to `message_delivery_status` and `message_log` |
| `api/webhooks/meta.js` | Incoming Meta webhook — HMAC-SHA256 verify, stores delivery events |
| `scripts/integration-check.js` | Integration check — Playwright + Claude vision + DB compare; smart-send logic |
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic |
| `src/lib/pictureOfDay.js` | `getPictureOfDay`, `computeWorkerDiff`, `hashPicture` |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf`; `timingSafeEqual` auth; weekend path |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) + `storeRosterImage` |
| `src/lib/notifyHelpers.js` | `refreshDaytimeSchedule` (extracted for testability) |
| `scripts/cron-health-check.js` | Midnight cron health checker |
| `scripts/gmail-monitor.js` | Gmail infrastructure alert monitor (GH Actions hourly) |
| `src/hooks/useMessageLog.js` | Fetches message_log, generates signed URLs for image rows |
| `src/pages/MessageLogPage.jsx` | `/messages` page — last 5 days of sends with inline roster PNGs |

### GitHub Actions repo secrets
| Secret | Status |
|---|---|
| `VITE_SUPABASE_URL` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `EXTERNAL_SITE_USERNAME` | ✅ Set |
| `EXTERNAL_SITE_PASSWORD` | ✅ Set |
| `ANTHROPIC_API_KEY` | ✅ Set (no credits — Step 3 silently skipped) |
| `INTEGRATION_CHECK_RECIPIENTS` | ✅ Set (Kate only) |
| `META_PHONE_NUMBER_ID` | ✅ Set |
| `META_WHATSAPP_TOKEN` | ✅ Set |
| `META_WEBHOOK_VERIFY_TOKEN` | ✅ Set |
| `GMAIL_CLIENT_ID` | ✅ Set |
| `GMAIL_CLIENT_SECRET` | ✅ Set |
| `GMAIL_REFRESH_TOKEN` | ✅ Set |

### Vercel env vars (production)
| Var | Value |
|---|---|
| `META_ROSTER_TEMPLATE` | `dog_boarding_roster_3` |
| `META_WHATSAPP_TOKEN` | ✅ Set |
| `META_PHONE_NUMBER_ID` | ✅ Set |
| `META_WEBHOOK_VERIFY_TOKEN` | ✅ Set |
| `NOTIFY_RECIPIENTS` | ✅ Set — **2 numbers**: +15550100103, +15550100102 |
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
| Staff Member 1 | 208669 |
| Staff Member 2 | 141407 |
| Staff Member 3 | 174385 |
| Staff Member 4 | 189436 |
| Staff Member 5 | 164375 |

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

-- Delivery status (F-1)
SELECT wamid, status, recipient_masked, job_name, created_at
FROM message_delivery_status ORDER BY created_at DESC LIMIT 20;

-- Message log (F-2)
SELECT id, sent_at, job_name, message_type, recipient, status, wamid, image_path
FROM message_log ORDER BY sent_at DESC LIMIT 20;
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0, v5.4.0, **v5.5.0 (latest)**

## K-6 — Docs direct-push to main
Admin bypass on ruleset (id 13512551) — docs-only pushes go direct to main. CI still required on all PRs.

## Archive
- v5.5 session: `docs/archive/SESSION_HANDOFF_v5.5_final.md`
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
