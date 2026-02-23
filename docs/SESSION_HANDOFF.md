# Dog Boarding App — Session Handoff (v2.2)
**Last updated:** February 23, 2026
**Status:** v2.2 complete — all 4 REQs done + DC pattern fix, 619 tests pass

---

## Current State

- **619 tests pass.** Chunk A + Chunk B + DC pattern fix all on `main`, not yet deployed.
- Migrations 012 and 013 already applied in production Supabase.
- 3 crons live: cron-auth 0:00 UTC → cron-schedule 0:05 UTC → cron-detail 0:10 UTC
- Manual sync working end-to-end in production.
- Vercel env vars confirmed set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, VITE_EXTERNAL_SITE_USERNAME, VITE_EXTERNAL_SITE_PASSWORD

> **Check first thing each session:** Did overnight crons run?
> Vercel dashboard → Logs (left nav) → filter by `/api/cron-auth`, `/api/cron-schedule`, `/api/cron-detail`
> Hobby plan logs persist for ~1 hour — check within that window after midnight UTC.

---

## Pending Before Deploying

No migrations needed — 012 and 013 already applied. Just deploy.

**After deploying, do these in order:**

1. Run the dog rate recovery SQL (see Useful SQL below) to restore rates zeroed by the bug
2. Trigger a manual sync for any date range to re-populate `boardings.night_rate` with the DC fix
3. Verify rates populated:
```sql
SELECT b.billed_amount, b.night_rate, b.day_rate, d.name, d.night_rate as dog_night_rate
FROM boardings b
JOIN dogs d ON b.dog_id = d.id
WHERE b.source = 'external'
ORDER BY b.created_at DESC
LIMIT 20;
```

---

## v2.2 REQ Status

| REQ     | Title                                       | Status   |
| ------- | ------------------------------------------- | -------- |
| REQ-200 | Extract pricing from appointment pages      | Complete |
| REQ-201 | Sync rates and billed amount to app records | Complete |
| REQ-202 | Revenue reporting view                      | Complete |
| REQ-203 | Payroll uses extracted rates                | Complete |

---

## This Session (Feb 23, 2026)

**Co-Authored-By slug removed** from commit 31ae04f (previous session had added one — stripped via git filter-branch).

**REQ-203: Payroll rate fallback chain**
- `calculateGross` / `calculateBoardingGross` in `src/utils/calculations.js` now use `boarding.nightRate ?? dog.nightRate ?? 0`
- `PayrollPage.jsx:calculateDayNet` now calls shared `calculateGross` (no inline duplicate)
- `SummaryCards.jsx:periodRevenue` now calls `calculateGross`
- `src/hooks/useBoardings.js` maps `night_rate → nightRate`, `billed_amount → billedAmount`, `source → source`
- Tests: `src/__tests__/utils/calculations.test.js` — 10 new tests

**REQ-202: Revenue reporting view**
- `src/components/RevenueView.jsx` (NEW) — table of boardings whose check-in falls in the selected period
- Shows `billedAmount` exact, or `rate × nights` with "est." label when no billedAmount
- Period Total row at bottom; added to `MatrixPage.jsx` below Employee Totals
- Tests: `src/__tests__/pages/RevenueView.test.jsx` — 10 new tests

**Bug fix: upsertDog zero-overwrite**
- `upsertDog` was writing `night_rate: 0` to the dogs table when single-line pricing couldn't classify rates
- Fixed: only write `night_rate`/`day_rate` to DB when value > 0
- Regression test added to `mapping.test.js`
- **Action needed:** Run recovery SQL below to restore zeroed dog rates from existing sync data

**Bug fix: /DC /i false positive in dayServicePatterns**
- "Boarding discounted nights for DC full-time" (Captain Morgan) was being classified as a day service
- Fixed: `/DC /i` → `/^DC/i` in `SCRAPER_CONFIG.dayServicePatterns` — anchors to start of service name
- Next sync after deploy will correctly populate `night_rate: 55` for affected boardings
- Tests added to `mapping.test.js`

---

## Chunk A — What Was Done (previous session)

**New file:** `supabase/migrations/013_add_pricing_columns.sql`
- `boardings`: +`billed_amount`, `night_rate`, `day_rate` (all `NUMERIC(10,2)`, nullable)
- `sync_appointments`: +`appointment_total NUMERIC(10,2)`, `pricing_line_items JSONB`

**`src/lib/scraper/config.js`**
- Added `dayServicePatterns: [/day/i, /daycare/i, /^DC/i, /pack/i]` — originally `/DC /i`, anchored to `^` on Feb 23 to fix false positive
- Used to classify pricing line items as night vs day services

**`src/lib/scraper/extraction.js`**
- New exported `extractPricing(html)` — parses `#confirm-price` fieldset
- Returns `{ total, lineItems }` or `null` (null = no pricing section, not an error)
- `data-rate` / `data-qty` → `parseFloat(attr) / 100` (site stores cents / qty×100)
- `parseAppointmentPage()` now includes `pricing` field in its return object

