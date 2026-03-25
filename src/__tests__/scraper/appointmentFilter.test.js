/**
 * appointmentFilter tests — applyDetailFilters
 *
 * Tests each filter gate independently, then validates real-world cases
 * (Kailin PG boarding passes; PG daycare in both forms is skipped).
 *
 * @requirements REQ-104
 */

import { describe, it, expect, vi } from 'vitest';
import { applyDetailFilters } from '../../lib/scraper/appointmentFilter.js';

vi.mock('../../lib/scraper/config.js', () => ({
  SCRAPER_CONFIG: {
    nonBoardingPatterns: [
      /(d\/c|\bdc\b)/i,
      /\badd\b/i,
      /switch\s+day/i,
      /back\s+to\s+\d+/i,
      /initial\s+eval/i,
      /^busy$/i,
    ],
    dayServicePatterns: [/day/i, /daycare/i, /^DC/i, /pack/i],
  },
}));

// ─── Fixture helpers ──────────────────────────────────────────────────────────

/** A valid multi-night boarding that passes all filters. */
function validBoarding(overrides = {}) {
  return {
    service_type: 'Boarding',
    booking_status: 'confirmed',
    pricing: {
      total: 570,
      lineItems: [{ serviceName: 'Boarding (Nights)', rate: 60, qty: 9.5 }],
    },
    check_in_datetime:  '2026-03-23T10:00:00Z',
    check_out_datetime: '2026-03-30T16:15:00Z', // ~174 hours
    ...overrides,
  };
}

/** Build ISO strings bracketing a specific duration in hours. */
function withDuration(hours) {
  const checkIn  = new Date('2026-03-24T10:00:00Z');
  const checkOut = new Date(checkIn.getTime() + hours * 3_600_000);
  return { check_in_datetime: checkIn.toISOString(), check_out_datetime: checkOut.toISOString() };
}

// ─── boardingOnly=false ────────────────────────────────────────────────────────

describe('boardingOnly=false', () => {
  it('bypasses every filter when boardingOnly is false', () => {
    const details = {
      service_type: 'DC:FT',
      booking_status: 'canceled',
      pricing: { total: 0, lineItems: [{ serviceName: 'Pack Group FT', rate: 0, qty: 1 }] },
      ...withDuration(1),
    };
    expect(applyDetailFilters(details, 'DC:FT', { boardingOnly: false }))
      .toEqual({ skip: false, reason: null });
  });
});

// ─── Filter 1: title / service_type ───────────────────────────────────────────

describe('title filter', () => {
  it('skips DC:FT by service_type', () => {
    const { skip, reason } = applyDetailFilters(
      validBoarding({ service_type: 'DC:FT' }), 'DC:FT',
    );
    expect(skip).toBe(true);
    expect(reason).toMatch(/title_pattern/);
  });

  it('skips D/C M/T/W/TH via scheduleTitle fallback when service_type is absent', () => {
    const { skip } = applyDetailFilters(
      validBoarding({ service_type: null }), 'D/C M/T/W/TH',
    );
    expect(skip).toBe(true);
  });

  it('skips "back to 4 days" schedule notes', () => {
    const { skip } = applyDetailFilters(validBoarding({ service_type: 'mav back to 4 days' }), null);
    expect(skip).toBe(true);
  });

  it('does NOT skip PG titles — PG is intentionally absent from nonBoardingPatterns', () => {
    const { skip } = applyDetailFilters(
      validBoarding({ service_type: 'PG 3/23-30' }), 'PG 3/23-30',
    );
    expect(skip).toBe(false);
  });
});

// ─── Filter 2: booking_status ─────────────────────────────────────────────────

describe('booking_status filter', () => {
  it('skips canceled booking requests', () => {
    const { skip, reason } = applyDetailFilters(
      validBoarding({ booking_status: 'canceled' }), null,
    );
    expect(skip).toBe(true);
    expect(reason).toMatch(/booking_status/);
  });

  it('passes confirmed bookings', () => {
    expect(applyDetailFilters(validBoarding({ booking_status: 'confirmed' }), null).skip).toBe(false);
  });

  it('passes when booking_status is absent', () => {
    expect(applyDetailFilters(validBoarding({ booking_status: null }), null).skip).toBe(false);
  });
});

// ─── Filter 3: pricing ────────────────────────────────────────────────────────

