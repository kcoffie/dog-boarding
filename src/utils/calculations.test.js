import { describe, it, expect } from 'vitest';
import {
  calculateGross,
  calculateNet,
  countOvernightDogs,
  calculateEmployeeTotals,
  calculateBoardingGross,
} from './calculations';

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
