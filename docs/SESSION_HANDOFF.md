# Dog Boarding App — Session Handoff (v2.2)
**Last updated:** February 26, 2026
**Status:** 643 tests (642 pass, 1 pre-existing date-flaky in DateNavigator) — NOT YET DEPLOYED

---

## Current State

- **643 tests, 642 pass.** The 1 failure (`DateNavigator.test.jsx`) is the pre-existing DST-flaky test — unrelated.
- Two sessions of commits are pending deploy: the Feb 25 v2 multi-pet fix + today's 3 null rate bug fixes.
- Migrations 012 and 013 already applied in production Supabase. No new migrations needed.
- 3 crons live: cron-auth 0:00 UTC → cron-schedule 0:05 UTC → cron-detail 0:10 UTC
- Manual sync working end-to-end in production.
- Vercel env vars confirmed set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, VITE_EXTERNAL_SITE_USERNAME, VITE_EXTERNAL_SITE_PASSWORD

> **Check first thing each session:** Did overnight crons run?
> Vercel dashboard → Logs (left nav) → filter by `/api/cron-auth`, `/api/cron-schedule`, `/api/cron-detail`
> Hobby plan logs persist for ~1 hour — check within that window after midnight UTC.

---

## What's Pending (do these in order)

### 1. Run SQL data cleanup (before deploy)

Run all SQL in the "Useful SQL → POST-DEPLOY DATA CLEANUP" section below.
Issues 1–3 are carry-overs from last session. Do them first so re-sync doesn't
re-create bad data.

### 2. Deploy to Vercel

All commits are on `main`. Push/deploy from Vercel dashboard — no migrations needed.

Commits since last deploy:
- `4061fa4` — feat: process all pets in multi-pet appointments with per-pet rates
- `8598a59` — fix: resolve null rates on boardings and sync_appointments after re-sync

### 3. Trigger a manual sync and verify

