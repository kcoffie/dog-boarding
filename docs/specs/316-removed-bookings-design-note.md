# #316 design note: a booking removed on the booking site is cancelled in the app automatically

**Status:** architect: proceed with changes (folded in below, session 52, 2026-10-26); Kate answered Q1 and Q3; Q2 and Q4–Q5 open. Builds on #353 PR 1 (`siteMidnight`, merged 10-26 as `f317878`). Issue #316 (`priority: high`, Kate 2026-10-26: "very soon"). Kate: the booking site is the source of truth (2026-10-23).

## Problem
A booking deleted on the booking site stays in the app: on the rosters, in nights and in pay. Only the browser's Sync Now notices it: `reconcile.js` is called only from `sync.js` (`src/lib/scraper/sync.js:458`), which only `useSyncSettings.js` imports. The scheduled syncs read just the bookings they see on the week pages (`runScheduleSync`, `src/lib/scraper/syncRunner.js:261`), and a deleted booking simply isn't there, so nothing scheduled looks at it again.
- **Seen:** `C63QhHuu` was on the 10-20 4am roster after it was gone from the site; a Sync Now cancelled it that evening. `C63QhB7h` (11-03 → 11-12, two dogs) shows "You cannot view appointment" in Kate's Chrome (10-26) and is still `confirmed` in the app.
- **Second half of the same problem:** a cancellation is permanent. Sync Now skips archived bookings forever (`sync.js:332`), and nothing in the sync clears `boardings.cancelled_at` (its only writer is `reconcile.js:108`). If the site brings a booking back, the app keeps it cancelled.

## Evidence (each checked; no guessing)
| # | Claim | Source |
|---|---|---|
| E1 | A removed booking's URL answers **302 → `/schedule`**; the "You cannot view appointment" box is drawn by the page's JavaScript, not in the HTML | `reconcile.js:22-24` (seen 2026-10-21 on an archived booking) |
| E2 | An *edited* booking also redirects, but comes back on the schedule under the **same booking ID** with a new URL timestamp; "not seen" compares booking IDs, so an edit is not a candidate | #344 (`C63QhLBU`, 2026-10-23); `findReconciliationCandidates`, `reconcile.js:54` |
| E3 | Reconciliation already marks only on proof (#324): >10 missing → opens none; any unexpected answer → marks none; >3 gone → marks none; a 429/403 stops the run | `reconcile.js:15-18, 120-180` |
| E4 | `cron-schedule` (Vercel, 00:05 UTC daily) reads the pages for `today` and `today + 7 d` plus one cursor week, and collects every booking ID it saw (`seenIds`) before the non-boarding filter. A page shows the Sunday–Saturday week *containing* its date (live pages, 10-19); on a UTC host the two dates always fall in consecutive weeks. At 00:05 UTC `today` is San Francisco's date + 1 | `syncRunner.js:74-79, 281-321` (`seenIds` `:296`, `:319`); `docs/specs/sync-queue-churn-design-note.md:9` (the comment at `schedule.js:101`, "D starts the window", is wrong) |
| E4b | **A stay is listed on every day it covers**, including weeks after it began: `C63QhFVc` (10/13–10/29) shows on each week page in that range | Kate, 2026-10-26; `sync-queue-churn-design-note.md:10` |
| E4c | A two-dog booking has one boarding per dog: `<id>` and `<id>_p1` (`C63QhB7h`, `C63QhFVc` tonight). `mapped_boarding_id` points only at `<id>` | `mapping.js:661-670, 851-852`; `boardings`, read-only |
| E5 | The server fetch doesn't follow redirects, so a real 302 and `Location` reach the classifier (unlike Edge, which #324 couldn't prove) | `redirects.js`, #344 PR 1 |
| E6 | Tonight's window (Sun 10-25 → Sat 11-07) holds 13 active bookings with a boarding (5 began before Sunday 10-25; listed per E4b); 73 active rows have no check-out date and can never be candidates (the dateless week-page rows of #344, no boarding) | `sync_appointments`, read-only, 2026-10-26 |
| E7 | History: reconciliation archived 12 bookings in 123 Sync Now runs since January; >10 candidates never happened | findings `:54`; `sync_appointments` (12 archived) |

