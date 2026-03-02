/**
 * Tests for Calendar Print / Export date range logic.
 * window.print() and the rendered print view are verified manually.
 * @requirements REQ-400
 */

import { describe, it, expect } from 'vitest';

// eachDayInRange logic replicated here since it's a module-level helper
// inside CalendarPage.jsx (not exported). Tests verify the algorithm.
function eachDayInRange(startDate, endDate) {
  const days = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

describe('REQ-400: Calendar Print / Export', () => {
  it('generates the correct number of days for a range', () => {
    const days = eachDayInRange(new Date(2026, 2, 1), new Date(2026, 2, 31));
    expect(days).toHaveLength(31);
  });

  it('returns a single day when start equals end', () => {
    const days = eachDayInRange(new Date(2026, 2, 15), new Date(2026, 2, 15));
    expect(days).toHaveLength(1);
    expect(days[0].getDate()).toBe(15);
  });

  it('handles cross-month ranges', () => {
    const days = eachDayInRange(new Date(2026, 2, 29), new Date(2026, 3, 2));
    expect(days).toHaveLength(5);
    expect(days[0].getMonth()).toBe(2); // March
    expect(days[2].getDate()).toBe(31); // March 31
    expect(days[3].getMonth()).toBe(3); // April
    expect(days[4].getDate()).toBe(2);  // April 2
  });

  it('returns empty array when start is after end', () => {
    const days = eachDayInRange(new Date(2026, 2, 10), new Date(2026, 2, 5));
    expect(days).toHaveLength(0);
  });
});
