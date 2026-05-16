# J-1 Build Plan — Intraday Change Notification
_Written: April 30, 2026. Execute this plan in a fresh context._

---

## What J-1 Is

A new hourly WhatsApp notification job (9am–8pm Mon–Fri) that sends a delta image when overnight boarding changes since 8:30am. Different image design from the morning roster — shows only what changed, not the full grid.

**Core behavior:**
- 8:30am notify run stores a snapshot of tonight's boarders
- Hourly job compares current boarders against that snapshot
- Sends only when delta changed since last hourly send (cumulative delta vs. 8:30am, but no re-send if nothing new since last hourly)
- Image shows "✅ Added" and "❌ Cancelled" sections with dog names + date ranges

---

## Confirmed Design Decisions (All Approved)

1. **Snapshot stored at 8:30am regardless of whether 8:30am sends** — stored before the skip decision
2. **Separate `cron_health` row** for snapshot: `cron_name = 'boarders-snapshot'`
3. **Delta gate: skip if delta hash matches last hourly send** (not just "skip if empty")
4. **Boarders included in `hashPicture`** — this fixes a silent gap where a new boarding added between 4:30am and 7:30am was invisible to morning jobs. Now the 7:30am job will catch it and send. J-1's baseline (8:30am snapshot) will already include it, so J-1 correctly skips.
5. **`queryBoarders` returns richer objects** `{ name, arrival_datetime, departure_datetime }[]` instead of `string[]`
6. **Dates shown in both images:**
   - Q Boarding box (roster image, narrow column): `Mochi Hill (4/29–5/2)` compact format
   - Intraday delta image (full width): `Mochi Hill (Apr 29 – May 2)` readable format
7. **Header clearly says "Q Boarding Changes"** — not just "Changes since 8:30am"
8. **`intraday-image.js` is self-contained** — reads snapshot + current boarders itself (same pattern as `roster-image.js`). Double-querying is intentional and matches existing system.
9. **Bundle all changes in one PR** — hash fix + J-1 together

---

## How the Full Day Works After J-1

| Time | Event | Behavior |
|---|---|---|
| 4:30am | 3 boarders, 20 daytime dogs | 4am job always sends — baseline hash includes boarders |
| 6:00am | New boarder added | — |
| 7:30am | 7am job checks hash | Hash differs (boarder now in hash) → sends updated roster image |
| 8:30am | 8:30am job checks hash | Hash unchanged since 7:30am → skips send |
| 8:30am | Snapshot stored | `boarders-snapshot` row written with current boarders (including new one) |
| 9:00am | First J-1 run | Compares current against 8:30am snapshot → delta empty → skips |
| 11:00am | Another boarder added after 8:30am | — |
| 11:00am | J-1 run | Delta non-empty → sends intraday image |
| 12:00pm | J-1 run | Delta hash unchanged since 11am send → skips |

---

## File Change List

### Modified files

**1. `src/lib/pictureOfDay.js`**

Two changes:

a) `queryBoarders` — return richer objects instead of `string[]`:
```js
// BEFORE: returns string[]
boarders.push(name);

// AFTER: returns { name, arrival_datetime, departure_datetime }[]
boarders.push({ name, arrival_datetime: row.arrival_datetime, departure_datetime: row.departure_datetime });
```
Also update the select to include `arrival_datetime, departure_datetime` from boardings table:
```js
.select('booking_status, arrival_datetime, departure_datetime, dogs(name)')
```

b) `hashPicture` — include boarders in hash (remove v4.1.1 exclusion):
```js
// BEFORE: boarders excluded with stale comment "not rendered"
// AFTER:
boarders: data.boarders.map(b => b.name).sort(),
```
Update the comment to say boarders ARE rendered (R-1) and ARE included in hash.

**Downstream effects of queryBoarders change** — every caller of `data.boarders` now gets objects instead of strings. Check and fix:
- `api/roster-image.js` → `qBoardingCard` iterates boarders as strings. Change to read `.name` and add date display.
- `api/roster-image.js` → `qBoardingCardHeight` uses `boarders.length` — no change needed.
- `api/roster-image.js` → `computeImageHeight` uses `data.boarders` — no change needed (just length).
- Tests for `qBoardingCard`, `computeImageHeight`, `hashPicture` — update fixtures to pass objects.

Export `queryBoarders` from `pictureOfDay.js` (add `export` keyword) — needed by `intraday-image.js`.

**2. `api/roster-image.js`**

Update `qBoardingCard` to:
- Accept `{ name, arrival_datetime, departure_datetime }[]` instead of `string[]`
- Display `Name (M/D–M/D)` compact format

