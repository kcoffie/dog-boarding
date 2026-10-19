# Design note: sync queue churn (#278), with the queue alert shared by #275

## Problem
Every schedule scan re-queues about 30 appointments that didn't change. The queue drains about 62 items a day (3 Integration Checks × 20, plus `cron-detail` and `cron-detail-2`), and about 4 scans a day add 30 each on top of new bookings. So the backlog grows without end. New and edited bookings wait behind it, and the Integration Check reports them missing in the meantime (C63QhKpW on 2026-10-19). Nothing alerts on queue depth.

**Cause:** B-3 (#205, `enqueue()` in `src/lib/scraper/syncQueue.js`) treats any change to the `/<timestamp>` at the end of a `done` item's URL as an edit.

**What the timestamp really is** (read from live AGYD week pages, 2026-10-19, pages for 10/18, 10/19, 10/20, 10/21 and 10/26):
- A week page (`/schedule/days-7/Y/M/D`) shows the Sunday–Saturday week that contains the date.
- **A boarding stay** (e.g. "10/13-29") is one link repeated on every day it covers, and **every copy has the same timestamp: the stay's start day.** It doesn't drift.
- **A recurring series** (playgroup "PG:FT", daycare "DC M/T/W/TH", and day visits such as C63QhKpW's "10am - 4pm" on 10/20–22) has **one timestamp per occurrence**. `parseScheduleHtml` keeps the first link per ID, so the stored timestamp is whichever occurrence came first on the pages that scan fetched.
- That first occurrence changes as days pass, and as the cursor week rotates through the next 8 weeks. In the 18:44 UTC run on 10-19 (39304992997), **all 32 "modified" re-queues were PG series**. 13 moved one day later (10/19 → 10/20), and **19 moved earlier** (12/07 → 12/01), because the cursor page brought an earlier occurrence into view.

So "the URL changed" is a real edit signal for a stay, and noise for a series.

## What counts as "modified" (the choice)
A `done` appointment is re-queued when the schedule scan shows that it was edited:
1. **Its title changed.** The scan's title is compared, trimmed, with the stored `sync_queue.title`. A stored title that's empty or null can't be compared, so it's not an edit. Dates live in titles ("10/19-22"), so a reschedule nearly always changes the title too.
2. **Its URL timestamp changed and it isn't recurring.** An appointment is **recurring** when the scan saw more than one distinct timestamp for its ID, across every page that run fetched. A stay shows one, a series shows several (a once-a-week series still shows one on this week's page and one on next week's).

A recurring appointment's new URL is not an edit. An item that's pending or processing is never touched (as today). Form items (`resetIfDone`) are unchanged. When an item is re-queued, its stored title and URL are updated, so the same edit re-queues it once, not every scan.

## Options considered
1. **Ignore a timestamp that moved later while the old one is already past.** No new data needed, but it misses the 19 cursor-driven moves to an earlier date. Rejected.
2. **Fingerprint the schedule `time` text** ("Oct 13, 5:05pm ..."). The text differs from day to day for the same stay ("PM - Oct 24, AM" vs "Oct 18, PM - Oct 24, AM"), so it would churn too. Rejected.
3. **Recurring detection plus a title change (chosen).** It uses only what the scan already fetches, needs no migration, and makes a stay's start-date move still re-queue.
4. **Add PG to `nonBoardingPatterns` so series are never queued.** That would cut the volume (every PG item is skipped at detail anyway), but it changes what's treated as a boarding, which is the #198 risk. Not in this change.

## What breaks
- **A stay rescheduled in place without a title change, after it started** (the start moves while the old start is past): its single timestamp changes, so rule 2 still catches it. Only a *recurring* appointment edited without a title change is missed, and those are daytime items the detail step skips anyway.
- **A one-off appointment that the scan sees on one page only:** treated as a stay, so it keeps today's behaviour.
- **A recurring series down to its last visible occurrence:** it now looks like a single appointment, and if that timestamp differs from the stored one it's re-queued once. That's bounded: once per series end, not once per scan.
- **The first scans after deploy:** stored titles were set at first queue time. An appointment whose title was edited since then is re-queued once. That is a real edit.

## The queue alert (outside GitHub's scheduler)
ops-watch (`api/ops-watch.js`, a Vercel cron at 17:00 UTC) already checks "oldest pending older than 48 h" and "pending but nothing processed in 36 h". The 48 h rule wouldn't have caught this early: churn keeps re-queued items young, and it takes days for the oldest item to cross 48 h.
- **Add: queue depth.** A finding when more than **60** items are pending. That is about one day's drain capacity. After this fix a normal day queues about 17 new items, all drained within the day.
- **Tighten: oldest pending, 48 h → 24 h.** An item queued by the 00:05 UTC scan has three Integration Check drains plus two detail crons before the next day's ops-watch, so pending for over 24 h means it's stuck.
- Both rules run on Vercel, not GitHub, and alert through `sendAlert` (Telegram) plus the `ops-alert.yml` email, as every ops-watch finding does.

## #275 (sync silent failures): shared alert, separate fix
- **Shared:** the new rules are the outcome check for #275's "endless `session_cleared`" case. That path puts the item back to `pending` without touching `queued_at`, so it ages past 24 h and alerts.
- **Not shared:** #275's `sync_settings` failures (the cursor reset to today, duplicate rows) don't show up as queue depth. Their fix is to check `error` and fail the run, so `cron_health` goes red, plus not advancing the cursor after failed enqueues. That's different code (the cursor and session cache) and gets its own PR, built against this note's alert section.

## Threat
No new secret, table, service or message recipient. The alert text holds counts and ages only, never client or dog names. Reading AGYD pages to confirm the timestamp behaviour used the existing cached session, read-only.

## How we'll know it's working
- **Tests from REQ-109** (B-3 rules above), with the expected re-queue decisions worked out from the 10-19 log shapes by hand, plus a mutation score on `syncQueue.js` and the changed `syncRunner.js` lines.
- **In production:** the next scans log `0 re-queued modified` for PG series (the `🔄 Re-queued modified` line count in the Integration Check step 0 log). `sync_queue` pending at ops-watch time stays under about 20.
- **When it isn't working:** ops-watch reports "Sync backlog: N items pending" (over 60) or an oldest item over 24 h.
