# Qboard Operator Runbook

**Who this is for:** the person responsible for keeping Qboard running. Currently: Kate.

**Philosophy:** the system is designed to alert you before you notice something is wrong. If you're reading this because you noticed a problem yourself, check the monitoring first — there should already be a WhatsApp alert with context.

---

## Quick health check

Run these SQL queries in the Supabase dashboard to get a full system status in 30 seconds:

```sql
-- 1. Cron pipeline — did the overnight sync run?
SELECT cron_name, last_ran_at, status, result, error_msg
FROM cron_health
ORDER BY cron_name;

-- 2. Queue — is anything stuck?
SELECT status, type, COUNT(*)
FROM sync_queue
GROUP BY status, type
ORDER BY type, status;

-- 3. Recent boardings — is data flowing in?
SELECT b.external_id, d.name, b.arrival_datetime, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC
LIMIT 10;

-- 4. Notify state — when was the last roster image sent? (status 'failure' + error_msg = last run failed; result is then null)
SELECT status, error_msg, result FROM cron_health WHERE cron_name = 'notify';
```

---

## Failure playbook

### "I didn't get a WhatsApp this morning"

**Step 1: Check GitHub Actions**

Go to the repo → Actions → `notify-4am` → latest run.

- **Run didn't trigger:** the scheduled workflow didn't fire (GitHub Actions outage or missed schedule). Trigger it manually via `workflow_dispatch`.
- **Run failed:** check the step logs. The curl response body will show the error.
  - `No recipient received the roster (N of N sends failed)`: Meta rejected every recipient (token expired, template rejected, number problem). See the Meta token and template steps. Nothing else to do for the roster itself: no hash was stored, so the next window sends again.
  - ops-watch can say "No morning roster sent today" even when 4am failed and 7am got through. Check `message_log` for today's `notify-7am` / `notify-8:30am` rows before acting.
- **Run succeeded:** the endpoint returned 200. Check Vercel logs for `/api/notify`.

**Step 2: Check Vercel logs**

Vercel dashboard → Functions tab → filter for `/api/notify`. Look for:
- `[Notify] shouldSend: false` — the hash matched (nothing changed since last send). This is correct behavior for 7am/8:30am. Not correct for 4am — that window always sends.
- `[NotifyWA] Meta API credentials not configured` — `META_PHONE_NUMBER_ID` or `META_WHATSAPP_TOKEN` is missing from Vercel env vars.
- `[NotifyWA] Failed to send to ***-***-XXXX: Meta API error 401` — token is invalid or expired. Regenerate the system user token in Meta Business Settings.
- `[Notify/Refresh]` errors — the live schedule refresh failed. Non-fatal; notify should still proceed with DB data.

**Step 3: Verify the Meta token**

In Meta Business Settings → System Users → Admin → confirm the system user is assigned to both the App (QApp) and the WhatsApp Business Account with Full control. Re-generate the token if needed, update `META_WHATSAPP_TOKEN` in Vercel env and GitHub Secrets.

---

### "The cron health check sent an alert"

The alert message will say which cron missed a run or had consecutive failures (auth, schedule, or detail).

**If `cron-auth` is missing/failed:**
- All other crons will fail too (no valid session)
- Check Vercel logs for `/api/cron-auth` — look for auth errors (`[Auth]` log lines)
- Common causes: external site password changed, site is down, Vercel function error
- Manual fix: trigger `cron-auth` manually via `curl https://qboarding.vercel.app/api/cron-auth -H "Authorization: Bearer $CRON_SECRET"`, then trigger `cron-schedule`

**If `cron-schedule` is missing/failed:**
- Boardings won't be queued for the next cycle
- The queue won't grow — existing queue items will still be processed by detail crons
- Check Vercel logs for `/api/cron-schedule`

**If `cron-detail` is missing/failed (but auth + schedule are OK):**
- Appointments are queued but not being fetched/saved
- The queue will process normally the next night
- No data loss — items stay in the queue with `status = 'pending'`

---

### "Ops watch sent an alert" (WhatsApp "Q Boarding ops watch", or a GitHub email from "Ops alert")

