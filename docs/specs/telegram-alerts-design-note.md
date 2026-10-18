# Design note: Kate's alerts on Telegram (#259)

## Problem
On 2026-10-18 Meta disabled the WhatsApp Business account the app sends from (the Meta test account, unverified, "policy issues"). Every message the app sends went through it:
- the team roster
- every alert to Kate

So from that moment, **every alert is silent**, which is the exact failure the Ops gate exists to prevent.

Kate has no registered business, so a verified WhatsApp sender is out. The roster moves to SMS (Twilio, Sole Proprietor 10DLC; a separate issue, waiting on Twilio's approval). Alerts go only to Kate, and Kate uses Telegram. Messages must never be tied to the client's business.

## Options
1. **Wait for Twilio SMS, then send alerts there too.** That's one channel for everything, but alerts stay silent for days or weeks while registration is reviewed, and the next provider outage silences both again. Rejected as the only channel.
2. **Telegram bot for Kate's alerts (the dos pattern).** No business verification, no template approval, free, and works today. It reaches only Telegram users, which is fine because the only recipient is Kate.
3. **Email via a new provider (Resend, Gmail send).** A new account and key, and alerts get buried in an inbox. ops-watch already has an email path (a deliberately failing `ops-alert.yml`, so GitHub emails Kate) once `GH_ACTIONS_TOKEN` is set.

**Choice: 2.** Alerts also keep the existing GitHub-email path through ops-watch, so a Telegram outage is still noticed: ops-watch alerts on both channels.

## Design
- **`src/lib/alertKate.js` exports `sendAlert(text)`, the one way to alert Kate.** It sends to every configured alert channel, which today is Telegram only. WhatsApp alerts stop: the account is dead, and sending through it only adds failures.
  - Returns results in the same shape as `sendTextMessage`: `[{ to: 'telegram', status: 'sent' | 'failed', error? }]`. It includes **no `messageId`**, so `recordSentMessages`, which keeps only rows with a `messageId` (Meta wamids), records nothing. `message_log` still records the alert text.
  - **Missing config is a failure, never a silent no-op.** If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_ALERT_CHAT_ID` is unset, the result is `failed` with `Telegram alert channel not configured`, and the caller logs it.
  - **One attempt, no retry.** A retried send could arrive twice, and the next scheduled check is the retry (as in dos).
  - **Errors never include the URL,** because the bot token is part of it (`api.telegram.org/bot<token>/…`). Errors name the method and Telegram's error code only.
  - **Long text:** Telegram's limit is 4096 characters, so cut to 4000 with a "…" marker.
- **Callers switch from `sendTextMessage(text, getAlertRecipients())` to `sendAlert(text)`:**
  - `scripts/cron-health-check.js`
  - `scripts/integration-check.js`
  - `scripts/gmail-monitor.js`
  - `api/ops-watch.js` (WhatsApp half)
  - `api/send-question.js`

  `getAlertRecipients()` and `INTEGRATION_CHECK_RECIPIENTS` become unused, and are removed once the roster is on SMS.
- **Not in scope:** the notify refresh alert goes to the team (`NOTIFY_RECIPIENTS`), so it moves with the roster in the SMS work.
- **Workflows:** `cron-health-check.yml`, `integration-check.yml` and `gmail-monitor.yml` get `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` from repo secrets.

## What breaks
- **Every alert caller's channel.** Each has its existing test file; the tests change from asserting WhatsApp recipients to asserting `sendAlert`.
- **ops-watch's "the alert couldn't be sent" finding** now means Telegram failed. The GitHub-email path is unchanged.
- **Send-a-Question tells the user "Sent!"** only when Telegram accepted the message, as it does today for WhatsApp.

## Threat
- **`TELEGRAM_BOT_TOKEN` is a new bot, used only for dog-boarding** (not dos's bot), so a leak exposes only this bot. Anyone holding the token could send messages as the bot and read messages sent to it. Nobody but Kate talks to it, and the app never reads updates.
- **Where it lives:** GitHub Actions secrets plus Vercel Production env. Never in code, tests or docs (the repo is public). Rotate with @BotFather `/revoke`.
- **`TELEGRAM_ALERT_CHAT_ID` is Kate's private chat with the bot.** It isn't a credential (only this bot can message it), but it's kept in secrets too, so nothing personal sits in the public repo.
- **The bot only sends; nothing calls `getUpdates` or sets a webhook,** so there's no inbound surface.

## How we'll know it's working (and when it isn't)
- **Setup proof:** after Kate adds the secrets, one Telegram test alert is sent, with Kate's OK, from a manual `cron-health-check` run.
- **Ongoing:** every alert writes `message_log`. A Telegram failure leaves the caller's run failed or logged.
- **Outside watcher:** ops-watch (Vercel) sends its daily findings on Telegram and also through the GitHub-email path. If Telegram breaks, the email still arrives.
- **Known gap until #257 lands:** nothing alerts when an alert itself fails, except ops-watch's own email. Telegram failures from the GitHub scripts show only as red runs. #257 adds an ops-watch check for that.
