# #353 design note: booking times are San Francisco clock times

**Status:** Kate chose option B (2026-10-26, session 51); architect: proceed with changes (folded in below). Issue #353 (`priority: high`). #350 PR 2 waits on it.

## Problem
The booking site stores each booking's times as **San Francisco clock times written as if they were UTC**. A 10:00am drop-off is stored as `10:00Z`. The app copies them as they are, then reads them as real moments: in Pacific time `10:00Z` is 3:00am (2:00am in winter). So:
- the Friday pm roster showed "Sat 3:15 AM" for a 10:15am pick-up (10-23, Kate's screenshot);
- the Dogs page and the Calendar show times 7–8 hours early on a Pacific device (`formatTime` / `formatDateTime` use the device's zone, `src/utils/dateUtils.js:54`, `src/pages/CalendarPage.jsx:70`);
- comparisons with "now" are off by 7–8 hours. At 9:15am Pacific the Dogs page already treats a 4:15pm pick-up as past (`isPastBoarding`, `src/pages/DogsPage.jsx:58`). The Friday weekend roster starts its window at the real "now" (`getWeekendWindowISO`, `api/roster-image.js:676`), so a Friday 4pm arrival (`16:00Z`) is earlier than a Friday 3pm run (`22:00Z`) and is **left off "Arriving this weekend"**.

Dates are mostly right today, but only by accident: on a Pacific device a clock time from 7am on (8am in winter) still lands on its own date, and on Vercel (UTC) every clock time does. On a device east of UTC (Kate in Paris), an evening time moves to the next day.

## Evidence (each checked; no guessing)
| # | Claim | Source |
|---|---|---|
| E1 | A booking the site shows as 10:00am → 4:15pm is stored `10:00Z → 16:15Z` | Kate on the site, 2026-10-26 |
| E2 | The sync stores the page's Unix seconds as they are | `extractScheduledTimestamps`, `src/lib/scraper/extraction.js:258` |
| E3 | The site's own AM/PM label matches the **UTC** hour on 387 of 389 labelled boarding times ("PM" on 171 times at 15:00–17:00Z, which would be 8–10am as real moments). The 2 others: a `10:00Z` arrival labelled PM, and an old title-only row | `boardings.arrival_ampm/departure_ampm`, read-only, 2026-10-26 |
| E4 | 14,954 daytime appointments: the UTC clock of `start_ts` equals the site's printed time on every common shape (`09:00Z` = "Pick-Up (9 am - 10 am)", `09:52Z` = "9:52am - 4:31pm") | `daytime_appointments.start_ts` vs `display_time`, read-only |
| E5 | **No DST shift:** the same clock values appear in summer and winter. 1,711 winter daytime rows show `09:00Z` = "9 am". Boarding departures are 16:15 / 10:15 / 11:00 / 17:00Z in both seasons | same tables, split at 2026-03-08 / 2026-11-01 |
| E6 | A stay spanning DST (`C63QhM5Q`): start `10:00Z` 10-29, end `17:00Z` 11-02, labelled AM / **PM**; the site's own duration comment is "4 days, 7 hours" (10am → 5pm with no hour lost or gained) | the page's HTML, opened by Kate 2026-10-26 |
| E7 | The week page shows an actual check-in as "IN PROGRESS Oct 22, 10:09am" with `data-start="1792663786"` = `10:09:46Z` | week page in Kate's Chrome, read-only, with her OK |
| E8 | The 24 boardings stored at `00:00`, `07:00` or `08:00Z` are **title-only dates** (no time on the page; all Jan–Mar 2026; 23 have no AM/PM). Midnight in the zone of whatever ran the sync: Vercel `00:00Z`, a Pacific browser `07:00/08:00Z` | `parseServiceTypeDates`, `extraction.js:55` (`new Date(year, m, d)` is the runtime's local midnight); `boardings`, read-only |
| E9 | The daytime sync's date is right because of the same rule: `tsToDate` takes the UTC date (`src/lib/scraper/daytimeSchedule.js:106`). Its comment ("data-ts is midnight Pacific") is wrong: `day_ts` holds `09:00Z`, `10:00Z` etc. | code, `daytime_appointments.day_ts` |

Not checked on the site: the exact hour shown for a winter booking (the pages show only AM/PM); E3 and E5 cover it.

## Options
**A. Convert at the sync, and repair the stored rows.** Read the page's seconds as an SF clock time and store the real moment (`10:00` PDT → `17:00Z`). Every reader then shows stored moments in SF time (#350 PR 2 as first planned).
- Repair: 369 boardings, 482 `sync_appointments` (plus their `previous_data`), with the 24 title-only rows handled apart. Kate runs it, and it must land together with the deploy: a sync between the two writes old-style rows next to new ones.
- `changeDetection` sees every booking as changed once; the night boundary in `queryBoarders` and the Integration Check's windows change to Pacific midnight; `tsToDate` must change too.
- The 1–2am hour on 11-01 is ambiguous (rare for drop-offs).

**B. Keep the site's convention, and read it correctly in one place (recommended).** Booking times stay as the site stores them: **"site clock" values**, whose UTC parts *are* the SF date and time. One small module, `src/utils/siteClock.js`, is the only way any code reads them:
- `siteDate(iso)` → `YYYY-MM-DD` (the UTC date), `siteTime(iso)` → "10:15 AM" (formatted with `timeZone: 'UTC'`), labelled "PT" where a time is shown;
- `siteNow(now = new Date())` → SF's wall clock now, written the same way, for comparisons with "now" (`isPastBoarding`, the form-job "departed" check, `isBoardingUpcoming`, the weekend roster's window);
- the title-date fallback uses `Date.UTC(...)`, so a browser and Vercel write the same midnight.
No data repair, no migration, no booking-site requests, no new change-detection churn. Vercel code that already works in UTC (`queryBoarders`, the Integration Check's date windows) keeps working unchanged. `isOvernight` / `isDayPresent` / `calculateNights` switch from the device's local parts to `siteDate`, which also fixes them on non-Pacific devices.

**C. New columns** (`arrival_date`, `arrival_time` as plain text) next to the timestamps. Clearest data, but a migration, a backfill and two sources of truth for every reader. Not worth it here.

## Choice and why
**B (Kate, 2026-10-26).** It's the smallest change that makes every date and time match the site, on any device. It touches no stored data, which matters after #344 (no guessing). Option A's "real moments" would be cleaner in the abstract. In practice it costs a two-table repair that has to land together with a deploy, a one-off change storm, and new Pacific-midnight boundaries in the server code that is right today. The risk in B is a future reader using `new Date(x).getHours()` on a booking time. Guard: an ADR (ADR-009), a comment on the columns' readers, and a test that fails if `src/` or `api/` reads a booking time with local-zone methods outside `siteClock.js`.

Real moments stay real moments: `created_at`, `updated_at`, `last_synced_at`, `cancelled_at`, `paid_date`, cron times. #350 PR 2 shows those in SF time with `BUSINESS_TIME_ZONE`, and booking times with `siteClock`.

## What changes (B)
| Where | Today | After |
|---|---|---|
| Friday pm roster times (`formatWeekendDatetime`, `api/roster-image.js:724`) | Pacific of a fake moment: "Sat 3:15 AM" | `siteTime`: "Sat 10:15 AM" |
| Weekend window (`getWeekendWindowISO`) | starts at the real now: a Friday 4pm arrival is dropped | starts at `siteNow()` |
| Roster/intraday date ranges (`formatCompactDateRange`, `formatReadableDateRange`) | Pacific date of the fake moment (wrong only for clock times before 7–8am) | `siteDate` |
| Dogs page, Calendar times; Sync History check-in dates (`SyncDetailModal.jsx:427`) | device-local time, 7–8 h early | `siteTime` / `siteDate` + "PT" |
| `isOvernight`, `isDayPresent`, `calculateNights`, Calendar `isSameDay` | device-local date | `siteDate` (same result on a Pacific device today, except clock times before 7–8am) |
| "Departed?" checks (`isPastBoarding`, `isBoardingUpcoming`, `enqueueFormJob` `mapping.js:682`) | real now vs fake moment | `siteNow()` |
| Form matching (`findFormForBoarding`, `forms.js:179`) | runtime-local date (UTC on Vercel: right) | `siteDate` (same on Vercel) |
| Title-date fallback (`parseServiceTypeDates`) | runtime-local midnight | `Date.UTC` midnight |
| Daytime `tsToDate` | right; wrong comment | unchanged; comment fixed |

**Not changed:** stored data, the sync's requests, the night/pay rule. `nightStays` uses `isOvernight`; on a Pacific device its date changes for **one** stored booking only: a title-only stay of March 2026 stored at `00:00Z`, which a Pacific device reads a day early today. Every other booking keeps its nights. Check after the change: 10-23 still 8 dogs / $440 / $286.

## Open questions for Kate
1. **A pm drop-off and the Dashboard's day icon.** `isDayPresent` counts the arrival day as a day "if they arrived before 5pm". Read correctly, a 4pm drop-off (37 bookings at `16:00Z`) is before 5pm, so it **still** shows a day icon; only the 2 drop-offs at 5:15pm lose it. The issue said "a 4pm arrival doesn't count as a day stay". Which do you want: (a) keep "before 5pm", or (b) use the site's AM/PM label (PM drop-off = no day)? This is display only: pay uses nights (`nightStays`), not `isDayPresent`. The 2 drop-offs at 5:15pm are both a staff member's dog (Goose, no pet ID, $0; March and April), so no client booking has ever arrived after 5pm. **Kate: (a)**, keep "before 5pm" (what a Pacific device shows today); leave the two 5:15pm stays alone (a staff dog dropped off after a shift; it stays the night, and nights don't depend on the time).
2. **The 24 title-only rows (Jan–Mar 2026)** would show "8:00 AM PT" as a time. **Kate: (a)**, show no time when the booking has no AM/PM label and the time is midnight, 7:00 or 8:00 (no data change).
3. **"PT" on every booking time: yes (Kate).**

## Architect review (2026-10-26): proceed with changes
Folded in:
1. **Test zones that can catch a wrong date.** Every stored time is 07:00–17:15Z (one at 23:00Z), so UTC, Pacific, Paris and Tokyo all give `10:00Z` the same date even with `getDate()`. Tests and both scoped Stryker runs use **`Pacific/Kiritimati` (+14)** and **`Pacific/Pago_Pago` (−11)** (no DST in either): `10:00Z` is the next day in one and the day before in the other.
2. **The guard, concretely:** a vitest test that walks `src/`, `api/`, `scripts/` with `fs` (not `git grep`: Stryker's sandbox is untracked). In any file that names a booking-time field (`arrival_datetime`, `departure_datetime`, `arrivalDateTime`, `departureDateTime`, `check_in_datetime`, `check_out_datetime`, `check_in`, `check_out`, `start_ts`, `day_ts`; ~25 files), it fails on local-zone calls (`get/setHours|Date|Day|Month|FullYear(`, multi-argument `new Date(y, m, d)`, `toLocale*String(` without `timeZone`) unless the line says `// real-moment: <why>` or the file is `siteClock.js`.
3. **Weekend window:** start at `siteNow()` rounded down to the hour (the cron runs at 22:00:0x, so a 3:00pm Friday booking would miss by seconds). Friday afternoon **departures** come in too, not just arrivals. The header keeps the real `now` (formatting `siteNow()` in Pacific would shift it twice).
4. **Labels that contradict the time:** when `*_ampm` disagrees with the UTC hour (2 rows: `C63Qgwjs` 10:00Z "PM", `C63QgNHs` 07:00Z "PM"), show the date only and log it.
5. **Server code is right only because Vercel runs in UTC:** `queryBoarders` (`pictureOfDay.js:162`) and `findFormForBoarding` (`forms.js:179-199`) move to `Date.UTC` / `siteDate` (no change on Vercel; right in any zone).
6. **`siteNow()`** uses `formatToParts` with `hourCycle: 'h23'` and returns an ISO string, not a Date, so it can't be handed to a Pacific formatter. In the repeated 1–2am hour on 11-01 it steps back an hour: harmless for comparisons.
7. **Lasting cost, in ADR-009:** raw SQL against `now()` on these columns is always wrong by 7–8 h (Kate's queries, any future ops-watch rule); #318's engine must use `siteClock`.

Readers the first draft missed, now in scope: `SyncDetailModal.jsx:347-349, 375-376` (sync-log `check_in/check_out`); `BoardingFormModal.jsx:27-31` (`formatBookingDate`: the form view and its "Date Discrepancy" line, which can disagree with `forms.js:350`); `useBoardingForms.js:48` (local midnight filter; also an embedded filter without `!inner`, so it filters nothing: fix with the same change); `sync.js:457` → `reconcile.js:65` (Sync Now's cancellation window starts at the real now: use `siteNow()`); `appointmentFilter.js:95-101` with `SyncSettings.jsx:97/101` (build the range with `Date.UTC`). `api/roster-image.js:758` (night count) is fine. `scripts/integration-check.js:322` (`todayStr` from UTC parts) is a "today" bug: #350's scope.

One more date-only row: `C63QgTXx` departs `2026-03-08T23:00Z` with no label (midnight 3-09 in Paris, so likely a Paris Sync Now). It's Goose's March stay ($0, a staff dog); Kate: leave it alone.

## Kate's decisions on the architect's points (2026-10-26)
- **Friday-afternoon bookings on the Friday pm roster: yes, list them** (9 Friday 4pm arrivals and 16 Friday 4:15–5pm departures so far were left off; next: a Fri 12-04 4pm arrival).
- **Still open:** (2) Monday-morning pick-ups: keep them and retitle the header "Fri – Mon" (recommended) or end at Sunday 11:59pm; (3) the 2 rows whose AM/PM label contradicts the time: show the date only (recommended).

## Threat
No new secret, table, job or request. No client data in tests (synthetic names; the real page's shape only).

## How we'll know it works
- **Tests** (expected values by hand from E1–E7, each seen failing): `10:00Z` reads "10:00 AM" and date 10-29 with the host at UTC, Pacific, Paris and Tokyo plus `Pacific/Kiritimati` and `Pacific/Pago_Pago` (`process.env.TZ` in vitest forks); a stay 10-29 → 11-02 is 4 nights across DST; at 9:15am Pacific a 4:15pm pick-up is not past; a Friday 3pm run lists a Friday 4pm arrival; the weekend roster prints "Sat 10:15 AM". A guard test fails on a local-zone read of a booking time outside `siteClock.js`. Scoped Stryker on the changed lines with host `TZ=Pacific/Kiritimati` and `TZ=Pacific/Pago_Pago`.
- **Production:** the Friday pm roster on **Fri 10-30** shows the site's times (Kate compares 2 with the site); the Dogs page shows `C63QhM5Q` as 10:00 AM → 5:00 PM; Dashboard/Payroll 10-23 still 8 dogs / $440 / $286.
- **When it isn't:** a time that differs from the site is a bug (source of truth); the Friday roster is the first place Kate or staff would see it.

## Order of work
1. This note → architect → Kate's answers → ADR-009 ("booking times are site clock times").
2. PR 1: `siteClock.js`, the server side (rosters, form jobs, title fallback). Target: merged before the **Fri 10-30** roster.
3. PR 2 (= #350 PR 2): the UI (Dogs, Calendar, Sync History, day/night helpers), with "PT".
