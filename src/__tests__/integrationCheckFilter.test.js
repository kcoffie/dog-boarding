/**
 * Regression tests for the integration-check daycare-only false-positive filter (REQ-620).
 * @requirements REQ-620
 *
 * Tests the real `isDaycareOnlyTitle` exported from scripts/integration-check.js
 * (main() only runs when the script is executed directly). Covers the confirmed
 * false positives (31 March 2026; +2 April 2026; +1 April 2026 Daycare Add-On Day;
 * +1 October 2026 weekend daycare) plus real boardings that must NOT be filtered.
 */

import { describe, it, expect } from 'vitest';
import { isDaycareOnlyTitle } from '../../scripts/integration-check.js';

// ─── Known false positives (must be filtered) ─────────────────────────────────

const FALSE_POSITIVES = [
  // PG daycare schedule variants
  'P/G M/T/W/Th',
  'P/G M/T/W/Th F',
  'P/G M T W Th F',
  'PG:FT',
  'PG: MWTH OFF OFF',
  'PG M/W/F',
  'PG T/Th',
  'PG M/T/W/Th/F',
  'PG M/W',
  'PG T/Th/F',
  'PG: M/T/W/Th/F',
  'PG:M/T/W/Th/F',
  'P/G: M/T/W/Th/F',
  'PG M T W Th',
  'PG M/T',
  'PG: M/T',
  'PG T/W/Th',
  'PG M/T/W',
  'PG: M/T/W',
  'PG M/W/Th',
  'PG: FT',
  'PG F',
  'PG OFF OFF M/T/W',
  'PG Th/F',
  // PG daycare with concatenated day codes (no delimiters — new March 2026)
  'Millie McSpadden — P/G MTWTH',
  'Fergus Stevens — P/G TWTH',
  'Hank Yip — PG:WTH',
  'PG: TWTH',            // separator, then a space, then run-together days
  // Make-up days
  'Moonbeam — Make up days T.F',
  'Maple — make up days',
  'Makeup days',
  // No charge
  'Peanut — No charge',
  // Standalone daycare (added April 2026 — PR #159)
  'Weekend Daycare',
  // New client initial evaluation (added April 2026 — #160)
  // N/C = new client; always an Initial Evaluation daytime visit, never overnight boarding.
  // Sync filters this via detail-page service_type; integration check only sees schedule title.
  'N/C Tula 3/23-26',
  'N/C Buddy 4/1',
  // Daycare Add-On Day (added April 2026 — #177)
  // Appears as /schedule/a/ boarding link but pricing says "all day services (Daycare Add-On Day)".
  // Title is a bare date with no range — overnight boardings always show a range like "4/21-25".
  '4/21',
  '3/5',
  '12/31',
  // Weekend daycare (added October 2026 — #272)
  // Detail page is category DC, so the sync skips it; the title doesn't start with DC.
  'Wknd DC 10/24',
  'Dog A — Wknd DC 10/24',
  'Weekend DC 11/1',
  'wknd d/c 10/31',
  'Weekend  DC 11/7',     // titles are typed by hand: any run of spaces
];

// ─── Real boardings (must NOT be filtered) ────────────────────────────────────

const REAL_BOARDINGS = [
  'PG 3/23-30',          // date-range style — real boarding
  'PG 4/1-7',
  'Kailin 3/21-28 PG',   // name-first style — real boarding
  'Boarding - overnight',
  'Max 3/15-20',
  'Daisy 4/5-10 PG',
  'Staff Boarding (nights)',
  'Charlie 3/28-31',
  '4/21-25',             // bare date WITH range — real boarding (new; guards against over-filtering)
  '4/21-21',             // same-day range format
  '3/5-8',
  '4/21-4/25',           // range with a month on both ends: ends in d/d but isn't a bare date
  // A boarding can name the DC full-time tier (#198); only "Wknd/Weekend DC" is daycare
  'Boarding discounted nights for DC full-time',
  'Dog B 10/24-26 DC full-time',
  // A weekend-DC title with a date range might be an overnight stay: keep it a candidate (#272)
  'Wknd DC 10/24-26',
  'Dog C — Weekend DC 10/24 - 10/26',
  '10/24-26 Wknd DC',
  'Wknd DC 10/24–26',      // en dash, as pasted from a phone
  'Wknd DC 10/24 to 10/26',
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('isDaycareOnlyTitle — false positive filter', () => {
  describe('known false positives are filtered', () => {
    FALSE_POSITIVES.forEach(title => {
      it(`filters: "${title}"`, () => {
        expect(isDaycareOnlyTitle(title)).toBe(true);
      });
    });
  });

  describe('real boardings pass through', () => {
    REAL_BOARDINGS.forEach(title => {
      it(`passes: "${title}"`, () => {
        expect(isDaycareOnlyTitle(title)).toBe(false);
      });
    });
  });
});
