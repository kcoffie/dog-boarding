# Dog Boarding App — Session Handoff (v4.1 in progress)
**Last updated:** March 5, 2026 (v4.0.0 released; v4.1 roster image implementation started)

---

## Current State

- **v4.0 is LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **v4.0.0 GitHub Release tagged** — demoted v3.2.0 from latest, v4.0.0 is now latest
- **PR #40 merged** — HTML entity decode fix for pet/client names
- **v4.1 branch open** — `feat/v4.1-roster-image`; PR not yet opened
- **737 tests pass, 46 files, 0 failures**

---

## IMMEDIATE NEXT ACTIONS

1. **Twilio setup** — sign up at twilio.com, activate WhatsApp sandbox, get a sandbox number
2. **Add Vercel env vars** — `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `NOTIFY_RECIPIENTS=+18312477375`
3. **Add GitHub Actions secrets** — `APP_URL` (production URL e.g. `https://qboarding.vercel.app`), `VITE_SYNC_PROXY_TOKEN` (copy from Vercel dashboard)
4. **Test the image endpoint** — `GET /api/roster-image?date=2026-03-05&token=...` in browser; verify PNG renders correctly
5. **Test the notify endpoint** — `GET /api/notify?window=4am&token=...`; verify Twilio delivers image to test number
6. **Open PR** for `feat/v4.1-roster-image` → merge → tag `v4.1.0`

---

## v4.1 Staff Engineer Pre-Implementation Review (archived)

### Decision Log — Critical Branching Points

| Branching Point | What to Log |
|---|---|
| `getPictureOfDay` entry | `date`, query date range (today + yesterday) |
| Today's query result | Row count per worker; warn if 0 rows (cron may not have run yet) |
| Yesterday's query result | Row count; if 0 rows → "no baseline, treating all as new" |
| Diff computation per worker | Worker name, added count, removed count |
| `shouldSend` check | `window`, `hasUpdates`, decision + reason |
| Image generation | Dimensions (width x computed height), worker count, total dog count |
| `satori` render | Success or error; error → abort (do not send broken image) |
| Twilio send attempt | Masked number (last 4 only), response SID |
| Twilio error | HTTP status, error code, message |

### Pattern Alignment

- Pure data layer: `getPictureOfDay` is side-effect-free, fully unit-testable
- Dependency injection: supabase + Twilio clients passed in, never constructed inside business logic
- Single-responsibility routes: `/api/roster-image` only generates images; `/api/notify` only orchestrates
- Explicit state: last_notified_hash stored in `cron_health` table under `cron_name='notify'` — no new migration needed
- No full phone numbers in logs — masked to last 4 digits everywhere

### Security Surface Area

