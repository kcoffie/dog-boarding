# Design note: switchable roster channel (#260, step 1)

**Problem.** Meta locked the WhatsApp Business Account on 2026-10-17 (every send fails `131031`), so no roster has reached anyone since. Twilio SMS/MMS (#260) needs Kate's paid upgrade and A2P registration, which takes days to weeks. Meanwhile Kate wants the roster herself, on Telegram, and a one-setting switch to Twilio once it's approved.

**Options.**
1. **A `ROSTER_CHANNEL` env setting with one module behind it** (`telegram` now, `twilio` later, `whatsapp` kept until removed). The notify jobs call `rosterChannel.js` instead of `notifyWhatsApp.js`; the module picks the recipients and the sender. Switching means changing one Vercel env var and redeploying.
2. A row in `sync_settings`, which switches without a redeploy. But it's a table read on every send, and #295 says that table's schema isn't under migrations yet.
3. Send to both WhatsApp and Telegram. WhatsApp is dead, so this only adds a guaranteed failure to every run.

**Choice: 1.** One env var and one small module, built to the architect's review (all nine required changes folded in below).

**Behaviour (as built, REQ-655).**
- **`ROSTER_CHANNEL` is required, with no default.** The only value today is `telegram`. Unset or any other value fails `/api/notify` and `/api/notify-intraday` at handler entry, before the refresh or the hash gate, so a 7am window that would have skipped can't hide it. They return 500 naming the value and record a cron_health failure. A default would turn a lost env var after the Twilio switch into "staff silently get nothing while ops-watch is green".
- **The channel owns its recipients.** The Telegram sender sends to `TELEGRAM_ALERT_CHAT_ID` and takes no recipient argument, so staff numbers can never become chat IDs. The call sites lost their `getRecipients()` early returns: an empty `NOTIFY_RECIPIENTS` no longer turns into a green skip.
- **Interface `sendRoster({ channel, png, caption })`.** The handler renders the image once (`fetchRosterPng`, 30 s timeout), stores the bytes before the send, and sends the same bytes. No URL ever reaches the channel. A render failure fails the run.
- **No token in any error.** Errors are fixed text plus Telegram's `error_code`/`description`, or the HTTP status of our own render. Never a URL, fetch options or a raw fetch message. The notify workflows print the 500 body in public Actions logs.
- **Intraday is off on `telegram`.** It's for staff, and would be up to ~12 images a weekday to Kate (her decision, 2026-10-19). It skips with reason `channel_telegram` before reading anything. On a staff channel, a send that reached no one now fails the run before the delta hash is stored, so the next hour retries. It used to write `success` and a hash whatever happened.
- **The refresh alert isn't a roster.** It goes to Kate through `alertAndLog` (`notify-refresh-alert`) on every channel, so the Twilio switch can't send it to staff. The day's dedup row is written only when it was delivered, and `notify-refresh-alert` is in ops-watch's `ALERT_JOBS`.
- **ops-watch** reads `recipient` and counts a `sent` `notify-4am` row with `recipient = 'telegram'` as delivered, not "a row with no wamid". This retires Kate's "no 4am roster" finding while the roster reaches her.
- `whatsapp` isn't a value: the account is locked, and #260 never returns to it. `notifyWhatsApp.js` stays on disk until #260 removes it.
- Photo, not document: the rosters measured 800×1048 (weekday) and 800×374 (weekend), under Telegram's 1280 px photo limit.

**The switch to Twilio.** The setting is the cutover and the fallback, not the whole job. `twilio` needs #260's full build per PR #291's review: stored image and signed URL, the claims table, the trigger, delivery polling, new labels without the client's name, secrets and opt-in. #260 adds a `twilio` case to `sendRoster`; the call sites don't change.

**What breaks.**
- Staff get nothing until Twilio. That's no change from today, since WhatsApp is locked.
- A Telegram outage means the roster isn't delivered and the notify run goes red.
- Switching channels mid-morning: the 7am/8:30am hash compares against what Kate already got, so staff get nothing until the roster changes. Switch in the evening (RUNBOOK).

**Threat.** No new secret: it reuses the bot token and chat ID already in Vercel. The roster image holds client and dog names, and it goes only to Kate's own chat (she decided client data in Telegram is OK). The bot is in no groups.

**How we'll know it's working.**
- A photo in Kate's Telegram per window. GitHub's scheduler can run late: 4am ran 6 h late on 10-19.
- `message_log` rows with `recipient = telegram`, `status = sent`.
- cron_health `success` for `notify` / `notify-friday-pm`.

**How we'll know it isn't.**
- A non-200 turns the GitHub notify run red, and GitHub emails Kate.
- ops-watch at 17:00 UTC reports a missing weekday 4am roster.
- friday-pm, 7am and 8:30am have no outcome check beyond the red run (#257). cron-health-check doesn't watch notify, and shouldn't: it runs at 00:30 UTC.
