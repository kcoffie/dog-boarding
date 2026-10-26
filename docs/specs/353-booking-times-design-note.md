# #353 design note: booking times are San Francisco clock times

**Status:** Kate chose option B (2026-10-26, session 51); architect: proceed with changes (folded in below); reviewer findings fixed (session 52). Three small questions open (Q4–Q6). Issue #353 (`priority: high`). #350 PR 2 waits on it.

## Problem
The booking site stores each booking's times as **San Francisco clock times written as if they were UTC**. A 10:00am drop-off is stored as `10:00Z`. The app copies them as they are, then reads them as real moments: in Pacific time `10:00Z` is 3:00am (2:00am in winter). So:
- the Friday pm roster showed "Sat 3:15 AM" for a 10:15am pick-up (10-23, Kate's screenshot);
- the Dogs page and the Calendar show times 7–8 hours early on a Pacific device (`formatTime` / `formatDateTime` use the device's zone, `src/utils/dateUtils.js:54` / `:63`, `src/pages/CalendarPage.jsx:70`);
- comparisons with "now" are off by 7–8 hours. From 9:15am Pacific (8:15 in winter) the Dogs page already treats a 4:15pm pick-up as past (`isPastBoarding`, `src/pages/DogsPage.jsx:58`). The Friday weekend roster starts its window at the real "now" (`getWeekendWindowISO`, `api/roster-image.js:671`), so a Friday 4pm arrival (`16:00Z`) is earlier than a Friday 3pm run (`22:00Z`) and is **left off "Arriving this weekend"**.

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
| E8 | **25 boardings have title-only dates** (no time on the page; all Jan–Mar 2026): 24 stored at `00:00`, `07:00` or `08:00Z` (23 of them with no AM/PM label), plus `C63QgTXx`, whose departure is `2026-03-08T23:00Z` with no label. Each is midnight in the zone of whatever ran the sync: Vercel `00:00Z`, a Pacific browser `07:00/08:00Z`, a Paris browser `23:00Z` | `parseServiceTypeDates`, `extraction.js:55` (`new Date(year, m, d)` is the runtime's local midnight); `boardings`, read-only |
| E9 | The daytime sync's date is right because of the same rule: `tsToDate` takes the UTC date (`src/lib/scraper/daytimeSchedule.js:106`). Its comment ("data-ts is midnight Pacific") is wrong: `day_ts` holds `09:00Z`, `10:00Z` etc. | code, `daytime_appointments.day_ts` |

Not checked on the site: the exact hour shown for a winter booking (the pages show only AM/PM); E3 and E5 cover it.

## Options
**A. Convert at the sync, and repair the stored rows.** Read the page's seconds as an SF clock time and store the real moment (`10:00` PDT → `17:00Z`). Every reader then shows stored moments in SF time (#350 PR 2 as first planned).
- Repair: 369 boardings, 482 `sync_appointments` (plus their `previous_data`), with the 25 title-only rows handled apart. Kate runs it, and it must land together with the deploy: a sync between the two writes old-style rows next to new ones.
- `changeDetection` sees every booking as changed once; the night boundary in `queryBoarders` and the Integration Check's windows change to Pacific midnight; `tsToDate` must change too.
- The 1–2am hour on 11-01 is ambiguous (rare for drop-offs).

**B. Keep the site's convention, and read it correctly in one place (recommended).** Booking times stay as the site stores them: **"site clock" values**, whose UTC parts *are* the SF date and time. One small module, `src/utils/siteClock.js`, is the only way any code reads them:
- `siteDate(iso)` → `YYYY-MM-DD` (the UTC date), `siteTime(iso)` → "10:15 AM" (formatted with `timeZone: 'UTC'`), labelled "PT" where a time is shown;
- `siteNow(now = new Date())` → SF's wall clock now, written the same way, for comparisons with "now" (`isPastBoarding`, `getBoardingStatus`, the form-job "departed" check, `isBoardingUpcoming`, Sync Now's cancellation window, the weekend roster's window);
- the title-date fallback uses `Date.UTC(...)`, so a browser and Vercel write the same midnight.
No data repair, no migration, no booking-site requests, no new change-detection churn. Server code that is right today only because Vercel runs in UTC (`queryBoarders`, `findFormForBoarding`) moves to `Date.UTC` / `siteDate`, which changes nothing on Vercel and makes it right in any zone (architect point 5). `isOvernight` / `isDayPresent` / `calculateNights` switch from the device's local parts to `siteDate`, which also fixes them on non-Pacific devices.

**C. New columns** (`arrival_date`, `arrival_time` as plain text) next to the timestamps. Clearest data, but a migration, a backfill and two sources of truth for every reader. Not worth it here.

## Choice and why
**B (Kate, 2026-10-26).** It's the smallest change that makes every date and time match the site, on any device. It touches no stored data, which matters after #344 (no guessing). Option A's "real moments" would be cleaner in the abstract. In practice it costs a two-table repair that has to land together with a deploy, a one-off change storm, and new Pacific-midnight boundaries in the server code that is right today. The risk in B is a future reader using `new Date(x).getHours()` on a booking time. Guard: an ADR (ADR-009), a comment on the columns' readers, and a test that fails if `src/`, `api/` or `scripts/` reads a booking time with local-zone methods outside `siteClock.js` (architect point 2, with its limits).

Real moments stay real moments: `created_at`, `updated_at`, `last_synced_at`, `cancelled_at`, `paid_date`, cron times. #350 PR 2 shows those in SF time with `BUSINESS_TIME_ZONE`, and booking times with `siteClock`.

## What changes (B)
| Where | Today | After | PR |
|---|---|---|---|
| Friday pm roster times (`formatWeekendDatetime`, `api/roster-image.js:724`) | Pacific of a fake moment: "Sat 3:15 AM" | `siteTime`: "Sat 10:15 AM PT" | 1 |
| Weekend window (`getWeekendWindowISO`, `:671`) | starts at the real now: Friday 4pm arrivals and 4:15–5pm departures are dropped | starts at `siteNow()` rounded down to the hour; ends Monday 12:00 site clock as today (Q4) | 1 |
| Roster/intraday date ranges (`formatCompactDateRange`, `formatReadableDateRange`) | Pacific date of the fake moment (wrong only for clock times before 7–8am) | `siteDate` | 1 |
| `queryBoarders` (`pictureOfDay.js:162`) | runtime-local night boundary (right on Vercel) | `Date.UTC` (same on Vercel) | 1 |
| Form matching (`findFormForBoarding`, `forms.js:176-199`) | runtime-local end of arrival day (right on Vercel) | `siteDate` (same on Vercel) | 1 |
| Form-job "departed?" (`enqueueFormJob`, `mapping.js:682`) | runtime-local midnight vs the stored value | `siteDate(departure) >= siteDate(siteNow())` | 1 |
| Sync Now's cancellation window (`sync.js:457` → `reconcile.js:65`) | starts at the real now | `siteNow()` | 1 |
| Manual sync range (`appointmentFilter.js:95-101`, `SyncSettings.jsx:97/101`) | device-local Dates | `Date.UTC` | 1 |
| Title-date fallback (`parseServiceTypeDates`) | runtime-local midnight | `Date.UTC` midnight | 1 |
| Daytime `tsToDate` | right; wrong comment | unchanged; comment fixed | 1 |
| Seed script (`scripts/seed-test-data.js:212-219`) | local `setDate`/`setHours` on booking times | `setUTC*` | 1 |
| Dogs page times (`formatTime`/`formatDateTime`, `dateUtils.js:54/63`; `formatDateWithAmPm`, `DogsPage.jsx:34-37`) | device-local, 7–8 h early | `siteTime` / `siteDate` + "PT"; date only for title-only rows (Q2, Q6) and contradicting labels (Q5) | 2 |
| Dogs page status (`isPastBoarding` `:58`; `getBoardingStatus` `:67-76`, which drives the Current/Upcoming/Past badge and sort) | real now vs fake moment | `siteNow()` | 2 |
| Calendar: times (`:70`), `isSameDay`, `monthBookings` (`:305-314`), `getBookingsForDay` (`:317-330`), `getBookingsForAnyDay` (`:358-367`), print view and selected day | device-local | `siteTime` / `siteDate` | 2 |
| `isOvernight`, `isDayPresent`, `calculateNights` (`dateUtils.js:85-120`) | device-local date | `siteDate` (same result on a Pacific device today, except clock times before 7–8am) | 2 |
| Sync History (`SyncDetailModal.jsx:347-349, 375-376, 427`) | device-local | `siteTime` / `siteDate` + "PT" | 2 |
| Form view (`formatBookingDate`, `BoardingFormModal.jsx:27-31`; its "Date Discrepancy" line can disagree with `forms.js:350`) | device-local date | `siteDate` | 2 |
| Upcoming forms (`isBoardingUpcoming`, `useBoardingForms.js:14`; filter `:48`, embedded without `!inner`, so it filters nothing) | local midnight vs the stored value | `siteDate` vs `siteDate(siteNow())`; `!inner` | 2 |
| `toTimeInputValue` (`dateUtils.js:74-77`, `toTimeString`, used only by tests) | device-local | removed | 2 |

Fine as they are: `api/roster-image.js:758` (night count). Out of scope: `scripts/integration-check.js:323` builds `todayStr` from runtime-local parts (right only because the runner is UTC); that's a "today" bug for #350.

**Not changed:** stored data, the sync's requests, the night/pay rule. `nightStays` uses `isOvernight`; on a Pacific device its date changes for **one** stored booking only: a title-only stay of March 2026 stored at `00:00Z`, which a Pacific device reads a day early today. Every other booking keeps its nights. Check after the change: 10-23 still 8 dogs / $440 / $286.

## Open questions for Kate
1. **A pm drop-off and the Dashboard's day icon.** `isDayPresent` counts the arrival day as a day "if they arrived before 5pm". Read correctly, a 4pm drop-off (37 bookings at `16:00Z`) is before 5pm, so it **still** shows a day icon; only the 2 drop-offs at 5:15pm lose it. The issue said "a 4pm arrival doesn't count as a day stay". Which do you want: (a) keep "before 5pm", or (b) use the site's AM/PM label (PM drop-off = no day)? This is display only: pay uses nights (`nightStays`), not `isDayPresent`. The 2 drop-offs at 5:15pm are both a staff member's dog (Goose, no pet ID, $0; March and April), so no client booking has ever arrived after 5pm. **Kate: (a)**, keep "before 5pm" (what a Pacific device shows today); leave the two 5:15pm stays alone (a staff dog dropped off after a shift; it stays the night, and nights don't depend on the time).
2. **The 24 title-only rows at midnight, 7:00 or 8:00 (Jan–Mar 2026)** would show "8:00 AM PT" as a time. **Kate: (a)**, show no time when the booking has no AM/PM label and the time is midnight, 7:00 or 8:00 (no data change).
3. **"PT" on every booking time: yes (Kate).**
4. **Monday-morning pick-ups on the Friday pm roster. Open.** Today the window already ends Monday 12:00Z, which as a site clock time is Monday noon SF, so Monday-morning pick-ups are already listed; only the header ends at "Sun" (`formatWeekendHeaderDates`, `roster-image.js:741`). (a) Keep them and make the header "Fri – Mon" (recommended: no change to which bookings are listed); (b) end the window at Sunday 11:59pm (Monday pick-ups leave the Friday roster; Monday's 4am roster has them).
5. **The 2 rows whose AM/PM label contradicts the time. Open** (architect point 4): `C63Qgwjs` `10:00Z` "PM", `C63QgNHs` `07:00Z` "PM". (a) Show the date only and log it (recommended); (b) show the stored time.
6. **`C63QgTXx`'s 23:00Z departure (no label; Goose's March stay). Open.** Kate said to leave its data alone; Q2's rule doesn't cover 23:00, so it would show "Mar 8, 11:00 PM PT". (a) Add 23:00 to Q2's rule, so it shows "Mar 8" with no time (recommended: it's a Paris midnight, the same title-only case); (b) show 11:00 PM.

## Architect review (2026-10-26): proceed with changes
Folded in:
1. **Test zones that can catch a wrong date.** Every stored time is 07:00–17:15Z, except title-only rows at 00:00Z and one at 23:00Z, so UTC, Pacific, Paris and Tokyo all give `10:00Z` the same date even with `getDate()`. Tests and both scoped Stryker runs use **`Pacific/Kiritimati` (+14)** and **`Pacific/Pago_Pago` (−11)** (no DST in either): `10:00Z` is the next day in one and the day before in the other.
2. **The guard, concretely:** a vitest test that walks `src/`, `api/`, `scripts/` with `fs` (not `git grep`: Stryker's sandbox is untracked). In any file that names a booking-time field (`arrival_datetime`, `departure_datetime`, `arrivalDateTime`, `departureDateTime`, `check_in_datetime`, `check_out_datetime`, `check_in`, `check_out`, `start_ts`, `day_ts`; ~25 files), it fails on local-zone calls (`get/setHours|Date|Day|Month|FullYear(`, multi-argument `new Date(y, m, d)`, `toLocale*String(` without `timeZone`, `toTimeString(`, `toDateString(`) unless the line says `// real-moment: <why>` or the file is `siteClock.js`.
   - **Limits (accepted):** it catches local-zone reads, not comparisons with the real now (`new Date() > new Date(departureDateTime)`); those are covered by the tests for each reader in the table. It works per file, so legitimate "today" and calendar-grid calls in the same files (`pictureOfDay.js`, `syncRunner.js`, `schedule.js`, `api/notify.js`, `CalendarPage.jsx` and others) need the `// real-moment:` marker: a one-off cost, and each marker says why.
   - **In PR 1** it carries an allowlist of the files PR 2 fixes (the PR 2 rows above); PR 2 empties it.
3. **Weekend window:** start at `siteNow()` rounded down to the hour (the cron runs at 22:00:0x, so a 3:00pm Friday booking would miss by seconds). Friday afternoon **departures** come in too, not just arrivals. The header keeps the real `now` (formatting `siteNow()` in Pacific would shift it twice).
4. **Labels that contradict the time:** when `*_ampm` disagrees with the UTC hour (2 rows: `C63Qgwjs` 10:00Z "PM", `C63QgNHs` 07:00Z "PM"), show the date only and log it. **Pending Kate (Q5).**
5. **Server code is right only because Vercel runs in UTC:** `queryBoarders` (`pictureOfDay.js:162`) and `findFormForBoarding` (`forms.js:176-199`) move to `Date.UTC` / `siteDate` (no change on Vercel; right in any zone).
6. **`siteNow()`** uses `formatToParts` with `hourCycle: 'h23'` and returns an ISO string, not a Date, so it can't be handed to a Pacific formatter. In the repeated 1–2am hour on 11-01 it steps back an hour: harmless for comparisons.
7. **Lasting cost, in ADR-009:** raw SQL against `now()` on these columns is always wrong by 7–8 h (Kate's queries, any future ops-watch rule); #318's engine must use `siteClock`.

The readers the first draft missed (and those the session 52 review found) are rows in "What changes".

## Kate's decisions on the architect's points (2026-10-26)
- **Friday-afternoon bookings on the Friday pm roster: yes, list them** (9 Friday 4pm arrivals and 16 Friday 4:15–5pm departures so far were left off; next: a Fri 12-04 4pm arrival).
- Still open: Q4, Q5 and Q6 above.

## Threat
No new secret, table, job or request. No client data in tests (synthetic names; the real page's shape only).

## How we'll know it works
- **Tests** (expected values by hand from E1–E8 and Kate's answers, each seen failing, host zones switched via `process.env.TZ` in vitest forks):
  - `10:00Z` reads "10:00 AM" and date 10-29 with the host at UTC, Pacific, Paris, Tokyo, `Pacific/Kiritimati` and `Pacific/Pago_Pago`;
  - a stay 10-29 → 11-02 is 4 nights across DST;
  - from 9:15am Pacific a 4:15pm pick-up is neither past nor "past" in the status badge (`isPastBoarding`, `getBoardingStatus`);
  - the weekend window starts at `siteNow()` rounded down to the hour: a run at Fri 22:00:05Z lists a Friday 3:00pm and a 4pm arrival and a Friday 4:15pm departure; the roster prints "Sat 10:15 AM PT";
  - `isDayPresent` counts a `16:00Z` drop-off as a day and a `17:15Z` one as not (Q1);
  - a title-only boarding with no label shows its date and no time (Q2, and Q6 if Kate says yes);
  - a label that contradicts its time shows the date only and logs it (Q5, if Kate says yes);
  - `findFormForBoarding` and `queryBoarders` give the same result with the host at `Pacific/Kiritimati` and `Pacific/Pago_Pago`;
  - the guard fails on a local-zone read of a booking time outside `siteClock.js`.
  Scoped Stryker on the changed lines, run once with host `TZ=Pacific/Kiritimati` and once with `TZ=Pacific/Pago_Pago`.
- **Production:** the Friday pm roster on **Fri 10-30** shows the site's times (Kate compares 2 with the site); the Dogs page shows `C63QhM5Q` as 10:00 AM → 5:00 PM; Dashboard/Payroll 10-23 still 8 dogs / $440 / $286.
- **When it isn't:** a time that differs from the site is a bug (source of truth). Today a person has to notice it, and the Friday roster is the first place Kate or staff would. **Proposed follow-up (not in PR 1 or 2; an issue if Kate agrees):** the Integration Check, which already reads the week page, compares each row's printed time with `siteTime` of the stored value and alerts on a mismatch, with no new booking-site requests.

## Order of work
1. This note → architect → Kate's answers (Q4–Q6) → ADR-009 ("booking times are site clock times").
2. **PR 1:** `siteClock.js`, the guard test (with PR 2's files allowlisted), and every row marked **1** above: Friday pm roster (times, window, date ranges), `queryBoarders`, form matching and the form-job check, Sync Now's cancellation window, the manual sync range, the title fallback, the `tsToDate` comment, the seed script. Target: merged before the **Fri 10-30** roster (22:00 UTC).
3. **PR 2** (= #350 PR 2): every row marked **2** above (Dogs page, Calendar, day/night helpers, Sync History, form view, upcoming forms, `toTimeInputValue`), with "PT"; empties the guard's allowlist.