- No new RLS policies needed — all routes use service role key (server-side only)
- Env vars: `TWILIO_ACCOUNT_SID` (secret), `TWILIO_AUTH_TOKEN` (secret), `TWILIO_FROM_NUMBER`, `NOTIFY_RECIPIENTS` (secret — contains Kate's number), `VITE_SYNC_PROXY_TOKEN` (reused for auth)
- `date` param: validated against `/^\d{4}-\d{2}-\d{2}$/`, parsed as local Date (no UTC trap)
- `window` param: exact allowlist `['4am', '7am', '8:30am']`
- `token` param: compared against env var; constant-time string comparison
- Roster image URL contains token — standard Twilio media URL pattern

---

## v4.1 Implementation (completed this session)

### New files

| File | Purpose |
|---|---|
| `src/lib/pictureOfDay.js` | `getPictureOfDay`, `hashPicture`, `shouldSendNotification`, `parseDateParam` |
| `api/roster-image.js` | Vercel serverless fn; validates token+date, generates PNG via satori+@resvg/resvg-js |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper: `createTwilioClient`, `sendRosterImage`, `getRecipients` |
| `api/notify.js` | Orchestrator: validates params, fetches data, gates send, calls Twilio |
| `src/__tests__/pictureOfDay.test.js` | 22 tests for data layer (all passing) |
| `.github/workflows/notify-4am.yml` | GitHub Actions: 4am PST daily (always sends) |
| `.github/workflows/notify-7am.yml` | GitHub Actions: 7am PST daily (sends if diff) |
| `.github/workflows/notify-830am.yml` | GitHub Actions: 8:30am PST daily (sends if diff) |
| `api/_fonts/inter-400.ttf` | Inter Regular (bundled font for satori, ~398KB) |
| `api/_fonts/inter-700.ttf` | Inter Bold (bundled font for satori, ~405KB) |
| `docs/archive/SESSION_HANDOFF_v4.0_final.md` | Archived v4.0 handoff |

### New packages installed

| Package | Version | Purpose |
|---|---|---|
| `satori` | 0.25.0 | HTML/CSS-like element tree → SVG |
| `@resvg/resvg-js` | 2.6.2 | SVG → PNG (native bindings, Node.js runtime) |
| `twilio` | 5.12.2 | WhatsApp message delivery |

### No new DB migrations needed
All data comes from existing `daytime_appointments` + `workers` tables.
Change-detection state stored in `cron_health` under `cron_name='notify'`.

### DST note — update GitHub Actions workflows twice/year
- PST (Nov–Mar): 4am=12:00 UTC, 7am=15:00 UTC, 8:30am=16:30 UTC
- PDT (Mar–Nov): 4am=11:00 UTC, 7am=14:00 UTC, 8:30am=15:30 UTC
- **DST starts March 8, 2026** — update workflow cron strings soon

---

## v4.1 Image Format (confirmed)

```
┌────────────────────────────────────────────────┐
│  Thursday, March 5      Daily Roster  UPDATED! │  ← dark header
├──────────────────┬─────────────────────────────┤
│ Charlie (3 dogs) │ Kathalyn (5 dogs)           │  ← worker cards (2-3 col)
│ + Bronwyn (C)    │ + Frances (Wiebe)           │  ← green (+)
│ + Rex (Smith)    │ − Tasha (See)               │  ← red (−), strikethrough
│   Benny (Jones)  │   Milo (Park)               │  ← gray (unchanged)
├──────────────────┴─────────────────────────────┤
│ Boarders: Benny · Millie · Bowie               │
└────────────────────────────────────────────────┘
```

- Layout: 800px wide, dynamic height
- Columns: 2 columns for ≤2 workers; 3 columns for 3–6 workers
- Dog line: `Pet (LastName)` format; added first → removed → unchanged

---

## v4 — Daytime Activity Intelligence

### Goal
Ingest ALL daytime dog activities (Daycare + Playgroup) from the schedule page. Deliver a "picture of the day" image per worker showing who's in their group, who was added vs. yesterday, who was removed — sent via WhatsApp.

### Delivery phases
1. **v4.0** ✅ — Data ingestion: parse full schedule page, store all daytime appointments
2. **v4.1** 🚧 — Roster image: generate PNG + send via Twilio WhatsApp
3. **v4.2** — Multiple numbers + group chat; DST-aware cron times
4. **v4.3** — On-demand daytime ingest via "Sync Now" button

---

### What the schedule page gives us (no detail fetches needed)

Each `.day-event <a>` element on the weekly grid (`/schedule/days-7/YYYY/M/D`) exposes:

| Data | Source |
|---|---|
| Appointment external ID | `data-id` |
| Day-column date | `data-ts` (Unix ts, midnight of that day) |
| Actual check-in time | `data-start` (Unix ts) |
| Status | `data-status` (1=upcoming, 5=in-progress, 6=completed) |
| Recurring series ID | `data-series` (stable across same dog's recurring appts) |
| Worker ID | class `ew-{uid}` (0 = no worker = boardings) |
| Service category + type | classes `cat-{id}` `ser-{id}` |
| Title (free-form) | `.day-event-title` inner text |
| Display time | `.day-event-time` inner text |
| Client UID | `data-uid` on `.event-clients-pets` |
| Client name | `.event-client` inner text |
| Pet external IDs | `data-pet` on each `.event-pet-wrapper` |
| Pet names | `.event-pet` inner text |
| Multi-day span | classes `appt-before`, `appt-after`, `appt-all-day` |

### Workers (confirmed from HTML)
| Name | External UID |
|---|---|
| Charlie | 61023 |
| Kathalyn Dominguez | 208669 |
| Kentaro Cavey | 141407 |
| Max Posse | 174385 |
| Sierra Tagle | 189436 |
| Stephen Muro | 164375 |
| No worker set (boardings) | 0 |

### Service categories (confirmed)
| Category | cat-ID | service | ser-ID |
|---|---|---|---|
| Daycare | 5634 | Daycare Monthly | 10692 |
| Playgroup | 7431 | Playgroup Monthly | 15824 |
| Boarding | 5635 | Boarding (Nights) | 17357 |
| Boarding | 5635 | Boarding (Days) | 11778 |
| Boarding | 5635 | Boarding discounted (DC FT) | 22215 |
| Boarding | 5635 | Staff Boarding (nights) | 22387 |

### Day-over-day diff logic
`data-series` is stable for recurring appointments of the same dog with the same worker.
- For each worker: collect `Set<series_id>` for day N and day N-1
- Added = in N but not N-1
- Removed = in N-1 but not N

---

### WhatsApp integration
- **Twilio** chosen — Node SDK, free trial, WhatsApp sandbox for testing
- Three GitHub Actions workflows (not Vercel crons — already at 3-cron Hobby limit)
- Send gate: 4am always sends; 7am/8:30am compare hash vs. `cron_health.result.lastHash`

---

## Data quality notes
- **Staff Boarding empty pets**: `ser-22387` events have no pet data. Expected, not a bug.

---

## Cron health (as of March 4, 2026)
- `schedule` — 00:18 UTC → queued 14, skipped 124, 1 page scanned
- `detail` — 00:27 UTC → idle
- `auth` — 00:54 UTC → skipped (session still valid)

Check each session:
```sql
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;
-- Check notify state (last hash sent):
SELECT result FROM cron_health WHERE cron_name = 'notify';
```

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

-- Stored forms
SELECT bf.boarding_id, d.name, bf.submission_id, bf.date_mismatch,
       bf.form_arrival_date, bf.form_departure_date, bf.fetched_at
FROM boarding_forms bf
JOIN boardings b ON bf.boarding_id = b.id
JOIN dogs d ON b.dog_id = d.id
ORDER BY bf.fetched_at DESC LIMIT 10;

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
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, **v4.0.0 (Latest)**
- Next release: `v4.1.0` after `feat/v4.1-roster-image` PR merges

## Archive
- v4.0 full session log: `docs/archive/SESSION_HANDOFF_v4.0_final.md`
- v3.0 full session log: `docs/archive/SESSION_HANDOFF_v3.0_final.md`
- v2.4 full session log: `docs/archive/SESSION_HANDOFF_v2.4_final.md`
- Earlier versions: `docs/archive/SESSION_HANDOFF_v2.{0-3}_final.md`
