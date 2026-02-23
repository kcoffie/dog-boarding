import { describe, it, expect } from 'vitest';
import { calculateGross, calculateBoardingGross } from '../../utils/calculations';

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
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', nightRate: 65 },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(65);
  });

  it('falls back to dog.nightRate when boarding.nightRate is null', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', nightRate: null },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(45);
  });

  it('falls back to dog.nightRate when boarding.nightRate is undefined', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00' },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(45);
  });

  it('returns 0 when both boarding.nightRate and dog.nightRate are null', () => {
    const dogsNoRate = [{ id: '1', name: 'Luna', nightRate: null }];
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', nightRate: null },
    ];
    expect(calculateGross(dogsNoRate, boardings, '2025-01-15')).toBe(0);
  });

  it('uses explicit boarding.nightRate=0, does not fall back to dog.nightRate', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', nightRate: 0 },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-15')).toBe(0);
  });

  it('each dog uses its own boarding.nightRate independently', () => {
    // Jan 16: both Luna (boarding.nightRate=65) and Cooper (boarding.nightRate=null → dog.nightRate=55)
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', nightRate: 65 },
      { id: '2', dogId: '2', arrivalDateTime: '2025-01-16T14:00:00', departureDateTime: '2025-01-18T10:00:00', nightRate: null },
    ];
    expect(calculateGross(dogs, boardings, '2025-01-16')).toBe(65 + 55);
  });

  it('prefers boarding.nightRate over dog.nightRate when both are set', () => {
    const boardings = [
      { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', nightRate: 80 },
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
      arrivalDateTime: '2025-01-15T14:00:00',
      departureDateTime: '2025-01-17T10:00:00',
      nightRate: 65,
    };
    // 2 nights × 65 = 130
    expect(calculateBoardingGross(dog, boarding, ['2025-01-15', '2025-01-16'])).toBe(130);
  });

  it('falls back to dog.nightRate when boarding.nightRate is null', () => {
    const dog = { id: '1', nightRate: 45 };
    const boarding = {
      id: '1', dogId: '1',
      arrivalDateTime: '2025-01-15T14:00:00',
      departureDateTime: '2025-01-17T10:00:00',
      nightRate: null,
    };
    // 2 nights × 45 = 90
    expect(calculateBoardingGross(dog, boarding, ['2025-01-15', '2025-01-16'])).toBe(90);
  });

  it('returns 0 per night when both boarding.nightRate and dog.nightRate are null', () => {
    const dog = { id: '1', nightRate: null };
    const boarding = {
      id: '1', dogId: '1',
      arrivalDateTime: '2025-01-15T14:00:00',
      departureDateTime: '2025-01-17T10:00:00',
      nightRate: null,
    };
    expect(calculateBoardingGross(dog, boarding, ['2025-01-15', '2025-01-16'])).toBe(0);
  });
});
