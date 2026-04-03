# Gmail Monitor Job

**Status:** Live — hourly at :15 past, OAuth2 confirmed working (March 20, 2026)
**Last reviewed:** April 2, 2026

---

## What It Does

Scans `kcoffie@gmail.com` hourly for unread emails from known infrastructure senders. When a matching email is found, it sends a WhatsApp alert to `INTEGRATION_CHECK_RECIPIENTS` (Kate only) and records the email ID in Supabase to prevent duplicate alerts.

**Coverage:**

| What broke | How it surfaces |
|---|---|
| GitHub Actions workflow failed | `notifications@github.com` + subject matching "run failed" / "all jobs have failed" / "some jobs were not successful" |
| Vercel deployment failed | `notifications@vercel.com` + subject matching "failed" |
| Any Supabase email (quota, downtime, billing) | `*@supabase.com` domain — any subject |

This is the infrastructure-level complement to the cron health check (M1-1). The cron health check catches *application-level* failures (cron ran but errored internally). The Gmail monitor catches *platform-level* failures (workflow never ran, Vercel deploy blew up, Supabase quota hit).

---

## How It Works (Step by Step)

### Step 1 — OAuth2 token refresh
Exchanges the long-lived `GMAIL_REFRESH_TOKEN` for a short-lived access token via Google's OAuth2 endpoint. The access token is only used for this run — not stored. Throws on failure (hard exit).

### Step 2 — Gmail search
Searches `kcoffie@gmail.com` for unread messages from known senders using a Gmail query:
```
from:(notifications@github.com OR notifications@vercel.com) OR from:(@supabase.com) is:unread
```
Returns up to 20 message IDs. If 0 results → done.

### Step 3 — Classify each message
For each message ID:
1. Fetch metadata only (`From` + `Subject` headers + snippet — not the full body)
2. **Self-skip check first:** if subject matches `SELF_SKIP_SUBJECTS` (`/gmail[- ]monitor/i`) → skip silently. This prevents an infinite loop where the Gmail Monitor's own GH Actions failure email triggers another alert.
3. **Sender match:** check if `From` matches a known sender config (exact email or domain)
4. **Subject match:** check if subject matches any pattern for that sender
5. If both match → proceed to dedup check. If sender matched but subject didn't (e.g. a GitHub PR comment) → skip and log.

### Step 4 — Dedup check
Query `gmail_processed_emails` by `email_id`. Already processed → skip. Query failure → fail open (process anyway, to avoid missing real alerts).

### Step 5 — Build and send alert
Constructs a WhatsApp message:
```
⚠️ Infrastructure Alert
From: GitHub Actions
Subject: [deploy-dog-boarding] Run failed
Summary: <1-line Claude summary if available>
```
The `Summary:` line is only included when Claude returns a different value than the subject. Falls back to subject if Claude is unavailable or has no credits. Sends to all numbers in `INTEGRATION_CHECK_RECIPIENTS` via Meta Cloud API.

### Step 6 — Mark processed
Inserts `{ email_id, sender, subject, alert_sent: true }` into `gmail_processed_emails`. Mark-processed failure is non-fatal (logged as warning) — the alert was already sent.

---

## Self-Skip Guard

If the Gmail Monitor workflow itself fails, GitHub sends a "run failed" email to the inbox. Without the self-skip guard, the *next* Gmail Monitor run would pick that up and alert — and if that alert triggered another failure, you'd have an infinite loop.

`SELF_SKIP_SUBJECTS` (currently `[/gmail[- ]monitor/i]`) is checked before any sender or subject matching. Any email whose subject matches is silently dropped.

**To add a new self-skip pattern:** edit `SELF_SKIP_SUBJECTS` in `scripts/gmail-monitor.js`. Keep the list narrow — it's a suppression list, not a general filter.

---

## Dedup Mechanism

`gmail_processed_emails` table in Supabase. Schema:
```sql
email_id   text primary key
sender     text
subject    text
alert_sent boolean
created_at timestamptz default now()
```

Gmail message IDs are stable and globally unique. Once an ID is in this table, it will never be processed again regardless of unread status. This is intentional — if Gmail re-marks an email as unread (e.g. after a label change), you don't want a duplicate alert.

---

## Optional: Claude Summary

If `ANTHROPIC_API_KEY` is set and has credits, the monitor calls Claude Haiku with the email subject + snippet and asks for a one-sentence summary (max 15 words). This makes the WhatsApp message more scannable than a raw subject line.

Uses `claude-haiku-4-5-20251001` — cheapest model, only used when a matching email is found (not on every run). Completely non-blocking: if the API call fails for any reason, the alert still sends with the raw subject.

As of March 20, 2026 — Anthropic API key is set but has no credits. Claude summary is silently skipped.

---

## Schedule

