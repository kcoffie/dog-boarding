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

### "I didn't get the roster this morning"

**Since 2026-10-20 the roster comes to Kate's Telegram** (`ROSTER_CHANNEL=telegram`, REQ-655). The WhatsApp steps further down are kept for reference only.

**How the 4am roster is sent (REQ-658, #321):** two Vercel crons call `/api/notify` at 11:00 and 12:00 UTC; the one that lands in 04:00–05:59 Pacific (Mon–Fri) sends. The GitHub `notify-4am` workflow at 14:00 UTC (7am PDT / 6am PST) is the fallback: it sends only if the on-time send didn't, and then Telegram says **"The 4am roster went out late … The on-time send <reason>."** Every 4am call first claims the day on the `cron_health` row `notify-4am-claim`, so the roster goes out once.
- **"went out late … never ran today":** Vercel didn't call (cron missing from the deploy, or a Vercel outage). Check Vercel → qboard → Settings → Cron Jobs lists two `/api/notify` entries, and the claim row (below).
- **"… found no roster data":** 0 workers at 4–6am. You also got a "No roster data for …" alert at 4am. Check the midnight crons (`cron_health` `schedule` / `detail`) and the daytime refresh.
- **"… failed: <error>":** the error is the on-time call's 500 (see the 500s below).
- **"… started but didn't finish":** the on-time call crashed or timed out mid-send (it may have sent; you may get two rosters).
- **"… couldn't be checked":** the claim row couldn't be read when the fallback ran (a Supabase blip); read it now (below).
- **Two rosters on a bad morning:** 7am and the fallback both run at 14:00 UTC; on a day the on-time send failed, both may send. Expected, and only on failure days.
- **"Roster image fetch failed: HTTP 401/403"** on the on-time call: the trigger renders from `https://qboarding.vercel.app`; check that domain is still the production domain and not behind Deployment Protection.
- **"didn't go out on time … A later roster already went out":** nothing was re-sent; read the reason the same way.
- **No roster and no alert:** Vercel didn't send and the GitHub fallback didn't run either. ops-watch reports "No morning roster sent today" at 17:00 UTC. Send it now with the forced run (Manual operations).
- **Claim row:** `SELECT status, result, error_msg, updated_at FROM cron_health WHERE cron_name = 'notify-4am-claim';` — `success` + today's `result.date` = sent (by `result.trigger`: `vercel` on time, `github` late); `failure` = the day is open and a later call retries; `started` = in progress (or crashed; taken over after 10 minutes).
- **Daylight time needs nothing:** after a change, the other UTC cron becomes the 4am one. To check, read the claim row's `result.at` the next weekday.
- **500 `ROSTER_CHANNEL is not set…` or `is "…"`:** set `ROSTER_CHANNEL` in Vercel (qboard → Production) to `telegram`, then redeploy (env changes apply only after a deploy).
- **500 `Roster image fetch failed: HTTP …`:** the image endpoint is broken. Check `/api/roster-image?type=weekend&token=…` (see "Roster image broken").
- **500 `No recipient received the roster (1 of 1 sends failed): Telegram sendPhoto …`:** Telegram refused it. `400 … chat not found` means `TELEGRAM_ALERT_CHAT_ID` is wrong; `401` means `TELEGRAM_BOT_TOKEN` is wrong. No hash was stored, so the next window sends again.
- **"The 7am / 8:30am / Friday pm roster failed at … : <error>"** (job `notify-alert`, REQ-659): the on-time call for that window failed; the error is its 500 (the cases above apply). Re-send by hand: Actions → `notify-7am` / `notify-830am` / `notify-friday-pm` → Run workflow. For 7am, the 8:30am check sends any change anyway.
- **"The 7am roster didn't run on <date>"** (ops-watch or cron-health-check): Vercel skipped that cron. Check Vercel → qboard → Settings → Cron Jobs lists **13** entries (8 for `/api/notify`), and the window's claim row: `SELECT status, result FROM cron_health WHERE cron_name IN ('notify-7am-claim','notify-830am-claim','notify-friday-pm-claim');`. One skip is a Vercel blip; two in a row needs investigating.
- **"… roster failed at … : no roster data":** no roster data at that window although the 4am call didn't report none (the day's data vanished after 4am, or the 4am call never ran) (a bad sync or refresh). Check the sync and the daytime refresh before the next window.
- **Switching channels:** change `ROSTER_CHANNEL` in the evening and redeploy. The 7am/8:30am hash gate compares against what was already sent that day, so a mid-morning switch sends nothing new until the roster changes.

