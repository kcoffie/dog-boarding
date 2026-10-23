# Design note: the 4am roster on time (#321, option A)

## Problem
The 4am roster is a GitHub schedule (`notify-4am.yml`, `0 11 * * 1-5`), and GitHub starts it hours late. In the last four weekdays it started at 17:21, 15:34, 15:51 and 15:48 UTC, which is 8:20–10:20 PDT instead of 4:00. On 10-22 GitHub dropped most hourly runs too. Staff need the roster before their day starts, and GitHub's lateness isn't fixable from our side.

Second problem: **DST ends Sun 2026-11-01.** 4am PST is 12:00 UTC. The workflow's comment says to edit the cron by hand each March and November; if nobody does, it fires at 3am PST.

Kate chose **option A (2026-10-22): the 4am roster only.** The 7am and 8:30am rosters stay on GitHub for now, and the design keeps adding them to one cron line plus their Pacific hour each.

## Options
1. **A Vercel cron dispatches `notify-4am.yml`** (GitHub API, `GH_ACTIONS_TOKEN`). Two hops, it still waits for a GitHub runner, and the token gains a new use.
2. **A Vercel cron calls `/api/notify` itself.** One hop, no runner, no new secret. `notify` already does the work; the workflow only curls it.
3. **Vercel Pro or an outside scheduler** for minute precision. It costs money or adds a service and a secret. Not needed for "early morning, before staff start".

**Choice: 2.** The architect reviewed it on 2026-10-22 ("proceed with changes"); every change it asked for is folded in below.

## Design
### Who is calling
- **Vercel** means `Authorization: Bearer $CRON_SECRET` matched. That is the only way to be the on-time trigger. **Any `trigger` query param is ignored.** If `CRON_SECRET` is unset, this path fails closed, as ops-watch does (unlike the older sync crons, which fail open). It only allows `window=4am`, and it rejects a `date` param.
- **Token** (`?token=INTERNAL_API_TOKEN`) is GitHub's path, the fallback and manual runs, unchanged otherwise.
- The cron `path` has **no query string.** Vercel's docs don't say whether one is passed through, and crons can't be tried on a preview. A CRON_SECRET call with no `window` means `4am`.

### When Vercel sends (DST)
- There are **two Vercel crons**, `/api/notify` at `0 11 * * *` and `0 12 * * *`, bringing the project to 7 (limit 100). Hobby fires each one once a day, anywhere within its hour, and never retries a failed run.
- **The gate is 04:00–05:59 `America/Los_Angeles`, Mon–Fri.** In PDT both calls pass, so the 12:00 call is a free 5am retry and the claim dedupes it. In PST the 11:00 call (3am) skips, and the 12:00 call passes even if it lands after 13:00 UTC (5am). DST always changes on a Sunday, so no send day is ambiguous.
- A gated skip returns 200 `{ action: 'skipped', reason: 'outside_window' }` and writes nothing.

### Once a day: the claim
- **Storage: one `cron_health` row, `cron_name = 'notify-4am-claim'`, no migration.**
  - The code seeds it once with `ON CONFLICT DO NOTHING` and date `1970-01-01`, so the date comparison is never NULL.
  - **The claim is one conditional UPDATE** with `.select()`. It matches when `result->>date` is NULL or `<> today`, OR `status = 'failure'`, OR (`status = 'started'` AND `updated_at` older than 10 min). (A missing JSON key is NULL, and `neq` never matches NULL, so the NULL case is explicit.)
  - Exactly one row back means the claim is ours. Postgres row locking makes a concurrent second UPDATE re-check and match 0 rows.
  - The statuses used are `started`, `success` and `failure`, all already allowed by the CHECK (migration 022). One row in the Settings health list is fine (per-date rows would not be).
- **"Today" is the actual Pacific date.** Explicit `date=` calls (manual, token path only) skip the claim.
- **The order inside `notify` for `4am`** is window validation, then the claim, then the channel check, the daytime refresh and the picture build. A call that loses the claim does no work that could throw.
- **Outcomes:**
  - After `sendRoster` succeeds: `success`, recording `{date, trigger, sentAt}`.
  - On failure: the claim is released, so the 5am call or the fallback tries again.
  - `no_data` (0 workers on a weekday): `failure` with `outcome: 'no_data'`, so later calls retry, plus **an alert at once** (`alertAndLog`, job `notify-4am-alert`), once per day. Today this case is silent.
