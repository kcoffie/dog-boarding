# ADR-004: Rosters sent by Vercel crons on the Pacific hour, with claim rows

**Status:** Accepted
**Date:** 2026-10-22 (4am roster, PR #335; 7am, 8:30am and Friday pm, #321)
**Supersedes:** the notifications part of ADR-002 ("GitHub Actions for notifications")

---

## Context
ADR-002 put the roster notifications on GitHub Actions schedules. Two things made that untenable by October 2026:

1. **GitHub starts scheduled runs hours late.** In the week of 10-19 the 4am roster started at 8:20–10:20 PDT, and on 10-22 GitHub dropped most hourly runs. A 7am or 8:30am "the roster changed" message at noon is useless to staff.
2. **GitHub cron is UTC only.** Every March and November someone had to edit the UTC hours, or the rosters fired an hour off. Kate's rule (2026-10-22): daylight time must need no code edits.

Vercel Hobby crons are on time to the hour. Each cron runs at most once a day, fires anywhere within its hour, never retries, and may very rarely be delivered twice or not at all (Vercel's docs). A project may have 100.

## Decision
- **Vercel crons call `/api/notify` with no query string, once in every UTC hour a roster window can fall in, in either season** (13 crons in the project today). The code reads the Pacific clock and picks the window: 4am (04:00–05:59), 7am (07:00–07:59), 8:30am (08:00–08:59), Friday pm (15:00–16:59 Fridays). Any other hour does nothing. Daylight time needs no edit.
- **Only the credential makes a call the trigger** (`Authorization: Bearer $CRON_SECRET`, fails closed). The trigger takes no params, so nothing in a URL can choose what it sends.
- **Each window claims its Pacific day on its own `cron_health` row before doing any work** (`notify-4am-claim`, `notify-7am-claim`, `notify-830am-claim`, `notify-friday-pm-claim`). The claim is one conditional update that Postgres row locking makes exclusive. A stale `started` claim (a crash) is taken over after 10 minutes. So duplicate deliveries send once, a retry hour costs nothing, and the row records each run.
- **Failure is loud, and the watcher runs elsewhere.**
  - The 4am roster keeps a GitHub fallback that sends late and alerts with the reason.
  - The other windows alert Kate at once on any failure (a 500 on Vercel is silent).
  - ops-watch (Vercel, its own cron) reports a window that didn't run the same morning. cron-health-check (GitHub) reports it the same evening, and also watches ops-watch.

## Options rejected
- **Hand-edit GitHub crons twice a year:** still hours late, and nothing outside GitHub hears a failure.
- **A Vercel cron dispatching the GitHub workflow:** two hops, still waits for a runner, and a token gains a new use.
- **Vercel Pro or an outside scheduler for minute precision:** costs money or adds a service and a secret. "Within the hour" is good enough for these windows.
- **Per-date claim rows, or a new table:** needs a migration and clutters the Settings health list. One row per window, holding the date, is enough.

## Consequences
- The 8:30am roster can arrive any time from 8:00 to 8:59. Accepted in #321.
- Rare duplicates on failure days are accepted: the 7am call and the 4am fallback at 14:00 UTC, or 7am and 8:30am seconds apart. A duplicate is preferred to a missing roster.
- `CRON_SECRET` can now start each roster once a day in its hour, to the configured channel only. Revisit when the roster goes to staff (#260).
- The pattern is reusable. A new timed job needs one cron line per UTC hour, an entry in the clock map, a claim row, an alert, and a watcher check.

Design notes: `docs/specs/roster-trigger-design-note.md` (the main note and the addendum), both reviewed by the architect agent. Requirements: REQ-658, REQ-659.
