import { describe, it, expect } from 'vitest';
import {
  calculateGross,
  calculateNet,
  countOvernightDogs,
  calculateEmployeeTotals,
  calculateBoardingGross,
  calculateDaytimeCredit,
  calculateDaytimeGross,
  nightRate,
  nightStays,
} from './calculations';
import * as night from '../__tests__/components/oneNightFixture';

const sampleDogs = [
  { id: '1', name: 'Luna', dayRate: 35, nightRate: 45 },
  { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45 },
  { id: '3', name: 'Bella', dayRate: 40, nightRate: 50 },
];

const sampleBoardings = [
  // Luna: Jan 15 2PM -> Jan 18 10AM (3 nights: 15, 16, 17)
  { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-18T10:00:00' },
  // Cooper: Jan 16 9AM -> Jan 17 5PM (1 night: 16)
  { id: '2', dogId: '2', arrivalDateTime: '2025-01-16T09:00:00', departureDateTime: '2025-01-17T17:00:00' },
  // Bella: Jan 15 6PM -> Jan 20 11AM (5 nights: 15, 16, 17, 18, 19)
  { id: '3', dogId: '3', arrivalDateTime: '2025-01-15T18:00:00', departureDateTime: '2025-01-20T11:00:00' },
];

/**
 * @requirements REQ-032, REQ-063
 */
describe('REQ-063: calculateGross', () => {
  it('calculates gross for single overnight dog', () => {
    // Jan 18: Only Bella is overnight (Luna departed, Cooper departed)
    const gross = calculateGross(sampleDogs, sampleBoardings, '2025-01-18');
    expect(gross).toBe(50); // Bella's night rate
  });

  it('calculates gross for multiple overnight dogs', () => {
    // Jan 16: Luna ($45) + Cooper ($45) + Bella ($50) = $140
    const gross = calculateGross(sampleDogs, sampleBoardings, '2025-01-16');
    expect(gross).toBe(140);
  });

  it('returns 0 when no dogs overnight', () => {
    const gross = calculateGross(sampleDogs, sampleBoardings, '2025-01-14');
    expect(gross).toBe(0);
  });

  it('returns 0 for empty dogs list', () => {
    const gross = calculateGross([], sampleBoardings, '2025-01-16');
    expect(gross).toBe(0);
  });

  it('returns 0 for empty boardings list', () => {
    const gross = calculateGross(sampleDogs, [], '2025-01-16');
    expect(gross).toBe(0);
  });

  it('only counts dog once even with multiple boardings same night', () => {
    const dogsWithOne = [{ id: '1', name: 'Luna', dayRate: 35, nightRate: 45 }];
    const multipleBoardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T10:00:00', departureDateTime: '2025-01-16T10:00:00' },
      { id: '2', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00' },
    ];
    const gross = calculateGross(dogsWithOne, multipleBoardings, '2025-01-15');
    expect(gross).toBe(45); // Only counted once
  });
});

/**
 * @requirements REQ-032, REQ-063
 */
describe('REQ-063: calculateNet', () => {
  it('calculates net at 65%', () => {
    expect(calculateNet(100, 65)).toBe(65);
  });

  it('calculates net at 100%', () => {
    expect(calculateNet(100, 100)).toBe(100);
  });

  it('calculates net at 0%', () => {
    expect(calculateNet(100, 0)).toBe(0);
  });

  it('handles decimal percentages', () => {
    expect(calculateNet(100, 65.5)).toBe(65.5);
  });

  it('returns 0 for 0 gross', () => {
    expect(calculateNet(0, 65)).toBe(0);
  });
});

/**
 * @requirements REQ-032
 */
describe('REQ-032: countOvernightDogs', () => {
  it('counts multiple dogs on same night', () => {
    // Jan 16: Luna, Cooper, and Bella are all overnight
    const count = countOvernightDogs(sampleDogs, sampleBoardings, '2025-01-16');
    expect(count).toBe(3);
  });

  it('counts single dog overnight', () => {
    // Jan 19: Only Bella is overnight
    const count = countOvernightDogs(sampleDogs, sampleBoardings, '2025-01-19');
    expect(count).toBe(1);
  });

  it('returns 0 when no dogs overnight', () => {
    const count = countOvernightDogs(sampleDogs, sampleBoardings, '2025-01-14');
    expect(count).toBe(0);
  });

  it('returns 0 for empty arrays', () => {
    expect(countOvernightDogs([], [], '2025-01-16')).toBe(0);
  });
});

/**
 * @requirements REQ-040
 */
describe('REQ-040: calculateEmployeeTotals', () => {
  const dates = ['2025-01-15', '2025-01-16', '2025-01-17'];
  const assignments = [
    { date: '2025-01-15', employeeName: 'Kate' },
    { date: '2025-01-16', employeeName: 'Nick' },
    { date: '2025-01-17', employeeName: 'Kate' },
  ];

  it('calculates totals per employee', () => {
    const totals = calculateEmployeeTotals(assignments, sampleDogs, sampleBoardings, dates, 65);

    expect(totals.Kate.nights).toBe(2);
    expect(totals.Nick.nights).toBe(1);
  });

  it('calculates correct earnings', () => {
    const totals = calculateEmployeeTotals(assignments, sampleDogs, sampleBoardings, dates, 65);

    // Jan 15: Luna ($45) + Bella ($50) = $95 gross, $61.75 net
    // Jan 17: Luna ($45) + Bella ($50) = $95 gross, $61.75 net
    // Kate total: $123.50
    expect(totals.Kate.earnings).toBeCloseTo(123.5, 2);

    // Jan 16: Luna ($45) + Cooper ($45) + Bella ($50) = $140 gross, $91 net
    expect(totals.Nick.earnings).toBeCloseTo(91, 2);
  });

  it('tracks dates worked', () => {
    const totals = calculateEmployeeTotals(assignments, sampleDogs, sampleBoardings, dates, 65);

    expect(totals.Kate.dates).toContain('2025-01-15');
    expect(totals.Kate.dates).toContain('2025-01-17');
    expect(totals.Nick.dates).toContain('2025-01-16');
  });

  it('returns empty object when no assignments', () => {
    const totals = calculateEmployeeTotals([], sampleDogs, sampleBoardings, dates, 65);
    expect(Object.keys(totals)).toHaveLength(0);
  });

  it('handles unassigned dates', () => {
    const partialAssignments = [
      { date: '2025-01-15', employeeName: 'Kate' },
      // Jan 16 unassigned
      { date: '2025-01-17', employeeName: 'Kate' },
    ];
    const totals = calculateEmployeeTotals(partialAssignments, sampleDogs, sampleBoardings, dates, 65);

    expect(totals.Kate.nights).toBe(2);
    expect(totals.Nick).toBeUndefined();
  });
});

/**
 * @requirements REQ-063
 */
describe('REQ-063: calculateBoardingGross', () => {
  const luna = { id: '1', name: 'Luna', dayRate: 35, nightRate: 45 };
  const lunaBoarding = {
    id: '1',
    dogId: '1',
    arrivalDateTime: '2025-01-15T14:00:00',
    departureDateTime: '2025-01-18T10:00:00',
  };

  it('calculates gross for full stay', () => {
    const dates = ['2025-01-15', '2025-01-16', '2025-01-17', '2025-01-18'];
    const gross = calculateBoardingGross(luna, lunaBoarding, dates);
    // 3 nights: 15, 16, 17 @ $45 = $135
    expect(gross).toBe(135);
  });

  it('calculates partial date range', () => {
    const dates = ['2025-01-16']; // Only checking one night
    const gross = calculateBoardingGross(luna, lunaBoarding, dates);
    expect(gross).toBe(45);
  });

  it('returns 0 for dates outside boarding', () => {
    const dates = ['2025-01-14', '2025-01-19'];
    const gross = calculateBoardingGross(luna, lunaBoarding, dates);
    expect(gross).toBe(0);
  });
});

/**
 * @requirements REQ-P1
 */
describe('REQ-P1: calculateDaytimeCredit', () => {
  const dogs = [
    { name: 'Luna', dayRate: 35 },
    { name: 'Cooper', dayRate: 35 },
    { name: 'Bella', dayRate: 40 },
  ];

  it('returns 0 when petNames is empty (no daytime dogs)', () => {
    expect(calculateDaytimeCredit([], dogs, 65)).toBe(0);
  });

  it('computes credit for matching dogs at the given net percentage', () => {
    // Luna ($35) + Cooper ($35) = $70 gross → $70 × 0.65 = $45.50
    const credit = calculateDaytimeCredit(['Luna', 'Cooper'], dogs, 65);
    expect(credit).toBeCloseTo(45.5);
  });

  it('skips pet names not in the dogs array (unrecognized dog)', () => {
    // Only Bella ($40) matches → $40 × 0.65 = $26
    const credit = calculateDaytimeCredit(['Bella', 'Unknown'], dogs, 65);
    expect(credit).toBeCloseTo(26);
  });

  it('deduplicates repeated pet names', () => {
    // Luna appears twice — should only be counted once: $35 × 0.65 = $22.75
    const credit = calculateDaytimeCredit(['Luna', 'Luna'], dogs, 65);
    expect(credit).toBeCloseTo(22.75);
  });

  it('returns 0 when net percentage is 0', () => {
    expect(calculateDaytimeCredit(['Luna', 'Cooper'], dogs, 0)).toBe(0);
  });

  it('uses the full dayRate when percentage is 100', () => {
    // Luna ($35) + Bella ($40) = $75 at 100%
    const credit = calculateDaytimeCredit(['Luna', 'Bella'], dogs, 100);
    expect(credit).toBeCloseTo(75);
  });
});

/**
 * @requirements REQ-036
 */
describe('REQ-036: one calculation for nights and pay', () => {
  const b = (id, dogId, arrival, departure, nightRate, extra = {}) =>
    ({ id, dogId, arrivalDateTime: arrival, departureDateTime: departure, nightRate, ...extra });
  const dog = (id, nightRate, dayRate = 30) => ({ id, name: `Dog ${id}`, dayRate, nightRate });

  it('a cancelled boarding has no night: 3 dogs, not 4', () => {
    expect(countOvernightDogs(night.dogs, night.boardings, night.NIGHT)).toBe(3);
  });

  it("a night counts at the booking's price, not the dog's: $140", () => {
    expect(calculateGross(night.dogs, night.boardings, night.NIGHT)).toBe(140);
  });

  it('the count is the length of the list of dogs staying, each with its rate', () => {
    const stays = nightStays(night.dogs, night.boardings, night.NIGHT);
    expect(stays.map(s => [s.dog.id, s.rate])).toEqual([['a', 60], ['b', 40], ['c', 40]]);
  });

  it("a booking with no price counts at the dog's rate", () => {
    const stays = nightStays([dog('x', 55)], [b('x1', 'x', '2026-10-22T16:00:00', '2026-10-24T10:00:00', null)], '2026-10-23');
    expect(stays[0].rate).toBe(55);
  });

  it("a booking priced $0 counts $0, not the dog's rate", () => {
    expect(calculateGross([dog('x', 55)], [b('x1', 'x', '2026-10-22T16:00:00', '2026-10-24T10:00:00', 0)], '2026-10-23')).toBe(0);
  });

  it("a boarding whose dog isn't loaded counts at its own price, else $0", () => {
    expect(nightRate({ nightRate: 40 }, undefined)).toBe(40);
    expect(nightRate({ nightRate: null }, undefined)).toBe(0);
  });

  it('a dog with no rate anywhere counts $0', () => {
    expect(calculateGross([dog('x', null)], [b('x1', 'x', '2026-10-22T16:00:00', '2026-10-24T10:00:00', null)], '2026-10-23')).toBe(0);
  });

  it('a dog with two boardings on one night counts once, at the rate of the one that arrived first', () => {
    const earlier = b('x2', 'x', '2026-10-20T16:00:00', '2026-10-25T10:00:00', 55);
    const later = b('x1', 'x', '2026-10-22T16:00:00', '2026-10-25T10:00:00', 60);
    for (const order of [[earlier, later], [later, earlier]]) {
      expect(countOvernightDogs([dog('x', 70)], order, '2026-10-23')).toBe(1);
      expect(calculateGross([dog('x', 70)], order, '2026-10-23')).toBe(55);
    }
  });

  it('two boardings arriving at the same time: the lower id sets the rate, whatever the load order', () => {
    const p = b('p', 'x', '2026-10-22T16:00:00', '2026-10-25T10:00:00', 55);
    const q = b('q', 'x', '2026-10-22T16:00:00', '2026-10-25T10:00:00', 60);
    expect(calculateGross([dog('x', 70)], [p, q], '2026-10-23')).toBe(55);
    expect(calculateGross([dog('x', 70)], [q, p], '2026-10-23')).toBe(55);
  });

  it("a cancelled boarding never sets a dog's rate, even when it arrived first", () => {
    const cancelled = b('x1', 'x', '2026-10-20T16:00:00', '2026-10-25T10:00:00', 55, { cancelledAt: '2026-10-19T00:00:00Z' });
    const active = b('x2', 'x', '2026-10-22T16:00:00', '2026-10-25T10:00:00', 60);
    expect(calculateGross([dog('x', 70)], [cancelled, active], '2026-10-23')).toBe(60);
  });

  it('the daytime credit is paid from the day rates of the dogs staying that night: $85', () => {
    expect(calculateDaytimeGross(night.dogs, night.boardings, night.NIGHT)).toBe(85);
  });

  it('a dog with two boardings on one night adds its day rate once', () => {
    const two = [b('x1', 'x', '2026-10-20T16:00:00', '2026-10-25T10:00:00', 55), b('x2', 'x', '2026-10-22T16:00:00', '2026-10-25T10:00:00', 60)];
    expect(calculateDaytimeGross([dog('x', 70, 30)], two, '2026-10-23')).toBe(30);
  });

  it('a dog with no day rate adds $0 to the daytime credit', () => {
    const noDayRate = { id: 'x', name: 'Dog x', nightRate: 70 };
    expect(calculateDaytimeGross([noDayRate], [b('x1', 'x', '2026-10-22T16:00:00', '2026-10-24T10:00:00', 60)], '2026-10-23')).toBe(0);
  });
});