`/api/ops-watch` runs on Vercel once a day, some time between 17:00 and 17:59 UTC (Hobby cron precision) and checks outcomes, not just whether jobs ran. Every line of the alert is one finding:
- **Sync backlog / Sync queue deep / Sync stalled:** the detail queue isn't draining (oldest pending over 16 h, more than 30 pending, or nothing processed in 36 h). If `requeuedEdited` in the `schedule` `cron_health` row is large, unchanged appointments are being re-queued again (#278). See "Queue is backed up". To drain by hand: `node scripts/drain-queue.js` with `.env.local` loaded (sends nothing, about 7–10 s per item).
- **No morning roster / not delivered:** check today's `notify-4am` run in Actions and the `message_delivery_status` rows. "Not delivered" with Meta errors usually means a token or template problem.
- **Workflow X: last success Nh ago:** open that workflow in Actions. If it's disabled, enable it. If it's failing, read the error (an expired Gmail token is a common one).
- **Roster image broken:** call `/api/roster-image?type=weekend&token=…`. A 500 with `FUNCTION_INVOCATION_FAILED` means the function crashed on load. The last time (#246) a dependency bump caused it.
- **Couldn't check …:** the check itself failed. Fix that first: missing `GH_ACTIONS_TOKEN`, an expired token, or Supabase down.

**To see today's findings without alerting:** `curl -H "Authorization: Bearer $CRON_SECRET" "https://qboarding.vercel.app/api/ops-watch?dryRun=1"`.

`cron-health-check` (GitHub) reports ops-watch itself when it hasn't run for 26 h, so each scheduler watches the other.

---

### "The Keepalive workflow failed" (or no notifications at all)

GitHub disables scheduled workflows after 60 days without a commit. Then notifications, the cron health check, the integration check and the Gmail monitor all stop silently (this happened 2026-08-24 and wasn't noticed until October). `Keepalive` runs every Monday at 12:00 UTC and refreshes each active workflow so that can't happen again.

**If it failed with "was disabled for inactivity":** a workflow got disabled anyway. GitHub → Actions → pick the workflow → **Enable workflow**. Do that for each one named, then run `Keepalive` by hand (Run workflow) and check it goes green.

**If it failed with "Could not refresh":** usually a GitHub outage or a token permission problem. Re-run it. If it keeps failing, check that `keepalive.yml` still has `permissions: actions: write`.

**To check the state of every workflow:** `command gh workflow list --all` (`gh` alone is a shell alias here). `disabled_inactivity` is the problem state. `disabled_manually` means someone turned it off on purpose.

---

### "The integration check reported missing appointments"

The check runs 3×/day and compares DB boardings against the live schedule page.

**Read the report carefully:** the message will list specific external IDs that appear on the schedule but are missing from the DB.

**Known false positive:** new bookings made after midnight (after the cron ran) will appear on the schedule but won't be in the DB yet. They'll sync overnight. If the IDs are for bookings that were just made today, this is expected.

**If it's a real gap:**
1. Trigger a manual sync from the app (Settings → External Sync → Sync Now)
2. If the appointment still doesn't appear, check the sync filter — the appointment might be getting filtered out. Look for the external ID in Vercel logs during a manual sync.
3. If filtered incorrectly, this is a bug — check `sync.js` filter logic.

**To trigger the integration check on-demand:**
GitHub Actions → `integration-check` → Run workflow.

---

### "The Gmail monitor is sending alerts for old/irrelevant emails"

The monitor catches all unread emails from GitHub, Vercel, and Supabase that match failure patterns. On first run after setup, it will alert on historical unread emails — all are deduped immediately after the first run.

**If you're getting repeat alerts for the same email:**
Check `gmail_processed_emails` in Supabase — the email ID should be there after the first alert. If it's not being deduped, there may be a DB write failure. Check GH Actions logs for the gmail-monitor run.

**If you want to suppress a specific email type:**
Edit the `KNOWN_SENDERS` array in `scripts/gmail-monitor.js` to adjust `subjectPatterns`. Note: Supabase newsletter emails (from `@supabase.com`) are intentionally caught by any-subject matching — the filter is broad by design.

---

### "The Supabase project is paused"

Supabase pauses free-tier projects after 7 days of inactivity.

**Symptoms:** all DB operations fail with connection errors. The Gmail monitor will catch the "Your Supabase Project has been paused" email and send an alert.

**Fix:**
1. Go to [supabase.com](https://supabase.com) → your project → click "Restore project"
2. Wait 1–2 minutes for the project to come back online
3. Trigger a manual sync to catch up on any missed overnight data

**Prevention:** visiting the Supabase dashboard or making any DB call counts as activity. The app's cron jobs run daily and count as activity, so the project should never pause while crons are healthy.

---

### "Queue is backed up (many `pending` items)"

Check the queue query above. If there are many pending items:

1. **Is the detail cron running?** Check `cron_health` for `cron-detail` — if it hasn't run recently, trigger it manually
2. **Is the session valid?** If `cron-auth` failed, the session may be expired. Trigger `cron-auth` manually first
3. **Are items stuck?** Items with `status = 'processing'` for more than 10 minutes are stuck. Run `resetStuck` logic or manually update them to `pending` via SQL:

```sql
UPDATE sync_queue
SET status = 'pending', attempts = attempts + 1
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '15 minutes';
```


**Drain it by hand** (sends no WhatsApp): load `.env.local`, then `node scripts/drain-queue.js [maxItems]`. It runs the crons' own `runDetailSync()` until the queue is idle, one item every ~7–10 s. On 2026-10-16 it drained 880 → 0 in about 2 h (835 skipped as daycare/same-day, 39 boardings created).
---

## Manual operations

### Force a full sync (browser)

Settings → External Sync → set date range → Sync Now. Or use the "Full sync" link for no date filter.

### Trigger the notify pipeline manually

GitHub Actions → `notify-4am` → Run workflow.

### Check what was sent today

```sql
SELECT status, error_msg, result FROM cron_health WHERE cron_name = 'notify';
-- status 'failure' = the last window failed (result is null; error_msg says why)
-- result.lastHash = hash of last roster sent
-- result.lastDate = date of last send
```

### Clear a stuck queue item

```sql
UPDATE sync_queue SET status = 'pending' WHERE id = <id>;
```

### Adding a worker

The repo is public, so worker names are kept only in Supabase (#281).
1. Find the worker's AGYD UID: the `ew-<uid>` class on their events, or the "Unknown worker uid" warning in the sync logs.
2. Add the row in Supabase (SQL editor), not in a migration:
   ```sql
   INSERT INTO workers (external_id, name) VALUES (<uid>, '<display name>');
   ```
3. Add the UID to `WORKER_IDS` in `src/lib/workers.js`, in the roster column position you want, and update REQ-601 and `src/__tests__/workers.test.js`.
4. To retire someone, set `active = false` on their row. Their column then shows "Worker <uid>" until the UID is removed from `WORKER_IDS`.

### Mark a boarding as archived (don't sync it again)

```sql
UPDATE boardings SET sync_status = 'archived' WHERE external_id = '<id>';
```

---

## Vercel env for ops-watch
- `GH_ACTIONS_TOKEN`: fine-grained PAT, repository `kcoffie/dog-boarding` only, permissions **Actions: Read and write**. Used by `/api/ops-watch` to read workflow runs and dispatch `ops-alert.yml`. When it expires, ops-watch reports "Couldn't check the scheduled workflows".
- `CRON_SECRET`: Vercel sends it to crons; ops-watch rejects every request without it.
- ops-watch also needs these in **Vercel** env (not just GitHub secrets): `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` (Kate's alert channel, also used by `/api/send-question`), `VITE_SYNC_PROXY_TOKEN` (roster image) and the Supabase keys. Env changes apply only after a redeploy. If `CRON_SECRET` is missing, every ops-watch call gets 401 and `cron-health-check` reports "ops-watch has never run".
- Email alerts arrive only if Kate's GitHub notification settings email her about failed Actions runs she triggered (Settings → Notifications → Actions).

## GitHub Actions secrets reference

All secrets must be **Repository secrets** (not environment secrets) for workflows to access them.

| Secret | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | All workflows | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All workflows | Never expose to browser |
| `EXTERNAL_SITE_USERNAME` | integration-check | For Step 0 re-auth |
| `EXTERNAL_SITE_PASSWORD` | integration-check | For Step 0 re-auth |
| `META_PHONE_NUMBER_ID` | notify workflows | From Meta app dashboard |
| `META_WHATSAPP_TOKEN` | notify workflows | System user token — never expires |
| `NOTIFY_RECIPIENTS` | notify workflows | E.164, comma-separated |
| `TELEGRAM_BOT_TOKEN` | integration-check, health-check, gmail-monitor (+ Vercel: ops-watch, send-question) | `@qap_alert_bot` token from @BotFather. Rotate with `/revoke`, then update GitHub **and** Vercel |
| `TELEGRAM_ALERT_CHAT_ID` | same as above | Kate's private chat with the bot (from `getUpdates` after she messages it once) |
| `ANTHROPIC_API_KEY` | gmail-monitor | Optional one-line summary of each alert email (plain `fetch`, no SDK); skipped if unset |
| `GMAIL_CLIENT_ID` | gmail-monitor | Google Cloud OAuth2 |
| `GMAIL_CLIENT_SECRET` | gmail-monitor | Google Cloud OAuth2 |
| `GMAIL_REFRESH_TOKEN` | gmail-monitor | Long-lived, doesn't expire for personal accounts in test mode |
| `APP_URL` | notify workflows | `https://qboarding.vercel.app` |
| `VITE_SYNC_PROXY_TOKEN` | notify workflows | Shared token for gated API endpoints |
