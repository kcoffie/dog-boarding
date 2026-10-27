/**
 * #353 PR 2: the night/day helpers and the upcoming-forms filter read booking times as
 * San Francisco clock times written as UTC (ADR-009): 10:00Z is 10:00am on its UTC date.
 * Expected values are worked out by hand; each test runs with the host in six zones.
 * @requirements REQ-065
 */
import { describe, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { calculateNights, isOvernight, isDayPresent } from '../utils/dateUtils';
import { isBoardingUpcoming, useBoardingForms } from '../hooks/useBoardingForms';
import { supabase } from '../lib/supabase';
import { eachZone, restoreHostZone } from './hostZones';

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn() } }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  restoreHostZone();
});

const atClock = (instant) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
};

// Drop-off 10:00am Thu 10-29, pick-up 4:15pm Mon 11-02: nights of 10-29, 10-30, 10-31 and 11-01
const STAY = { arrivalDateTime: '2026-10-29T10:00:00Z', departureDateTime: '2026-11-02T16:15:00Z' };

describe('REQ-065: nights and days fall on the site dates', () => {
  eachZone('Oct 29 10:00am → Nov 2 4:15pm is 4 nights', () => {
    expect(calculateNights(STAY.arrivalDateTime, STAY.departureDateTime)).toBe(4);
  });

  eachZone('a 4pm drop-off to a 9am pick-up four days later is 4 nights', () => {
    expect(calculateNights('2026-10-29T16:00:00Z', '2026-11-02T09:00:00Z')).toBe(4);
  });

  eachZone('the stay covers the nights of Oct 29 and Nov 1, not Oct 28 or Nov 2', () => {
    expect(isOvernight(STAY, '2026-10-28')).toBe(false);
    expect(isOvernight(STAY, '2026-10-29')).toBe(true);
    expect(isOvernight(STAY, '2026-11-01')).toBe(true);
    expect(isOvernight(STAY, '2026-11-02')).toBe(false);
  });

  eachZone('a 4pm drop-off is a day on its arrival day (before 5pm, Q1)', () => {
    expect(isDayPresent({ arrivalDateTime: '2026-10-29T16:00:00Z', departureDateTime: '2026-10-31T11:00:00Z' }, '2026-10-29')).toBe(true);
  });

  eachZone('a 5:15pm drop-off is not a day on its arrival day (Q1)', () => {
    expect(isDayPresent({ arrivalDateTime: '2026-10-29T17:15:00Z', departureDateTime: '2026-10-31T11:00:00Z' }, '2026-10-29')).toBe(false);
  });

  eachZone('a 5:15pm drop-off is present all day on the days after its arrival day', () => {
    expect(isDayPresent({ arrivalDateTime: '2026-10-29T17:15:00Z', departureDateTime: '2026-10-31T11:00:00Z' }, '2026-10-30')).toBe(true);
  });

  eachZone('the stay is present on its departure day and not the day before arrival or after departure', () => {
    expect(isDayPresent(STAY, '2026-10-28')).toBe(false);
    expect(isDayPresent(STAY, '2026-11-02')).toBe(true);
    expect(isDayPresent(STAY, '2026-11-03')).toBe(false);
  });
});

describe('REQ-065: upcoming forms run to the end of the departure day in San Francisco', () => {
  // 9pm Pacific on Thu 10-29 (PDT): already Fri 10-30 in UTC
  const NINE_PM = '2026-10-30T04:00:00Z';

  eachZone('at 9pm, a stay that left at 4:15pm today is still upcoming', () => {
    atClock(NINE_PM);
    expect(isBoardingUpcoming({ departureDateTime: '2026-10-29T16:15:00Z' })).toBe(true);
  });

  eachZone('at 9pm, a stay that left yesterday is not upcoming', () => {
    atClock(NINE_PM);
    expect(isBoardingUpcoming({ departureDateTime: '2026-10-28T16:15:00Z' })).toBe(false);
  });

  eachZone("the forms query keeps only boardings departing from today's site midnight", async () => {
    atClock(NINE_PM);
    const calls = {};
    const query = {
      select: (cols) => { calls.select = cols; return query; },
      gte: (col, value) => { calls.gte = [col, value]; return Promise.resolve({ data: [{ boarding_id: 'b1' }], error: null }); },
    };
    supabase.from.mockReturnValue(query);
    const { result } = renderHook(() => useBoardingForms());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(calls.gte).toEqual(['boardings.departure_datetime', '2026-10-29T00:00:00.000Z']);
    // Without !inner, a filter on the embedded table drops only the embed, not the form
    expect(calls.select.replace(/\s+/g, '')).toBe('*,boardings!boarding_id!inner(id,departure_datetime)');
    expect(Object.keys(result.current.formsByBoardingId)).toEqual(['b1']);
  });
});
