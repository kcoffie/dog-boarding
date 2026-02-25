# Dog Boarding App — Session Handoff (v2.2)
**Last updated:** February 25, 2026 (v2 — multi-pet fix)
**Status:** v2.2 deployed — 641 tests (640 pass, 1 pre-existing date-flaky in DateNavigator)

---

## Current State

- **641 tests, 640 pass.** The 1 failure (`DateNavigator.test.jsx`) is the pre-existing DST-flaky test — unrelated.
- v2.2 deployed. Multi-pet fix committed locally — **NOT YET DEPLOYED** (deploy + SQL cleanup required).
- Migrations 012 and 013 already applied in production Supabase. No new migrations needed.
- 3 crons live: cron-auth 0:00 UTC → cron-schedule 0:05 UTC → cron-detail 0:10 UTC
- Manual sync working end-to-end in production.
- Vercel env vars confirmed set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, VITE_EXTERNAL_SITE_USERNAME, VITE_EXTERNAL_SITE_PASSWORD
- Issues 1 (Bronwyn), 3 (Millie) fixed via SQL this session. Issues 2 (Gulliver) and 4 (Mochi/Marlee) need next-session SQL + deploy.

> **Check first thing each session:** Did overnight crons run?
> Vercel dashboard → Logs (left nav) → filter by `/api/cron-auth`, `/api/cron-schedule`, `/api/cron-detail`
> Hobby plan logs persist for ~1 hour — check within that window after midnight UTC.

---

## What's Pending

### 1. Deploy this session's fixes (REQUIRED before next sync)

Code changes committed — deploy before running any more syncs:
1. **Deploy to Vercel** — no migrations needed
2. **Run SQL data cleanup** (see SQL section below) — fix Gulliver boarding delete
3. **Trigger a manual sync** to verify Mochi + Marlee both appear with correct rates

### 2. Post-deploy data quality issues found after v2.2 sync

#### Issue 1 — Bronwyn: "Initial Evaluation" showing as boarding (STALE DATA)
- External IDs: C63QgPJz, C63QgTPD, C63QgTPE
- Sync now correctly skips these (logs show `⏭️ Skipping non-boarding`), but old DB records remain
- **Fix: SQL cleanup** (see below) — no code change needed

#### Issue 2 — Gulliver (C63QgSiD): showing as boarding on 2/28 but not on external site (CANCELLED APPT)
- Reconciler logged: `valid appointment page but was NOT seen during sync — NOT archiving`
- Root cause: cancelled appointment's direct URL still returns a valid page with `data-start_scheduled`
- Reconciler correctly warned but conservatively did not archive
- **Fix: SQL cleanup** (see below) — no code change needed; reconciler limitation is acceptable behavior

#### Issue 3 — Millie McSpadden: app shows March 4–19, external site shows March 3–19 (CODE FIXED)
- Root cause: `upsertBoarding` overlap fallback was overwriting existing boarding with a different `external_id`
  - C63QgH5K (March 3–19) was in DB. C63QgNHs (March 4–19, amended) was processed.
  - Both have overlapping dates → overlap match found C63QgH5K → overwrote it with NHs data (March 4 date, NHs external_id)
- **Code fix:** `mapping.js:upsertBoarding` — overlap fallback now only uses the match when the found boarding has NO external_id (manual boarding waiting to be linked). If it already has a different external_id, creates a new boarding instead.
- **SQL data fix also needed** — restore Millie's boarding to March 3 before re-sync (see SQL below)

#### Issue 4 — Mochi + Marlee Hill (C63QfLnk): only Mochi was being processed (CODE FIXED Feb 25 v2)
- Root cause: pipeline assumed 1 appointment = 1 pet. Marlee was never created as a dog or boarding.
- Pricing extraction was already correct (rate=$55/$800 nights, $50/$85 days) — the rates just only applied to Mochi.
- **Code fix (Feb 25 v2):**
  - `extraction.js` — added `extractAllPetNames()`, `all_pet_names[]` field, `perPetRates[]` in extractPricing return (per-pet night/day rates: Mochi $55/$50, Marlee $45/$35)
  - `mapping.js` — secondary pet loop in `mapAndSaveAppointment`: each pet beyond the first gets their own dog (with their rate) and boarding (external_id suffixed `_p1`, `_p2`…)
  - Fixture bug fixed: Marlee's day rate was `data-rate="5000"` in test fixture but real HTML has `data-rate="3500"` ($35, not $50)