- **A crash after a successful send** (timeout) leaves the claim `started`. After 10 min it can be taken over, which allows one duplicate. That's the intended direction: a duplicate beats a missing roster. `api/notify.js` gets `maxDuration: 60` in `vercel.json` (a send took 9–10 s in the last four runs), so the 10-minute takeover is always above the function limit.

### The 7am / 8:30am baseline
- Today a `notify` failure write (`writeCronHealth(..., 'failure', null, ...)`) blindly sets `result: null` on the `notify` row and wipes `lastHash`/`lastDate`. 7am then has no baseline and re-sends an unchanged roster.
- That's an existing bug, and the daily fallback would hit it every weekday. **Fix:** failure writes keep the stored `lastHash`/`lastDate`.

### The GitHub fallback
- **`notify-4am.yml` moves to `0 14 * * 1-5`** (7am PDT / 6am PST) before 2026-11-01 (Kate approved, 2026-10-22).
- **A token-path 4am call sends only at or after 06:00 Pacific** (`force=1` overrides it for a manual re-send). It can't beat Vercel's 4–6am window, and it can't send at 3am even if the cron isn't moved.
- **It skips when any roster already went out today:** the claim's date is today, or the `notify` row's `lastDate` is today, which covers GitHub running 7am first.
- **When it does send, it alerts Kate** through `alertAndLog`, job `notify-4am-alert`, which is added to ops-watch's `ALERT_JOBS` so an undelivered alert is a finding. **Not `notify-4am`:** ops-watch reads `message_log` `notify-4am` `sent` as "the roster went out", so an alert logged under it would hide a missing roster (found while building). The text names the reason: the on-time call never ran, sent nothing (no data), or failed (the claim's last error).
- `force=1` (token path only) re-sends past the claim and the floor. `notify-4am.yml`'s `workflow_dispatch` gets a `force` checkbox that passes it (Kate approved, 2026-10-22).

## What breaks
- **Both Vercel calls fail or never run:** the fallback sends late (as today) and alerts. No worse than now, and loud.
- **The fallback never runs either:** ops-watch's 17:00 UTC "No morning roster sent today" (reads `message_log` `notify-4am` `sent`; unchanged). The fallback is the watcher on the other scheduler; cron-health-check (GitHub, 00:30 UTC) watches ops-watch.
- **The gate is wrong around DST:** tests pin fixed instants on both sides (Fri 2026-10-30 PDT, Mon 2026-11-02 PST) and the edges (03:59, 04:00, 05:59, 06:00 Pacific).
- **Holidays and weekends:** as today. Mon–Fri Pacific; holidays still send; matches ops-watch's weekend skip.

