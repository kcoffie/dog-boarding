# Dog Boarding App — Session Handoff (v4.1 live; v4.1.1 image polish in progress)
**Last updated:** March 5, 2026 (v4.1.0 released; v4.1.1 work designed, not started)

---

## Current State

- **v4.1.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **v4.1.0 GitHub Release tagged** — latest
- **PR #41 merged** — roster image + WhatsApp notifications
- **PR #42 open** — `fix/dst-pdt-cron-times` — DST cron schedule shift for March 8 PDT. Merge this first.
- **Branch `fix/v4.1.1-image-polish`** — created, no commits yet. All planned work described below.
- **737 tests, 46 files, 0 failures**
- Twilio sandbox confirmed working — WhatsApp image delivered successfully in testing

---

## IMMEDIATE NEXT ACTIONS (in order)

### 1. Merge PR #42 (DST cron times)
No code review needed — 3-line change shifting GitHub Actions cron schedules from PST to PDT.
DST starts March 8, 2026. Merge before then.

```bash
git checkout main && git fetch origin && git reset --hard origin/main
```

### 2. Implement v4.1.1 image polish on `fix/v4.1.1-image-polish`
Branch exists locally. All changes below are approved by Kate — implement, test, commit, PR.

---

## v4.1.1 — Planned Changes (approved, not yet coded)

### Change 1: Live schedule refresh in `notify.js`

**Problem:** `notify.js` currently reads stale DB data. The daytime cron runs at 12:05 AM UTC. When GitHub Actions fires at 4am / 7am / 8:30am PDT, nothing has updated the DB since midnight. The 7am and 8:30am hash-change checks are therefore pointless — the data never changes between sends.

**Fix:** At the top of `notify.js`'s handler, before calling `getPictureOfDay`, add a `refreshDaytimeSchedule(supabase)` step:
1. `getSession(supabase)` — load cached auth session
2. `setSession(cookies)` — inject into `authenticatedFetch`
3. Build today's week URL: `${BASE_URL}/schedule/days-7/YYYY/M/D`
4. `authenticatedFetch(url)` → HTML
5. `parseDaytimeSchedulePage(html)` → daytime rows
6. `upsertDaytimeAppointments(supabase, rows)` → DB upsert