describe('pricing filter', () => {
  it('skips when all line items are pack/daycare services', () => {
    const { skip, reason } = applyDetailFilters(
      validBoarding({ pricing: { total: 0, lineItems: [{ serviceName: 'Pack Group FT' }] } }),
      null,
    );
    expect(skip).toBe(true);
    expect(reason).toMatch(/pricing/);
  });

  it('skips when all line items are daycare', () => {
    const details = validBoarding({
      pricing: { total: 35, lineItems: [{ serviceName: 'Daycare Add-On Day' }] },
    });
    expect(applyDetailFilters(details, null).skip).toBe(true);
  });

  it('passes when at least one line item is a night service', () => {
    expect(applyDetailFilters(validBoarding(), null).skip).toBe(false);
  });

  it('passes when lineItems is empty — uninvoiced future boarding', () => {
    const { skip } = applyDetailFilters(
      validBoarding({ pricing: { total: 0, lineItems: [] } }), null,
    );
    expect(skip).toBe(false);
  });

  it('passes when pricing is null', () => {
    expect(applyDetailFilters(validBoarding({ pricing: null }), null).skip).toBe(false);
  });
});

// ─── Filter 4: same-day duration ─────────────────────────────────────────────

describe('same-day duration filter', () => {
  it('skips a 1-hour appointment', () => {
    const { skip, reason } = applyDetailFilters(
      validBoarding({ ...withDuration(1), pricing: null }), null,
    );
    expect(skip).toBe(true);
    expect(reason).toMatch(/same_day/);
  });

  it('skips at 11.9 hours (just under the 12h threshold)', () => {
    expect(applyDetailFilters(validBoarding({ ...withDuration(11.9), pricing: null }), null).skip).toBe(true);
  });

  it('passes at exactly 12 hours', () => {
    expect(applyDetailFilters(validBoarding({ ...withDuration(12), pricing: null }), null).skip).toBe(false);
  });

  it('passes a multi-day boarding', () => {
    expect(applyDetailFilters(validBoarding(), null).skip).toBe(false);
  });

  it('passes when datetimes are absent — cannot determine duration, do not block', () => {
    const { skip } = applyDetailFilters(
      validBoarding({ check_in_datetime: null, check_out_datetime: null, pricing: null }), null,
    );
    expect(skip).toBe(false);
  });
});

// ─── Filter 5: date-overlap ───────────────────────────────────────────────────

describe('date-overlap filter', () => {
  const startDate = new Date('2026-03-20T00:00:00Z');
  const endDate   = new Date('2026-03-27T00:00:00Z');

  it('skips boardings entirely before the window', () => {
    const { skip, reason } = applyDetailFilters(
      validBoarding({ check_in_datetime: '2026-03-10T10:00:00Z', check_out_datetime: '2026-03-12T10:00:00Z' }),
      null,
      { startDate, endDate },
    );
    expect(skip).toBe(true);
    expect(reason).toMatch(/date_overlap/);
  });

  it('skips boardings entirely after the window', () => {
    const { skip } = applyDetailFilters(
      validBoarding({ check_in_datetime: '2026-03-28T10:00:00Z', check_out_datetime: '2026-04-04T10:00:00Z' }),
      null,
      { startDate, endDate },
    );
    expect(skip).toBe(true);
  });

  it('passes a boarding that overlaps the window', () => {
    expect(applyDetailFilters(validBoarding(), null, { startDate, endDate }).skip).toBe(false);
  });

  it('passes when no date range is provided (cron path)', () => {
    expect(applyDetailFilters(validBoarding(), null).skip).toBe(false);
  });
});

// ─── Real-world cases ─────────────────────────────────────────────────────────

describe('real-world cases', () => {
  it('Kailin "PG 3/23-30" boarding passes — PG title allowed, has night pricing', () => {
    const { skip } = applyDetailFilters(
      validBoarding({
        service_type: 'PG 3/23-30',
        pricing: { total: 570, lineItems: [{ serviceName: 'Boarding (Nights)', rate: 60, qty: 9.5 }] },
        check_in_datetime:  '2026-03-23T10:00:00Z',
        check_out_datetime: '2026-03-30T16:15:00Z',
      }),
      'PG 3/23-30',
    );
    expect(skip).toBe(false);
  });

  it('PG FT daycare (1-hour, no pricing) is skipped by same-day filter', () => {
    const { skip, reason } = applyDetailFilters(
      {
        service_type: 'PG FT',
        booking_status: 'confirmed',
        pricing: null,
        check_in_datetime:  '2026-03-24T10:00:00Z',
        check_out_datetime: '2026-03-24T11:00:00Z',
      },
      'PG FT',
    );
    expect(skip).toBe(true);
    expect(reason).toMatch(/same_day/);
  });

  it('PG FT daycare (multi-day span, pack pricing) is skipped by pricing filter', () => {
    const { skip, reason } = applyDetailFilters(
      {
        service_type: 'PG FT',
        booking_status: 'confirmed',
        pricing: { total: 45, lineItems: [{ serviceName: 'Pack Group Full Time', rate: 45, qty: 1 }] },
        check_in_datetime:  '2026-03-24T10:00:00Z',
        check_out_datetime: '2026-03-30T16:00:00Z',
      },
      'PG FT',
    );
    expect(skip).toBe(true);
    expect(reason).toMatch(/pricing/);
  });
});
