# Design note: ops-watch (stale-data alert) — #237

## Problem
The app stopped serving the client for seven weeks and nobody was told.
- **2026-08-24:** GitHub disabled all 8 scheduled workflows (60 days without a commit). Morning rosters stopped. So did the cron health check, because it runs on the same GitHub scheduler.
- **From 2026-09-26:** boardings stopped updating while the Vercel sync crons kept writing `success` to `cron_health`. The detail queue backed up to about 880 items.

Every existing check asks whether a job ran, and every one of them runs on GitHub. We need a check that asks whether the **outcome** happened, running on a scheduler GitHub can't switch off.

## Options
1. **Add the checks to `scripts/cron-health-check.js` (GitHub).** It has the least new code, but it dies with GitHub's scheduler, which is exactly the August failure. Rejected.
2. **A new Vercel cron, `api/ops-watch.js`, once a day.** Vercel's crons kept running through both outages. It reads outcomes from Supabase plus workflow states from the GitHub API, then sends WhatsApp to Kate through the existing `sendTextMessage` / `getAlertRecipients()`.
3. **An external dead-man's switch (e.g. healthchecks.io).** Each job pings it, and it emails when pings stop. It's independent of both Vercel and GitHub, but it needs a new account and only covers "ran", not "outcome".

**Choice: 2.** For the watcher, the GitHub `cron-health-check` also checks that `ops-watch` ran in the last 26 h, so each scheduler watches the other. Option 3 stays a later add-on for the case where both die.

## What it checks (daily, 17:00 UTC = 10:00 PDT / 09:00 PST, after the 8:30 roster)
| # | Check | Alerts when |
|---|---|---|
| 1 | Queue backlog | Oldest `pending` `sync_queue` item is older than 48 h |
| 2 | Sync is moving | `pending` > 0 and no item reached `done` (`processed_at`) in the last 36 h |
| 3 | Morning roster went out (Mon–Fri, Pacific) | No `message_log` row with `job_name = 'notify-4am'` and `status = 'sent'` since 00:00 Pacific today |
| 4 | GitHub workflows alive | Any workflow under `.github/workflows/` is `disabled_inactivity` (reuses `classifyWorkflows`, REQ-650) |
| 5 | Keep-alive itself | Last successful `keepalive.yml` run is older than 8 days |
| 6 | Couldn't check | Any query above errors, or the GitHub token is missing or rejected. This counts as a finding, never as "fine" |

One WhatsApp message lists every finding, so there's at most one a day. When there are no findings, nothing is sent. The run is recorded in `cron_health` as `ops-watch` (success/failure) and in `message_log`.

A quiet day isn't a failure: an empty queue and no new boardings raise nothing (checks 1 and 2 only fire when work is waiting). The 4am roster always sends on weekdays when there is worker data (`api/notify.js`). Its `no_data` skip would trigger check 3, which is what we want: no roster is worth knowing about.

## What breaks
- **WhatsApp itself is down** (e.g. the Meta test number expired, K-8): every alert, this one included, goes nowhere. Then `ops-watch` records `failure` in `cron_health`, which the app's own status could show. **Open question for the architect.**
- **DST:** "today in Pacific" is computed with the `America/Los_Angeles` time zone, not a fixed offset.
- **Vercel Hobby:** crons run once a day at most and fire within the hour. 17:00 UTC is late enough either way.
- **GitHub API down:** that's check 6, one line in the message, not a crash.

## Threat
- **New secret:** `GH_ACTIONS_READ_TOKEN`, a fine-grained PAT scoped to `kcoffie/dog-boarding` only, with Actions read-only (Kate approved, 2026-10-16). It lives only in Vercel env (Production). A leak exposes workflow states and run logs of a repo that is already public. When the token expires, check 6 fires.
- **Endpoint auth:** `Authorization: Bearer $CRON_SECRET`, **failing closed** when `CRON_SECRET` is unset. The existing crons fail open there; that's tracked in #239.
- **The alert text** holds counts and workflow names only, never client or dog names.

## How we'll know it's working
- Unit tests for each check, written from this table (good-tests rules), plus a mutation score on the new module.
- A dry-run mode (`?dryRun=1`) that returns the findings as JSON without sending, run once against production with Kate's OK. Today it should report all 6 kinds: the queue backlog, the stalled sync, no roster, 8 disabled workflows, and a keep-alive that has never run.
