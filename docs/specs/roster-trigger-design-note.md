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
  - **The claim is one conditional UPDATE** with `.select()`. It matches when `result->>date <> today` OR (`status = 'started'` AND `updated_at` older than 10 min).
  - Exactly one row back means the claim is ours. Postgres row locking makes a concurrent second UPDATE re-check and match 0 rows.
  - The statuses used are `started` and `success`, both already allowed by the CHECK. One row in the Settings health list is fine (per-date rows would not be).
- **"Today" is the actual Pacific date.** Explicit `date=` calls (manual, token path only) skip the claim.
- **The order inside `notify` for `4am`** is window validation, then the claim, then the channel check, the daytime refresh and the picture build. A call that loses the claim does no work that could throw.
- **Outcomes:**
  - After `sendRoster` succeeds: `success`, recording `{date, trigger, sentAt}`.
  - On failure: the claim is released, so the 5am call or the fallback tries again.
  - `no_data` (0 workers on a weekday): `success` with `outcome: 'no_data'`, plus **an alert at once** (`alertAndLog`, job `notify-4am`). Today this case is silent.
- **A crash after a successful send** (timeout) leaves the claim `started`. After 10 min it can be taken over, which allows one duplicate. That's the intended direction: a duplicate beats a missing roster. `api/notify.js` gets `maxDuration: 60` in `vercel.json`, so the 10-minute takeover is always above the function limit.

### The 7am / 8:30am baseline
- Today a `notify` failure write (`writeCronHealth(..., 'failure', null, ...)`) blindly sets `result: null` on the `notify` row and wipes `lastHash`/`lastDate`. 7am then has no baseline and re-sends an unchanged roster.
- That's an existing bug, and the daily fallback would hit it every weekday. **Fix:** failure writes keep the stored `lastHash`/`lastDate`.

### The GitHub fallback
- **`notify-4am.yml` moves to `0 14 * * 1-5`** (7am PDT / 6am PST) before 2026-11-01 (Kate approved, 2026-10-22).
- **A token-path 4am call sends only at or after 06:00 Pacific** (`force=1` overrides it for a manual re-send). It can't beat Vercel's 4–6am window, and it can't send at 3am even if the cron isn't moved.
- **It skips when any roster already went out today:** the claim's date is today, or the `notify` row's `lastDate` is today, which covers GitHub running 7am first.
- **When it does send, it alerts Kate** through `alertAndLog`, job `notify-4am-late`, which is added to ops-watch's `ALERT_JOBS` so an undelivered alert is a finding. The text names the reason: the on-time call never ran, sent nothing (no data), or failed (the claim's last error).
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
- Failure signals: the `notify-4am-late` alert, the `no_data` alert, ops-watch's no-roster finding.
- First live runs: Fri 2026-10-23 at 11:00–12:59 UTC (check Vercel received both calls with no query string). First PST run: Mon 2026-11-02 at 12:00–13:59 UTC.

## Tests (from this note, before code)
Gate edges at both DST instants; the trigger comes from the credential (CRON_SECRET without any param is still gated; `trigger=vercel` on the token path changes nothing); CRON_SECRET unset fails closed; CRON_SECRET with `date=` or another window is rejected; two claims race and only one sends; a stale `started` claim is taken over after 10 min; a failed send releases the claim; the fallback skips after a 7am send; a fallback failure leaves `lastHash`/`lastDate` intact; `no_data` alerts; the late alert names its reason; `force=1` only on the token path.

## Not in this change
7am and 8:30am (later: one cron line each plus their Pacific hour), Friday pm, intraday (off while the roster goes to Telegram).
