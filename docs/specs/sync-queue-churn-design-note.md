# Design note: sync queue churn (#278), with the queue alert shared by #275

## Problem
Every schedule scan re-queues about 30 appointments that didn't change. The queue drains about 62 items a day (3 Integration Checks × 20, plus `cron-detail` and `cron-detail-2`), and about 4 scans a day add 30 each on top of new bookings. So the backlog grows without end. New and edited bookings wait behind it, and the Integration Check reports them missing in the meantime (C63QhKpW on 2026-10-19). Nothing alerts on queue depth.

**Cause:** B-3 (#205, `enqueue()` in `src/lib/scraper/syncQueue.js`) treats any change to the `/<timestamp>` at the end of a `done` item's URL as an edit.

**What the timestamp really is** (read from live AGYD week pages, 2026-10-19, pages for 10/18, 10/19, 10/20, 10/21 and 10/26):
- A week page (`/schedule/days-7/Y/M/D`) shows the Sunday–Saturday week that contains the date.
- **A boarding stay** (e.g. "10/13-29") is one link repeated on every day it covers, and **every copy has the same timestamp: the stay's start day.** It doesn't drift.
- **A recurring series** (playgroup "PG:FT", daycare "DC M/T/W/TH", and day visits such as C63QhKpW's "10am - 4pm" on 10/20–22) has **one timestamp per occurrence**. `parseScheduleHtml` keeps the first link per ID, so the stored timestamp is whichever occurrence came first on the pages that scan fetched.
- That first occurrence changes as days pass, and as the cursor week rotates through the next 8 weeks. In the 18:44 UTC run on 10-19 (39304992997), **all 32 "modified" re-queues were PG series**. 11 moved one day later and 2 moved two days later, and **19 moved earlier** (12/07 → 12/01), because the cursor page brought an earlier occurrence into view.

So "the URL changed" is a real edit signal for a stay, and noise for a series.

## What counts as "modified" (the choice, revised after the architect review)
A `done` appointment is re-queued when the scan shows it was edited:
1. **Its title changed.** Compared trimmed, using the same value the scan stores (`title`, else the pet name). A stored or incoming title that's empty isn't compared. Dates live in titles ("10/19-22"), so this also catches a moved checkout, which the URL never showed.
2. **Its URL timestamp changed, and the detail step didn't skip it.** When the detail step skips an appointment (REQ-104: same-day, daycare and so on), it now records the reason in `meta.detail_skip`. A URL change on a skipped item is ignored: no re-queue, no write.

Every churned item on 10-19 was one the detail step skips (the drain logged `skipped` for all 37). Stays keep B-3 exactly as before. An item is never re-queued over and over: a re-queue stores the new title and URL, and the detail result sets the flag again.

**Measured before building (live pages, 2026-10-19):**
- 399 appointment IDs across six week pages. **No ID has different titles on different copies**, so the title rule can't churn.
- Of 191 `done` rows, **6** have a different title now, and all 6 are real edits (for example a checkout moved from 10/23 to 10/24). That's the day-one re-queue wave.
- The churned series have no `detail_skip` yet. Each is re-queued once more on its next URL change, then flagged.

## Options considered
1. **Ignore a timestamp that moved later while the old one is already past.** It misses the 19 cursor-driven moves to an earlier date. Rejected.
2. **Fingerprint the schedule `time` text.** It differs from day to day for the same stay. Rejected.
3. **A series is "an ID with more than one timestamp across the scan's pages"** (the first draft). The architect showed that a once-a-week series, or one seen only on the cursor page, shows a single timestamp, so the churn comes back. Rejected.
4. **Use the detail step's own skip verdict, plus a title change (chosen).** The architect proposed it. There's no timestamp guessing and no #198 risk: the classification is the detail filter's, not new scan patterns.
5. **Add PG to `nonBoardingPatterns`.** It changes what counts as a boarding (#198). Not in this change.

## What breaks
- **A skipped item edited without a title change** isn't re-synced. Today it would be re-synced and skipped again, so nothing is lost.
- **A stay the detail step skipped by mistake** keeps that verdict until its title changes. The same is true today: the skip is the detail filter's decision either way.
- **A recurring boarding (one ID across weeks) moved without a title change:** if the detail step saved it, the URL rule still re-queues it.
- **Proof in production:** `runScheduleSync` now returns `requeuedEdited` and `urlChangesIgnored`, and `cron-schedule` writes both into its `cron_health` row. After deploy, `requeuedEdited` should be close to 0 on most scans.

## The queue alert (outside GitHub's scheduler)
ops-watch (`api/ops-watch.js`, a Vercel cron at 17:00 UTC) already checks "oldest pending older than 48 h" and "pending but nothing processed in 36 h". The 48 h rule was too slow for this: re-queued items look young, and it takes days for the oldest item to cross 48 h.
- **Timetable (UTC):** Integration Check at 00:00 (scan + 20), `cron-schedule` at 00:05, the detail crons at 00:10 and 00:15 (1 each), Integration Checks at 08:00 and 16:00 (the 16:00 one often runs late), then ops-watch at 17:00.
- **Oldest pending, 48 h → 16 h.** An item from the midnight scans that's still pending at 17:00 has missed both detail crons and the 08:00 drain.
- **New: more than 30 pending.** The Integration Check starts reporting false "Missing from DB" once an item sits behind more than one 20-item drain. After this fix, a normal day queues about 17.
- Both rules run on Vercel, not GitHub, and alert through `sendAlert` (Telegram) plus the `ops-alert.yml` email.
- **Day one:** 0 pending now (drained 19:05 UTC), plus the 6-item title wave and one more re-queue per churned series. That's under 30, so no alert is expected.

## #275 (sync silent failures): shared alert, separate fix
- **Shared:** the 16 h rule catches #275's detail-side `session_cleared` bounce. The item goes back to `pending` without touching `queued_at`, so it ages.
- **Not covered:** a scanner that keeps returning `session_cleared` (the login form served after `ensureSession` succeeds) enqueues nothing. Then the queue is empty and these rules stay silent. **#275 adds an ops-watch check: "no schedule scan with `found > 0` in about 26 h"**, read from `cron_health`.
- **Kept separate:** the `sync_settings` error handling and not advancing the cursor after failed enqueues. That's different code; its own PR.

## Threat
No new secret, table, service or message recipient. The alert text holds counts and ages only, never client or dog names. Reading AGYD pages to confirm the timestamp behaviour used the existing cached session, read-only.

## How we'll know it's working
- **Tests from REQ-109 and REQ-651** (the rules above), with expected decisions worked out by hand, plus mutation scores on `syncQueue.js` and `opsWatch.js`.
- **In production:** the schedule `cron_health` row shows `requeuedEdited` near 0 and `urlChangesIgnored` counting the series. `sync_queue` pending at ops-watch time stays under about 20.
- **When it isn't working:** ops-watch reports "Sync queue deep" (more than 30) or "Sync backlog" (oldest over 16 h).

## Architect review (2026-10-19): proceed with changes, all applied
1. **The recurring check fails for series seen on one page.** Replaced with the detail-skip flag (option 4).
2. **Compare titles the way they're stored, and update them on both re-queue paths.** Done. Titles were checked for consistency across copies, and the day-one wave measured at 6.
3. **Thresholds: more than 30 pending and 16 h**, from the real timetable. Done.
4. **#275 needs a scanner-outcome check.** Recorded above, built in #275.
5. **Make the fix observable.** `requeuedEdited` and `urlChangesIgnored` go into the scan result and the `cron_health` row.
6. **Counts:** the 13 one-day moves were really 11 one-day and 2 two-day moves. Fixed.