**WhatsApp (before 2026-10-17, reference)**

**Step 1: Check GitHub Actions**

Go to the repo → Actions → `notify-4am` → latest run.

- **Run didn't trigger:** the scheduled workflow didn't fire (GitHub Actions outage or missed schedule). Trigger it manually via `workflow_dispatch`.
- **Run failed:** check the step logs. The curl response body will show the error.
  - `No recipient received the roster (N of N sends failed)`: Meta rejected every recipient (token expired, template rejected, number problem). See the Meta token and template steps. Nothing else to do for the roster itself: no hash was stored, so the next window sends again.
- **Run succeeded:** the endpoint returned 200. Check Vercel logs for `/api/notify`.

**Step 2: Check Vercel logs**

Vercel dashboard → Functions tab → filter for `/api/notify`. Look for:
- `[Notify] shouldSend: false` — the hash matched (nothing changed since last send). This is correct behavior for 7am/8:30am. The 4am window never hash-gates (since REQ-658 it skips only as `already_sent` / `already_claimed` / outside its hour).
- `[NotifyWA] Meta API credentials not configured` — `META_PHONE_NUMBER_ID` or `META_WHATSAPP_TOKEN` is missing from Vercel env vars.
- `[NotifyWA] Failed to send to ***-***-XXXX: Meta API error 401` — token is invalid or expired. Regenerate the system user token in Meta Business Settings.
- `[Notify/Refresh]` errors — the live schedule refresh failed. Non-fatal; notify should still proceed with DB data.

**Step 3: Verify the Meta token**

In Meta Business Settings → System Users → Admin → confirm the system user is assigned to both the App (QApp) and the WhatsApp Business Account with Full control. Re-generate the token if needed, update `META_WHATSAPP_TOKEN` in Vercel env and GitHub Secrets.

---

### "The cron health check sent an alert"

The alert message will say which cron missed a run or had consecutive failures (auth, schedule, or detail).

**If `cron-auth` is missing/failed:**
- The other crons don't log in themselves (#324): they use the stored session until its 30 h stamp passes, then record `session_failed`
- Check Vercel logs for `/api/cron-auth` — look for auth errors (`[Auth]` / `[SiteLogin]` log lines)
- Common causes: external site password changed (that trips the breaker: see "Booking site blocked"), site is down, Vercel function error
- Manual fix (a 5xx or a timeout, not a refused login): trigger `cron-auth` manually via `curl https://qboarding.vercel.app/api/cron-auth -H "Authorization: Bearer $CRON_SECRET"`, then trigger `cron-schedule`

---

### "Booking site blocked" (Telegram alert, or an ops-watch line)

