# Dog Boarding App — Session Handoff (v6 — OPEN)
**Last updated:** May 1, 2026 (session 23) — G-2/K-5 closed. N-1 architect plan complete. Ready to build.

---

## Current State

- **v6 OPEN** — theme: *Client-driven operational intelligence*
- **1034 tests, 59 files, 0 failures**
- **main is clean** — v6.1.0 released
- Live at [qboarding.vercel.app](https://qboarding.vercel.app)

### Session 22 Summary
| Item | Status |
|---|---|
| P-1 — merge PR #193 + run migration 027 | ✅ Merged. Kate ran migration 027 in Supabase. |
| P-1 — live verification | ✅ Checkbox renders. Bug found: credit used wrong data source. |
| P-1 bug fix — daytime credit source (#194, PR #195) | ✅ Fixed. Merged. |
| v6.1.0 GitHub release | ✅ Tagged and released. |

**P-1 final state (fully shipped):**
- DB: `worked_following_day BOOLEAN DEFAULT NULL` on `night_assignments` (migration 027, live in Supabase)
- `useNightAssignments`: `workedFollowingDay` in shape; `getWorkedFollowingDay(date)`, `setWorkedFollowingDay(date, value)`
- `DataContext`: exposes `getWorkedFollowingDay`, `setWorkedFollowingDay`
- `calculations.js`: `calculateDaytimeCredit(petNames, dogs, netPercentage)` — not used by components (kept for tests); components compute credit directly from boardings
- `EmployeeDropdown.jsx`: "Also worked [Day, M/D]?" checkbox below dropdown when a worker is assigned
- `PayrollPage.jsx`: daytime credit computed from overnight boardings (`isOvernight`) × `dayRate` × `netPercentage`; shows "Daytime follow-on" line item in Outstanding Payments
- `EmployeeTotals.jsx`: same daytime credit computation; included in "Total earnings" widget on matrix page
- **Bug fixed (#194):** original implementation queried `daytime_appointments` (all DC/PG dogs that day — wrong). Corrected to use `boardings` table via `isOvernight` — only the dogs the worker actually cared for that night.
- Expected amount for Apr 30 night: Annie ($50) + Tracy ($35) + Frances Wiebe ($50) × 65% = **$87.75**
- 1034 tests, 0 failures

**P-1 DoD — all complete:**
- [x] DB migration 027 run in Supabase
- [x] Checkbox renders on matrix page
- [x] Daytime credit appears in Payroll Outstanding Payments
- [x] Daytime credit included in EmployeeTotals widget
- [x] Correct data source: overnight boardings, not daytime_appointments
- [x] v6.1.0 released

---

## v6 — Remaining Tickets

All v6 specced tickets (R-1, J-1, P-1) are **DONE**. G-2 confirmed done (warning already in code). K-5 closed. Remaining work is from the backlog.

### Next: N-1 — Notify diff UX (architect complete, ready to build)

**Architect plan:** See full spec in SPRINT_PLAN.md. Summary:

**Item 1 — Badge suppression (4am):**
- Pass `sendWindow` as query param on image URL in `notify.js`
- `roster-image.js`: suppress badge when `sendWindow === '4am'`
- ~5 lines, two files

**Item 2 — Blue intra-day overlay:**
- `cron_health.result` is already a JSON object — add `snapshot: workers` alongside `lastHash` (no schema change)
- `readLastSentState()` returns `lastSnapshot`; `persistSentState()` writes `snapshot: workers`
- For 7am/8:30am: build `changedDogs` Set (keyed `workerId:series_id`), base64-encode prior snapshot, append `&lastSnapshot=<base64>` to image URL
- 4am: no `lastSnapshot` param passed → graceful fallback to green/red only
- `roster-image.js`: parse param, build changedDogs Set, add `COLORS.intraday = '#2563eb'`, blue takes priority in `workerCard()`
- Fallback key for null series_id: `${workerId}:${pet_names[0]}`

**Files to touch:**
- `api/notify.js` — URL construction, readLastSentState, persistSentState
- `api/roster-image.js` — parse sendWindow + lastSnapshot, color logic, buildLayout/workerCard signatures
- `src/lib/pictureOfDay.js` — probably none
- `src/__tests__/pictureOfDay.test.js` (or new test file) — badge suppression, blue overlay, no-snapshot fallback

### Other backlog candidates (after N-1):

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| G-1 | **Alert on failed wamid** — nothing reads `message_delivery_status` and fires on status=`failed` | Medium | — |
| G-3 | **Client-facing status page** — no self-serve health check for operator | Medium | UAT gate 4 |

---

### Session 21 Summary (reference)
| Item | Status |
|---|---|
| J-1 — merge PR #191 + verify Vercel deploy | ✅ Merged. `notify-intraday?token=...` returns `{"ok":true,"action":"skipped","reason":"no_snapshot"}` |
| v6.0.0 GitHub release | ✅ Tagged — J-1 + R-1 + hashPicture fix |
| P-1 — employee pay daytime follow-on | ✅ Built. PR #193 opened (issue #192). |

### Session 20 Summary (reference)
| Item | Status |
|---|---|
| J-1 — intraday boarding change notification job | ✅ PR #191 CI green — merged this session |

**J-1 changes:**
- `queryBoarders` now returns `{ name, arrival_datetime, departure_datetime }[]` (was `string[]`)
- `hashPicture` now includes boarders in hash
- Q Boarding card shows compact date ranges: `Name (M/D–M/D)`
- `notify.js` 8:30am window stores `boarders-snapshot` in `cron_health` before send-gate check
- New `api/notify-intraday.js` — hourly delta handler
- New `api/intraday-image.js` — delta PNG: "Q Boarding Changes" header + Added/Cancelled
- New `.github/workflows/notify-intraday.yml` — hourly 9am–8pm PDT Mon–Fri

### Session 19 Summary (reference)
| Item | Status |
|---|---|
| R-1 bug fix — Q Boarding missing dogs with DC/PG appointments | ✅ PR #189 merged |
| Calendar duplication (Annie/Tracy shown twice) | ✅ Root cause confirmed, data cleanup deferred |

---

## Pending Kate Actions

| # | Action | Blocks | Priority |
|---|--------|--------|----------|
| ~~K-5~~ | ✅ Closed May 1 — Step 3 skipping silently without ill effects; `::warning::` already fires (integration-check.js:621). Credits not needed. | — | — |
| K-8 | **Replace Meta test phone number before ~July 2, 2026.** Google Voice (free). Meta API Setup → Step 5 → verify → update `META_PHONE_NUMBER_ID` in Vercel. | WhatsApp continuity | 🟡 Medium — ~9 weeks |

---

## Known Data Issues (Deferred)

| Issue | Detail | Fix when ready |
|---|---|---|
| Annie + Tracy duplicate boardings | AGYD created 2 appointment IDs for same stay. 4 rows in `boardings` instead of 2. Calendar shows each dog twice. | Delete rows `d47115e8` (Annie) and `36e76c49` (Tracy). Null `sync_appointments.mapped_boarding_id` first. |

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

### Key files
| File | Purpose |
|---|---|
| `src/lib/notifyWhatsApp.js` | Meta Cloud API wrapper — `metaMediaUpload`, `sendRosterImage`, `sendTextMessage` |
| `src/lib/messageDeliveryStatus.js` | `recordSentMessages` + `recordMessageLog` — writes to `message_delivery_status` and `message_log` |
| `api/webhooks/meta.js` | Incoming Meta webhook — HMAC-SHA256 verify, stores delivery events |
| `scripts/integration-check.js` | Integration check — Playwright + Claude vision + DB compare; smart-send logic |
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic |
| `src/lib/pictureOfDay.js` | `getPictureOfDay`, `computeWorkerDiff`, `hashPicture`; `queryBoarders` uses `boardings` table |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf`; `timingSafeEqual` auth; weekend path |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) + `storeRosterImage` |
| `src/lib/notifyHelpers.js` | `refreshDaytimeSchedule` (extracted for testability) |
| `scripts/cron-health-check.js` | Midnight cron health checker |
| `scripts/gmail-monitor.js` | Gmail infrastructure alert monitor (GH Actions hourly) |
| `src/hooks/useMessageLog.js` | Fetches message_log, generates signed URLs for image rows |
| `src/pages/MessageLogPage.jsx` | `/messages` page — last 5 days of sends with inline roster PNGs |
| `src/hooks/useNightAssignments.js` | Night assignments hook — includes `workedFollowingDay`, `getWorkedFollowingDay`, `setWorkedFollowingDay` |
| `src/pages/PayrollPage.jsx` | Payroll page — daytime follow-on credit from `isOvernight` × `dayRate` × `netPercentage` |
| `src/components/EmployeeTotals.jsx` | Employee totals widget — includes daytime follow-on credit |
| `src/components/EmployeeDropdown.jsx` | Night assignment dropdown + "Also worked [Day]?" checkbox |

### Workers
| Name | External UID |
|---|---|
| Charlie | 61023 |
| Kathalyn Dominguez | 208669 |
| Kentaro Cavey | 141407 |
| Max Posse | 174385 |
| Sierra Tagle | 189436 |
| Stephen Muro | 164375 |

### GitHub Releases
v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0, v5.4.0, v5.5.0, v6.0.0, **v6.1.0**

### Useful SQL
```sql
-- Message log
SELECT id, sent_at, job_name, message_type, recipient, status, wamid, image_path
FROM message_log ORDER BY sent_at DESC LIMIT 20;

-- Delivery status
SELECT wamid, status, recipient_masked, job_name, created_at
FROM message_delivery_status ORDER BY created_at DESC LIMIT 20;

-- Cron health
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;

-- Recent boardings
SELECT b.external_id, d.name, b.billed_amount, b.night_rate, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC LIMIT 20;

-- Tonight's boarders (what Q Boarding box shows)
SELECT d.name, b.arrival_datetime, b.departure_datetime, b.booking_status
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.arrival_datetime < (CURRENT_DATE + INTERVAL '1 day')
  AND b.departure_datetime >= (CURRENT_DATE + INTERVAL '1 day')
ORDER BY d.name;

-- Night assignments with daytime follow-on flag
SELECT date, worked_following_day FROM night_assignments ORDER BY date DESC LIMIT 20;
```

### GitHub Actions repo secrets / Vercel env vars
See previous archive (`docs/archive/SESSION_HANDOFF_v5.5_final.md`) for full table — unchanged.

### K-6 — Docs direct-push to main
Admin bypass on ruleset (id 13512551) — docs-only pushes go direct to main. CI required on all PRs.

### Meta template status
`META_ROSTER_TEMPLATE=dog_boarding_roster_3` — Utility category, confirmed delivered April 2.

---

## Archive
- v5.5 session: `docs/archive/SESSION_HANDOFF_v5.5_final.md`
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
