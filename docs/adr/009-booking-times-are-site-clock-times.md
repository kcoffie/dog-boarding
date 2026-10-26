# ADR-009: Booking times are site clock times, read only through siteClock.js

**Status:** Accepted (Kate, 2026-10-26)
**Date:** 2026-10-26 (#353)
**Supersedes:** nothing.

---

## Context
The booking site stores each booking's times as **San Francisco clock times written as if they were UTC**: a 10:00am drop-off is `10:00Z`, summer and winter alike, with no DST shift. The sync copies the page's seconds as they are. The app then read them as real moments, so:
- the Friday pm roster printed "Sat 3:15 AM" for a 10:15am pick-up;
- the screens showed times 7–8 hours early on a Pacific device;
- the Friday roster's window left off Friday-afternoon bookings.

Evidence (E1–E9: the site's own pages, 387 of 389 AM/PM labels, 14,954 daytime rows, a stay across DST): `docs/specs/353-booking-times-design-note.md`.

## Decision
- **Booking times stay stored as the site writes them.** These are "site clock" values: their UTC parts *are* the San Francisco date and time. No data repair and no migration.
- **One module reads them: `src/utils/siteClock.js`.**
  - `siteDate`: the San Francisco date.
  - `siteTime` / `bookingTime`: "10:15 AM", or "10:15 AM PT" with the "PT" label.
  - `formatSiteDate`.
  - `siteNow`: San Francisco's wall clock now, written the same way, as an ISO string so it can't reach a Pacific formatter.
  - `siteMidnight`: a picked calendar day as a site clock value.
- **Only the date is shown when the time isn't known** (Kate's answers Q2, Q5, Q6):
  - a title-only date: no AM/PM label and a time of 00:00, 07:00, 08:00 or 23:00, the midnight of whatever zone ran the sync;
  - an AM/PM label that contradicts the time.
- **New title-only dates are written as `Date.UTC` midnights**, the same whether a browser or Vercel runs the sync.
- **Real moments stay real moments:** `created_at`, `updated_at`, `last_synced_at`, `cancelled_at`, `paid_date` and cron times. Shown in San Francisco time with `BUSINESS_TIME_ZONE` (#350).
- **The guard:** a test fails when a file that names a booking-time field uses a local-zone call (`getHours`, `setDate`, `toLocaleString` without `timeZone`, `new Date(y, m, d)`...) outside `siteClock.js`, unless the line says `// real-moment: <why>`.

## Options rejected
- **Convert at the sync and repair the stored rows (real moments):**
  - Kate would have to run a two-table repair (369 boardings, 482 bookings plus their history) at the same moment as the deploy.
  - Every booking would show as changed once.
  - The server code that is right today would get new Pacific-midnight boundaries.
- **New date and time text columns:** a migration, a backfill, and two sources of truth for every reader.

## Consequences
- **Raw SQL against `now()` on these columns is always 7–8 hours off.** This applies to Kate's queries and to any future ops-watch rule: compare with San Francisco's wall clock written as UTC instead.
- **#318's engine and any new reader must use `siteClock`.** The guard catches local-zone reads. It doesn't catch a comparison with the real now (`new Date() > new Date(departure)`); each reader's tests must.
- **The repeated 1–2am hour on 11-01 has no ambiguity in storage.** `siteNow` steps back an hour during it, which is harmless for comparisons.
- **Server code no longer depends on Vercel running in UTC:** `queryBoarders`, form matching, the form job and Sync Now's ranges.
- **The Friday pm roster now runs from the run's hour on Friday to Monday noon**, with the header "Fri – Mon" (Kate, Q4).
