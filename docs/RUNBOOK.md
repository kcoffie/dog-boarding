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

-- 4. Notify state — when was the last roster image sent?
SELECT result FROM cron_health WHERE cron_name = 'notify';
```

---

## Failure playbook

### "I didn't get a WhatsApp this morning"

**Step 1: Check GitHub Actions**

Go to the repo → Actions → `notify-4am` → latest run.

- **Run didn't trigger:** the scheduled workflow didn't fire (GitHub Actions outage or missed schedule). Trigger it manually via `workflow_dispatch`.
- **Run failed:** check the step logs. The curl response body will show the error.
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

---

## Manual operations

### Force a full sync (browser)

Settings → External Sync → set date range → Sync Now. Or use the "Full sync" link for no date filter.

### Trigger the notify pipeline manually

GitHub Actions → `notify-4am` → Run workflow.

### Check what was sent today

```sql
SELECT result FROM cron_health WHERE cron_name = 'notify';
-- result.lastHash = hash of last roster sent
-- result.lastDate = date of last send
```

### Clear a stuck queue item

```sql
UPDATE sync_queue SET status = 'pending' WHERE id = <id>;
```

### Mark a boarding as archived (don't sync it again)

```sql
UPDATE boardings SET sync_status = 'archived' WHERE external_id = '<id>';
```

---

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
| `TWILIO_ACCOUNT_SID` | integration-check, health-check, gmail-monitor | Twilio account |
| `TWILIO_AUTH_TOKEN` | integration-check, health-check, gmail-monitor | Twilio token |
| `TWILIO_FROM_NUMBER` | integration-check, health-check, gmail-monitor | `whatsapp:+14155238886` |
| `INTEGRATION_CHECK_RECIPIENTS` | integration-check, health-check, gmail-monitor | Kate's number |
| `ANTHROPIC_API_KEY` | integration-check | Step 3 vision check — silently skipped if no credits |
| `GMAIL_CLIENT_ID` | gmail-monitor | Google Cloud OAuth2 |
| `GMAIL_CLIENT_SECRET` | gmail-monitor | Google Cloud OAuth2 |
| `GMAIL_REFRESH_TOKEN` | gmail-monitor | Long-lived, doesn't expire for personal accounts in test mode |
| `APP_URL` | notify workflows | `https://qboarding.vercel.app` |
| `VITE_SYNC_PROXY_TOKEN` | notify workflows | Shared token for gated API endpoints |