New helper function (in this file, not exported):
```js
function formatCompactDateRange(arrivalIso, departureIso) {
  // "4/29–5/2" format in America/Los_Angeles
  // Use toLocaleDateString with month: 'numeric', day: 'numeric', timeZone: 'America/Los_Angeles'
  // Join with en dash –
}
```

Updated dog row in `qBoardingCard`:
```js
const label = `${decodeEntities(boarding.name)} (${formatCompactDateRange(boarding.arrival_datetime, boarding.departure_datetime)})`;
```

**3. `api/notify.js`**

Add `storeBoardersSnapshot` helper function:
```js
async function storeBoardersSnapshot(supabase, boarders, dateStr) {
  const snapshot = boarders.map(b => ({
    name: b.name,
    arrival_datetime: b.arrival_datetime,
    departure_datetime: b.departure_datetime,
  }));
  await writeCronHealth(supabase, 'boarders-snapshot', 'success', {
    snapshotDate: dateStr,
    boarders: snapshot,
    capturedAt: new Date().toISOString(),
  }, null).catch(err =>
    console.warn(`[Notify/Snapshot] Failed to store boarders snapshot: ${err.message}`)
  );
  console.log(`[Notify/Snapshot] Stored boarders snapshot for ${dateStr} — ${snapshot.length} boarders: [${snapshot.map(b => b.name).join(', ')}]`);
}
```

Call it in the `8:30am` window **after `getPictureOfDay` succeeds, before the `shouldSendNotification` call**:
```js
// In the main handler, after: const data = await getPictureOfDay(supabase, date);
if (window === '8:30am') {
  await storeBoardersSnapshot(supabase, data.boarders, dateStr);
}
```

### New files

**4. `api/notify-intraday.js`**

Hourly delta job handler. Structure mirrors `api/notify.js` but much simpler.

Full logic:
```
1. Validate token (same pattern as notify.js)
2. Compute todayStr in Pacific time (same pattern as notify.js)
3. Log entry: [NotifyIntraday] Entry — date: {dateStr}, run at: {jobRunAt}
4. getSupabase()
5. readBoardersSnapshot(supabase, todayStr)
   → reads cron_health where cron_name='boarders-snapshot'
   → returns null if not found OR snapshotDate !== todayStr
   → if null: log warning + return { ok: true, action: 'skipped', reason: 'no_snapshot' }
6. queryBoarders(supabase, todayStr)  [imported from pictureOfDay.js]
7. computeIntradayDelta(snapshot.boarders, currentBoarders)
   → added   = currentBoarders whose name not in snapshot names Set
   → cancelled = snapshot boarders whose name not in current names Set
   → returns { added: BoarderObj[], cancelled: BoarderObj[] }
8. hashDelta(added, cancelled)
   → djb2 over JSON.stringify({ added: added.map(b=>b.name).sort(), cancelled: cancelled.map(b=>b.name).sort() })
9. readLastIntradayState(supabase)
   → cron_health where cron_name='notify-intraday'
   → returns { lastDeltaHash, lastDate } or null
10. if lastState?.lastDate === todayStr && lastState.lastDeltaHash === deltaHash:
    → log: [NotifyIntraday] Delta unchanged since last send — skipping
    → return { ok: true, action: 'skipped', reason: 'delta_unchanged' }
11. if added.length === 0 && cancelled.length === 0:
    → log: [NotifyIntraday] Delta empty (no changes since 8:30am) — skipping
    → return { ok: true, action: 'skipped', reason: 'no_change_since_830am' }
12. Construct image URL: /api/intraday-image?date={dateStr}&token={token}&ts={jobRunAt}
13. getRecipients() — if empty, skip with reason 'no_recipients'
14. sendRosterImage(imageUrl, recipients)  [same function as notify.js]
15. recordSentMessages(supabase, sendResults, 'notify-intraday')
16. storeIntradayImage(supabase, imageUrl, 'notify-intraday', jobRunAt)  [same as storeRosterImage]
17. recordMessageLog(supabase, sendResults, 'notify-intraday', 'image', null, imagePath)
18. persistIntradayState(supabase, deltaHash, dateStr, added, cancelled, sendResults)
    → writeCronHealth(supabase, 'notify-intraday', 'success', {
        lastDeltaHash: deltaHash,
        lastDate: dateStr,
        sentAt: ...,
        addedCount: added.length,
        cancelledCount: cancelled.length,
        recipients: sendResults.map(r => r.to),
      }, null)
19. Return { ok: true, action: 'sent', addedCount, cancelledCount, sentCount, failedCount }
```

Error handling: top-level try/catch writes to `cron_health` under `'notify-intraday'` on failure, same pattern as `notify.js`.

**5. `api/intraday-image.js`**

Delta PNG generator. Self-contained — reads its own data.

```
GET /api/intraday-image?date=YYYY-MM-DD&token=SECRET&ts=ISO
```

