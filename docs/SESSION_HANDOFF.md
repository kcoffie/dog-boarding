# Dog Boarding App — Session Handoff (v6 — OPEN)
**Last updated:** May 1, 2026 (session 26) — B-1 fully resolved. Job docs updated + OVERVIEW.md created. Next: G-1 or G-3 (Kate picks). 1045 tests.

---

## Current State

- **v6 OPEN** — theme: *Client-driven operational intelligence*
- **1045 tests, 59 files, 0 failures**
- **main clean** — all PRs merged, no open branches
- Live at [qboarding.vercel.app](https://qboarding.vercel.app)

### Session 26 Summary (this session)
| Item | Status |
|---|---|
| B-1 — verify Integration Check run 25239049354 | ✅ C63QghzF ENQUEUE'd (not SKIP'd). New boarding created in DB: Peanut $270, May 1–5, confirmed. |
| B-1 — verify Peanut in DB via Supabase query | ✅ Row confirmed: `external_id=C63QghzF`, `billed_amount=270`, `booking_status=confirmed` |
| Intraday timing analysis — will Peanut trigger a notification? | ✅ Yes — 8:30am snapshot taken before Peanut synced (5:32pm PDT). Next intraday run (6pm PDT) should detect Peanut as "added" and send WhatsApp. Run 25238309409 at 4:57pm returned `no_change_since_830am` (Peanut not yet in DB at that time). |
| docs/job_docs/ — review and update all 4 docs | ✅ All 4 updated. See below. |
| docs/job_docs/OVERVIEW.md — create new overview doc | ✅ Created. Covers all 12 jobs with schedule, behavior, interesting design notes, weekday timeline, failure coverage map. |

**Job docs changes (May 1):**
- `integration-check.md` — fixed stale "NON_BOARDING_PATTERNS duplicated on purpose" claim (they now import from shared `config.js`); updated Claude credits note (K-5 closed)
- `notify-jobs.md` — removed stale "second recipient not added" (G-6 fixed April 21); updated delivery receipts to note F-1 done, G-1 is the gap
- `sync-crons.md` — updated DC pattern description to `^(d/c|dc)\b/i` with B-1 explanation
- `gmail-monitor.md` — date only

**Pending verifications (check at next session start):**
1. **Peanut intraday notify** — did the 6pm PDT intraday run (01:00 UTC May 2) fire and send a WhatsApp showing Peanut as Added? Check: `gh run list --workflow=notify-intraday.yml --limit=5` and view the log for the run at ~01:00 UTC.
2. **N-1 morning verification** — still pending Kate's observation on the first real 3-send morning cycle (tomorrow, May 2):
   - 4am image: no UPDATED! badge
   - 7am image: blue dogs if anything changed since 4am
   - 8:30am image: blue dogs if anything changed since 7am

### Session 25 Summary (reference)
| Item | Status |
|---|---|
| B-1 — DC filter false positive drops "Boarding discounted nights for DC full-time" | ✅ PR #199 merged. Deployed. |
| B-1 — 2 regression tests (appointmentFilter + syncRunner) | ✅ 1045 tests, 0 failures |
| B-1 — SKIP log now includes title for observability | ✅ |
| notify-intraday.yml health check | ✅ 5/5 runs healthy today. All skipped correctly (boarding not in DB before 5:32pm). |
| integration-check.yml health check | ✅ 3/3 runs healthy today. Step 3 (Claude vision) still warning (credit balance). |

### Session 24 Summary (reference)
| Item | Status |
|---|---|
| N-1 — suppress UPDATED! badge on 4am | ✅ Built. PR #197 merged. |
| N-1 — blue intra-day overlay on 7am/8:30am | ✅ Built. PR #197 merged. |
| N-1 — 9 unit tests (badge, blue, fallback) | ✅ 1043 tests, 0 failures |

**N-1 final state:**
- `notify.js`: `persistSentState()` writes `snapshot: workers` to `cron_health.result`; `readLastSentState()` returns `lastSnapshot`; image URL gets `&sendWindow=${window}` + `&lastSnapshot=<base64>` (7am/8:30am only)
- `roster-image.js`: `buildChangedDogs(lastSnapshot, currentWorkers)` → `Set<string>`; `workerCard()` checks set first (blue `#2563eb`); `buildLayout()` suppresses badge when `sendWindow === '4am'`
- No schema migration needed — `cron_health.result` is free-form JSONB; `snapshot` field is additive

**N-1 DoD — all complete:**
- [x] 4am image: no UPDATED! badge
- [x] 7am/8:30am: UPDATED! badge present; green/red today-vs-yesterday diff unchanged; blue overlay on changed dogs
- [x] Blue strikethrough for dogs removed intra-day
- [x] Blue + for dogs added intra-day
- [x] Null/malformed snapshot: graceful green/red fallback, no crash
- [x] 9 unit tests passing
- [x] 1043 tests, 0 failures
- [x] PR #197 merged — **pending: Kate verifies on first 3-send morning cycle (May 2)**

---

## v6 — Remaining Tickets

All v6 specced tickets (R-1, J-1, P-1) are **DONE**. B-1 DONE. G-2 confirmed done. K-5 closed. N-1 merged.

### In flight:
None.

### Next backlog candidates (Kate picks):

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| G-1 | **Alert on failed wamid** — `message_delivery_status` table exists (F-1) but nothing reads it and fires on `status='failed'` | Medium | Lightweight cron or webhook-triggered check |
| G-3 | **Client-facing status page** — no self-serve health check for the operator | Medium | UAT gate 4 — read-only page: last cron run, last notify sent, last delivery status |

---

## Pending Kate Actions

| # | Action | Blocks | Priority |
|---|--------|--------|----------|
| N-1 verify | **Check tomorrow morning (May 2):** 4am image has no UPDATED! badge. 7am/8:30am shows blue dogs for intra-day changes. | N-1 done | 🔴 First thing |
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
