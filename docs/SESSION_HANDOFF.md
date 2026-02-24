# Dog Boarding App — Session Handoff (v2.2)
**Last updated:** February 24, 2026
**Status:** v2.2 complete — 620 tests (619 pass, 1 pre-existing date-flaky in DateNavigator)

---

## Current State

- **620 tests, 619 pass.** The 1 failure (`DateNavigator.test.jsx` expects diffDays=13, gets 12) is a pre-existing date-flaky test unrelated to pricing — was 619/619 on Feb 23. Not introduced by this session.
- Migrations 012 and 013 already applied in production Supabase.
- 3 crons live: cron-auth 0:00 UTC → cron-schedule 0:05 UTC → cron-detail 0:10 UTC
- Manual sync working end-to-end in production.
- Vercel env vars confirmed set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, VITE_EXTERNAL_SITE_USERNAME, VITE_EXTERNAL_SITE_PASSWORD

> **Check first thing each session:** Did overnight crons run?
> Vercel dashboard → Logs (left nav) → filter by `/api/cron-auth`, `/api/cron-schedule`, `/api/cron-detail`
> Hobby plan logs persist for ~1 hour — check within that window after midnight UTC.

---

## What's Pending

### Deploy + sync (REQUIRED to get night_rates populated)

This session's commit fixes the root cause of `night_rate = null` on all boardings. Changes need to be deployed, then a manual sync run.

1. **Deploy to Vercel** — no migrations needed
2. **Trigger a manual sync** (any date range with boardings) — this will populate `boardings.night_rate` and update `dogs.night_rate` correctly for the first time
3. **Verify with this query:**

```sql
SELECT b.billed_amount, b.night_rate, b.day_rate, d.name, d.night_rate as dog_night_rate,
       b.arrival_datetime, b.departure_datetime
FROM boardings b
JOIN dogs d ON b.dog_id = d.id
WHERE b.billed_amount IS NOT NULL
ORDER BY b.departure_datetime DESC;
```

Expected: `night_rate` and `day_rate` now non-null for boardings with 2+ service lines. Dog rates updated too.

4. **If dog rates are still 0** after the sync, run the recovery SQL (see Useful SQL section) — it reads rates from `sync_appointments.pricing_line_items` which is already populated.

---

## This Session (Feb 24, 2026) — Night Rate Extraction Bug

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

---

## Low-Priority Backlog

- REQ-107: Sync history UI + enable/disable toggle
- Fix status field extraction (always null — `.appt-change-status` needs textContent on `<a><i>`)
- Pre-detail-fetch date filter (~48s perf gain per sync)

---

## Useful SQL

```sql
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