| Schedule | Detail |
|---|---|
| Cron | `15 * * * *` — every hour at :15 past |
| Timezone | UTC (GitHub Actions) |
| Trigger | Also available on-demand via `workflow_dispatch` in the Actions tab |
| Timeout | 5 minutes |

The `:15` offset is deliberate — avoids collision with other hourly jobs that might run at `:00`.

---

## Required Secrets

All must be **Repository secrets** in GitHub (Settings → Secrets and variables → Actions → Repository secrets — NOT environment secrets).

| Secret | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS — for dedup read/write |
| `GMAIL_CLIENT_ID` | OAuth2 client ID from Google Cloud Console |
| `GMAIL_CLIENT_SECRET` | OAuth2 client secret |
| `GMAIL_REFRESH_TOKEN` | Long-lived token — obtained via one-time local auth flow (`npm run reauth-gmail`) |
| `META_PHONE_NUMBER_ID` | Meta Cloud API phone number ID |
| `META_WHATSAPP_TOKEN` | Meta Cloud API system user token |
| `INTEGRATION_CHECK_RECIPIENTS` | Kate's number only (E.164 format, comma-separated for multiple) |
| `ANTHROPIC_API_KEY` | Optional — Claude 1-line summary. Falls back to subject if absent or no credits |

**Note on Gmail OAuth:** The OAuth app is in "testing" mode on Google Cloud. This works indefinitely for a single authorized user (Kate). No Google app verification is required for personal use. If this ever needs a second authorized user, Google's verification process for Gmail read scope applies.

---

## Files

| File | Purpose |
|---|---|
| `scripts/gmail-monitor.js` | The job script — runs in GH Actions |
| `.github/workflows/gmail-monitor.yml` | Schedule + secrets wiring |

---

## Diagnosing Failures

### "No unread emails from known senders — done" (no alert when you expected one)
- The email may not be from one of the exact configured senders (check `KNOWN_SENDERS` in `gmail-monitor.js`)
- The email may not match any subject pattern for that sender (e.g. a GitHub PR comment from `notifications@github.com` won't match)
- The email may have been marked as read before the monitor ran
- The email may already be in `gmail_processed_emails` — check with: `SELECT * FROM gmail_processed_emails ORDER BY created_at DESC LIMIT 20;`

### OAuth2 error — `invalid_grant` (token revoked)

Google returns `invalid_grant` when the refresh token is revoked or expired. This happens when:
- Kate logs in from a new country (Google treats this as a security event and revokes tokens)
- The Google account password changes
- Access is manually revoked in Google Account → Security → Third-party access

**How the monitor handles it:** The script detects `invalid_grant` specifically and exits 0 with a clear message — it does NOT fail the workflow (which would generate its own GH Actions failure email). Monitoring is paused until the token is refreshed.

**How to fix:** run the one-time re-auth flow locally:
```bash
GMAIL_CLIENT_ID=<value from GH secrets> GMAIL_CLIENT_SECRET=<value from GH secrets> npm run reauth-gmail
```
The script opens a browser, captures the new refresh token, and prints the exact `gh secret set` command to update it. After updating the secret, trigger the Gmail Monitor workflow manually to confirm it works:
```bash
/usr/local/bin/gh workflow run gmail-monitor.yml --repo kcoffie/dog-boarding
```

**Other OAuth errors** (wrong credentials, network failure, etc.) are not `invalid_grant` and will still cause the workflow to exit 1 — those are unexpected failures, not a known state.

### Alert fired but it was a false positive
Check `gmail_processed_emails` to confirm the email was recorded. The self-skip guard only suppresses alerts about the Gmail Monitor workflow itself. If a different GH Actions workflow you don't care about is sending alerts, you have two options:
1. Add the subject pattern to `SELF_SKIP_SUBJECTS` (suppresses for all future runs)
2. Narrow the subject pattern in `KNOWN_SENDERS` for that sender

### Seeing alerts for old emails on first run (historical backfill)
On the first run after setup, all unread matching emails in the inbox will be processed — not just new ones. This is expected behavior (first run will send alerts for any historical unread match). After the first run, all processed IDs are in Supabase and won't fire again.

---

## Known Limitations

- **Gmail unread-only:** The monitor only sees emails that are currently unread at `:15` past the hour. If Gmail auto-marks emails as read (e.g., via a filter rule or mobile client), the monitor won't catch them.
- **Max 20 per run:** `searchGmail` returns up to 20 messages. In a flood scenario (mass GH Actions failure), only the first 20 matches will be processed per run. The remaining ones will be caught on the next hourly run (they'll still be unread since the monitor doesn't mark emails as read in Gmail — it only records in Supabase).
- **No read/unread state management:** The monitor never modifies Gmail (no mark-as-read, no archive). The `is:unread` filter in the Gmail query is the dedup mechanism at the Gmail level; `gmail_processed_emails` is the dedup at the alert level.