- Expected after deploy + sync: Mochi dog night_rate=$55, Marlee dog night_rate=$45; both have boardings 3/6-14

---

## Feb 25, 2026 Session — Post-Deploy Bug Fixes

### Code fix 1: Multi-pet pricing extraction (`extraction.js`)

**Root cause:** `extractPricing` paired `serviceNames[i]` with `priceTags[i]`. For a 2-pet, 2-service appointment (`pets-2 services-2`) there are 4 price divs, so index 1 was Marlee's night div instead of the Boarding Days service's div. Result: wrong rate ($45 instead of $50) and wrong amount on the day line item.

**Fix:** Extract `numPets` from `pets-N` wrapper class (default 1 when absent). Use `priceTags[i * numPets]` for rate and qty. Sum amounts across `priceTags[i * numPets + 0..numPets-1]` for the service total. Single-pet appointments unchanged (numPets=1 → same index math as before).

### Code fix 2: Amended appointment overwrite prevention (`mapping.js`)

**Root cause:** `upsertBoarding` date-overlap fallback set `existing` to whatever boarding overlapped by date — even if that boarding already had a different `external_id`. When C63QgNHs (March 4–19, amended) was synced, it matched C63QgH5K's boarding (March 3–19) by overlap and overwrote it, changing arrival to March 4 and replacing the external_id.

**Fix:** Overlap fallback now only claims the match when `!overlap.external_id` (manual boarding waiting to be linked). If the overlap has a different external_id, logs a message and falls through to create a new boarding.

**Tests added:** 7 new tests (5 multi-pet extraction, 2 mapping overlap behavior). Total: 627 (626 pass).

---

## Feb 24, 2026 Session — Night Rate Extraction Bug

### Root cause

`extractPricing` in `extraction.js` used this regex to find `.price` divs:
```js
/<div[^>]*class="price"[^>]*>/gi   // WRONG — exact class match only
```

Real production HTML has **multiple CSS classes** on price divs:
```html
<div class="price p-7 has-outstanding" id="price-0" data-rate="5500" data-qty="500" ...>
```

The regex matched bare `class="price"` in test fixtures but **never** matched production HTML. Result: `priceTags = []` → `lineItems = []` → `classifyPricingItems` bailed at `length < 2` → `night_rate = null` silently for every boarding. All tests passed because fixtures used the simplified (wrong) class format.

### Fix

`extraction.js:434` — changed to word-boundary match:
```js
/<div[^>]*class="[^"]*\bprice\b[^"]*"[^>]*>/gi   // matches "price" among multiple classes
```

### Additional changes

**`extraction.js` — `extractPricing` now has step-by-step logging:**
- Logs fieldset snippet, total parsed, service names found, each price tag matched, each line item
- If Vercel logs show `[extractPricing] priceTags found: 2` and line items → working correctly
- If logs show `[extractPricing] priceTags found: 0` → regex still not matching, investigate fieldset snippet

**`extraction.js` — throws instead of silent null on structural failure:**
- Previously: service names found + zero price divs → silently returned `{ total, lineItems: [] }` → null rates stored
- Now: throws `EXTRACTION FAILURE` error when service names > 0 but price divs = 0
- Caller (`mapAndSaveAppointment`) catches this, logs to `summary.errors`, skips upsert — no bad data written

**`fixtures.js` — all price divs updated to real HTML structure:**
- All 7 occurrences of bare `class="price"` → `class="price p-0 has-outstanding"` / `class="price p-1 has-outstanding"`
- Added `mockPricingNoPriceDivs`: valid service names but wrong div class — used to test the throw

**`extraction.test.js` — new test:**
- `'throws when service names exist but no .price divs match (extraction failure)'` — expects `toThrow(/EXTRACTION FAILURE/)`