Full logic:
```
1. Token auth (timingSafeEqual, same as roster-image.js)
2. Parse date param
3. getSupabase()
4. readBoardersSnapshot(supabase, dateStr)  [same helper — extract to shared location or duplicate]
5. queryBoarders(supabase, dateStr)
6. computeIntradayDelta(snapshot, current) → { added, cancelled }
7. formatAsOf(tsParam || null) for header
8. buildIntradayLayout({ date: dateStr, added, cancelled, asOfStr })
9. satori → resvg → PNG response
```

**Image layout** (export `buildIntradayLayout` and `computeIntradayImageHeight` for testing):

```
[Forest Green header bar, 800px wide, height 64]
  Left: "Q Boarding Changes · Wednesday, April 29"     Right: "since 8:30 AM (as of 2:00 PM)"

[Content area, padding 20]
  If added.length > 0:
    [Sage Green section header: "✅ Added (N dog/dogs)"]
    [Rows: "  Mochi Hill (Apr 29 – May 2)" per dog]

  If cancelled.length > 0:
    [Red section header: "❌ Cancelled (N dog/dogs)"]  — use COLORS.removed (#dc2626)
    [Rows: "  Tula (Apr 27 – May 1)" per dog]
```

New helper for readable date range:
```js
function formatReadableDateRange(arrivalIso, departureIso) {
  // "Apr 29 – May 2" in America/Los_Angeles
  // Use toLocaleDateString with month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles'
}
```

Image height: `HEADER_H + OUTER_PAD * 2 + section heights` where section height = `SECTION_HEADER_H + rows * DOG_ROW_H + gap`.

Reuse existing constants: `IMAGE_WIDTH=800`, `OUTER_PAD=20`, `HEADER_H=64`, `DOG_ROW_H=24`, `COLORS`, `FONTS` (same Inter fonts), `h()` builder.

**6. `.github/workflows/notify-intraday.yml`**

```yaml
# Hourly intraday boarding change check, 9am–8pm PDT Mon–Fri.
# DST: times are PDT (Mar–Nov). Revisit UTC offsets at each DST transition.
# Two cron expressions required because the 5pm–8pm PDT window spans UTC midnight.
name: Notify Intraday (9am–8pm hourly)

on:
  schedule:
    - cron: '0 16,17,18,19,20,21,22,23 * * 1-5'  # 9am–4pm PDT (UTC 16–23, Mon–Fri UTC)
    - cron: '0 0,1,2,3 * * 2-6'                    # 5pm–8pm PDT (UTC 0–3, Tue–Sat UTC = Mon–Fri PDT)
  workflow_dispatch:

jobs:
  notify-intraday:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Send intraday boarding change notification if delta changed
        run: |
          RESPONSE=$(curl -s -o /tmp/intraday_response.json -w "%{http_code}" \
            "${{ secrets.APP_URL }}/api/notify-intraday?token=${{ secrets.VITE_SYNC_PROXY_TOKEN }}")
          echo "HTTP status: $RESPONSE"
          cat /tmp/intraday_response.json
          if [ "$RESPONSE" != "200" ]; then
            echo "Notify-intraday endpoint returned non-200 status"
            exit 1
          fi
```

**7. `docs/job_docs/notify-jobs.md`**

Update to:
- Add `notify-intraday.yml` to the workflow table (runs hourly 9am–8pm PDT Mon–Fri)
- Add section explaining the intraday job, the snapshot design, and the delta gate
- Note that boarders are now included in `hashPicture` (change from v4.1.1 exclusion)

---

## Shared Helper: `readBoardersSnapshot`

Both `notify-intraday.js` and `intraday-image.js` need to read the snapshot. Two options:
- Duplicate the 10-line helper in each file (simple, no new shared module)
- Extract to `api/_intradayHelpers.js` (DRY, but adds a file)

**Recommendation: duplicate.** Both files are short reads, the helper is trivial, and this avoids a premature shared module. If a third consumer appears, extract then.

---

## Extract `computeIntradayDelta` for Testing

This pure function must be unit-testable. Define it in `api/notify-intraday.js` and export it:

```js
export function computeIntradayDelta(snapshotBoarders, currentBoarders) {
  const snapshotNames = new Set(snapshotBoarders.map(b => b.name));
  const currentNames = new Set(currentBoarders.map(b => b.name));
  const added = currentBoarders.filter(b => !snapshotNames.has(b.name));
  const cancelled = snapshotBoarders.filter(b => !currentNames.has(b.name));
  return { added, cancelled };
}
```

Similarly export `hashDelta` for testing.

---

## Definition of Done