**`src/lib/scraper/mapping.js`**
- New private `classifyPricingItems(pricing)` helper — identifies night/day line items
- `mapToDog()` — sets `night_rate`/`day_rate` from pricing when available (0 when absent)
- `mapToBoarding()` — populates `billed_amount`, `night_rate`, `day_rate`
- `mapToSyncAppointment()` — populates `appointment_total`, `pricing_line_items`
- `upsertDog()` — new `updateRates` option; only overwrites DB rates when pricing was extracted
- `upsertBoarding()` — pricing fields only written when present in boarding data
- `mapAndSaveAppointment()` — passes `updateRates: externalData.pricing != null`

**Tests added:**
- `src/__tests__/scraper/extraction.test.js` — 14 new `extractPricing` tests
- `src/__tests__/scraper/mapping.test.js` — 12 new REQ-201 pricing/mapping tests
- `src/__tests__/scraper/fixtures.js` — pricing HTML fixtures + mock external appointment objects

---

## Chunk B — COMPLETE

**REQ-203: Payroll Uses Extracted Rates**
- `calculateGross` and `calculateBoardingGross` now use `boarding.nightRate ?? dog.nightRate ?? 0`
- `PayrollPage.jsx:calculateDayNet` now calls `calculateGross` from utils (no inline duplicate)
- `SummaryCards.jsx:periodRevenue` now calls `calculateGross` (same fallback chain, REQ-202 card)
- `useBoardings.js` now maps `night_rate → nightRate`, `billed_amount → billedAmount`, `source → source`
- Tests: `src/__tests__/utils/calculations.test.js` — 10 new tests (7 calculateGross, 3 calculateBoardingGross)

**REQ-202: Revenue Reporting View**
- `src/components/RevenueView.jsx` (NEW) — table of boardings whose check-in falls in the selected period
- Shows `billedAmount` (exact, no label) or `rate × nights` with "est." label
- Period Total row at bottom
- Added to `MatrixPage.jsx` below Employee Totals
- Tests: `src/__tests__/pages/RevenueView.test.jsx` — 10 new tests

---

## Rate Fallback Chain (IMPLEMENTED)

```
Per-night revenue for a boarding =
  boarding.night_rate           ← from sync (preferred, set by Chunk A)
  ?? dog.night_rate             ← fallback for manual boardings or pre-v2.2 records
  ?? 0                          ← last resort (show in UI as "no rate set")
```

---

## Pricing HTML Structure (confirmed from C63QgKsK)

```html
<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $750 <i class="fa fa-fw"></i></a>
  <div class="toggle-field-content hidden">
    <div class="service-wrapper" data-service="22215-0">
      <span class="service-name">Boarding discounted nights for DC full-time</span>
      <div class="price"
        data-amount="550.00"
        data-rate="5500"       <!-- cents ÷ 100 = $55.00 -->
        data-qty="1000">       <!-- qty × 100 ÷ 100 = 10 nights -->
      </div>
    </div>
    <div class="service-wrapper" data-service="11778-0">
      <span class="service-name"> Boarding (Days)</span>
      <div class="price"
        data-amount="200.00"
        data-rate="5000.00"    <!-- decimal string ok -->
        data-qty="400.00">
      </div>
    </div>
  </div>
</fieldset>
```

**DC pattern fixed (Feb 23):** Changed `/DC /i` → `/^DC/i` in `SCRAPER_CONFIG.dayServicePatterns`.
"Boarding discounted nights for DC full-time" now correctly classifies as a night service
because "DC" does not appear at the start of the service name. Tests added for this case.

---

## Decisions Locked In

- Single-line pricing → `appointment_total` only, `night_rate = null` (can't classify safely)
- Dog rate updates → only when pricing was extracted (`updateRates` option in `upsertDog`)
- Day service patterns in `SCRAPER_CONFIG.dayServicePatterns` (not inline in sync.js/cron)
- REQ-110 parse degradation does NOT include `appointment_total` (legitimately absent on some appts)
- No invoice generation (out of scope)

---

## Known Data Issues (self-resolving on next sync)

- Null service_types: C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe
- Amended appts not yet archived: C63QgNGU→C63QfyoF (4/1-13), C63QgH5K→C63QgNHs (3/3-19)

---

## Useful SQL

```sql
-- If sync gets stuck
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';

-- Check rate extraction after Chunk A deploys
SELECT b.billed_amount, b.night_rate, b.day_rate, d.name, d.night_rate as dog_night_rate
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.source = 'external' ORDER BY b.created_at DESC LIMIT 20;

-- Check pricing in sync_appointments
SELECT external_id, pet_name, appointment_total, pricing_line_items
FROM sync_appointments WHERE appointment_total IS NOT NULL
ORDER BY last_synced_at DESC LIMIT 10;

-- Recover dog night_rates that were zeroed by the upsertDog bug.
-- Reads from the most recent sync_appointment that has pricing_line_items for each dog,
-- extracts the first non-day line item rate (the night rate).
-- Review before running — only updates dogs whose current night_rate is 0.
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