**Error handling:** If session is missing or fetch fails → log warning, continue with stale DB data (non-fatal — don't block the send).

This mirrors what `cron-schedule.js` does at lines 216–274. Reuse the same imports: `getSession`, `setSession`, `authenticatedFetch` from auth/sessionCache, `parseDaytimeSchedulePage` + `upsertDaytimeAppointments` from daytimeSchedule.

---

### Change 2: "As of" timestamp in image header

**Decision:** After `notify.js` refreshes the data, `daytime_appointments.updated_at` reflects the actual refresh time. Query `max(updated_at)` from today's DC/PG rows and return it from `getPictureOfDay`. Display it in the image header.

**Why not `cron_health.last_ran_at`:** Once notify.js does the live refresh, `cron_health.schedule.last_ran_at` always shows 12:05 AM (midnight cron) — not the 7am/8:30am refresh time. `max(updated_at)` from the data itself is always accurate.

**Header layout:**
```
Thursday, March 5 (as of 7:03 AM)          Daily Roster   UPDATED!
```

**`pictureOfDay.js` change:** In `queryAppointmentsByDate` for today's rows, also select `updated_at` and return the max. Add `lastSyncedAt: string | null` to `getPictureOfDay`'s return value.

**`roster-image.js` change:** Format `lastSyncedAt` as `h:MM AM/PM` local time. Append `(as of HH:MM AM)` to the date string in the header span.

---

### Change 3: Remove boarders from image and hash

**`roster-image.js`:**
- Remove `boardersSection` from `buildLayout()`
- Remove `boardersSectionH` from `computeImageHeight()`
- Remove `boardersBg` and `boardersText` from `COLORS`

**`pictureOfDay.js` — `hashPicture`:** Remove `boarders` from the hash key object. Boarder changes should not trigger a resend since boarders are no longer shown.

**Test update (`pictureOfDay.test.js`):** Remove the test `'returns a different hash when boarders change'`. Update `'sends for 8:30am when hash changed'` — it currently creates a hash difference via `boarders: ['Benny']` vs `boarders: []`; change it to use a worker/dog difference instead.

Note: `queryBoarders` and `boarders` field can remain in the data struct (harmless, easy to restore later). Only rendering and hash need updating.

---

### Change 4: HTML entity decode (defensive)

**Problem:** `daytime_appointments` rows stored before PR #40 have literal `&quot;`, `&amp;`, etc. in `pet_names` / `client_name`. Example: `&quot;Waldo&quot; Ralph` displays instead of `"Waldo" Ralph`.

**Fix:** Add a `decodeEntities` helper in `roster-image.js` (same logic as `daytimeSchedule.js`):
```js
function decodeEntities(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
```
Apply it in `dogLabel()` on each pet name and on the client name. Display-layer safety net; parse layer already decodes but stale DB rows bypass it.

---

### Change 5: AGYD brand colors in image

Update `COLORS` in `roster-image.js`:

| Key | Old | New | Reason |
|---|---|---|---|
| `headerBg` | `#1e293b` | `#4A773C` | Forest Green — main brand color |
| `headerText` | `#f8fafc` | `#FFFFFF` | Pure white on green |
| `workerBg` | `#f8fafc` | `#FFFFFF` | Pure white cards |
| `workerBorder` | `#e2e8f0` | `#d0e8c2` | Light sage green border |
| `workerName` | `#1e293b` | `#78A354` | Sage Green — headings |
| `dogCount` | `#64748b` | `#777777` | Medium Gray — secondary text |
| `unchanged` | `#374151` | `#333333` | Deep Charcoal — body text |
| `added` | `#16a34a` | keep | Functional green |
| `removed` | `#dc2626` | keep | Functional red |
| `updated` | `#ea580c` | keep | Functional orange badge |

**Brand reference (A Girl and Your Dog):**
- Forest Green `#4A773C` — header backgrounds
- Sage Green `#78A354` — H1/H2 headings, accented text
- Deep Charcoal `#333333` — body text
- Pure White `#FFFFFF` — content background
- Medium Gray `#777777` — nav items, secondary text

---

## Open PRs

| PR | Branch | Status | Action |
|---|---|---|---|
| #42 | `fix/dst-pdt-cron-times` | Open | Merge before March 8 |

---

## After v4.1.1 merges

- Reset local main: `git checkout main && git fetch origin && git reset --hard origin/main`
- Tag `v4.1.1` GitHub Release (`/usr/local/bin/gh release create v4.1.1 ...`)
- Mark `v4.1.0` as `--latest=false`

---

## v4.2 Backlog (next after v4.1.1)

- Add second test number, then production group chat
- DST-aware scheduling (or a single cron that computes its own send window by checking wall-clock time)
- Move from Twilio sandbox to registered WhatsApp Business sender

## v4.3 Backlog

- On-demand daytime ingest via "Sync Now" button

---

## v4.1 Architecture — What Was Built

### Files added in v4.1

| File | Purpose |
|---|---|
| `src/lib/pictureOfDay.js` | Data layer: `getPictureOfDay`, `hashPicture`, `shouldSendNotification`, `parseDateParam` |
| `api/roster-image.js` | Token-gated endpoint → queries DB, renders PNG via satori+resvg |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper: `createTwilioClient`, `sendRosterImage`, `getRecipients` |
| `api/notify.js` | Orchestrator: validates `window`+`token`, gates send via hash, calls Twilio |
| `src/__tests__/pictureOfDay.test.js` | 22 unit tests for data layer (mock Supabase, no real DB) |
| `.github/workflows/notify-4am.yml` | Fires 11:00 UTC (4am PDT after PR #42) |
| `.github/workflows/notify-7am.yml` | Fires 14:00 UTC (7am PDT after PR #42) |
| `.github/workflows/notify-830am.yml` | Fires 15:30 UTC (8:30am PDT after PR #42) |
| `api/_fonts/inter-400.ttf` | Bundled Inter Regular for satori |
| `api/_fonts/inter-700.ttf` | Bundled Inter Bold for satori |

### Packages added in v4.1
- `satori@0.25.0` — element tree → SVG
- `@resvg/resvg-js@2.6.2` — SVG → PNG (native Node.js bindings)
- `twilio@5.12.2` — WhatsApp delivery

### API surface
```
GET /api/roster-image?date=YYYY-MM-DD&token=SECRET  → PNG
GET /api/notify?window=4am|7am|8:30am&token=SECRET[&date=YYYY-MM-DD]  → JSON
```

### Send gate logic (notify.js, current — pre-v4.1.1)
1. `window=4am` → always send; stores hash in `cron_health` after send
2. `window=7am|8:30am` → reads `cron_health.result` for `cron_name='notify'`; if `lastDate` matches today and `lastHash` matches current hash → skip; otherwise send + update hash
3. If `lastDate` is yesterday → treat as no baseline (first send of new day)

### No DB migrations in v4.1
All data from existing `daytime_appointments` + `workers` tables.
Change-detection hash stored in `cron_health.result` under `cron_name='notify'`.

---

## v4 — Daytime Activity Intelligence

### Workers
| Name | External UID |
|---|---|
| Charlie | 61023 |
| Kathalyn Dominguez | 208669 |
| Kentaro Cavey | 141407 |
| Max Posse | 174385 |
| Sierra Tagle | 189436 |
| Stephen Muro | 164375 |
| No worker / boardings | 0 |

### Service categories
| Category | cat-ID | ser-ID |
|---|---|---|
| Daycare | 5634 | 10692 |
| Playgroup | 7431 | 15824 |
| Boarding | 5635 | 17357, 11778, 22215, 22387 |

---

## Cron health (as of March 5, 2026)
- `schedule` — 00:18 UTC → queued 14, skipped 124, 1 page scanned
- `detail` — 00:27 UTC → idle
- `auth` — 00:54 UTC → skipped (session still valid)

Check each session:
```sql
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;
-- Notify state:
SELECT result FROM cron_health WHERE cron_name = 'notify';
-- Last daytime sync time:
SELECT MAX(updated_at) FROM daytime_appointments WHERE appointment_date = CURRENT_DATE;
```

---

## v3.2 Decisions Locked In
- Rate fallback: `boarding.night_rate ?? dog.night_rate ?? 0`
- HASH_FIELDS: identity/structure only — pricing excluded
- `.maybeSingle()` everywhere a 0-row result is valid; never `.single()` for existence checks
- Form matching: 7-day window `(arrival − 7 days)` to `(arrival day)` inclusive
- Form field regex: `id="(field_\d+)-wrapper"` — external site uses `-wrapper` suffix
- `sync_status = 'archived'` — `is_archived` column does NOT exist

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

-- Notify state (last image sent)
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
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, **v4.1.0 (Latest)**
- Next: `v4.1.1` after image polish PR merges

## Archive
- v4.0 full session log: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 full session log: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 full session log: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
