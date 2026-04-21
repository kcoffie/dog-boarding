# Dog Boarding App — Session Handoff (v5.4.0 LIVE)
**Last updated:** April 8, 2026 (session 11) — No code changes. Investigation + planning session. (1) G-6 added: second number not receiving — DB confirmed zero wamid rows for second number, only 7375. Root cause: Meta dev-mode requires test recipient opt-in. Kate added second number to Meta API Setup test recipients April 8 — verify on next notify run (~4am Apr 9). (2) Deep dive on K-7 (Meta app publish): confirmed app is Unpublished, path is Dashboard → Test use cases → Check requirements → Publish (do NOT click "Become a Tech Provider"). Token expiry risk discussed — Kate should check token expiry in Access Token Debugger. (3) SPRINT_PLAN G-6 ticket added and updated to reflect partial fix.

---

## Current State

- **v5.4.0 LIVE** at [qboarding.vercel.app](https://qboarding.vercel.app)
- **978 tests, 56 files, 0 failures**
- **main clean at `70b9132`**

### Recent merges (newest first)
| PR | What |
|---|---|
| #167 merged Apr 5 | I-1: integration check smart-send — run 1 always sends; runs 2+3 silent on pass |
| #165 merged Apr 3 | F-1: Meta webhook + wamid storage + 32 new tests |
| #163 merged Apr 3 | M3-6: doc staleness CI check |
| #161 merged Apr 3 | fix: integration-check false positive for N/C titles |
| #159 merged Apr 3 | fix: integration-check false positive for "Weekend Daycare" |

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
- **Remaining gap:** Meta app is unpublished — real delivery events blocked until K-7 (Kate action)

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

### Step 0 — Verify G-6: second number receiving (check after 4am Apr 9 notify run)

Run: `SELECT wamid, recipient_masked, status, created_at FROM message_delivery_status ORDER BY created_at DESC LIMIT 20;`

Look for a second masked number appearing alongside `***-***-7375`. If it's there with `status='sent'` or `status='delivered'` — G-6 is resolved. If still only one number, escalate: check GH Actions notify logs for an error on the second send.

---

### Step 1 — K-7: Publish Meta app (🔴 HIGH — KATE ACTION — IN PROGRESS)

**Risk:** Current `META_WHATSAPP_TOKEN` is almost certainly a 60-day expiring token. Expiry = complete WhatsApp outage, silent.

**Immediate:** Check token expiry → developers.facebook.com → Tools → Access Token Debugger → paste `META_WHATSAPP_TOKEN`. If < 2 weeks, this is a fire drill.

**Publish path (from Dashboard):**
1. Click "Test use cases" → confirm/complete
2. Click "Check that all requirements are met, then publish your app"
3. Click "Required actions" in left sidebar — address anything flagged there
4. **Do NOT click "Become a Tech Provider"** — not needed, adds unnecessary burden

**After publish:**
- Generate System User access token: Meta Business Settings → System Users → Generate Token → select `whatsapp_business_messaging` scope → token never expires
- Update `META_WHATSAPP_TOKEN` in Vercel with the new permanent token
- Verify next notify run delivers to both numbers
- Real `delivered`/`read`/`failed` webhook events will now flow to `message_delivery_status` (F-1 already wired)

**No code needed.** Webhook is already wired and verified.

---

### Step 1 — M3-7: Screen recording (PARKED — Kate editing)

**Recording file:** `/Users/kcoffie/Downloads/ScreenRecording_04-03-2026 11-10-42_1.MP4` — 22 MB MP4. Kate may supply a trimmed version instead.

**Decision gate (ask Kate at session start):**
- **Option A — Use as-is:** Copy to `docs/screenshots/roster-delivery.mp4`, embed with `<video>` tag
- **Option B — Trim via ffmpeg:** `brew install ffmpeg` first, Kate specifies start/end times, agent trims
- **Option C — Kate trimmed in QuickTime:** Drop trimmed file, agent embeds

**Once file is ready:**
1. Copy to `docs/screenshots/roster-delivery.mp4`
2. In README, after `![Roster image](docs/screenshots/roster-image.jpeg)`, before the `---` separator, add:
```html
<video src="docs/screenshots/roster-delivery.mp4" controls width="400"></video>
```
3. Caption: "End-to-end flow: notify job fires → WhatsApp message received → image opens with 'as of' timestamp"
4. Push direct to main (K-6 bypass — docs-only)
5. Update SESSION_HANDOFF.md and SPRINT_PLAN.md

---

### Step 2 — F-2: Message log page (next code ticket after M3-7)

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
| K-7 | **URGENT** Publish Meta app — App Review + Business Verification at developers.facebook.com. Takes 5–10+ business days. Start immediately — expiry = complete WhatsApp outage. | Service continuity + real delivery events in `message_delivery_status` | 🔴 **HIGH — start today** |
| G-6 | **Second number not receiving messages — partial fix applied April 8.** DB confirmed only 7375 received; zero rows for second number. Root cause: dev-mode app (K-7 unpublished) requires each recipient to opt in as test recipient. Kate added second number to Meta test recipients (API Setup → To → Add phone number) April 8. Second number should receive on next notify run. **Verify:** check `message_delivery_status` for second number's wamid after next notify run. Permanent fix: K-7 publish removes test-recipient restriction entirely. | Second number delivery | 🟡 Monitor — verify on next notify run |

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
- v1.0, v1.2.0, v2.0.0, v3.0.0, v3.1.0, v3.2.0, v4.0.0, v4.1.0, v4.1.1, v4.1.2, v4.2.0, v4.3.0, v4.4.0, v4.4.1, v4.4.2, v4.4.3, v5.0.0, v5.1.0, v5.2.0, v5.3.0, **v5.4.0 (latest)**

## K-6 — Docs direct-push to main
Added admin role (RepositoryRole, actor_id=5) as bypass actor on the `protection` ruleset (id 13512551) with `bypass_mode: always`. Docs-only pushes go direct to main without a PR. CI requirements still apply to all PRs.

## Archive
- v4.5 session: `docs/archive/SESSION_HANDOFF_v4.5_final.md`
- v4.3 session: `docs/archive/SESSION_HANDOFF_v4.3_final.md`
- v4.2 session: `docs/archive/SESSION_HANDOFF_v4.2_final.md`
