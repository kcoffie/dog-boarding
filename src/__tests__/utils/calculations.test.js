import { describe, it, expect } from 'vitest';
import { activeBoardings, calculateGross, calculateBoardingGross } from '../../utils/calculations';

/**
 * @requirements REQ-203
 */
describe('REQ-203: calculateGross — boarding.nightRate fallback chain', () => {
  const dogs = [
    { id: '1', name: 'Luna', nightRate: 45 },
    { id: '2', name: 'Cooper', nightRate: 55 },
  ];

  it('uses boarding.nightRate when set', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', nightRate: 65 },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(65);
  });

  it('falls back to dog.nightRate when boarding.nightRate is null', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', nightRate: null },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(45);
  });

  it('falls back to dog.nightRate when boarding.nightRate is undefined', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z' },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(45);
  });

  it('returns 0 when both boarding.nightRate and dog.nightRate are null', () => {
    const dogsNoRate = [{ id: '1', name: 'Luna', nightRate: null }];
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', nightRate: null },
    ];
    expect(calculateGross(dogsNoRate, boardings, '2025-01-15')).toBe(0);
  });

  it('uses explicit boarding.nightRate=0, does not fall back to dog.nightRate', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', nightRate: 0 },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(0);
  });

  it('each dog uses its own boarding.nightRate independently', () => {
    // Jan 16: both Luna (boarding.nightRate=65) and Cooper (boarding.nightRate=null → dog.nightRate=55)
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', nightRate: 65 },
      { id: '2', dogId: '2', arrivalDateTime: '2025-01-16T14:00:00Z', departureDateTime: '2025-01-18T10:00:00Z', nightRate: null },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-16')).toBe(65 + 55);
  });

  it('prefers boarding.nightRate over dog.nightRate when both are set', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', nightRate: 80 },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(80);
  });
});

/**
 * @requirements REQ-203
 */
describe('REQ-203: calculateBoardingGross — boarding.nightRate fallback chain', () => {
  it('uses boarding.nightRate for total nights', () => {
    const dog = { id: '1', nightRate: 45 };
    const boarding = {
      id: '1', dogId: '1',
      arrivalDateTime: '2025-01-15T14:00:00Z',
      departureDateTime: '2025-01-17T10:00:00Z',
      nightRate: 65,
    };
    // 2 nights × 65 = 130
    expect(calculateBoardingGross(dog, boarding, ['2025-01-15', '2025-01-16'])).toBe(130);
  });

  it('falls back to dog.nightRate when boarding.nightRate is null', () => {
    const dog = { id: '1', nightRate: 45 };
    const boarding = {
      id: '1', dogId: '1',
      arrivalDateTime: '2025-01-15T14:00:00Z',
      departureDateTime: '2025-01-17T10:00:00Z',
      nightRate: null,
    };
    // 2 nights × 45 = 90
    expect(calculateBoardingGross(dog, boarding, ['2025-01-15', '2025-01-16'])).toBe(90);
  });

  it('returns 0 per night when both boarding.nightRate and dog.nightRate are null', () => {
    const dog = { id: '1', nightRate: null };
    const boarding = {
      id: '1', dogId: '1',
      arrivalDateTime: '2025-01-15T14:00:00Z',
      departureDateTime: '2025-01-17T10:00:00Z',
      nightRate: null,
    };
    expect(calculateBoardingGross(dog, boarding, ['2025-01-15', '2025-01-16'])).toBe(0);
  });
});

/**
 * @requirements REQ-108
 */
describe('REQ-108: a boarding marked gone (cancelledAt) has no nights (#322)', () => {
  const dogs = [
    { id: '1', name: 'Luna', nightRate: 45 },
    { id: '2', name: 'Cooper', nightRate: 55 },
  ];

  it('a boarding marked gone adds nothing to the night\'s gross', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z' },
      { id: '2', dogId: '2', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', cancelledAt: '2025-01-10T12:00:00Z' },
    ];
    // Only Luna is there on Jan 15: $45
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(45);
  });

  it('an amended stay pays the new booking\'s rate, not the one marked gone', () => {
    // The site replaced booking 1 with booking 2 for the same dog and night;
    // reconciliation marked booking 1 gone. The marked row comes first.
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', nightRate: 60, cancelledAt: '2025-01-14T12:00:00Z' },
      { id: '2', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00Z', departureDateTime: '2025-01-17T10:00:00Z', nightRate: 70 },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(70);
  });

  it('activeBoardings keeps unmarked boardings and drops marked ones', () => {
    const kept = { id: '1', dogId: '1', cancelledAt: null };
    const dropped = { id: '2', dogId: '2', cancelledAt: '2025-01-10T12:00:00Z' };
    expect(activeBoardings([kept, dropped]).map(b => b.id)).toEqual(['1']);
  });
});
