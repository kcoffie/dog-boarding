# Dog Boarding App — Session Handoff (v2.2)
**Last updated:** February 26, 2026 (session 4)
**Status:** 643 tests (642 pass, 1 pre-existing date-flaky in DateNavigator) — commit bf01842 deployed. SQL cleanup pending + re-sync needed.

---

## Current State

- **643 tests, 642 pass.** The 1 failure (`DateNavigator.test.jsx`) is the pre-existing DST-flaky test — unrelated.
- **Code deployed:** Commits `4061fa4`, `8598a59`, `713a722`, `bf01842` all live on Vercel.
- Migrations 012 and 013 already applied in production. No new migrations needed.
- 3 crons live: cron-auth 0:00 UTC → cron-schedule 0:05 UTC → cron-detail 0:10 UTC
- Vercel env vars confirmed set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, VITE_EXTERNAL_SITE_USERNAME, VITE_EXTERNAL_SITE_PASSWORD

> **Check first thing each session:** Did overnight crons run?
> Vercel dashboard → Logs (left nav) → filter by `/api/cron-auth`, `/api/cron-schedule`, `/api/cron-detail`
> Hobby plan logs persist for ~1 hour — check within that window after midnight UTC.

---

## What's Pending (do these in order)

### 1. Run data cleanup SQL (see "Useful SQL" below)

- **Oscar (C63QgU4P):** Delete boarding + archive sync_appointment (Daycare Add-On Day, not a boarding)
- **Staff Boarding (C63QgTXz, C63QgTXx):** Delete sync_appointments + any boardings (null pet_name, $0 staff bookings)
- **Unknown dog boardings:** Delete $0 artifacts from pre-fix era
- **Millie McSpadden + Mochi/Marlee Hill:** Delete all their boardings — let sync recreate clean

### 2. Run a full sync after cleanup

After cleanup SQL, run a manual sync. Verify in browser console:
- `[Sync] ⏭️ Skipping non-client appointment C63QgU4P (services: Daycare Add-On Day)` appears
- `[Sync] ⏭️ Skipping non-client appointment C63QgTXz/TXx (services: Staff Boarding (nights))` appears (if those appear on schedule)
- Millie + Mochi/Marlee Hill boardings recreated with correct rates
- No Unknown dog boardings recreated

---

## Session 4 (Feb 26, 2026) — Pricing Filter + Data Cleanup

### Completed
- ✅ All Issues 1, 2, 3 SQL from session 3 handoff run (Bronwyn archive, Gulliver delete, Millie date fix)
- ✅ Re-synced after cleanup
- ✅ Verified rates on all boardings with billed_amount (all correct)
- ✅ Marlee Hill secondaries (C63QfLnk_p1, C63QgCXd_p1) recreated by sync with correct rates
- ✅ Deployed commit bf01842: pricing-based filter to skip non-client appointments

### New issues found post-sync

**Oscar (C63QgU4P) — "Daycare Add-On Day" processed as boarding:**
- Title on schedule page is "2/27" — passes all title-based filters
- After detail fetch, pricing shows `serviceNames: ['Daycare Add-On Day']` (all day services)
- Boarding incorrectly created: `billed_amount=70, night_rate=null, day_rate=70`
- Fix: new pricing filter in sync.js (commit bf01842) — if all pricing line items are day services → skip
- SQL needed: delete the boarding + archive the sync_appointment

**Null pet_name sync_appointments (C63QgTXz, C63QgTXx) — Staff Boarding:**
- `serviceName: 'Staff Boarding (nights)'`, `rate=0`, `appointment_total=0`
- Fix: pricing filter catches "Staff Boarding" by service name → skip
- SQL needed: delete these sync_appointments + any associated boardings

**Unknown dog boardings — $0 artifacts:**
- Two `$0` boardings for dog named "Unknown" — pre-fix era artifacts
- SQL needed: delete them (will not be recreated — pet_name fallback fix already deployed)

**Millie McSpadden — duplicate boardings:**
- SQL run to restore C63QgNHs boarding arrival to March 3 resulted in two boardings with overlapping dates
- Decision: delete all Millie boardings + let sync recreate clean

### Code change: pricing-based filter (commit bf01842)

Added to sync.js immediately after the post-fetch title filter, before the date-overlap filter:
- **All day services** (e.g. "Daycare Add-On Day") → skip. Catches appointments whose schedule title looks like a date range but pricing reveals it's daycare.
- **Staff Boarding** → skip. Internal $0 bookings, not client boardings.
- Logging: skip logged to `syncLog` (visible in UI); pass logged to `console.log` (browser console only).
- Hash/save path: unaffected — filter runs before `mapAndSaveAppointment`, hash never involved for skipped appointments.

---

## Session 3 (Feb 26, 2026) — Deploy + Sync + Data Cleanup

### Completed
- ✅ SQL cleanup: deleted duplicate C63QgH5K boardings (Millie overlap-bug artifact)
- ✅ Deployed commit 713a722 (force fresh build — no cache)
- ✅ Manual sync run post-deploy
- ✅ Verification SQL run — results confirmed rates populating correctly

### Verification results (post-sync)
- Mochi Hill: `night_rate=55`, `day_rate=50` ✅
- Marlee Hill: `night_rate=45`, `day_rate=35` ✅
- Boardings with amounts that have rates: all correct
- Remaining null-rate boardings: deleted (see below)