## Threat
No new secret. `CRON_SECRET` can now also start one 4am send a day, only inside the 4–6am Pacific window and only to the configured channel (Kate on Telegram today). A leaked `CRON_SECRET` already runs the sync crons. Revisit when the roster goes to staff (#260).

## How we'll know it works (and when it doesn't)
- The claim row shows `success`, `trigger: vercel`, with `sentAt` at 04:00–05:59 Pacific.
- `message_log` has `notify-4am` `sent` in that window.
- The GitHub run logs `already_sent`.
- Failure signals: the `notify-4am-alert` alerts (late send, missed, no data), ops-watch's no-roster finding.
- First live runs: Fri 2026-10-23 at 11:00–12:59 UTC (check Vercel received both calls with no query string). First PST run: Mon 2026-11-02 at 12:00–13:59 UTC.

## Tests (from this note, before code)
Gate edges at both DST instants; the trigger comes from the credential (CRON_SECRET without any param is still gated; `trigger=vercel` on the token path changes nothing); CRON_SECRET unset fails closed; CRON_SECRET with `date=` or another window is rejected; two claims race and only one sends; a stale `started` claim is taken over after 10 min; a failed send releases the claim; the fallback skips after a 7am send; a fallback failure leaves `lastHash`/`lastDate` intact; `no_data` alerts; the late alert names its reason; `force=1` only on the token path.

## Changes after the code review (2026-10-22)
- **"Already sent today" also needs the send to have been made today** (`notify.result.sentAt` on today's Pacific date). Without it, a `date=` preview sent the evening before would have stopped the next morning's 4am send all day.
- **The trigger renders the image from `https://qboarding.vercel.app`** (`PROD_URL`). A cron's own host can be the deployment's generated URL, which Deployment Protection may answer with 401.
- **The fallback is weekdays only** (`not_a_weekday`), like the trigger.
- **An unreadable claim row** is worded as such in the alert, not as "never ran".
- **The no-data alert promises no 5am retry** (in PST there is none).
- **Known and accepted:** 7am and the fallback both run at 14:00 UTC, so on a day the on-time send failed both may send (a duplicate on a failure day). A second no-data alert is possible if a different failure falls between two no-data calls.

## Not in this change
7am and 8:30am (later: one cron line each plus their Pacific hour), Friday pm, intraday (off while the roster goes to Telegram).

---

# Addendum (2026-10-22): 7am, 8:30am and Friday pm on time (#321, #257)

## Problem
The 7am, 8:30am and Friday 3pm rosters are still GitHub schedules. They start 4–6 h late, which makes the 7am and 8:30am change checks useless: a "the roster changed" send at noon is too late for staff. Their UTC crons are PDT-only, so **DST (Sun 11-01) moves them an hour early** unless someone edits them by hand (Kate: DST must need no edits). And a failed run is reported only by GitHub's failure email, from the same scheduler (#257, Ops rule 3).

## Options
1. **Hand-edit the three GitHub crons twice a year.** Zero code. Still 4–6 h late, and nothing outside GitHub sees a failure. It's the fallback if this misses Fri 10-30.
2. **The REQ-658 pattern for every window: Vercel crons call `/api/notify`, and the code picks the window from the Pacific hour.** No new secret, no new table, one cron line per UTC hour used.
3. **An outside scheduler or Vercel Pro** for minute precision. Costs money or adds a service; "anywhere in the hour" is good enough for these windows.

**Choice: 2.**

## Design
### The trigger picks the window from the clock
- A CRON_SECRET call sends **no query string** (as today). The code maps the Pacific hour to a window:

  | Pacific | Window |
  |---|---|
  | 04:00–05:59 Mon–Fri | `4am` (unchanged) |
  | 07:00–07:59 Mon–Fri | `7am` |
  | 08:00–08:59 Mon–Fri | `8:30am` |
  | 15:00–16:59 Fri | `friday-pm` (the 16:00 hour is a retry, deduped by the claim) |
  | anything else | skipped, `outside_window`, writes nothing |
- **The trigger rejects any `window`, `date` or `force` param** (400), as the 4am trigger rejects `date` and `force` today. Only the clock picks the window.
- **The token path doesn't change.** GitHub and manual runs with `?window=…&token=…` behave as now, with no gate and no claim (except the 4am fallback, as REQ-658).

### Vercel crons (DST without edits)
Each UTC hour gets one cron line. Every line fires once a day, anywhere in its hour, and the code decides what it is:

| Cron (UTC) | PDT (UTC-7) | PST (UTC-8) |
|---|---|---|
| `0 11 * * *` (existing) | 4am | 3am: skip |
| `0 12 * * *` (existing) | 5am: 4am retry | 4am |
| `0 14 * * *` **new** | 7am | 6am: skip |
| `0 15 * * *` **new** | 8:30am (lands 8:00–8:59) | 7am |
| `0 16 * * *` **new** | 9am: skip | 8:30am (lands 8:00–8:59) |
| `0 22 * * 5` **new** | Fri 3pm | Fri 2pm: skip |
| `0 23 * * 5` **new** | Fri 4pm: Friday pm retry | Fri 3pm |
| `0 0 * * 6` **new** | Fri 5pm: skip | Fri 4pm: Friday pm retry |

The project goes from 7 crons to 13. Hobby allows 100 per project, each at most once a day, firing anywhere in its hour, with no retry; Vercel documents both duplicate and missed deliveries (architect, from Vercel's docs updated 2026-07/08). `15:00 UTC` serves two windows, one per season. On a given day 7am and 8:30am get exactly one call each; 4am and Friday pm get two, deduped by their claims. The 8:30am roster can land anywhere from 8:00 to 8:59, as the issue accepted.

### One claim row per window
- `claimDay` and `finishClaim` take the row name. New rows: **`notify-7am-claim`, `notify-830am-claim`, `notify-friday-pm-claim`**, same shape and rules as `notify-4am-claim` (seeded, one conditional update, a stale `started` claim taken over after 10 min). No migration.
- **Why claim a window with one call:** Vercel may deliver a cron event more than once. The 7am and 8:30am hash gate would dedupe a duplicate that arrives later, but two at once could both send, and `friday-pm` has no hash gate at all. The claim row is also the record of the run that the watcher reads (below).
- **Outcomes:** `sent`; `unchanged` (the hash gate skipped; `success`, since checking was the job); `no_data` at 7am/8:30am is `success` only when today's 4am claim also shows `no_data` (Kate already has that alert); otherwise it's `failure` and alerts (data that vanished after 4am is a fault); `failed` (`failure`, with the error).
- **The claim comes first, as in 4am:** a call that loses it does no refresh, no image and no booking-site request.

### Failure is loud
- **On a trigger call, any failure alerts Kate at once, on every path:** the claim/database catch, the `ROSTER_CHANNEL` error branch, the Friday pm catch and the main catch (one test each). The alert goes on Kate's alert bot, which doesn't depend on `ROSTER_CHANNEL`.
- The alert itself (`alertAndLog`, new job **`notify-alert`**, added to ops-watch's `ALERT_JOBS`): "⚠️ The 7am roster check failed at 7:12 AM: <error>". On Vercel a 500 is silent, unlike a red GitHub run. The 4am window keeps its own path (the fallback sends and alerts).
- Errors that reach the alert already carry no token (the image URL is never put into an error).

### The watchers
- **ops-watch (Vercel, 17:00 UTC, its own cron line) checks today's 7am and 8:30am claim rows** (the last 8:30am call lands by 16:59 UTC in both seasons), and on Saturday Friday's Friday pm claim. It catches a single skipped line the same morning (~10am PDT / 9am PST).
- **Backstop on the other scheduler:**- **`cron-health-check` (GitHub, 00:30 UTC) checks the window claim rows** for the Pacific day of (now − 12 h). That's the same Pacific day for any run up to 11 h late (00:30 UTC is 5:30pm PDT / 4:30pm PST).
  - On a weekday: `notify-7am-claim` and `notify-830am-claim` have that date and `success`.
  - On a Friday: `notify-friday-pm-claim` as well.
  - Otherwise one issue line each: never ran, failed (quoting the error), or started but didn't finish.
- Both use one pure function in `src/lib/rosterTrigger.js` (mutation-tested); the scripts only wire it.
- If all Vercel crons die, ops-watch dies too; cron-health-check catches the missed windows that evening, and already flags ops-watch as stale. The 4am fallback on GitHub catches the morning, and cron-health-check already watches ops-watch.

### The GitHub workflows
- **`notify-7am.yml`, `notify-830am.yml` and `notify-friday-pm.yml` lose their `schedule:`** and keep `workflow_dispatch` for manual sends (token path, as now). That ends the 7am/fallback double send at 14:00 UTC on GitHub's side. No file deletes are needed.
- `notify-4am.yml` stays the 4am fallback at `0 14 * * 1-5`, unchanged.
- **Intraday stays on GitHub with PDT hours.** It sends nothing while the channel is `telegram`. Its DST is noted in the job docs and goes with #260.

## Booking-site load
**No change: one schedule-page request per window run (`refreshDaytimeSchedule`), 3 a weekday as today**, plus one when the 12:00 UTC 4am retry runs after a failed 11:00 call. A call that loses its claim or lands outside a window makes none. A blocked site (`site_access`) skips the refresh and uses the DB, as today.

## What breaks
- **Vercel skips a window's cron:** for 7am the 8:30am check still sends a change; ops-watch reports the miss that morning. A skipped Friday pm call is retried an hour later; if both miss, cron-health-check reports it Friday evening and Kate can run `notify-friday-pm.yml` by hand.
- **A window lands at the edge of its hour** (e.g. 15:59 UTC in PDT = 8:59): still inside the hour, so it sends. A call can't drift into the next hour's window, because each line fires within its own UTC hour.
- **DST day itself:** Sun 11-01 has no weekday window; Fri 10-30 is PDT and Mon 11-02 PST. Tests pin both.
- **Deploying in a window's hour:** a cron mid-deploy may hit either version. Merge outside 11:00–16:59 UTC on weekdays and 22:00–00:59 UTC on Fridays. After the merge, confirm Vercel's Cron Jobs page lists all 13 (crons come only from the production deployment, and the deploy quota has blocked prod before).
- **Holidays:** as today (weekdays send).

## Threat
No new secret. `CRON_SECRET` can now also start the 7am, 8:30am and Friday pm sends, each once a day, only in its Pacific hour, only to the configured channel (Kate on Telegram today). It already runs the sync crons and the 4am send. Revisit with #260.

## How we'll know it works
- Each window's claim row shows `success`, `trigger: vercel`, with `at` inside its Pacific hour; `message_log` has `notify-7am`/`notify-8:30am` `sent` only on days the roster changed.
- cron-health-check stays green; any `notify-alert` row is a failure to read.
- First live runs: the first weekday after the merge (7am, 8:30am), the first Friday (3pm), and **Mon 11-02**, the first PST weekday (7am at 15:00 UTC, 8:30am at 16:00 UTC).

## Tests (from this addendum, before code)
The clock-to-window map at both DST instants and every hour edge (06:59/07:00/07:59/08:00/08:59/09:00 Pacific; Fri 14:59/15:00/15:59/16:00; Thu 15:00 is no window); the trigger with any `window`, `date` or `force` param is 400; each window claims its own row and a lost claim makes no booking-site request; two concurrent 7am claims send once; `unchanged` and `no_data` record `success`; a failed trigger call alerts `notify-alert` and records `failure`; a token-path 7am call doesn't claim; the watcher's day is (now − 12 h) Pacific, weekday windows only on weekdays, Friday's only on Fridays, and each miss reason has its own line.

## Decisions for Kate (all four approved as recommended, 2026-10-22)
1. Turn the three GitHub schedules off (keep manual runs), rather than keep them as late fallbacks that would send 4–6 h late. **Recommended.**
2. The 8:30am roster can arrive any time 8:00–8:59 (already accepted in the issue).
3. Friday pm gets a 4pm retry (one more cron, 13 total). **Recommended:** otherwise one skipped Vercel run means no weekend roster unless Kate runs it by hand.
4. A missed 7am/8:30am is reported the same morning by ops-watch, with cron-health-check that evening as the backstop. **Recommended.**

## ADR
Ships with **ADR-004: rosters sent by Vercel crons on the Pacific hour, with claim rows** (the roster claim-row ADR planned for Sprint 3, done now because this extends it). The sync-redesign ADR moves to 005.

## Changes after the architect review (2026-10-22, "proceed with changes")
- **Friday pm on the trigger renders its image from `PROD_URL`**, like the daily path; from the request's host it could get a Deployment Protection 401 (test).
- **Friday pm gets a retry hour** (15:00–16:59 Fri Pacific, `0 0 * * 6` added).
- **ops-watch checks the window claims the same morning**; cron-health-check is the backstop.
- **Every failure path on the trigger alerts** (four paths, a test each).
- **`no_data` at 7am/8:30am is a failure** unless 4am found no data too.
- **ops-watch's "No morning roster sent today"** also counts `notify-7am` and `notify-8:30am` sends, so a day where 4am failed but 7am sent isn't reported as "no roster".
- **Known and accepted:** in PDT, 7am and 8:30am can land seconds apart (14:59, 15:00). Both read the baseline before either writes it, so a changed roster could go out twice.
- **Same PR:** REQ-659 (the Ops range's last number) for these windows; REQ-611/612/630 and the job docs (table, DST note, the stale "a failure clears `lastHash`" line) updated; ADR-004; `docs/SPRINT_PLAN.md`'s ADR numbering updated.