---

## v2.2 REQ Status

| REQ     | Title                                       | Status   |
| ------- | ------------------------------------------- | -------- |
| REQ-200 | Extract pricing from appointment pages      | Complete |
| REQ-201 | Sync rates and billed amount to app records | Complete |
| REQ-202 | Revenue reporting view                      | Complete |
| REQ-203 | Payroll uses extracted rates                | Complete |

---

## Feb 23 Session — What Was Done

**REQ-203: Payroll rate fallback chain**
- `calculateGross` / `calculateBoardingGross` in `src/utils/calculations.js` now use `boarding.nightRate ?? dog.nightRate ?? 0`
- `PayrollPage.jsx:calculateDayNet` now calls shared `calculateGross` (no inline duplicate)
- `SummaryCards.jsx:periodRevenue` now calls `calculateGross`
- `src/hooks/useBoardings.js` maps `night_rate → nightRate`, `billed_amount → billedAmount`, `source → source`

**REQ-202: Revenue reporting view**
- `src/components/RevenueView.jsx` (NEW) — table of boardings whose check-in falls in the selected period
- Shows `billedAmount` exact, or `rate × nights` with "est." label when no billedAmount
- Period Total row at bottom; added to `MatrixPage.jsx` below Employee Totals

**Bug fix: upsertDog zero-overwrite**
- `upsertDog` was writing `night_rate: 0` when single-line pricing couldn't classify rates
- Fixed: only write `night_rate`/`day_rate` to DB when value > 0

**Bug fix: /DC /i false positive**
- "Boarding discounted nights for DC full-time" was classified as a day service
- Fixed: `/DC /i` → `/^DC/i` in `SCRAPER_CONFIG.dayServicePatterns`

---

## Rate Fallback Chain

```
Per-night revenue for a boarding =
  boarding.night_rate           ← from sync (preferred, set by REQ-201)
  ?? dog.night_rate             ← fallback for manual boardings or pre-v2.2 records
  ?? 0                          ← last resort (show in UI as "no rate set")
```

---

## Pricing HTML Structure (CORRECTED Feb 24)

Real HTML — price divs have multiple classes:

```html
<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $375 <i class="fa fa-fw"></i></a>
  <div class="toggle-field-content hidden">
    <div class="service-wrapper" data-service="22215-0">
      <span class="service-name">Boarding discounted nights for DC full-time</span>
      <div class="price p-7 has-outstanding" id="price-0"
        data-amount="275.00"
        data-rate="5500"       <!-- cents ÷ 100 = $55.00 -->
        data-qty="500">        <!-- qty × 100 ÷ 100 = 5 nights -->
      </div>
    </div>
    <div class="service-wrapper" data-service="11778-0">
      <span class="service-name"> Boarding (Days)</span>
      <div class="price p-3 has-outstanding" id="price-1"
        data-amount="100.00"
        data-rate="5000.00"
        data-qty="200.00">
      </div>
    </div>
  </div>
</fieldset>
```

Key: `class="price p-N has-outstanding"` — the `p-N` suffix increments per line item. The original `class="price"` regex never matched this.

---

## Decisions Locked In

