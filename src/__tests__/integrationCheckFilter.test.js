/**
 * Regression tests for the integration-check daycare-only false-positive filter.
 *
 * The `isDaycareOnlyTitle` function lives in scripts/integration-check.js and
 * cannot be imported (it's a standalone script). These tests mirror the exact
 * patterns and validate the 27 confirmed false positives (March 2026) plus a
 * set of real boardings that must NOT be filtered.
 *
 * If you change DAYCARE_ONLY_PATTERNS in integration-check.js, update here too.
 */

import { describe, it, expect } from 'vitest';

// Mirror of DAYCARE_ONLY_PATTERNS in scripts/integration-check.js
const DAYCARE_ONLY_PATTERNS = [
  /\bP\/?G\b.*\b(M|T|W|Th|F|FT|OFF)\b/i,
  /\bP\/?G[: .]?\s*(?:TH|[MTWF])+\b/i,
  /make.?up days/i,
  /no charge/i,
];

function isDaycareOnlyTitle(title) {
  return DAYCARE_ONLY_PATTERNS.some(re => re.test(title));
}

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
  // Make-up days
  'Moonbeam — Make up days T.F',
  'Maple — make up days',
  // No charge
  'Peanut — No charge',
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
