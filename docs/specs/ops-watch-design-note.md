# Design note: ops-watch (stale-data alert) — #237

## Problem
The app stopped serving the client for seven weeks and nobody was told.
- **2026-08-24:** GitHub disabled all 8 scheduled workflows (9 with `keepalive.yml`) (60 days without a commit). Morning rosters stopped. So did the cron health check, because it runs on the same GitHub scheduler.
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
- **Vercel Hobby:** crons run once a day at most and can fire anywhere in a ±59 min window. 17:00 UTC is late enough either way.
- **GitHub API down:** that's check 6, one line in the message, not a crash.

## Threat
- **New secret:** `GH_ACTIONS_TOKEN`, a fine-grained PAT scoped to `kcoffie/dog-boarding` only, with **Actions read and write** (write is needed to dispatch `ops-alert.yml`; Kate approved, 2026-10-16). It lives only in Vercel env (Production). A leak lets someone read workflow runs and start or cancel workflows in this repo: no code, no secrets. When it expires, ops-watch reports "Couldn't check".
- **Public log:** the findings text, including error messages from Supabase and GitHub, appears in the public Actions log and step summary of `ops-alert.yml`. Findings hold counts, workflow names and error text only, never client data; each is cut to 200 characters.
- **Endpoint auth:** `Authorization: Bearer $CRON_SECRET`, **failing closed** when `CRON_SECRET` is unset. The existing crons fail open there; that's tracked in #239.
- **The alert text** holds counts and workflow names only, never client or dog names.

## How we'll know it's working
- Unit tests for each check, written from this table (good-tests rules), plus a mutation score on the new module.
- A dry-run mode (`?dryRun=1`) that returns the findings as JSON without sending, run once against production with Kate's OK. Today it should report all 6 kinds: the queue backlog, the stalled sync, no roster, 8 disabled workflows, and a keep-alive that has never run.

## Architect review (2026-10-16): proceed with changes
1. **WhatsApp may already be dead.** K-8 (replace the Meta test number) was due around 2026-07-02. If it wasn't done, every alert, this one included, goes nowhere. Before building: do one real send and confirm a `delivered` row in `message_delivery_status`. A `sent` row in `message_log` only means Meta accepted it.
   - Second channel with no new service: ops-watch triggers a tiny `ops-alert.yml` via `workflow_dispatch` that exits 1 with the findings. GitHub emails the person whose token triggered it, and event triggers are never disabled for inactivity. That needs Actions **write**.
   - An issue opened with Kate's own token won't work: GitHub doesn't notify you of your own activity.
2. **Replace checks 4 and 5 with "last successful run age per scheduled workflow"** (gmail-monitor 3 h, integration-check 12 h, cron-health-check 26 h, notify-4am 4 days for the weekend, keepalive 8 days). One check then catches disabled (inactivity or manual), failing (e.g. an expired secret), and dropped schedules.
3. **The keep-alive isn't proven.** GitHub doesn't document that the enable call resets the 60-day timer (keepalive-workflow relies on it; efrecon/gh-action-keepalive reports a toggle didn't beat the deadline). So ops-watch is the real guard, not a backup.
4. **The mutual watch needs fixing.**
   - `cron-health-check`'s "ran since midnight UTC" would flag a 17:00 job every night. It needs a 26 h rule for ops-watch.
   - `cron-health-check` exits 0 after alerting and writes no `cron_health` row, so nothing can watch it. It should exit 1 on findings.
5. **Alert fatigue.**
   - The 880-item backlog drains at about 60 a day (integration-check), so check 1 would fire daily for about 2 weeks. Drain or prune the backlog before go-live.
   - Re-alert on a persisting finding only when it gets worse, or every N days.
6. **Check 3 should look for `delivered`/`read` in `message_delivery_status`, not just `sent`.** That is most of G-1 for free.

### Decisions for Kate (blocking the build)
1. Widen the token to Actions:write for the email channel, or stay WhatsApp-only?
2. Was K-8 done? If not, it blocks the client's roster too.
3. A persisting finding: repeat daily, or only when it changes / every 3 days?
4. Should a closed-day `no_data` roster raise an alert?
5. Drain or prune the 880-item backlog before go-live?

### Kate's decisions (2026-10-16)
1. **Email channel: yes.** The token gets Actions read **and write**, so ops-watch can dispatch `ops-alert.yml`, which fails and makes GitHub email Kate.
2. **K-8 is fine.** The Friday roster sent by hand on 2026-10-16 was `delivered` to both recipients and `read` (webhook rows 2301–2306). WhatsApp works.
3. **Persisting findings repeat daily.** No dedup state needed.
4. **A closed-day `no_data` roster does alert.**
5. **Backlog drained** on 2026-10-16 with `scripts/drain-queue.js`: 880 → 0 (835 skipped, 39 boardings created, 1 updated, 17 forms).

### Build (revised after review)
Checks 4 and 5 are replaced by **"last successful run age"** per scheduled workflow, which also catches disabled, failing and dropped schedules. Check 3 requires a `delivered`/`read` webhook row, not just `sent`. **New check 7, from the 2026-10-16 incident:** the weekend roster image must render in production (#246: a deps bump crashed the image functions and only the Friday roster send revealed it). Every finding goes to WhatsApp (Kate) **and** to the email channel. `cron-health-check` gets a 26 h rule for `ops-watch`.
