# Notify Jobs (WhatsApp Roster)

**Status:** Live (weekdays + Friday PM, PDT schedule — update UTC times each DST transition)
**Last reviewed:** March 18, 2026

---

## What They Do

Four GitHub Actions workflows send WhatsApp notifications. Three fire on weekday mornings with the daily roster image; one fires Friday afternoon with a weekend boarding preview.

| Workflow | File | Time (PDT) | UTC | Days | Behavior |
|---|---|---|---|---|---|
| Notify 4am | `notify-4am.yml` | 4:00 AM | 11:00 | Mon–Fri | Always sends — daily roster image |
| Notify 7am | `notify-7am.yml` | 7:00 AM | 14:00 | Mon–Fri | Sends only if roster changed |
| Notify 8:30am | `notify-830am.yml` | 8:30 AM | 15:30 | Mon–Fri | Sends only if roster changed |
| Notify Friday PM | `notify-friday-pm.yml` | 3:00 PM | 22:00 | Fri only | Always sends — weekend boarding preview image |

All four support manual trigger (`workflow_dispatch`) for testing.

---

## Why They Exist

Staff start arriving at different times. The 4am message guarantees everyone has a roster before their shift starts — even if the team reviews it at different hours. The 7am and 8:30am checks catch last-minute changes (a new booking overnight, a cancellation) without spamming if nothing changed.

Using GitHub Actions (not Vercel crons) because:
- Vercel Hobby crons are limited to one trigger per path per day, and these run 3× daily
- GH Actions has no timeout constraint — the notify endpoint itself runs in Vercel, so the workflow just fires a curl and checks the HTTP status

---

## How It Works

### The four workflows
Each workflow is a single step: a `curl` to `/api/notify?window={window}&token={VITE_SYNC_PROXY_TOKEN}`. The token gates the endpoint against unauthorized calls. If the HTTP status isn't `200`, the step fails (shows red in GH Actions UI), which surfaces notify failures visibly.

### The `/api/notify` endpoint (`api/notify.js`)

The endpoint orchestrates the full notify flow:

1. **Refresh live schedule** — calls `refreshDaytimeSchedule()` to fetch the current day's DC/PG appointments from AGYD and upsert into `daytime_appointments`. This ensures the image reflects live data, not just what was ingested at midnight.

2. **Get picture of day** — calls `getPictureOfDay()` from `pictureOfDay.js`. This selects one dog per active worker for the day, building a roster of {worker → boarding dog}.

3. **Compute worker diff** — calls `computeWorkerDiff()` to compare today's roster against yesterday's (stored in `cron_health`). Returns which workers have new dogs and which lost dogs since the previous send.

4. **Window gate:**
   - `window=4am` → always proceeds to send daily roster image
   - `window=7am` or `window=8:30am` → hashes the current roster; if hash matches stored hash in `cron_health`, skips sending
   - `window=friday-pm` → always sends; generates a weekend-themed image (arrivals + departures Sat–Sun) instead of the daily roster. Writes health record to `cron_health WHERE cron_name = 'notify-friday-pm'`

5. **Generate roster image** — calls `/api/roster-image` (same Vercel deployment) with the roster data. Returns a PNG. Uses AGYD brand colors (Forest Green `#4A773C`, Sage Green `#78A354`).

6. **Send via Twilio WhatsApp** — calls `sendRosterImage()` from `notifyWhatsApp.js`, which sends the PNG to all numbers in `NOTIFY_RECIPIENTS` (comma-separated E.164 numbers).

7. **Store hash** — writes the roster hash and roster data to `cron_health` (`notify` row) so the 7am/8:30am windows can compare against it.

---

## Change Detection

The roster hash is computed from the current set of {worker → dog name} pairs. If any worker's dog changes (new booking, cancellation, name correction), the hash changes and the 7am/8:30am sends fire.

Hash is stored in `cron_health WHERE cron_name = 'notify'`. Check it with:

```sql
SELECT result FROM cron_health WHERE cron_name = 'notify';
```

---

## DST Note

The UTC times in the workflow `cron:` fields must be updated manually twice a year:

| Season | UTC offset | 4am | 7am | 8:30am | Fri 3pm |
|---|---|---|---|---|---|
| Standard (Nov–Mar) | UTC-8 | `0 12 * * 1-5` | `0 15 * * 1-5` | `30 16 * * 1-5` | `0 23 * * 5` |
| Daylight (Mar–Nov) | UTC-7 | `0 11 * * 1-5` | `0 14 * * 1-5` | `30 15 * * 1-5` | `0 22 * * 5` |

Currently set to **PDT** (daylight). Transition dates: second Sunday in March and first Sunday in November.

---

## Required Secrets

These are **GitHub Repository secrets** (Settings → Secrets → Actions → Repository secrets). They are separate from Vercel env vars — the two systems do not share secrets.

| Secret | Description |
|---|---|
| `APP_URL` | Vercel production URL (e.g. `https://qboarding.vercel.app`) |
| `VITE_SYNC_PROXY_TOKEN` | Token gating `/api/notify` and `/api/roster-image` |

The notify endpoint itself (running in Vercel) also needs these env vars set in Vercel:

| Vercel Env Var | Description |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio sandbox sender number |
| `NOTIFY_RECIPIENTS` | Comma-separated E.164 numbers (Kate + second recipient TBD) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — bypasses RLS |

---

## Files

| File | Purpose |
|---|---|
| `.github/workflows/notify-4am.yml` | 4am weekday workflow — always sends daily roster |
| `.github/workflows/notify-7am.yml` | 7am weekday workflow — sends on change |
| `.github/workflows/notify-830am.yml` | 8:30am weekday workflow — sends on change |
| `.github/workflows/notify-friday-pm.yml` | Friday 3pm workflow — always sends weekend boarding preview |
| `api/notify.js` | Notify orchestrator endpoint (handles all windows incl. friday-pm) |
| `api/roster-image.js` | PNG image generation endpoint (satori + resvg, token-gated; supports `type=weekend`) |
| `src/lib/pictureOfDay.js` | `getPictureOfDay()`, `computeWorkerDiff()`, `hashPicture()` |
| `src/lib/notifyWhatsApp.js` | Twilio wrapper — `sendRosterImage()`, `getRecipients()` |

---

## Known Issues / Backlog

- **Second recipient:** `NOTIFY_RECIPIENTS` currently has only Kate's number. Second number to be added when provided (Vercel env var change only — no code change needed).
- **Twilio sandbox:** currently using the Twilio sandbox sender, which requires recipients to opt in. Move to a Twilio production WhatsApp Business sender before expanding the team distribution.
- **DST manual update:** each March and November, the UTC times in all **four** `.yml` files need to be updated by hand. No automation exists for this.
- **`roster-image.js` token check comment:** the comment claims "constant-time comparison" but does not use `crypto.timingSafeEqual`. Low-priority polish — fix the comment or use the API.
- **`shouldSendNotification` `window` param shadowing:** the parameter named `window` shadows the browser global. Low-priority rename to `sendWindow`.