## Options
**A. Run the existing reconciliation in the nightly `cron-schedule`, over the two weeks it reads (recommended).** After the scan, the bookings not seen whose stay overlaps this week + next week (site clock values, ADR-009) are candidates. Each is opened once without following redirects. It's cancelled only on proof (E1, E3), and every cancellation or stop alerts Kate. A booking that's cancelled but shows up on the schedule again is re-read and un-cancelled, and Kate is told.
- Requests: one page per candidate. Most nights 0 (E7); at most 10, else none are opened. The cursor week isn't used, because its weeks aren't contiguous with the window.
- Latency: removed by 00:05–01:00 UTC (5–6pm Pacific), before the next morning's rosters.
- Built from what exists: `reconcileArchivedAppointments` is already Node-safe and server-tested.

**B. Wait for #318 step 4** (the daily full pass with reconciliation both ways): ~late November. Too late for `C63QhB7h` (11-03) and against "very soon".

**C. Integration Check reports "in the app, gone from the site", and Kate cancels by hand:** against the source-of-truth rule (no hand edits), and Kate has to act on every one.

## Choice and why
**A.** It closes the gap now with the proof rules already reviewed in #324, about 0 extra requests most nights, and no new table, secret or job (the alert job is new, see below). #318's engine later absorbs it: the logic stays in `reconcile.js`.