The breaker (#324, REQ-657) tripped: the booking site refused the app's login, or answered 429 (too many requests) or 403 (refused). Until it's cleared, **nothing contacts the booking site**: the sync crons, Sync Now, the roster refresh and the Integration Check all stop (`action: 'site_blocked'`, recorded as success because the alert already went out). The roster keeps using the data already in the app. ops-watch repeats it daily.

1. Read the reason: Settings → "Booking site access", or `SELECT blocked_at, blocked_reason, cleared_at, cleared_by FROM site_access;` (service key; the table has no policies).
2. **"it refused the login":** the app's own booking-site password is wrong or was changed. Update `EXTERNAL_SITE_PASSWORD` in Vercel (qboard → Production) and redeploy **before** Clear, or Clear's login fails and trips it again.
3. **"it answered 429 / 403":** the site is throttling the account. Wait (a few hours at least), and don't press Clear repeatedly: each Clear is one login.
4. Press **Clear** in Settings. It records who cleared it, then logs in at once. "Cleared and signed in" means the next runs work; an error means it tripped again (new alert).

**If `cron-schedule` is missing/failed:**
- Boardings won't be queued for the next cycle
- The queue won't grow — existing queue items will still be processed by detail crons
- Check Vercel logs for `/api/cron-schedule`

**If `cron-detail` is missing/failed (but auth + schedule are OK):**
- Appointments are queued but not being fetched/saved
- The queue will process normally the next night
- No data loss — items stay in the queue with `status = 'pending'`

---

### "Q Boarding sync: N booking(s) to check" (Telegram, job `sync-detail`)

One message per run, one line per booking (its ID and title), each sent once until what it says changes. Two kinds of line (#344).

**Pages that weren't read (REQ-660).** The booking site didn't show the booking, so nothing was written for it: no dog, boarding or sync row changed. Once per URL.

- **"now redirects to the schedule (stay moved or cancelled?)":** the booking last held a stay. Open it on the booking site from the schedule (not the old link):
  - **Moved** (new start time or dates): nothing to do. Its URL changed, so the next scan (4 a day) re-queues it and reads it.
  - **Cancelled or gone:** its boarding is still in the app until reconciliation catches it (#316). Mark it archived (below) if it affects tonight's roster or pay.
- **"redirected to …" anywhere else:** the site sent the page somewhere unexpected. Check the booking on the site; if it keeps happening across bookings, the site changed and the sync needs a look.
- **"had no check-in/check-out dates":** a booking page came back without its dates, so the site's page layout may have changed. If several arrive, stop and check the HTML before trusting new syncs.
- Playgroup series that redirect but never held a stay are counted (`redirected_to_schedule` in the detail result) but not alerted. "Held a stay" means a boarding under the booking's ID, or dates on its sync row or that row's previous version.

**Pets the sync wouldn't decide (REQ-661).** The page was read and everything else was saved; the line says what wasn't. The booking site is the source of truth: fix the data at the source or by SQL Kate runs, never by hand in the app.
- **"pet N is "X" on the booking site but "Y" in the app (not renamed)":** the sync never renames a dog. Check pet N's page on the booking site. If the app's name is wrong, rename the row by SQL; if the app's dog is a different dog, its stored pet ID is wrong: stop and look before changing anything.
- **"linked pet N ("X") to the app's dog of that name (…): …":** information. A dog that had no pet ID was given one, with the evidence named. If the evidence looks wrong (e.g. a dog entered by hand for another client), check pet N's page and clear the ID by SQL.
- **"… the app has a dog with that name, but nothing shows it's this pet" / "… bookings from another client" / "N dogs in the app have that name and no pet ID":** nothing was saved for that pet; its boarding is missing from the app. Check pet N's page, then either set the right dog's `external_pet_id` to N by SQL (the next read links the boarding) or, if no app dog is that pet, leave it: the next read creates one only once no same-name dog without an ID is left, so merge or rename the duplicate first.
- **"pet N (…) is on 2 dogs in the app":** migration 030 isn't in place, or it failed. Run its pre-check and fix the duplicate.
- **"the page gave no usable pet ID" / "the page has a client but no pet the sync could read (layout change?)":** the booking site's page may have changed. If several arrive, stop and check the HTML before trusting new syncs.
- **"pet N (…): no price on the page carries its ID":** rates weren't read for that pet (its stored rates are kept). If every two-pet booking says this, the raw page doesn't carry `data-pet` on its prices: the sync needs a change.
- **"boarding … is on a dog that isn't on this booking's page now" / "one dog (…) has 2 boardings on this booking":** old data from before #344. Check the booking on the site and fix the boarding rows by SQL (archive or move); the sync never moves a boarding.
- **"its form job is for pet N, not its boarding's dog's pet ID":** a form job queued before #344 PR 2 named the wrong pet. Nothing was fetched; the next read of the booking queues the right one.

**After the #344 PR 2 deploy (once):**
1. Before the deploy, Kate runs migration 030 (`supabase/migrations/030_unique_dog_pet_id.sql`): the pre-check in its header (expect 0 rows), then the two statements, outside 23:30–01:30 UTC.
2. After the deploy, re-queue the current and upcoming bookings so PR 2 reads them (about 18 booking pages, once; second pets then get their IDs and form jobs):
   ```sql
   -- preview
   SELECT q.external_id, s.check_out_datetime FROM sync_queue q JOIN sync_appointments s ON s.external_id = q.external_id
   WHERE q.type = 'appointment' AND q.status = 'done' AND s.check_out_datetime >= now();
   -- re-queue
   UPDATE sync_queue q SET status = 'pending', retry_count = 0, last_error = NULL, next_retry_at = NULL, queued_at = now()
   FROM sync_appointments s
   WHERE s.external_id = q.external_id AND q.type = 'appointment' AND q.status = 'done' AND s.check_out_datetime >= now();
   ```

- **Known gap (accepted):** each item is marked as reported before the alert is sent. If a run is killed in the seconds between (a Vercel timeout), that one alert is lost; the item's `meta.detail_redirect` in `sync_queue` still records it.

### "Ops watch sent an alert" (WhatsApp "Q Boarding ops watch", or a GitHub email from "Ops alert")

`/api/ops-watch` runs on Vercel once a day, some time between 17:00 and 17:59 UTC (Hobby cron precision) and checks outcomes, not just whether jobs ran. Every line of the alert is one finding:
- **Schedule scan … (failed / hung / got the login page / found no appointments / last run Nh ago):** the nightly `cron-schedule` didn't do its job (#275). `SELECT status, error_msg, result FROM cron_health WHERE cron_name = 'schedule';` For `sync_settings read failed`, check Supabase. For `N enqueue(s) failed`, `result.failedEnqueueIds` names them. For the login page, check AGYD's login (cron-auth's row). One night's miss is caught up by the next scans.
- **Sync backlog / Sync queue deep / Sync stalled:** the detail queue isn't draining (oldest pending over 16 h, more than 30 pending, or nothing processed in 36 h). If `requeuedEdited` in the `schedule` `cron_health` row is large, unchanged appointments are being re-queued again (#278). See "Queue is backed up". To drain by hand: `node scripts/drain-queue.js` with `.env.local` loaded (sends nothing, about 7–10 s per item).
- **Booking site blocked since … Nothing syncs until Clear in Settings:** the breaker is tripped. See "Booking site blocked".
- **No morning roster / not delivered:** the 4am roster is sent by Vercel's crons (REQ-658): read the `notify-4am-claim` row first (see "I didn't get the roster this morning"), then today's `notify-4am` fallback run in Actions, and the `message_delivery_status` rows. "Not delivered" with Meta errors usually means a token or template problem.
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
2. **Is the session valid, and the breaker clear?** If `cron-auth` failed, the session may be expired: trigger `cron-auth` manually first. If Settings shows "Booking site blocked", see that section
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

GitHub Actions → `notify-4am` → Run workflow. **Tick "force"** to send now: without it, a run on a weekend, before 06:00 Pacific, or on a day the 4am roster already went out sends nothing (it answers 200 `skipped`). **Don't run it without force on a day the roster already went out**: if the on-time claim doesn't show it, you get a "didn't go out on time" alert. A forced run doesn't touch the 4am claim and sends no alert.

### Check what was sent today

```sql
SELECT status, error_msg, result FROM cron_health WHERE cron_name = 'notify';
-- status 'failure' = the last window failed (error_msg says why; result keeps the last good send, REQ-658)
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

### "Q Boarding sync, removed bookings" (Telegram, job `sync-reconcile`)
The nightly `cron-schedule` (00:05 UTC) checks this week's and next week's bookings against the booking site (#316, REQ-108).
- **"Cancelled <id> …: removed on the booking site, or moved outside the next two weeks":** its page answered a redirect to `/schedule` and it was on neither page. All its dogs' boardings are cancelled (off the rosters and pay). If it was really moved, it's restored when it next shows up on a schedule page (a `sync-detail` alert says so). Nothing to do unless the site still shows it on its old dates.
- **"Would cancel …" (report only):** the first night after the deploy; nothing changed.
- **"N booking(s) … their page still opens":** not on either week's page but still live. Not cancelled. If it keeps happening, the schedule reader may be missing bookings: look at the page.
- **"Not checked: …" / "Reconciliation stopped: …" / "N error(s)":** nothing was cancelled that night. More than 10 missing or more than 3 gone means a page probably didn't load right; it tries again the next night. Read the `schedule` row's `cron_health.result.reconcile`.
- Don't fix a booking by hand: the booking site is the source of truth.

---

## Deploys (#298)
- **Only `main` deploys**, for every branch whose head contains #298. Vercel reads `git.deploymentEnabled` from the pushed commit's `vercel.json`, so a branch cut before #298 still builds on every push until it is rebased onto main. PRs and Dependabot branches then use none of Hobby's deployments and show no Vercel check. To get a preview of a UI change, push the branch as `preview/<name>`.
- **After every merge, run `npm run check:deploy`.** With no argument it checks main's head as GitHub reports it (not your local `origin/main`); or pass a SHA. It waits for qboard's Vercel status (context `Vercel`; `Vercel – qboard` on older commits), then checks the home page and `/api/roster-image` (200 `image/png`). Exit 1 means production did **not** change or doesn't answer.
- **Rate limits.** "retry in 24 hours" means the daily quota (100) ran out. A rate-limited deploy is never retried, so the next push to `main` after the reset ships everything. "retry in 5 minutes" is the short burst limit: push to main again (or redeploy) after 5 minutes.
- **Don't mass-push old branches** (history rewrites, bulk rebases): branches without #298 still build. That's what used up the quota on 2026-10-19.

## Vercel env for ops-watch
- `GH_ACTIONS_TOKEN`: fine-grained PAT, repository `kcoffie/dog-boarding` only, permissions **Actions: Read and write**. Used by `/api/ops-watch` to read workflow runs and dispatch `ops-alert.yml`. When it expires, ops-watch reports "Couldn't check the scheduled workflows".
- `CRON_SECRET`: Vercel sends it to crons; ops-watch rejects every request without it.
- ops-watch also needs these in **Vercel** env (not just GitHub secrets): `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` (Kate's alert channel, also used by `/api/send-question`), `INTERNAL_API_TOKEN` (roster image) and the Supabase keys. Env changes apply only after a redeploy. If `CRON_SECRET` is missing, every ops-watch call gets 401 and `cron-health-check` reports "ops-watch has never run".
- Email alerts arrive only if Kate's GitHub notification settings email her about failed Actions runs she triggered (Settings → Notifications → Actions).

## GitHub Actions secrets reference

All secrets must be **Repository secrets** (not environment secrets) for workflows to access them.

| Secret | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | All workflows | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All workflows | Never expose to browser |
| `EXTERNAL_SITE_USERNAME` | integration-check | **Unused since #324** (the check never logs in); Kate may delete it |
| `EXTERNAL_SITE_PASSWORD` | integration-check | **Unused since #324**; Kate may delete it |
| `META_PHONE_NUMBER_ID` | notify workflows | From Meta app dashboard |
| `META_WHATSAPP_TOKEN` | notify workflows | System user token — never expires |
| `NOTIFY_RECIPIENTS` | notify workflows | E.164, comma-separated |
| `ROSTER_CHANNEL` | Vercel env (not a secret) | Required. `telegram` = roster to Kate only, intraday off (REQ-655) |
| `TELEGRAM_BOT_TOKEN` | integration-check, health-check, gmail-monitor (+ Vercel: ops-watch, send-question) | `@qap_alert_bot` token from @BotFather. Rotate with `/revoke`, then update GitHub **and** Vercel |
| `TELEGRAM_ALERT_CHAT_ID` | same as above | Kate's private chat with the bot (from `getUpdates` after she messages it once) |
| `ANTHROPIC_API_KEY` | gmail-monitor | Optional one-line summary of each alert email (plain `fetch`, no SDK); skipped if unset |
| `GMAIL_CLIENT_ID` | gmail-monitor | Google Cloud OAuth2 |
| `GMAIL_CLIENT_SECRET` | gmail-monitor | Google Cloud OAuth2 |
| `GMAIL_REFRESH_TOKEN` | gmail-monitor | Long-lived, doesn't expire for personal accounts in test mode |
| `APP_URL` | notify workflows | `https://qboarding.vercel.app` |
| `INTERNAL_API_TOKEN` | notify workflows | Server-only token for the jobs' endpoints (REQ-656) |
