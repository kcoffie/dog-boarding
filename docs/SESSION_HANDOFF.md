# Dog Boarding App — Session Handoff (v6 — OPEN)
**Last updated:** April 29, 2026 (session 18) — R-1 complete. J-1 is next.

---

## Current State

- **v6 OPEN** — theme: *Client-driven operational intelligence*
- **1006 tests, 57 files, 0 failures**
- **main clean** (PR #187 merged this session — R-1 Q Boarding box)
- Live at [qboarding.vercel.app](https://qboarding.vercel.app)

### Session 18 Summary
| Item | Status |
|---|---|
| R-1 — Q Boarding 6th box | ✅ PR #187 merged — issue #186 |
| Verify on live image | ⏳ **Kate to trigger manually** — see command below |

**Manual verify command (run after Vercel deploys):**
```
curl -s "https://qboarding.vercel.app/api/notify?window=830am&token=$VITE_SYNC_PROXY_TOKEN" | jq .
```
Or open the image URL directly:
```
https://qboarding.vercel.app/api/roster-image?date=YYYY-MM-DD&token=TOKEN
```
Confirm Q Boarding box appears bottom-right with correct boarder list.

---

## v6 — Remaining Tickets

### R-1 — Roster image: 6th "Q Boarding" box ✅ DONE

**What:** Add a 6th box to the existing 5-box roster image layout. The empty slot (bottom-right) shows the full list of dogs boarding tonight — all dogs regardless of which worker has them. Heading: "Q Boarding".

**Key facts:**
- The data already flows through the notify pipeline — boardings are queried in `getPictureOfDay()`. The 6th box just aggregates them.
- Change is isolated to `api/roster-image.js` (Satori layout).
- No DB change, no new cron.

**Files to read before coding:**
- `api/roster-image.js` — full layout, box rendering, data shape passed in
- `src/lib/pictureOfDay.js` — what data is returned and how boardings are structured
- `api/notify.js` — what gets passed to the image URL

**Definition of Done:**
- [ ] 6th box renders in existing empty slot (bottom-right)
- [ ] Heading: "Q Boarding" in AGYD forest green `#4A773C`
- [x] Lists all dogs boarding tonight (all workers combined, sorted alphabetically)
- [x] Dog count shown (e.g., "14 dogs") consistent with other boxes
- [x] No layout regression on the other 5 boxes (weekend path untouched)
- [x] Unit tests: 7 new (sort order, empty state, singular/plural, height calc)
- [x] 1006 tests pass
- [ ] **Verify on live image** — Kate to trigger manually after deploy

---

### J-1 — Intraday change notification job

**What:** A new hourly job that runs 9am–8pm and sends a WhatsApp notification **only when something changed** from the 8:30am baseline. Different image design from the roster — delta-only format showing what was added or cancelled since 8:30am. Primary signal: new overnight boarders tonight. Secondary: cancellations.

**Confirmed design decisions:**
- **Baseline:** 8:30am snapshot (stored at end of the 8:30am notify run)
- **Delta logic:** cumulative since 8:30am. Once dogA shows as new, it stays in every report until the next morning resets the baseline. No send if zero changes since 8:30am.
- **Scope:** additions (new overnight boarders) AND cancellations (dogs removed from tonight since 8:30am)
- **Last run:** 8pm
- **Image design:** NOT a full worker roster grid. Delta-only format, e.g.:
  ```
  Changes since 8:30am, Wed 4/29
  ✅ Added: Mochi Hill, Bronwyn
  ❌ Cancelled: Tula
  ```
- **No send if no changes** — this is not a "heartbeat" job

**State design (the hard part):**
- The 8:30am notify run must store a snapshot of tonight's boarders (not just the hash) in `cron_health`.
- The hourly job loads that snapshot and compares to the current boarders list.
- Delta = dogs in current but not in snapshot (added) + dogs in snapshot but not in current (cancelled).
- If delta is empty → no send. If non-empty → send delta image.

**N-1 still relevant?** Yes — N-1 (blue overlay on existing morning images for intra-day changes) and J-1 (separate hourly delta job) solve different UX needs and are complementary. N-1 is still on backlog.

**Files to read before coding:**
- `api/notify.js` — where the 8:30am snapshot must be stored; how `cron_health` is written
- `src/lib/pictureOfDay.js` — boarding data shape
- `api/roster-image.js` — for the new delta image design
- `.github/workflows/notify-830am.yml` — GH Actions cron pattern to copy for J-1

**Definition of Done:**
- [ ] New GH Actions workflow: hourly 9am–8pm (Mon–Fri), `workflow_dispatch` for manual test
- [ ] 8:30am notify run stores a `boarders_snapshot` (array of boarding IDs/names) to `cron_health`
- [ ] Hourly job: load snapshot → compare to current → compute delta
- [ ] No send if delta empty
- [ ] WhatsApp message sent for non-empty delta (additions + cancellations)
- [ ] New image design for delta-only content (distinct from full roster image)
- [ ] Graceful fallback: if no snapshot found for today (8:30am run was skipped), log + skip send
- [ ] Unit tests: (a) empty delta → no send, (b) addition detected → send, (c) cancellation detected → send, (d) missing snapshot → graceful skip
- [ ] 999+ tests pass
- [ ] Verify on a real morning cycle

---

### P-1 — Employee pay: daytime follow-on

**What:** Night shift workers sometimes also work the following day. This allows crediting them for daytime work at the same pay rate (currently 65%) applied to each dog present that day. It is an **optional per-assignment flag**, not a global setting.

**Confirmed design decisions:**
- Daytime X% = same as overnight X% (currently 65%). No new config needed — reuse existing rate.
- Toggle is per night-assignment, not per worker or per pay period.
- Example: Charlie works Saturday night. The following day is Sunday. If he works Sunday day too, tick "worked following day" and the system also credits 65% × Sunday daytime rate × number of dogs that day.

**Current pay model (for context):**
- Worker assigned to a night → earns `night_rate × net_percentage` (stored in `night_assignments` + `settings`)
- The UI is on the payroll page where workers are assigned to nights

**What changes:**
- DB: new nullable boolean column on the night assignment (or linked row) — `worked_following_day`
- When `worked_following_day = true`: fetch daytime dogs for the following calendar day, compute `daytime_rate × net_percentage × dog_count`
- UI: checkbox on the assignment form — "Also worked [following day date]?"
- Payroll calculation: if flag is set, add the daytime credit to that worker's total for the pay period

**Files to read before coding:**
- The night assignments table schema (check current migration files)
- `src/utils/calculations.js` — payroll math
- Payroll page + assignment form components (check `src/pages/PayrollPage.jsx` and related)
- `src/hooks/useNightAssignments.js` (or equivalent)

**Definition of Done:**
- [ ] DB migration: `worked_following_day` boolean (nullable, default null) on night assignments
- [ ] Payroll calculation updated: when flag is true, add daytime credit to worker total
- [ ] UI: checkbox on assignment form — "Also worked [Day, M/D]?" — unchecked by default
- [ ] Payroll display shows the daytime credit as a separate line item (not folded into night pay)
- [ ] Unit tests: (a) flag false → no daytime credit, (b) flag true → daytime credit computed correctly, (c) no daytime dogs that day → $0 daytime credit
- [ ] 999+ tests pass

---

## Pending Kate Actions

| # | Action | Blocks | Priority |
|---|--------|--------|----------|
| K-5 | Add Anthropic API credits at console.anthropic.com | Integration check Step 3 vision name-check (currently silently skipped — now shows ::warning:: in GH Actions) | 🟢 Low |
| K-8 | **Replace Meta test phone number before ~July 2, 2026.** Google Voice (free). Meta API Setup → Step 5 → verify → update `META_PHONE_NUMBER_ID` in Vercel. | WhatsApp continuity | 🟡 Medium — ~9 weeks |

---

## v6 Sprint Order (Recommended)

1. **R-1** — Isolated, no new infrastructure, high visual value. First win.
2. **J-1** — New cron + state design. Architect carefully before building.
3. **P-1** — DB schema change. Needs spec review at architect step.

---

## v5 Backlog Carried to v6

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| N-1 | **Notify diff UX** — suppress UPDATED! on 4am; blue intra-day overlay on 7am/8:30am | Medium | Still relevant alongside J-1. Full spec in SPRINT_PLAN.md |
| G-1 | **Alert on failed wamid** — nothing reads `message_delivery_status` and fires on status=`failed` | Medium | — |
| G-3 | **Client-facing status page** — no self-serve health check for operator | Medium | UAT gate 4 |

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
| `src/lib/pictureOfDay.js` | `getPictureOfDay`, `computeWorkerDiff`, `hashPicture` |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf`; `timingSafeEqual` auth; weekend path |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) + `storeRosterImage` |
| `src/lib/notifyHelpers.js` | `refreshDaytimeSchedule` (extracted for testability) |
| `scripts/cron-health-check.js` | Midnight cron health checker |
| `scripts/gmail-monitor.js` | Gmail infrastructure alert monitor (GH Actions hourly) |
| `src/hooks/useMessageLog.js` | Fetches message_log, generates signed URLs for image rows |
| `src/pages/MessageLogPage.jsx` | `/messages` page — last 5 days of sends with inline roster PNGs |

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
v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0, v5.4.0, **v5.5.0 (latest)**

### Useful SQL
```sql
-- Message log (F-2)
SELECT id, sent_at, job_name, message_type, recipient, status, wamid, image_path
FROM message_log ORDER BY sent_at DESC LIMIT 20;

-- Delivery status (F-1)
SELECT wamid, status, recipient_masked, job_name, created_at
FROM message_delivery_status ORDER BY created_at DESC LIMIT 20;

-- Cron health
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;

-- Recent boardings
SELECT b.external_id, d.name, b.billed_amount, b.night_rate, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC LIMIT 20;
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
