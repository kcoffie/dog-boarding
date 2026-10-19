# Design note: sync silent failures (#275)

## Problem
Each case below makes a sync run look fine while the outcome the client depends on didn't happen (Ops gate rule 2). Found in the #239 review of `syncRunner.js`; checked against the code and production on 2026-10-19.

1. **`sync_settings` errors are ignored.**
   - `getCursorDate` ignores `error`, so a failed read silently resets the cursor to today, and weeks 3–8 are scanned less often.
   - `saveCursorDate` ignores the `select('id')` error. When that read fails, it **inserts** a second row, and it ignores the update and insert errors too.
   - `sessionCache.js` (`storeSession`, `clearSession`) has the same read-then-insert pattern.
   - **Correction to the issue text:** every read is `.limit(1).single()`, so a duplicate row doesn't make reads fail. Each read gets an **arbitrary** row (no `order`), so the cursor and the session cookies can split across rows: the session is stored in one row and read from the other, and the sync loses its login with no error.
   - Production has one row today (id 1).
2. **Endless `session_cleared`.** When AGYD serves the login form to a session `ensureSession` thinks is valid, `cron-schedule` clears the session and records health **success**, and nothing is queued. The detail path puts its item back to `pending` without counting a retry. If AGYD changes its login flow, every run does this forever.
3. **Failed enqueues still advance the cursor.** If every enqueue fails, the run returns `ok` with `queued: 0`, and the cursor moves past that week anyway. That week isn't scanned again for about 8 weeks (the cursor's wrap cycle).

## Options
1. **Fix each call site: check `error`, throw, never insert after a failed read, don't advance after failed enqueues. Then add one ops-watch outcome check (chosen).** It's small and local, and a throw already becomes a `cron_health` failure through the existing handlers.
2. **A unique single-row constraint on `sync_settings`** (for example `id = 1` with a CHECK). It stops duplicates at the database, but needs a migration on a table the session cache shares. Worth it later, but it doesn't make errors loud by itself.
3. **Count consecutive `session_cleared` results in `sync_settings` and alert past a cap.** That adds state and a write on the failure path. An outcome check catches the same thing without state.

**Choice: 1.**

## The changes
- **`getCursorDate`:** a `PGRST116` error (no row) means today, as now. Any other error throws `sync_settings read failed: …`. The scan then fails, `cron-schedule` records `failure`, and nothing is enqueued or advanced.
- **`saveCursorDate`, `storeSession`, `clearSession`:** read the row id with `order('id').limit(1)`. On `PGRST116` insert; on any other read error throw, and **never insert**. Check the update and insert errors too, and throw. `order('id')` makes every reader and writer pick the same row if a duplicate ever appears.
- **Failed enqueues:** if any enqueue failed, the cursor is **not** advanced, and the run returns `action: 'enqueue_failed'` with `failedEnqueues` and the counts. `cron-schedule` records that as `failure`. Enqueue is idempotent, so the next run retries the week.
- **`session_cleared` stays recorded as health success.** A single expired session is normal: `cron-auth` re-logs in daily. A persisting one is caught by the outcome check below, and by the 16 h oldest-pending rule from #278.
- **New ops-watch rule (Vercel, outside GitHub's scheduler): "Schedule scan found nothing."** A finding when the `schedule` `cron_health` row's last run is older than 26 h, or its `status` isn't `success`, or its `result.action` is `session_cleared`, or its `result.found` is 0. A working scan always finds something: the 10-19 scan found 227. A missing or unreadable row is "Couldn't check", as for every rule.

## What breaks
- **A Supabase blip during a scan** now fails the run, where before it silently reset the cursor. The cron is daily, so this costs one scan. `cron-health-check` and ops-watch report it; that's intended.
- **A genuinely empty schedule** (AGYD down for a day, or a holiday with nothing booked) is a finding. That's rare, and worth knowing.
- **`session_cleared` at 00:05 followed by a good Integration Check scan at 08:00:** the `schedule` row only reflects `cron-schedule`, so ops-watch at 17:00 still reports it. Acceptable: that cron's own scan failed.

## Threat
No new secret, table or recipient. The alert text holds counts and statuses only.

## How we'll know
- Tests from REQ-109's "Known gaps" (rewritten as criteria) and REQ-651 (the new rule): each `sync_settings` read and write error throws and doesn't insert; `order('id')` is used; a failed enqueue leaves the cursor; the ops-watch rule fires on each of its four conditions and not on a healthy row. Mutation scores on `syncRunner.js`, `sessionCache.js` and `opsWatch.js`.
- In production: the schedule `cron_health` row stays `success` with `found > 0`, and ops-watch stays quiet.
