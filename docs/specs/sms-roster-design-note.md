# Design note: the team roster over SMS/MMS (#260)

## Problem
The team roster has had no working channel since Meta disabled the WhatsApp Business account on 2026-10-18. Since then every roster send gets a `wamid`, and then the webhook marks it `failed 131031`. Two things are wrong at once:
1. **Channel.** WhatsApp needs a verified business, and Kate has none. The messages must never be tied to the client's business.
2. **Trigger.** The roster windows run on GitHub's scheduler: `notify-4am` (11:00 UTC), `notify-7am`, `notify-830am`, `notify-friday-pm` and `notify-intraday`. That scheduler drops and delays runs: on 10-19 nothing fired from 10:00 to 14:39 UTC, and notify-4am ran at 17:21 UTC, 6 h late. A roster that arrives after the shift started is worthless.

## Channel: Twilio SMS/MMS under a Sole Proprietor 10DLC brand
- **The sender is Kate, as an individual.** Her Sole Proprietor brand (her name, her own mobile for the OTP) and one campaign. No EIN, no business name, nothing that names the client.
- **Sole Proprietor limits:** one campaign and one phone number per brand, and low throughput (Twilio documents about 1 message segment a second and a T-Mobile daily cap). That's plenty for a handful of staff.
- **Status on 2026-10-19:** the Twilio account is a **trial** ($15.16 credit). The console blocks A2P registration until it's upgraded. **Upgrading is a payment, so Kate does it.** Then she registers the brand and campaign herself, since it needs her personal details and OTP. Campaign vetting takes days to weeks.
- **Plan B:** toll-free verification. It also works without an EIN, but the sender is an 8xx number.
- **Rejected:** Telegram for staff (Kate's decision: end users get SMS or WhatsApp, never Telegram), and email (rosters must be glanceable on a phone at 4am).

## Message
- **Roster windows (4am, 7am, 8:30am, Friday PM):** one MMS per recipient. Body: `Roster for <Day M/D>` plus a short text fallback (worker → dog count). The image is the existing PNG already stored in the private `roster-images` bucket (`api/notify.js`). Its `MediaUrl` is a **Supabase signed URL with a 15-minute TTL** created with the service role. Twilio fetches it once at send time. The `VITE_SYNC_PROXY_TOKEN` URL is never handed to a third party.
- **Intraday changes** are an image today (`notify-intraday.js` → `sendRosterImage`). Keep them as MMS, or switch to text; that's Kate's call, since it changes what staff receive (up to 12 messages a weekday).
- **The images name the client today:** the roster card title in `api/roster-image.js` ("Q Boarding") and the intraday header in `api/intraday-image.js` ("Q Boarding Changes · <date>"). Both must change before the first SMS, because messages from Kate's brand must not name the client's business. Kate picks the new label.
- **Opt-in and opt-out:** each staff member agrees in person or by text, and Kate records the date. The first message to each number says who it's from and gives "Reply STOP to opt out". Twilio's Advanced Opt-Out handles STOP and HELP itself. The campaign's sample messages and opt-in description must match this exactly, or vetting fails.
- **Recipients:** `NOTIFY_RECIPIENTS` (E.164) is unchanged. Who's on it is Kate's call.

## Trigger: off GitHub's scheduler
| Option | Precision | New moving parts | Notes |
|---|---|---|---|
| A. Vercel Hobby crons | once a day per entry, fires anywhere in the hour | 4–6 cron entries | 4am could land at 4:59. DST needs two entries per window. Vercel's cron count limits must be checked |
| **B. Supabase `pg_cron` + `pg_net` (chosen)** | to the minute | 2 extensions in the existing project, 1 secret in Vault | It calls `/api/notify?window=…` with a bearer secret. Supabase already runs every query the app makes, so there's no new vendor |
| C. External cron service (cron-job.org etc.) | to the minute | a new account, and the secret stored there | One more third party holding a secret |
| D. Vercel Pro | to the minute | $20/month | It's a cost, not a design |

**Choice: B.** The watcher stays on a different scheduler: ops-watch on Vercel (17:00 UTC) already reports "no 4am roster delivered", and #257 extends that to every window. GitHub's `notify-*` workflows are removed once B has run green for a week. Until then they're kept with schedules commented out, as a manual `workflow_dispatch` fallback.

**DST and duplicates:** `pg_cron` runs in UTC. Each window gets **two** jobs, one for PDT and one for PST: 11:00 and 12:00 UTC for 4am. `/api/notify` sends only when the Pacific clock matches the window (`America/Los_Angeles`, as ops-watch does), and otherwise returns `200 skipped: off-hour`. The existing hash gate (REQ-612) plus a per-window "already sent today" check in `cron_health` stop a retry or a double fire from sending twice.

## Delivery tracking
- Every message is sent with a `StatusCallback` to a new `POST /api/webhooks-twilio`. It verifies `X-Twilio-Signature` with the auth token, rejects anything unsigned, and writes `message_delivery_status`: the Twilio `MessageSid` in the existing `wamid` column, `status` (`queued`, `sent`, `delivered`, `undelivered`, `failed`), and `error_code`. There's no new table; the column keeps its name and a comment explains it.
- **ops-watch's roster rule** reads `delivered` the same way it does for WhatsApp today. `undelivered` and `failed` become a finding with the Twilio error code (30007 is carrier filtering, 30034 an unregistered number).
- **The notify refresh alert goes to staff today:** `sendRefreshAlert()` in `api/notify.js` sends to `NOTIFY_RECIPIENTS`. It moves to Kate's Telegram (`alertAndLog`, REQ-652) in this change.

## What breaks
- **The campaign is rejected or suspended.** Every send returns 30034, ops-watch reports "not delivered", and Kate sees it on Telegram. Plan B is toll-free.
- **The signed URL expires before Twilio fetches it.** 15 min is generous, since Twilio fetches within seconds. If not, the MMS fails with 12300 or 11200, which is reported the same way.
- **`pg_net` fails or the Supabase project pauses.** The free tier pauses after 7 days without activity, but the sync crons touch it daily. A missed window is caught by ops-watch on Vercel.
- **MMS image size.** Carriers cap MMS at around 1 MB, and Twilio transcodes up to 5 MB. Today's PNGs need measuring; if they're too big, send JPEG.
- **Long text.** SMS splits into 160-character segments (70 with emoji). Intraday text should stay short and avoid emoji.

## Threat
- **New secrets (Vercel Production only):** `TWILIO_ACCOUNT_SID`, plus a **restricted API key** (`TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`) limited to Messaging, rather than the account auth token. The webhook signature check needs `TWILIO_AUTH_TOKEN`. Also `TWILIO_FROM_NUMBER`.
  - **What a leak exposes:** sending SMS billed to Kate (fraud cost, and her campaign's reputation), and reading message logs that hold staff numbers and roster text.
  - **Mitigation:** the restricted key, Twilio's geo-permissions set to the US only, and a low balance with auto-recharge off.
- **New Supabase Vault secret:** the bearer secret `pg_net` sends to `/api/notify`. That's `CRON_SECRET`, and `notify.js` must check it and **fail closed**. Today it only checks the `VITE_` token, which ships to browsers (#239).
- **Staff phone numbers** stay in env and Twilio. They never go in the repo, logs (masked as last 4 digits, as now) or alert text.
- **Kate's own action:** remove the stale `TWILIO_*` GitHub secrets (Open TODOs).

## How we'll know it's working (and when it isn't)
- Unit tests from new REQ criteria: the Pacific-hour gate (both DST sides), the duplicate guard, signed-URL TTL use, Twilio request shape (a recorded response), webhook signature accept and reject, status mapping. Plus mutation scores.
- One real MMS to Kate's own number first, with her OK, then `delivered` in `message_delivery_status`.
- After go-live, ops-watch at 17:00 UTC shows no "roster not delivered" finding for a week, and only then are the GitHub `notify-*` schedules deleted. #246 closes after a scheduled roster is sent **and** delivered.

## Decisions for Kate
1. Upgrade the Twilio account (a payment) and register the Sole Proprietor brand and campaign yourself, with your name and your mobile. This blocks everything else.
2. The campaign's use-case wording and opt-in method. Proposed: "Shift schedule notifications to a small team who opted in in person; reply STOP to opt out." It must not name the client.
3. The trigger: Supabase `pg_cron` (recommended), or Vercel crons that can land up to an hour late.
4. Who's on `NOTIFY_RECIPIENTS`, and each person's recorded opt-in.

## Architect review (2026-10-19): proceed with changes
The review checked current Twilio, Supabase and Vercel docs. Sole Proprietor: one campaign and one number, about 1,000 segments a day to T-Mobile, MMS allowed at 0.5 messages a second, about $4.50 + $15 one-time plus $2/month campaign and about $1.40/month number (confirm in the console), and vetting of days to weeks. Vercel Hobby: 100 crons, each once a day, firing anywhere in the hour. pg_net: **2 s default timeout**, no retries, an unlogged queue.

Changes to the design (to be folded into the sections above before the build):
1. **No client name in any message:** fix both image labels, move the refresh alert to Telegram, and put no links in the messages (the app's hostname names the client). Every registration field gets Kate's own details.
2. **An atomic send claim.** A small `notify_claims(window, pacific_date)` table with a UNIQUE key and `INSERT … ON CONFLICT DO NOTHING`, states claimed / sent / failed, and a stale claim retaken after about 15 min. Today 4am always sends and `friday-pm` has no gate, so a read-then-write check in `cron_health` can't stop a double fire.
3. **Trigger:** pg_cron with an explicit `timeout_milliseconds` (about 120 s), **plus Vercel backstop crons** for 4am and friday-pm (2 of the 100). They send late if the window wasn't claimed, up to a cutoff, and Telegram Kate that pg_cron missed. Alternative: one pg_cron "tick" every 15 min calling one endpoint that works out which Pacific windows are due (one job, no DST pairs, catches up).
4. **Track delivery by polling, not a webhook.** Validating the `X-Twilio-Signature` webhook needs the account auth token, which controls the whole account. Instead, notify polls its message SIDs for about 60 s with the restricted key, writes delivered / undelivered / unconfirmed, and alerts Kate at once on 0 delivered. ops-watch re-checks. Add `undelivered` to `VALID_STATUSES` and a nullable `provider` column. Measure whether US MMS reports `delivered` at all.
5. **Opt-in by text keyword** (START/JOIN, with a confirmation reply that Twilio records). Send through the **Messaging Service** (Advanced Opt-Out and A2P attach there), with 2 sample messages matching the real body.
6. **Store the image before sending.** Today `storeRosterImage` runs after the send. Check that the signed URL answers HEAD with the right Content-Type, and measure the PNG against AT&T's 1 MB limit. Turn on HTTP auth for Twilio media.
7. **A dedicated `NOTIFY_TRIGGER_SECRET`** in Vault and Vercel, sent in the `Authorization` header and never in a query string. Notify fails closed. The pg_cron jobs live in a migration.
8. **The fallback:** a `force` flag with a logged reason for late manual sends. Update ops-watch's `notify-4am.yml` age rule in the same PR. Write ADR-004, superseding ADR-002 and ADR-003. Intraday moves too; it's hard-coded to PDT today.
9. **Opt-outs and balance:** report STOP'd numbers (21610) in ops-watch, and turn on Twilio's low-balance email.

**Decisions for Kate:** (1) upgrade and register (payment); (2) the new image label replacing the client's name; (3) intraday as MMS or SMS; (4) refresh alert to Telegram (recommended); (5) opt-in by keyword (recommended) and who's on the list; (6) when the guard can't read its state, send anyway (duplicate risk) or skip and alert; (7) how late a backstop may still send the 4am roster; (8) the trigger: pg_cron + Vercel backstops (recommended), the 15-min tick, or Vercel only; (9) delivery by polling (recommended) or webhook.