## What changes (A)
1. **Only the nightly `cron-schedule` reconciles:** `runScheduleSync(supabase, { reconcile: true })`, passed only by `api/cron-schedule.js`. The Integration Check calls `runScheduleSync` 3 times a day (`scripts/integration-check.js:473`) and stays check-only, as #318 plans.
2. **The window is exactly the two pages read:** the Sunday of the week containing `today`'s page date, to that Sunday + 14 days, as site clock midnights (`new Date(siteMidnight(...))`: a Date, since `findReconciliationCandidates` calls `.toISOString()`). Built from the same Date objects the page URLs used. It runs only if both pages were read with bookings on them, and the two Sundays are exactly 7 days apart (a guard for non-UTC hosts across DST). Candidates also need a check-out date after the window's Sunday, so a stay that ended that Sunday morning isn't a candidate all week. A booking ID seen on **any** page read that night, the cursor page included, is never a candidate.
3. **A removed booking cancels all its dogs:** every boarding matching `^<id>(_p\d+)?$` (as `findBookingBoardings`, `mapping.js:661-670`), not just `mapped_boarding_id`. The boardings are cancelled first, then the row is archived, so a timeout in between leaves the row active for the next night.
4. **Restore only on proof:** an archived booking ID seen again on a page is re-queued (`resetIfDone: true`, `meta.restore`). After its detail page answers 200 with a booking and mapping saves it, the row goes back to `active`, and `cancelled_at` / `cancellation_reason` are cleared on all its boardings. `booking_status` is never touched. A redirect leaves it cancelled. If the dog already has another active boarding overlapping those dates (the case Sync Now's skip at `sync.js:330-332` guarded against), it's reported and not restored. Sync Now's "skip archived forever" becomes the same re-queue.
5. **Every outcome is reported; nothing fails silently:**
   - one Telegram alert per run (new job **`sync-reconcile`**, added to ops-watch's `ALERT_JOBS`, `opsWatch.js:135`) listing each cancelled or restored booking (booking ID, dates, dog names), every stop (`skipped`), any error (a failed candidate query or write sets `errors`, which today leaves `skipped` null, `reconcile.js:138-144, 204-212`), and the count of `present` bookings (live pages not on the schedule: the only sign the parser is missing bookings);
   - a quiet run sends nothing;
   - the `schedule` row's `cron_health` result gets `reconcile: { candidates, present, gone, archived, restored, skipped, errors, alertDelivered }` (`api/cron-schedule.js:72-82` lists its fields); an undelivered alert makes the run `failure` (REQ-652, `alertKate.js:75`).
6. **`cron-schedule` gets an explicit `maxDuration`:** runs take 10.7–22.7 s today (2–3 pages); 10 candidates add ~50–85 s.
7. **An archived booking's own queue item** is skipped by the detail run unless it carries `meta.restore`, so a redirect doesn't also raise a `sync-detail` alert.
8. **Docs:** REQ-108 (both paths), RUNBOOK ("a booking was cancelled by the sync"), the `cron-schedule` job doc, and the comment at `schedule.js:101`.

**Not changed:** the proof rules and limits (10 candidates, 3 marks), the Integration Check, `cron-detail`'s requests.

## What could go wrong
- **A page that lists fewer bookings than it should** (a layout change, a partial page) makes real bookings look missing. Each is opened before marking: a live booking answers 200 with its page (`present`), which is never marked. More than 10 → none opened, Kate is told.
- **A booking edited to dates outside the two weeks:** its ID leaves both pages, and its old URL also answers 302 → `/schedule` (E2), so it's cancelled although it's live. The cursor page (weeks 2–8) usually still lists it, which keeps it off the candidate list. If not, the restore (item 4) brings it back when it next appears on any page, and the alert says "removed on the site, or moved outside the next two weeks" (Q4).
- **A 403 or 429 on a candidate** trips the booking-site breaker (`auth.js:76-80`) and stops every sync until Kate presses Clear. E1 is one observation of a 302, so Q2 is answered before merge.
- **A false cancellation** now heals itself (item 3) the next time the booking appears on the schedule, and Kate sees both alerts.
- **Booking-site load:** 0 most nights; the worst case is 10 page loads a night.

## Questions for Kate
1. ~~Does a week page list a stay that began before its Sunday?~~ **Yes** (Kate, 2026-10-26, E4b). No exclusion needed.
2. **Does `C63QhB7h` answer 302 → `/schedule`?** Kate checks once in her browser's Network tab, **before merge**: a 403 or 429 there would trip the breaker on the first night (above).
3. ~~Alert wording and channel~~ **One Telegram alert per run, listing each cancelled or restored booking: yes** (Kate, 2026-10-26).
4. **A booking moved outside the next two weeks:** (a) accept it: cancelled until it reappears on a page, then restored, and both alerts name it (recommended: no extra requests); (b) before marking, also open the ID-only URL `/schedule/a/<id>` (`extraction.js:179`); unproven whether the site serves the current version there, so it needs a test page load.
5. **First night report-only?** (a) The first night classifies and alerts "would cancel …" but marks nothing; live from the next night (recommended: `C63QhB7h` starts 11-03, so there's room); (b) live from the first night.

## Threat
No new secret, table or request type: the same signed-in page loads Sync Now makes, from the server. No client data in tests (synthetic names; recorded page shapes).

## How we'll know it works
- **Tests** (expected values by hand, each seen failing):
  - a booking missing from both pages whose URL answers 302 → `/schedule` is cancelled and reported, **with both dogs' boardings** of a two-dog booking;
  - a candidate seen only on the cursor page isn't one; a stay that ended on the window's Sunday isn't one;
  - restore happens only after a 200 read (with a `done` queue item); a redirect on restore leaves it cancelled; a duplicate overlapping boarding blocks the restore and is reported;
  - a failed candidate query is alerted; an undelivered alert turns the `schedule` run red;
  - the Integration Check's `runScheduleSync` doesn't reconcile; two Sundays not 7 days apart → no reconciliation;
  - one answering 200 with a booking page isn't cancelled;
  - more than 10 missing → none opened, reported;
  - a failed or empty page → no reconciliation;
  - a 429 → the run stops;
  - the window is exactly the two pages' days, in any host zone;
  - an archived booking seen again is restored, re-queued and reported;
  - a run with nothing to do sends no alert.
- **Production, first night:** the `schedule` row has `reconcile.*`; one `sync-reconcile` row in `message_log` naming `C63QhB7h` ("would cancel" if report-only, Q5); then both its boardings cancelled and the 11-03 rosters list neither dog. ops-watch reports a failed `sync-reconcile` alert.
- **When it isn't:** a booking gone from the site but still in the app after a night is a bug; every stop is an alert, never silent.

## Order of work
Architect (done) → Kate's answers (Q2, Q4, Q5) → build (one PR, ~1 day) → reviewer → merge → first night checked (report-only if Q5a) → live.