- [ ] `queryBoarders` returns `{ name, arrival_datetime, departure_datetime }[]`
- [ ] `hashPicture` includes boarders (hash on `.name` sorted)
- [ ] Q Boarding box in roster image shows compact dates `Name (M/D–M/D)`
- [ ] 8:30am notify run stores `boarders-snapshot` in `cron_health`
- [ ] Hourly job: load snapshot → compare → compute delta → hash gate → send if new delta
- [ ] No send if delta empty
- [ ] No send if delta hash unchanged since last intraday send
- [ ] Graceful skip if no snapshot found for today
- [ ] WhatsApp sent for non-empty new delta with "Q Boarding Changes" image
- [ ] Intraday image shows readable dates `Name (Apr 29 – May 2)`
- [ ] New GH Actions workflow: hourly 9am–8pm Mon–Fri, `workflow_dispatch`
- [ ] `docs/job_docs/notify-jobs.md` updated
- [ ] Unit tests (see below)
- [ ] 999+ tests pass, 0 failures

---

## Unit Tests Required

**`src/lib/pictureOfDay.test.js` (existing file):**
- `hashPicture` now includes boarders — add test: same workers, different boarders → different hash
- `hashPicture` boarder order doesn't matter (sorted) — add test: boarders in different order → same hash
- Update existing `queryBoarders` fixtures to return objects (not strings)

**`api/roster-image.test.js` (existing file):**
- `qBoardingCard` with objects: renders `Name (M/D–M/D)` correctly
- `qBoardingCard` empty state: renders `(none tonight)` when boarders=[]
- Update existing fixtures to pass objects

**`api/notify-intraday.test.js` (new file — 5 tests):**
1. Empty delta (current === snapshot) → `action: 'skipped', reason: 'no_change_since_830am'`
2. Addition detected → `action: 'sent'`, `addedCount: 1`
3. Cancellation detected → `action: 'sent'`, `cancelledCount: 1`
4. Missing snapshot (snapshotDate mismatch) → `action: 'skipped', reason: 'no_snapshot'`
5. Delta unchanged since last send (same hash) → `action: 'skipped', reason: 'delta_unchanged'`

**`api/intraday-image.test.js` (new file — 3 tests):**
1. `buildIntradayLayout` renders added section with correct dog names + date ranges
2. `buildIntradayLayout` renders cancelled section correctly
3. `computeIntradayImageHeight` returns correct height for N added + M cancelled

**`computeIntradayDelta` unit tests (in notify-intraday.test.js):**
1. Dog in current but not snapshot → added
2. Dog in snapshot but not current → cancelled
3. Dog in both → neither added nor cancelled

---

## Key Gotchas

1. **`queryBoarders` is currently NOT exported.** Add `export` keyword before the function definition. It's needed by `intraday-image.js`.

2. **`hashPicture` comment is stale.** The v4.1.1 comment says "boarders not rendered — excluded." Boarders ARE rendered (R-1, PR #187). Update the comment when removing the exclusion.

3. **Snapshot stores objects, not names.** Delta comparison uses Set of names, but the objects (with dates) are stored so cancelled dogs can show their date ranges in the image. The snapshot `boarders` field is `{ name, arrival_datetime, departure_datetime }[]`.

4. **`data.boarders` type change ripples through tests.** Any test that passes `boarders: ['Mochi', 'Tula']` as strings will break. Search for all test fixtures and update to objects.

5. **`storeRosterImage` can be reused verbatim in `notify-intraday.js`** — it takes `(supabase, imageUrl, jobName, jobRunAt)`. Just call it with `'notify-intraday'` as the job name.

6. **`sendRosterImage` (in `notifyWhatsApp.js`) sends to Meta via template.** The intraday image uses the same `dog_boarding_roster_3` template (image type). No new Meta template needed.

7. **`cron_health` `boarders-snapshot` row is overwritten each 8:30am run.** Next day's 8:30am replaces it. The hourly job checks `snapshotDate === todayStr` to reject a stale row from a prior day.

8. **GH Actions two-cron expressions for midnight-spanning window.** The `2-6` (Tue–Sat UTC) captures Mon–Fri PDT evenings because PDT is UTC-7 and 5pm–8pm PDT = 0am–3am UTC the following calendar day.

---

## Repo Context

- Working directory: `/Users/kcoffie/projs/qap/dog-boarding`
- Run tests: `npm test`
- Key files already read: `api/notify.js`, `src/lib/pictureOfDay.js`, `api/roster-image.js`, `api/_cronHealth.js`, `.github/workflows/notify-830am.yml`
- Session handoff: `docs/SESSION_HANDOFF.md`
- Sprint plan: `docs/SPRINT_PLAN.md`
- All PRs require CI green; `gh pr create` always uses `--body-file`; commit messages reference issue number
- GH CLI: `/usr/local/bin/gh`
- No Co-Authored-By lines in commits