After deploy, run a full sync from the app. Verify:
- **C63QfLnk (Mochi + Marlee Hill):** `appointment_total: 885` now backfilled; both dogs appear with correct rates (Mochi $55, Marlee $45)
- **Single-line appointments (C63QgH5K, C63QgToR, etc.):** `night_rate` now populated (was null)
- **Mochi Hill dog record:** `night_rate: 55` (was 0 — name-match path didn't write rates before)
- Use the verification SQL below to confirm

---

## Feb 26, 2026 Session — Null Rate Bug Fixes

Three separate bugs caused boardings/dogs to show `null` or `0` rates despite
`extractPricing` working correctly in production. All fixed in `src/lib/scraper/mapping.js`,
commit `8598a59`.

### Bug 1: `sync_appointments.appointment_total` / `pricing_line_items` stayed null on re-sync

**Root cause:** `HASH_FIELDS` excludes pricing fields. For appointments that hadn't changed
their identity fields (dates, pet name, etc.), the sync_appointment was marked `unchanged`
and only `last_synced_at` was written — pricing fields were never updated.

**Fix:** The unchanged path now also writes `appointment_total` and `pricing_line_items`
when the incoming syncData has them:
```js
if (syncData.appointment_total != null)  unchangedPayload.appointment_total  = syncData.appointment_total;
if (syncData.pricing_line_items != null) unchangedPayload.pricing_line_items = syncData.pricing_line_items;
```

### Bug 2: `dogs.night_rate = 0` for dogs found by name (not external_id)

**Root cause:** `upsertDog` name-match path (used when `findDogByExternalId` returns null)
only updated `source` and `external_id` — never wrote rates, even when `updateRates: true`.

**Fix:** Rate propagation added to name-match update, same guard as the external_id path:
```js
if (updateRates && dogData.night_rate > 0) nameMatchUpdate.night_rate = dogData.night_rate;
if (updateRates && dogData.day_rate   > 0) nameMatchUpdate.day_rate   = dogData.day_rate;
```

### Bug 3: Single-service appointments got `night_rate: null`

**Root cause:** `classifyPricingItems` had guard `lineItems.length < 2 → return null`.
A single non-day service (e.g., "Boarding") is unambiguously a night service, but the
guard prevented classification.

**Fix:** Changed guard to `length === 0`. Single "Boarding" → `nightItem` found → `night_rate: 55`.
Single day service → `dayItem` found → `day_rate`.

**Behavior change:** Previously, single-line pricing returned `night_rate: null` for boardings
and `night_rate: 0` for dogs. Now it returns the extracted rate. The "Decisions Locked In"
section below is updated accordingly.

**Tests:** 5 tests changed (3 updated expectations, 2 new). Total: 641 → 643.

---

## Feb 25, 2026 (v2) Session — Multi-Pet Fix

### Issue 4 — Mochi + Marlee Hill (C63QfLnk): only Mochi was being processed

- `extraction.js`: added `extractAllPetNames()`, returns `all_pet_names[]` and `perPetRates[]`
- `mapping.js`: secondary pet loop in `mapAndSaveAppointment` — each pet gets their own dog + boarding
- Secondary boarding `external_id = {appt_external_id}_p{index}` (e.g., `C63QfLnk_p1`)
- Expected after deploy + sync: Mochi night_rate=$55, Marlee night_rate=$45; both have boardings 3/6-14

---

## Post-Deploy Data Quality Issues (carry-over)

### Issue 1 — Bronwyn: stale "Initial Evaluation" boardings in DB
- External IDs: C63QgPJz, C63QgTPD, C63QgTPE
- Sync now correctly skips these but old records remain → SQL cleanup

### Issue 2 — Gulliver (C63QgSiD): cancelled appointment showing as boarding
- Reconciler conservatively did not archive (cancelled URL still returns valid page)
- SQL cleanup needed

### Issue 3 — Millie McSpadden: boarding shows March 4–19, should be March 3–19
- Root cause (now fixed in code): overlap fallback overwrote C63QgH5K with C63QgNHs data
- SQL fix needed to restore March 3 date before re-sync

---

## Decisions Locked In

- **Single-line pricing:** `appointment_total` + classified `night_rate` (updated — was null before Feb 26)
- **Two-line pricing:** `night_rate` from non-day line, `day_rate` from day line
- Dog rate updates only when pricing was extracted AND rate > 0 (`updateRates` option)
- Day service patterns in `SCRAPER_CONFIG.dayServicePatterns` (not inline)
- REQ-110 parse degradation does NOT include `appointment_total` (legitimately absent on some appts)
- No invoice generation (out of scope)

---

## Known Data Issues

- Null service_types in DB (self-correct on next sync): C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe
- Amended appts not yet archived: C63QgNGU→C63QfyoF (4/1-13), C63QgH5K→C63QgNHs (3/3-19)
- Bronwyn (Initial Evaluation): SQL cleanup needed — archive C63QgPJz, C63QgTPD, C63QgTPE
- Gulliver (C63QgSiD): SQL cleanup needed — archive cancelled appointment + delete boarding
- Millie (C63QgNHs): SQL data fix needed — restore March 3 before next sync

---

## Low-Priority Backlog

- REQ-107: Sync history UI + enable/disable toggle
- Fix status field extraction (always null — `.appt-change-status` needs textContent on `<a><i>`)
- Pre-detail-fetch date filter (~48s perf gain per sync)

---

## Useful SQL

```sql
-- ============================================================
-- POST-DEPLOY DATA CLEANUP (run BEFORE deploy/sync)
-- ============================================================

-- Issue 1: Archive stale sync_appointments for Initial Evaluation (Bronwyn)
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

-- Issue 2: Remove Gulliver's cancelled boarding (FK must be nulled first)
UPDATE sync_appointments SET mapped_boarding_id = NULL WHERE external_id = 'C63QgSiD';
DELETE FROM boardings WHERE external_id = 'C63QgSiD';

-- Issue 3: Restore Millie's boarding to March 3 (run BEFORE next sync)
UPDATE boardings
SET arrival_datetime = '2026-03-03T00:00:00.000Z',
    external_id = 'C63QgH5K'
WHERE external_id = 'C63QgNHs'
  AND dog_id = (SELECT id FROM dogs WHERE name ILIKE 'Millie%' LIMIT 1);

-- ============================================================
-- VERIFICATION SQL (run after deploy + sync)
-- ============================================================

-- Check null rates on boardings with known amounts (should be much fewer after fix)
SELECT b.external_id, d.name, b.night_rate, b.billed_amount
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.night_rate IS NULL AND b.billed_amount > 0
ORDER BY b.created_at DESC LIMIT 10;

-- Check Mochi + Marlee specifically
SELECT d.name, d.night_rate, d.day_rate, b.external_id, b.night_rate as b_night_rate, b.billed_amount
FROM dogs d JOIN boardings b ON b.dog_id = d.id
WHERE d.name ILIKE '%Hill%'
ORDER BY d.name;

-- Check pricing in sync_appointments (should now be populated for C63QfLnk etc.)
SELECT external_id, pet_name, appointment_total, pricing_line_items
FROM sync_appointments WHERE appointment_total IS NOT NULL
ORDER BY last_synced_at DESC LIMIT 10;

-- Verify full rate picture
SELECT b.billed_amount, b.night_rate, b.day_rate, d.name, d.night_rate as dog_night_rate,
       b.arrival_datetime, b.departure_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE b.billed_amount IS NOT NULL
ORDER BY b.departure_datetime DESC;

-- ============================================================
-- UTILITY
-- ============================================================

-- If sync gets stuck
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';

-- Recover dog night_rates still 0 after sync (reads from pricing_line_items)
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

## Pricing HTML Structure Reference

Real HTML — price divs always have multiple classes:

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

Multi-pet: `<div class="pricing-appt-wrapper pets-2 services-2">` wraps all service-wrappers.
`numPets` is extracted from `pets-N` class; `priceTags[i * numPets]` = rate/qty for service i.

---

## Rate Fallback Chain

```
Per-night revenue for a boarding =
  boarding.night_rate           ← from sync (preferred, set by REQ-201)
  ?? dog.night_rate             ← fallback for manual boardings or pre-v2.2 records
  ?? 0                          ← last resort (show in UI as "no rate set")
```

---

## Archive

Full Feb 25 v2 session history: `docs/archive/SESSION_HANDOFF_v2.2_feb25.md` (if archived)
Full v2.1 session history: `docs/archive/SESSION_HANDOFF_v2.1_final.md`
Full v2.0 session history: `docs/archive/SESSION_HANDOFF_v2.0_final.md`
