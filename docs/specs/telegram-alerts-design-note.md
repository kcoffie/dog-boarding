# Design note: Kate's alerts on Telegram (#259)

## Problem
On 2026-10-18 Meta disabled the WhatsApp Business account the app sends from (the Meta test account, unverified, "policy issues"). Every message the app sends went through it, the team roster and every alert to Kate, so from that moment every alert is silent.

Worse, **a failed alert was already silent before the account died.** The architect review found:
- **The scripts ignore their send results.** `cron-health-check`, `integration-check` and `gmail-monitor` log "N/M sent", then hard-code `process.exit(0)`, so the run stays green.
- **`gmail-monitor` marks each email processed even when its alert failed.** Since 10-18, every email it should have forwarded is marked done and never retried.
- **`send-question` returns `{ ok: true }`, so the user sees "Sent!", when every send failed,** and also when no recipient is configured.

Kate has no registered business, so a verified WhatsApp sender is out. The roster moves to SMS (#260, waiting on Twilio approval). Alerts go only to Kate, and Kate uses Telegram. Messages must never be tied to the client's business.

## Options
1. **Wait for Twilio SMS, then put alerts on it too.** Alerts would stay silent for days or weeks, and the next provider outage would silence both again. Rejected as the only channel.
2. **A Telegram bot for Kate's alerts (the dos pattern).** No business verification or template approval, free, and it works today. It only reaches Telegram users, which is fine: Kate is the only recipient.
3. **Email through a new provider.** A new account and key, and alerts get buried. Not needed: GitHub already emails Kate when a run goes red (below).

**Choice: 2, plus making failure loud everywhere,** so the second channel is real:
- **GitHub scripts:** an alert that reached nobody turns the run red, and GitHub emails Kate about red scheduled runs. That works today, with no tokens.
- **Vercel (ops-watch):** a new rule turns failed alerts in `message_log` into a finding (below). It runs on a different scheduler from the scripts it watches. Its email path needs `CRON_SECRET` + `GH_ACTIONS_TOKEN` in Vercel, which Kate is adding.

## Design
### `src/lib/alertKate.js`
- **`sendAlert(text)` is the one way to alert Kate.** It sends to every configured alert channel, which today is only Telegram. WhatsApp alerts stop: the account is dead.
- **It never throws.** The whole body is wrapped, and it returns `[{ to: 'telegram', status: 'sent' | 'failed', error? }]`, the same shape as `sendTextMessage`.
  - There's no `messageId`, so `recordSentMessages` (which keeps only Meta wamids) records nothing.
  - `recordMessageLog` writes a `sent` or `failed` row as usual.
- **`alertDelivered(results)` is true when at least one result is `sent`.** Every caller decides on it.
- **Missing config fails.** If `TELEGRAM_BOT_TOKEN` or `TELEGRAM_ALERT_CHAT_ID` is unset, the result is `failed: Telegram alert channel not configured`.
- **The send itself:**
  - `sendMessage` with plain text and no `parse_mode`, so `_` or `*` in alert text can't cause a 400.
  - Text is cut at 4000 code points with a "…" marker. Code points, not UTF-16 units, so an emoji is never split.
  - 15 s fetch timeout.
  - One attempt, no retry: a retried send could arrive twice, and the next scheduled run is the retry. That includes 429 rate limits, which gmail-monitor can hit when it sends several alerts in a row.
- **Errors carry Telegram's `error_code` and `description`** (e.g. "Forbidden: bot can't initiate conversation with a user"), which tells "never /started", "blocked" and "chat not found" apart. They **never include the URL or the fetch options**, because the token is in the URL and Vercel logs don't mask secrets.

### Caller contract (a test for each)
| Caller | Today | After |
|---|---|---|
| `scripts/cron-health-check.js` | logs, `exit(0)` | Alert not delivered → `exit(1)` (red run → GitHub email). The hard-coded `exit(0)` changes so it can't override that. |
| `scripts/integration-check.js` | logs, `exit(0)` | Same: not delivered → `exit(1)`. Discrepancies alone still exit 0 (REQ-620). |
| `scripts/gmail-monitor.js` | marks processed regardless | Marks processed **only when delivered**, so the next hourly run retries. Any undelivered email → `exit(1)`. |
| `api/send-question.js` | `200 { ok: true }` regardless | Not delivered → `502 { ok: false }`, and the modal shows its error. The zero-recipient early return goes away (missing config is a failure). |
| `api/ops-watch.js` | `some(sent)` | Unchanged: it already treats a send it can't confirm as not delivered. `deps.sendWhatsApp` becomes `deps.sendAlert`, and the WhatsApp wording goes. |

**Not in scope:** the notify refresh alert goes to the team (`NOTIFY_RECIPIENTS`), so it moves with the roster in #260. `getAlertRecipients()` and `INTEGRATION_CHECK_RECIPIENTS` are removed once nothing uses them.

### New ops-watch rule (REQ-652)
Any `message_log` row with `status = 'failed'` in the last 24 h, for job `cron-health-check`, `integration-check`, `gmail-monitor` or `send-question`, becomes one finding: "N alerts failed to send (jobs…)". The data already exists.

### Workflows
`cron-health-check.yml`, `integration-check.yml` and `gmail-monitor.yml` get `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` from repo secrets.

## What breaks
- **Every alert caller's channel and exit behavior.** Their tests change to assert `sendAlert` and the contract above.
- **While Telegram is down, a failing `gmail-monitor` goes red every hour,** which means up to about 24 GitHub emails a day. That's loud on purpose; Kate decides whether that's acceptable.
- **Until #260, ops-watch's roster check reports "no notify-4am sent" every weekday.** That's true, but noisy; Kate decides whether to suppress it until SMS lands.

## Threat
- **`TELEGRAM_BOT_TOKEN` belongs to a new bot used only for dog-boarding,** not dos's bot. If it leaks, someone can:
  - send fake alerts to Kate (e.g. "re-auth here" links)
  - read anything sent to the bot
  - hijack it with `setWebhook` / `getUpdates`

  Remedy: @BotFather `/revoke`, then update both secret stores.
- **Bot name and username are public** (t.me lookup). Keep them neutral, with nothing tying them to the client's business. In @BotFather, disable joining groups.
- **Alert text now goes to Telegram's servers, and bot chats aren't end-to-end encrypted.** It includes client customer and dog names (integration-check) and staff free text (send-question). Before, it went to Meta. **Kate's call.**
- **Where secrets live:** GitHub Actions secrets plus Vercel Production env. Never in code, tests or docs (the repo is public).
- **`TELEGRAM_ALERT_CHAT_ID`** is Kate's private chat with the bot. It isn't a credential (only this bot can message it), but it's still kept in secrets.
- **The bot only sends.** Nothing calls `getUpdates` or sets a webhook, so there's no inbound surface.

## Setup (Kate)
1. **@BotFather:** create a new bot with a neutral name and disable group joins. Then send the bot any message (Telegram won't let a bot start a chat).
2. **Chat id:** found once, by hand, from `getUpdates`, and never in code.
3. **Secrets:** add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALERT_CHAT_ID` to **GitHub Actions secrets** and to **Vercel qboard → Production**. Add `CRON_SECRET` and `GH_ACTIONS_TOKEN` there as well, then **redeploy**: env changes only apply to new deployments.
4. **Actions email:** confirm GitHub notification settings email failed Actions runs.

## How we'll know it's working (and when it isn't)
- **GitHub path:** with Kate's OK, a manual `cron-health-check` run sends one Telegram alert.
- **Vercel path:** with Kate's OK, one question sent from the app. `?dryRun=1` doesn't send.
- **Done means:** both proofs received, and one ops-watch email seen, so the second channel is shown to work, not assumed.
- **Ongoing:** an undelivered alert means a red run (GitHub email) or a 502 the user sees, plus a `message_log` `failed` row that ops-watch reports the next day.