### Additional data cleanup run this session
```sql
-- Deleted Marlee Hill secondary boardings (will be recreated by next sync)
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id IN (
  SELECT id FROM boardings WHERE external_id IN ('C63QfLnk_p1', 'C63QgCXd_p1')
);
DELETE FROM boardings WHERE external_id IN ('C63QfLnk_p1', 'C63QgCXd_p1');

-- Deleted all boardings with null night_rate where billed_amount is known
-- (covers 10 null-rate boardings with real amounts + old $0 daycare-era rows)
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id IN (
  SELECT id FROM boardings WHERE night_rate IS NULL AND billed_amount IS NOT NULL
);
DELETE FROM boardings WHERE night_rate IS NULL AND billed_amount IS NOT NULL;
```

---

## Feb 26, 2026 Session 2 — Two More Mapping Bugs Found

After deploying v2.2, sync still produced null rates. Identified two new bugs:

### Bug D: `upsertBoarding` — same external_id overlap falls through (commit 713a722)

**Root cause:** When `findBoardingByExternalId` returned 406 (because multiple boardings
share the same external_id, a side-effect of previous data issues), the overlap fallback
found a boarding with the same external_id. But neither overlap branch handled this case:
- `!overlap.external_id` → false (it has one)
- `overlap.external_id !== boardingData.external_id` → also false (they're equal)

Result: `existing` stayed null → a brand new duplicate boarding was created each sync,
with null rates if the classifyPricingItems fix wasn't in production.

**Fix:** Added a third case: `overlap.external_id === boardingData.external_id` →
set `existing = overlap` (reuse it) and log a warning. This prevents duplicate creation
and writes the correct rates to the existing boarding instead.

### Bug E: `upsertDog` — manual dog with existing external_id skips rate update (commit 713a722)

**Root cause:** When a dog has `source = 'manual'` AND `external_id` is already set,
`upsertDog` hit an early-return that skipped rate updates entirely. The Feb 26 Session 1
fix (Bug 2) only added rate propagation to the non-manual path.

**Fix:** In the already-linked manual-dog path, added rate update logic using the same
`updateRates && rate > 0` guard as all other paths.

### Diagnostic logging added (commit 713a722)

`classifyPricingItems`, `upsertDog`, and `upsertBoarding` now log at each decision point:
- `classifyPricingItems`: N items → night=$X (name), day=$Y (name) or none
- `upsertDog`: which path taken, what rates written or skipped and why
- `upsertBoarding`: update vs create, rates being written; ⚠️  warn on duplicate detection

---

## Feb 26, 2026 Session 1 — Null Rate Bug Fixes

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
- Oscar (C63QgU4P): boarding incorrectly created — **SQL cleanup pending** (session 4)
- Staff Boarding (C63QgTXz, C63QgTXx): null pet_name sync_appointments — **SQL cleanup pending** (session 4)
- Unknown dog boardings: $0 artifacts — **SQL cleanup pending** (session 4)
- Millie McSpadden + Mochi/Marlee Hill: boardings deleted pending re-sync — **SQL cleanup pending** (session 4)
- Bronwyn (C63QgPJz, C63QgTPD, C63QgTPE): ✅ archived (session 4)
- Gulliver (C63QgSiD): ✅ deleted (session 4)
- Millie March 3 date fix: ✅ run (session 4)

---

## Low-Priority Backlog

- REQ-107: Sync history UI + enable/disable toggle
- Fix status field extraction (always null — `.appt-change-status` needs textContent on `<a><i>`)
- Pre-detail-fetch date filter (~48s perf gain per sync)

---

## Useful SQL

```sql
-- ============================================================
-- SESSION 4 CLEANUP (pending — run before next sync)
-- ============================================================

-- Oscar (C63QgU4P): Daycare Add-On Day, not a boarding
UPDATE sync_appointments SET mapped_boarding_id = NULL WHERE external_id = 'C63QgU4P';
DELETE FROM boardings WHERE external_id = 'C63QgU4P';
UPDATE sync_appointments
SET sync_status = 'archived', last_change_type = 'archived', last_changed_at = NOW()
WHERE external_id = 'C63QgU4P';

-- Staff Boarding (C63QgTXz, C63QgTXx): null pet_name, $0, not client boardings
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id IN (
  SELECT id FROM boardings WHERE external_id IN ('C63QgTXz', 'C63QgTXx')
);
DELETE FROM boardings WHERE external_id IN ('C63QgTXz', 'C63QgTXx');
DELETE FROM sync_appointments WHERE external_id IN ('C63QgTXz', 'C63QgTXx');

-- Unknown dog boardings: $0 pre-fix artifacts
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id IN (
  SELECT b.id FROM boardings b JOIN dogs d ON b.dog_id = d.id WHERE d.name = 'Unknown'
);
DELETE FROM boardings
WHERE dog_id = (SELECT id FROM dogs WHERE name = 'Unknown' LIMIT 1);

-- Millie McSpadden + Mochi/Marlee Hill: delete all boardings, let sync recreate clean
UPDATE sync_appointments SET mapped_boarding_id = NULL
WHERE mapped_boarding_id IN (
  SELECT b.id FROM boardings b JOIN dogs d ON b.dog_id = d.id
  WHERE d.name ILIKE 'Millie%' OR d.name ILIKE '%Hill%'
);
DELETE FROM boardings
WHERE dog_id IN (
  SELECT id FROM dogs WHERE name ILIKE 'Millie%' OR name ILIKE '%Hill%'
);

-- Verify: should return 0 rows
SELECT d.name, b.external_id, b.arrival_datetime
FROM boardings b JOIN dogs d ON b.dog_id = d.id
WHERE d.name ILIKE 'Millie%' OR d.name ILIKE '%Hill%';

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