- Single-line pricing → `appointment_total` only, `night_rate = null` (can't classify safely)
- Dog rate updates → only when pricing was extracted (`updateRates` option in `upsertDog`)
- Day service patterns in `SCRAPER_CONFIG.dayServicePatterns` (not inline in sync.js/cron)
- REQ-110 parse degradation does NOT include `appointment_total` (legitimately absent on some appts)
- No invoice generation (out of scope)

---

## Known Data Issues

- Null service_types in DB (self-correct on next sync): C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe
- Amended appts not yet archived: C63QgNGU→C63QfyoF (4/1-13), C63QgH5K→C63QgNHs (3/3-19)
- Bronwyn (Initial Evaluation): SQL cleanup needed — archive C63QgPJz, C63QgTPD, C63QgTPE
- Gulliver (C63QgSiD): SQL cleanup needed — archive cancelled appointment
- Millie (C63QgNHs): SQL data fix needed — restore March 3 before next sync
- Mochi (C63QfLnk): multi-pet pricing will be correct after deploy + re-sync

---

## Low-Priority Backlog

- REQ-107: Sync history UI + enable/disable toggle
- Fix status field extraction (always null — `.appt-change-status` needs textContent on `<a><i>`)
- Pre-detail-fetch date filter (~48s perf gain per sync)

---

## Useful SQL

```sql
-- ============================================================
-- POST-DEPLOY DATA CLEANUP (run before next manual sync)
-- ============================================================

-- Issue 1: Archive stale sync_appointments for Initial Evaluation appointments (Bronwyn)
-- NOTE: column is sync_status, NOT is_archived (is_archived does not exist)
UPDATE sync_appointments
SET sync_status = 'archived',
    last_change_type = 'archived',
    last_changed_at = NOW()
WHERE external_id IN ('C63QgPJz', 'C63QgTPD', 'C63QgTPE');

-- Issue 1: Check if any boardings were incorrectly created from these appts
SELECT b.id, b.external_id, d.name, b.arrival_datetime
FROM boardings b
JOIN dogs d ON d.id = b.dog_id
WHERE b.external_id IN ('C63QgPJz', 'C63QgTPD', 'C63QgTPE');
-- If rows returned, delete them:
-- DELETE FROM boardings WHERE external_id IN ('C63QgPJz', 'C63QgTPD', 'C63QgTPE');

-- Issue 2: Archive Gulliver's cancelled appointment (was not seen in sync, reconciler warned)
-- sync_appointment already archived via SQL in prior session.
-- The linked boarding must also be removed (FK prevents direct delete):
UPDATE sync_appointments SET mapped_boarding_id = NULL WHERE external_id = 'C63QgSiD';
DELETE FROM boardings WHERE external_id = 'C63QgSiD';

-- Issue 3: Restore Millie's boarding to March 3 (original C63QgH5K, before overlap overwrite)
-- Run BEFORE next sync (after sync the code fix handles it correctly going forward)
UPDATE boardings
SET arrival_datetime = '2026-03-03T00:00:00.000Z',
    external_id = 'C63QgH5K'
WHERE external_id = 'C63QgNHs'
  AND dog_id = (SELECT id FROM dogs WHERE name ILIKE 'Millie%' LIMIT 1);

-- ============================================================

-- If sync gets stuck
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';

-- Verify night_rate populated after sync
SELECT b.billed_amount, b.night_rate, b.day_rate, d.name, d.night_rate as dog_night_rate,
       b.arrival_datetime, b.departure_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.billed_amount IS NOT NULL
ORDER BY b.departure_datetime DESC;

-- Check pricing in sync_appointments
SELECT external_id, pet_name, appointment_total, pricing_line_items
FROM sync_appointments WHERE appointment_total IS NOT NULL
ORDER BY last_synced_at DESC LIMIT 10;

-- Recover dog night_rates if still 0 after sync.
-- Reads rates from sync_appointments.pricing_line_items.
-- Only updates dogs whose current night_rate is 0.
WITH latest_pricing AS (
  SELECT DISTINCT ON (mapped_dog_id)
    mapped_dog_id,
    pricing_line_items
  FROM sync_appointments
  WHERE pricing_line_items IS NOT NULL
    AND mapped_dog_id IS NOT NULL
  ORDER BY mapped_dog_id, last_synced_at DESC
)
UPDATE dogs d
SET night_rate = (
  SELECT (item->>'rate')::numeric
  FROM jsonb_array_elements(lp.pricing_line_items) AS item
  WHERE NOT (item->>'serviceName' ~* '^DC|day|daycare|pack')
  LIMIT 1
)
FROM latest_pricing lp
WHERE d.id = lp.mapped_dog_id
  AND d.night_rate = 0
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(lp.pricing_line_items) AS item
    WHERE NOT (item->>'serviceName' ~* '^DC|day|daycare|pack')
  );
```

---

## Archive

Full v2.1 session history: `docs/archive/SESSION_HANDOFF_v2.1_final.md`
Full v2.0 session history: `docs/archive/SESSION_HANDOFF_v2.0_final.md`
