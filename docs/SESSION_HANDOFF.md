# Dog Boarding App — Session Handoff (v5.5.0 LIVE)
**Last updated:** April 23, 2026 (session 16) — F-2 fully verified live. v5.5.0 released. main at `ee6bd75`.

---

## Current State

- **v5.5.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **999 tests, 57 files, 0 failures**
- **main clean at `ee6bd75`** (migration 026 — storage RLS policy)

### Recent merges (newest first)
| PR | What |
|---|---|
| #182 merged Apr 23 | feat: F-2 message log — record all WhatsApp sends + /messages page |
| #178 merged Apr 21 | fix: integration check false positive — Daycare Add-On Day bare-date titles |
| #167 merged Apr 5 | I-1: integration check smart-send — run 1 always sends; runs 2+3 silent on pass |
| #165 merged Apr 3 | F-1: Meta webhook + wamid storage + 32 new tests |
| #163 merged Apr 3 | M3-6: doc staleness CI check |
| #161 merged Apr 3 | fix: integration-check false positive for N/C titles |

### WhatsApp delivery status (all confirmed live)

| Job | Send function | Status |
|---|---|---|
| notify 4am/7am/830am | `sendRosterImage` | ✅ Confirmed on phone Apr 2 — 2 recipients as of Apr 5 |
| notify friday-pm | `sendRosterImage` | ✅ Confirmed on phone Apr 2 — 2 recipients as of Apr 5 |
| integration-check | `sendTextMessage` | ✅ Confirmed Mar 25 — smart-send live (#167): run 1 always, runs 2+3 on fail only |
| cron-health-check | `sendTextMessage` | ✅ Same code path as integration-check |
| gmail-monitor | `sendTextMessage` | ✅ Confirmed Mar 20 |

### Meta template status
`META_ROSTER_TEMPLATE=dog_boarding_roster_3` set in Vercel — Utility category, confirmed delivered April 2.

---

## Completed This Session (April 23, session 16)

### F-2 — Message log page ✅ DONE — v5.5.0 live

- Migration 025 applied, PR #182 merged, Vercel deploy confirmed
- Triggered notify run — 2 rows in `message_log`, PNG in `roster-images` Storage, `/messages` page renders with inline image
- Found and fixed: Storage RLS policy missing — `createSignedUrl` silently failed for authenticated users. Migration 026 adds the policy and is committed to main.
- GitHub release v5.5.0 cut

---

## Completed This Session (April 23, session 15)

### F-2 — Message log page ✅ BUILT (PR #182 open, pending merge + live verify)

**What was built:**
- Migration `025_add_message_log.sql` — `message_log` table with RLS, two indexes
- `recordMessageLog` export in `src/lib/messageDeliveryStatus.js` — non-fatal, records ALL sends (sent + failed); unlike `recordSentMessages` which only records successful sends
- `storeRosterImage` private helper in `api/notify.js` — fetches PNG post-send, uploads to `roster-images` Storage bucket; non-fatal (null imagePath on failure)
- 6 send sites wired: `api/notify.js` (3 — refresh alert, friday-pm, daytime), `cron-health-check.js`, `integration-check.js`, `gmail-monitor.js`
- `src/hooks/useMessageLog.js` — fetches last 5 days from `message_log`, generates signed URLs for image rows
- `src/pages/MessageLogPage.jsx` — table with Time/Job/Type/Recipient/Content/Status/WAMID columns; roster PNGs rendered inline
- `src/App.jsx` — `/messages` route added
- `src/components/Layout.jsx` — "Messages" nav item added
- 15 new tests: 6 `recordMessageLog` unit tests + 9 `MessageLogPage` smoke tests
- **999 tests, 57 files, 0 failures**

**Key implementation note:** `image_path` stored as `roster-images/{jobName}/{safeTimestamp}.png` (colons replaced with dashes). Page strips the `roster-images/` prefix before calling `createSignedUrl` on the bucket.

---

## Completed This Session (April 21, session 13)

### G-6 — Second number receiving ✅ RESOLVED
- Root cause: typo in `NOTIFY_RECIPIENTS` Vercel env var — `+14159394562` instead of `+14159395462` (digits transposed since April 5)
- Fix: corrected to `+18312477375,+14159395462` in Vercel
- DB verified: `***-***-5462` shows `sent` → `delivered` on test send; `***-***-7375` shows `sent` → `delivered` → `read`
- Nothing was wrong with Meta setup — pure typo

### K-7 — Re-scoped: dev mode is the correct long-term model ✅
- App uses Meta test phone number (+1 555 153 3723, Phone Number ID: 1073787652481572)
- Test number expires ~July 2, 2026 (90 days from ~April 3)
- Publishing app requires Business Verification which requires a registered business — Kate does not have one
- Dev mode supports up to 5 test recipients — correct model for this use case (2–5 known recipients)
- **No app publish needed.** K-7 closed as not applicable.
- **New deadline: replace test number before ~July 2.** Requires a phone number not currently on WhatsApp (Google Voice, VoIP, secondary SIM). Kate to arrange.
- Added `/privacy` (PR #180) and `/terms` (direct push) pages to app for Meta App Settings requirements

---

## Completed This Session (April 21, session 12)

### PR #178 — Fix integration check false positive: Daycare Add-On Day ✅
- Kate received alert: `⚠️ Integration check found issues (4/21) | Boarding: | • Missing from DB: Mabel — 4/21 (C63QggUE)`
- Pulled GH Actions logs for all 3 runs on 4/21 — identified run 24735940934 (17:09 UTC) as the source
- Log confirmed: `⏭️ SKIP C63QggUE — pricing: all day services (Daycare Add-On Day)` — sync was correct, integration check was the false positive
- Root cause: `DAYCARE_ONLY_PATTERNS` had no entry for bare-date titles like `"4/21"`. Real boardings always show ranges like `"4/21-25"`.
- Fix: added `/^\d+\/\d+$/` to `DAYCARE_ONLY_PATTERNS` in `scripts/integration-check.js`
- 6 new tests in `integrationCheckFilter.test.js` (3 false-positives + 3 real-boarding guards)
- PR #178 merged, 984 tests passing

---

## Completed This Session (April 8, session 11)

### G-6 — Second number investigation + partial fix ✅
- Queried `message_delivery_status` — confirmed zero rows for second number; only `***-***-7375` receiving
- Root cause: Meta app is in dev mode (K-7 unpublished) — dev-mode requires each recipient to manually opt in as a test recipient
- Kate added second number to Meta API Setup → "To" → Add phone number on April 8
- Second number should receive opt-in confirmation from Meta; next notify run (~4am Apr 9) will confirm delivery
- Permanent fix is K-7 (app publish removes test-recipient restriction entirely)

### K-7 — Meta publish path clarified ✅
- Dashboard screenshot reviewed: app is Unpublished
- Correct path: Dashboard → "Test use cases" → "Check that all requirements are met, then publish your app"
- **Do NOT click "Become a Tech Provider"** — that is for ISVs/agencies building for other businesses, not needed here
- Also click "Required actions" in left sidebar to surface any hidden blockers
- Token expiry risk: Kate should check current token expiry at developers.facebook.com → Tools → Access Token Debugger. If < 2 weeks remaining, it is a fire drill.
- Once published: generate System User access token (permanent, never expires) → replace `META_WHATSAPP_TOKEN` in Vercel

---

## Completed This Session (April 5, session 9)

### docs/STATUS_REPORT.md — Project status report ✅
- Comprehensive report written for boss/client audience
- Covers: what's been built (v5 forward), what's in progress, what's left, risks, and 5 gaps not previously in the plan
- No code changes — docs only, push direct to main

### G-1 through G-5 — Gap tickets added to SPRINT_PLAN.md ✅
- New "Gap Investigation — Needs Decision Before Ticketing" section added
- G-1: Alert on failed wamid (follow-on to F-1, no alerting layer exists)
- G-2: Integration check Step 3 silent skip (no warning when Anthropic credits = 0)
- G-3: Client-facing status page (UAT gate 4 — operator self-serve health check)
- G-4: UAT gate 4 decision — does G-3 close it or does runbook suffice?
- G-5: No defined client acceptance criteria (process item, not a code ticket)

---

## Completed This Session (April 5, session 8)

### I-1 — Integration check smart-send (PR #167) ✅
- Run 1 (1am PDT, `0 8 * * *`): always sends (daily baseline)
- Runs 2+3 (9am, 5pm PDT): silent when passed; sends immediately on any failure
- Manual `workflow_dispatch`: always sends
- Mechanism: `INTEGRATION_CHECK_SCHEDULE: ${{ github.event.schedule }}` passed as env var; script checks against first-run cron string
- **No change to failure behavior** — failures always alert regardless of run number

### K-4 — Second notify recipient ✅
- Kate added second E.164 number to `NOTIFY_RECIPIENTS` Vercel env var (comma-separated)
- Takes effect on next notify run — both numbers receive roster images from 4am Apr 6 onward

---

## Completed This Session (April 3, sessions 3–7)

### F-1 — WhatsApp delivery observability (PR #165) ✅
- `message_delivery_status` table live (migration 024)
- `POST /api/webhooks/meta` deployed, HMAC-SHA256 verified, `messages` field subscribed
- End-to-end verified: real wamid row (status='sent') from friday-pm notify + delivered row from Meta test webhook
- **Note:** App uses Meta test phone number in dev mode. Real `delivered`/`read` events flow correctly — confirmed April 21.

### M3-7 — Screen recording (PARKED)
- Recording file: `/Users/kcoffie/Downloads/ScreenRecording_04-03-2026 11-10-42_1.MP4` — 22 MB MP4
- Kate editing the file herself. Parked until she drops the trimmed file.

### Other Apr 3 completions
- M3-6: doc staleness CI check (PR #163)
- M3-8: screenshots in README (pushed direct to main)
- K-6: admin bypass on ruleset — docs push direct to main, no PR needed
- gmail-monitor: end-to-end confirmed on Kate's phone

---

## IMMEDIATE NEXT (next session)

### Step 0 — K-8: Replace test phone number (deadline ~July 2, 2026)

---

### Step 0 (archived) — F-2: Message log page — FULLY ARCHITECTED, READY TO BUILD

All design decisions are made. Do not re-architect. Read this section completely before writing a single line of code, then execute.

---

#### What F-2 does

Every outbound WhatsApp message (text or image) gets written to a new `message_log` table at send time. A new protected app page at `/messages` shows the last 5 days of sends, with the actual roster PNG rendered inline for image messages.

**Why this matters:** Decouples "did the job run?" from "did the message go out?" When delivery is in question you can open the log page and see exactly what was sent, to whom, and whether the image looked correct.

---

#### Infrastructure already done (session 14)

- **Supabase Storage bucket `roster-images` created** — private bucket, use signed URLs to serve images. Do not make it public.

---

#### Database — migration `025_add_message_log.sql`

```sql
CREATE TABLE message_log (
  id            bigserial    PRIMARY KEY,
  sent_at       timestamptz  NOT NULL DEFAULT now(),
  job_name      text         NOT NULL,   -- 'notify-4am', 'notify-friday-pm', 'cron-health-check', etc.
  message_type  text         NOT NULL,   -- 'image' | 'text'
  recipient     text         NOT NULL,   -- masked last 4 digits (***-***-7375)
  content       text,                   -- text body for 'text' type; null for 'image' type
  image_path    text,                   -- Supabase Storage path for 'image' type; null for 'text' type
  wamid         text,                   -- null if send failed (no wamid assigned by Meta)
  status        text         NOT NULL   -- 'sent' | 'failed'
);

CREATE INDEX message_log_sent_at_idx ON message_log (sent_at DESC);
CREATE INDEX message_log_job_name_idx ON message_log (job_name, sent_at DESC);

ALTER TABLE message_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role full access" ON message_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated read" ON message_log
  FOR SELECT TO authenticated USING (true);
```

**Key design decisions (do not revisit):**
- Separate from `message_delivery_status` — that table tracks Meta webhook events (delivered/read/failed). This table tracks what WE sent. Different concerns.
- Records ALL sends including failed ones — unlike `recordSentMessages` which skips failures, `recordMessageLog` records every attempt (status='sent' or 'failed'). The whole point is a complete outbound audit trail.
- `content` is null for image sends — content is the roster image itself, stored in Supabase Storage at `image_path`.
- `wamid` is null for failed sends — Meta only assigns a wamid on success.

---

#### Library change — `src/lib/messageDeliveryStatus.js`

Add a new exported function `recordMessageLog`. Follow the exact same pattern as `recordSentMessages` (non-fatal, logs on error, returns void). Both functions can live in the same file.

```js
/**
 * Write one row per send result (both sent and failed) to message_log.
 * Non-fatal — DB error is logged and swallowed so caller's flow is never blocked.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient|null} supabase
 * @param {Array<{to: string, status: string, messageId?: string, error?: string}>} results
 * @param {string} jobName      - e.g. 'notify-4am', 'cron-health-check'
 * @param {'image'|'text'} messageType
 * @param {string|null} content       - text body for 'text'; null for 'image'
 * @param {string|null} imagePath     - Supabase Storage path for 'image'; null for 'text'
 * @returns {Promise<void>}
 */
export async function recordMessageLog(supabase, results, jobName, messageType, content, imagePath) { ... }
```

**Logging required inside `recordMessageLog`:**
```
[MessageLog] recordMessageLog("notify-4am", type=image, 2 results)
[MessageLog] Writing row — recipient: ***-***-7375, wamid: wamid.xxx, status: sent, image_path: roster-images/notify-4am/2026-04-22T11:00:00.000Z.png
[MessageLog] Writing row — recipient: ***-***-5462, wamid: wamid.yyy, status: sent, image_path: roster-images/notify-4am/2026-04-22T11:00:00.000Z.png
[MessageLog] Wrote 2 row(s) for job "notify-4am"

// Failure case:
[MessageLog] DB write failed for job "notify-4am" (type=image, 2 rows): <error.message>
```

---

#### Image storage — how to get and store the PNG

Image sends happen only in `api/notify.js`. After `sendRosterImage` completes successfully, fetch the image buffer from the same `imageUrl` used for the send, then upload to Supabase Storage.

```js
// After sendRosterImage — in api/notify.js
const imagePath = await storeRosterImage(supabase, imageUrl, jobName, jobRunAt);
// imagePath is e.g. 'roster-images/notify-4am/2026-04-22T11:00:00.000Z.png'
// or null if fetch/upload failed (non-fatal)
```

Create a private helper `storeRosterImage(supabase, imageUrl, jobName, jobRunAt)` in `api/notify.js`:

**Logging required inside `storeRosterImage`:**
```
[ImageStore] Fetching image for storage — host: qboarding.vercel.app, job: notify-4am
[ImageStore] Fetched 84320 bytes
[ImageStore] Uploading to Supabase Storage — path: roster-images/notify-4am/2026-04-22T11:00:00.000Z.png
[ImageStore] Upload complete — roster-images/notify-4am/2026-04-22T11:00:00.000Z.png

// Fetch failure:
[ImageStore] Image fetch failed (HTTP 500) — skipping storage, message_log row will have null image_path
// Upload failure:
[ImageStore] Storage upload failed: <error.message> — skipping storage, message_log row will have null image_path
```

The storage path format: `roster-images/{jobName}/{jobRunAt}.png` where `jobRunAt` is the ISO timestamp already captured at the top of each notify handler.

---

#### Send sites — all 6 locations that call recordMessageLog

The handoff previously said "7 write sites" — the correct count is **6**. Verified by grep.

| # | File | Line (approx) | Current call | Job label | Type | Content arg |
|---|------|---------------|--------------|-----------|------|-------------|
| 1 | `api/notify.js` | ~89 | `sendTextMessage` in `sendRefreshAlert` | `'notify-refresh-alert'` | `'text'` | `body` variable (the warning text) |
| 2 | `api/notify.js` | ~210 | `sendRosterImage` in friday-pm path | `'notify-friday-pm'` | `'image'` | `null` (content), `imagePath` from `storeRosterImage` |
| 3 | `api/notify.js` | ~337 | `sendRosterImage` in daytime path | `` `notify-${window}` `` | `'image'` | `null` (content), `imagePath` from `storeRosterImage` |
| 4 | `scripts/cron-health-check.js` | ~189 | `sendTextMessage` | `'cron-health-check'` | `'text'` | `message` variable |
| 5 | `scripts/integration-check.js` | ~514 | `sendTextMessage` | `'integration-check'` | `'text'` | `message` variable |
| 6 | `scripts/gmail-monitor.js` | ~353 | `sendTextMessage` | `'gmail-monitor'` | `'text'` | `message` variable |

All 3 scripts already have `getSupabase()` — no new supabase plumbing needed. Just import `recordMessageLog` and call it after the send, same pattern as `recordSentMessages`.

**Logging at each call site (before calling recordMessageLog):**
```
// notify.js image sites:
[Notify] Storing roster image and recording message_log — job: notify-4am, imagePath: roster-images/notify-4am/...

// script sites:
[CronHealthCheck] Recording message_log — job: cron-health-check, content length: 42 chars
```

---

#### App page

- **Route:** `/messages` (protected, inside Layout — sibling of `/sync-history`)
- **Page file:** `src/pages/MessageLogPage.jsx`
- **Hook:** `src/hooks/useMessageLog.js`
- **Nav label:** `"Messages"` — add to `navItems` in `src/components/Layout.jsx` (follow the "Sync" entry pattern)
- **Query:** `message_log` where `sent_at > now() - interval '5 days'`, order by `sent_at DESC`
- **Display:** Table with columns: Time, Job, Type, Recipient, Content/Image, Status, wamid (truncated)
- **Image rendering:** For rows where `image_path` is set, call `supabase.storage.from('roster-images').createSignedUrl(image_path, 3600)` and render an `<img>` tag. Signed URL expires in 1 hour — generate fresh on page load.
- **No pagination needed** — 5-day window at 2–6 recipients per job run ≈ 60–100 rows max

**Logging in `useMessageLog`:**
```
[MessageLog] Loading — cutoff: 2026-04-17T00:00:00.000Z
[MessageLog] Loaded 23 rows — generating signed URLs for 4 image rows
[MessageLog] Signed URL generated for roster-images/notify-4am/...
[MessageLog] Load failed: <error.message>   // surface to UI error state, never swallow
```

---

#### Full file touch list

| File | Change |
|------|--------|
| `supabase/migrations/025_add_message_log.sql` | New — schema above |
| `src/lib/messageDeliveryStatus.js` | Add `recordMessageLog` export |
| `api/notify.js` | Add `storeRosterImage` helper + 3 `recordMessageLog` calls |
| `scripts/cron-health-check.js` | Import `recordMessageLog` + 1 call |
| `scripts/integration-check.js` | Import `recordMessageLog` + 1 call |
| `scripts/gmail-monitor.js` | Import `recordMessageLog` + 1 call |
| `src/hooks/useMessageLog.js` | New hook |
| `src/pages/MessageLogPage.jsx` | New page |
| `src/App.jsx` | Add `/messages` route |
| `src/components/Layout.jsx` | Add "Messages" nav item |
| `src/__tests__/messageDeliveryStatus.test.js` | Tests for `recordMessageLog` |
| `src/__tests__/MessageLogPage.test.jsx` | Page smoke tests |

---

#### Definition of Done

- [ ] Migration 025 applied to Supabase (run in SQL editor)
- [ ] `recordMessageLog` unit tests pass — cover: success, DB failure (non-fatal), null supabase, failed send result recorded with status='failed'
- [ ] All 6 send sites write to `message_log` — verified by DB query after triggering a notify run
- [ ] Roster image stored in Supabase Storage bucket `roster-images` — verify file appears in dashboard after notify run
- [ ] `/messages` page renders in app — last 5 days of rows visible
- [ ] Image rows show the actual PNG inline (signed URL renders correctly)
- [ ] Text rows show content preview
- [ ] Failed sends appear with status='failed' and null wamid
- [ ] Storage upload failure is non-fatal — message is still recorded with null image_path
- [ ] All 984 existing tests still pass (0 regressions)
- [ ] PR opened, CI green, merged, Vercel deployment confirmed
- [ ] Trigger a real notify run after deploy — verify row appears in `/messages` page with image

---

### Step 1 — K-8: Replace test phone number (deadline ~July 2, 2026)

**Risk:** Meta test phone number (+1 555 153 3723) expires 90 days from ~April 3 = ~July 2. After that, all WhatsApp sends stop.

**What to do:** Get a phone number not currently on WhatsApp — easiest is Google Voice (voice.google.com, free). Then:
1. Meta API Setup → Step 5 "Add phone number" → enter the new number
2. Verify via SMS/call
3. Update `META_PHONE_NUMBER_ID` in Vercel to the new number's ID
4. Verify next notify run sends from the new number

**No registered business needed** — Meta only requires a verifiable phone number.

---

### Step 2 — M3-7: Screen recording (PARKED — Kate editing)

**Recording file:** `/Users/kcoffie/Downloads/ScreenRecording_04-03-2026 11-10-42_1.MP4` — 22 MB MP4.

**Once file is ready:**
1. Copy to `docs/screenshots/roster-delivery.mp4`
2. In README, after `![Roster image](docs/screenshots/roster-image.jpeg)`, before the `---` separator, add:
```html
<video src="docs/screenshots/roster-delivery.mp4" controls width="400"></video>
```
3. Caption: "End-to-end flow: notify job fires → WhatsApp message received → image opens with 'as of' timestamp"
4. Push direct to main (K-6 bypass — docs-only)

---

### Step 3 — F-2: Message log page detail

**What:** Store every outbound WhatsApp message (recipient, content, timestamp, type, wamid) to a `message_log` table at send time. New app page showing last 5 days of sends. Use this when delivery is in question — decouples "did the job run?" from "did the message go out?"

**Complexity:** High — table schema + 7 write sites in `notifyWhatsApp.js` + new app route + page UI. Plan carefully before building.

---

## Pending Kate Actions

| # | Action | Blocks | Priority |
|---|--------|--------|----------|
| ~~K-2~~ | ✅ Done April 3 | — | — |
| ~~K-3~~ | ✅ Done April 3 | — | — |
| ~~K-4~~ | ✅ Done April 5 — second number in `NOTIFY_RECIPIENTS` Vercel env var | — | — |
| K-5 | Add Anthropic API credits at console.anthropic.com | Integration check Step 3 vision name-check (currently silently skipped) | 🟢 Low |
| ~~K-7~~ | ~~Publish Meta app~~ — **CLOSED: not applicable.** App uses Meta test phone number. Publishing requires registered business (Kate doesn't have one). Dev mode (≤5 test recipients) is the correct long-term model. | — | — |
| ~~G-6~~ | ~~Second number not receiving~~ — **RESOLVED April 21.** Root cause was typo in `NOTIFY_RECIPIENTS` (`4562` vs `5462`). Fixed in Vercel. Both numbers confirmed in DB. | — | — |
| K-8 | **Replace test phone number before ~July 2, 2026.** Test number (+1 555 153 3723) expires 90 days from ~April 3. Need a real phone number not currently on WhatsApp — Google Voice (voice.google.com), VoIP, or secondary SIM. Once obtained: add via Meta API Setup → Step 5 "Add phone number" → verify via SMS/call → update `META_PHONE_NUMBER_ID` in Vercel. | WhatsApp continuity after July 2 | 🟡 Medium — ~10 weeks |

---

## Future Backlog (post-M3)

| # | Ticket | Complexity | Notes |
|---|--------|------------|-------|
| F-2 | **Message log page** — `message_log` table + 7 write sites + new app route + page UI | High | View sent messages via app; use when delivery is in question |
| #145 | **Tooling upgrade** — eslint 9→10 + @vitejs/plugin-react 5→6 | Low | Dev tooling only, no prod impact |

---

## Carry-Forward (low priority)

- `cron-schedule.js` ADD filter case-sensitive — `/\badd\b/` doesn't match uppercase `ADD`
- Claude credits for integration check Step 3 vision name-check — silently skipped until K-5 done
- Store datetimes in PST instead of UTC — tech debt, no user impact yet

---

## Architecture Reference

### Notify flow
```
GitHub Actions (4 workflows: M-F 4am/7am/8:30am + Fri 3pm PDT)
  → GET /api/notify?window=4am|7am|830am|friday-pm
  → refreshDaytimeSchedule (src/lib/notifyHelpers.js) → getPictureOfDay → computeWorkerDiff
  → /api/roster-image?date=YYYY-MM-DD&token=...&ts=<jobRunAt ISO>
  → PNG buffer → POST /v18.0/{PHONE_NUMBER_ID}/media → media_id
  → Meta Cloud API template send: { image: { id: media_id } } → NOTIFY_RECIPIENTS (2 numbers)
  → hash stored in cron_health (7am/8:30am skip if no change; friday-pm always sends)
```

### Sync pipeline
```
cron-auth.js (00:00 UTC)    → authenticate + store session in sync_settings
cron-schedule.js (00:05)    → runScheduleSync() → scan 3 pages, enqueue boarding candidates
cron-detail.js (00:10)      → runDetailSync() × 1 item → fetch detail, map + save to DB
cron-detail-2.js (00:15)    → re-exports cron-detail (second Vercel path = double throughput)
```

### Integration check smart-send (I-1, #167)
```
integration-check.yml passes: INTEGRATION_CHECK_SCHEDULE: ${{ github.event.schedule }}
scripts/integration-check.js:
  FIRST_RUN_SCHEDULE = '0 8 * * *'  (1am PDT)
  alwaysSend = !INTEGRATION_CHECK_SCHEDULE || INTEGRATION_CHECK_SCHEDULE === FIRST_RUN_SCHEDULE
  → if (alwaysSend || !passed): send WhatsApp
  → else: log suppression, skip send
```

### Template name config
```
notifyWhatsApp.js:28  ALERT_TEMPLATE  = process.env.META_ALERT_TEMPLATE  || 'dog_boarding_alert'
notifyWhatsApp.js:29  ROSTER_TEMPLATE = process.env.META_ROSTER_TEMPLATE || 'dog_boarding_roster'
```
`META_ROSTER_TEMPLATE=dog_boarding_roster_3` set in Vercel (Utility category, confirmed delivered April 2).

### Key files
| File | Purpose |
|---|---|
| `src/lib/notifyWhatsApp.js` | Meta Cloud API wrapper — `metaMediaUpload`, `sendRosterImage`, `sendTextMessage` |
| `src/lib/messageDeliveryStatus.js` | `recordSentMessages` — writes wamid + status to `message_delivery_status` |
| `api/webhooks/meta.js` | Incoming Meta webhook — HMAC-SHA256 verify, stores delivery events |
| `scripts/integration-check.js` | Integration check — Playwright + Claude vision + DB compare; smart-send logic |
| `src/lib/scraper/syncRunner.js` | `runScheduleSync`, `runDetailSync` — shared sync logic |
| `src/lib/pictureOfDay.js` | `getPictureOfDay`, `computeWorkerDiff`, `hashPicture` |
| `api/roster-image.js` | Token-gated PNG endpoint; `formatAsOf`; `timingSafeEqual` auth; weekend path |
| `api/notify.js` | Notify orchestrator (4am/7am/830am/friday-pm windows) |
| `src/lib/notifyHelpers.js` | `refreshDaytimeSchedule` (extracted for testability) |
| `scripts/cron-health-check.js` | Midnight cron health checker |
| `scripts/gmail-monitor.js` | Gmail infrastructure alert monitor (GH Actions hourly) |

### GitHub Actions repo secrets
| Secret | Status |
|---|---|
| `VITE_SUPABASE_URL` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `EXTERNAL_SITE_USERNAME` | ✅ Set |
| `EXTERNAL_SITE_PASSWORD` | ✅ Set |
| `ANTHROPIC_API_KEY` | ✅ Set (no credits — Step 3 silently skipped) |
| `INTEGRATION_CHECK_RECIPIENTS` | ✅ Set (Kate only) |
| `META_PHONE_NUMBER_ID` | ✅ Set |
| `META_WHATSAPP_TOKEN` | ✅ Set |
| `META_WEBHOOK_VERIFY_TOKEN` | ✅ Set |
| `GMAIL_CLIENT_ID` | ✅ Set |
| `GMAIL_CLIENT_SECRET` | ✅ Set |
| `GMAIL_REFRESH_TOKEN` | ✅ Set |

### Vercel env vars (production)
| Var | Value |
|---|---|
| `META_ROSTER_TEMPLATE` | `dog_boarding_roster_3` |
| `META_WHATSAPP_TOKEN` | ✅ Set |
| `META_PHONE_NUMBER_ID` | ✅ Set |
| `META_WEBHOOK_VERIFY_TOKEN` | ✅ Set |
| `NOTIFY_RECIPIENTS` | ✅ Set — **2 numbers** (updated April 5) |
| `VITE_SUPABASE_URL` | ✅ Set |
| `VITE_SUPABASE_ANON_KEY` | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Set |
| `EXTERNAL_SITE_USERNAME` | ✅ Set |
| `EXTERNAL_SITE_PASSWORD` | ✅ Set |
| `VITE_SYNC_PROXY_TOKEN` | ✅ Set |
| `APP_URL` | ✅ Set |

### Workers
| Name | External UID |
|---|---|
| Charlie | 61023 |
| Kathalyn Dominguez | 208669 |
| Kentaro Cavey | 141407 |
| Max Posse | 174385 |
| Sierra Tagle | 189436 |
| Stephen Muro | 164375 |

---

## Useful SQL

```sql
-- Cron health
SELECT cron_name, last_ran_at, status, result, error_msg FROM cron_health ORDER BY cron_name;

-- Queue status
SELECT status, type, COUNT(*) FROM sync_queue GROUP BY status, type ORDER BY type, status;

-- Recent boardings
SELECT b.external_id, d.name, b.billed_amount, b.night_rate, b.updated_at
FROM boardings b JOIN dogs d ON b.dog_id = d.id
ORDER BY b.updated_at DESC LIMIT 20;

-- Delivery status (F-1)
SELECT wamid, status, recipient_masked, job_name, created_at
FROM message_delivery_status ORDER BY created_at DESC LIMIT 20;
```

---

## GitHub Releases
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0, v5.4.0, **v5.5.0 (latest)**

## K-6 — Docs direct-push to main
Added admin role (RepositoryRole, actor_id=5) as bypass actor on the `protection` ruleset (id 13512551) with `bypass_mode: always`. Docs-only pushes go direct to main without a PR. CI requirements still apply to all PRs.

## Archive
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
