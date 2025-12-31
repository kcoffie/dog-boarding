import { describe, it, expect } from 'vitest';
import {
  formatName,
  formatDate,
  formatTime,
  formatDateTime,
  toDateInputValue,
  toTimeInputValue,
  combineDateAndTime,
  calculateNights,
  isOvernight,
  isDayPresent,
  getDateRange,
  formatDateShort,
  getDayOfWeek,
} from './dateUtils';

describe('formatName', () => {
  it('capitalizes first letter of each word', () => {
    expect(formatName('luna')).toBe('Luna');
    expect(formatName('cooper smith')).toBe('Cooper Smith');
  });

  it('handles mixed case input', () => {
    expect(formatName('LUNA')).toBe('Luna');
    expect(formatName('lUnA')).toBe('Luna');
  });

  it('handles empty string', () => {
    expect(formatName('')).toBe('');
  });

  it('handles null/undefined', () => {
    expect(formatName(null)).toBe('');
    expect(formatName(undefined)).toBe('');
  });
});

describe('formatDate', () => {
  it('formats date in readable format', () => {
    const result = formatDate('2025-01-15T14:00:00');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
    expect(result).toContain('2025');
  });
});

describe('formatTime', () => {
  it('formats time in readable format', () => {
    const result = formatTime('2025-01-15T14:30:00');
    expect(result).toMatch(/2:30|14:30/); // Depends on locale
  });
});

describe('formatDateTime', () => {
  it('combines date and time formatting', () => {
    const result = formatDateTime('2025-01-15T14:30:00');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });
});

describe('toDateInputValue', () => {
  it('converts datetime to YYYY-MM-DD format', () => {
    expect(toDateInputValue('2025-01-15T14:30:00')).toBe('2025-01-15');
  });
});

describe('toTimeInputValue', () => {
  it('converts datetime to HH:MM format', () => {
    expect(toTimeInputValue('2025-01-15T14:30:00')).toBe('14:30');
  });
});

describe('combineDateAndTime', () => {
  it('combines date and time strings into ISO format', () => {
    expect(combineDateAndTime('2025-01-15', '14:30')).toBe('2025-01-15T14:30');
  });
});

describe('calculateNights', () => {
  it('calculates nights for multi-day stay', () => {
    // Mon 2PM -> Wed 10AM = 2 nights (Mon night, Tue night)
    expect(calculateNights('2025-01-13T14:00', '2025-01-15T10:00')).toBe(2);
  });

  it('calculates nights for single overnight', () => {
    // Mon 2PM -> Tue 10AM = 1 night
    expect(calculateNights('2025-01-13T14:00', '2025-01-14T10:00')).toBe(1);
  });

  it('returns 0 for same-day departure', () => {
    // Arrive and leave same day
    expect(calculateNights('2025-01-13T10:00', '2025-01-13T16:00')).toBe(0);
  });

  it('handles week-long stay', () => {
    // Mon -> Mon = 7 nights
    expect(calculateNights('2025-01-13T10:00', '2025-01-20T10:00')).toBe(7);
  });
});

describe('isOvernight', () => {
  const boarding = {
    arrivalDateTime: '2025-01-15T14:00:00',
    departureDateTime: '2025-01-18T10:00:00',
  };

  it('returns true for nights during stay', () => {
    // Pass date strings directly (the function handles parsing)
    expect(isOvernight(boarding, '2025-01-15')).toBe(true); // First night
    expect(isOvernight(boarding, '2025-01-16')).toBe(true); // Second night
    expect(isOvernight(boarding, '2025-01-17')).toBe(true); // Third night
  });

  it('returns false for departure day (not staying overnight)', () => {
    expect(isOvernight(boarding, '2025-01-18')).toBe(false);
  });

  it('returns false for dates before arrival', () => {
    expect(isOvernight(boarding, '2025-01-14')).toBe(false);
  });

  it('returns false for dates after departure', () => {
    expect(isOvernight(boarding, '2025-01-19')).toBe(false);
  });

  it('handles same-day boarding (no overnight)', () => {
    const sameDayBoarding = {
      arrivalDateTime: '2025-01-15T10:00:00',
      departureDateTime: '2025-01-15T16:00:00',
    };
    expect(isOvernight(sameDayBoarding, '2025-01-15')).toBe(false);
  });

  it('handles arrival at exactly 5 PM', () => {
    const eveningBoarding = {
      arrivalDateTime: '2025-01-15T17:00:00',
      departureDateTime: '2025-01-16T10:00:00',
    };
    expect(isOvernight(eveningBoarding, '2025-01-15')).toBe(true);
  });
});

describe('isDayPresent', () => {
  const boarding = {
    arrivalDateTime: '2025-01-15T14:00:00', // 2 PM
    departureDateTime: '2025-01-18T10:00:00', // 10 AM
  };

  it('returns true for days during stay', () => {
    expect(isDayPresent(boarding, '2025-01-15')).toBe(true); // Arrival day (before 5 PM)
    expect(isDayPresent(boarding, '2025-01-16')).toBe(true); // Middle day
    expect(isDayPresent(boarding, '2025-01-17')).toBe(true); // Middle day
    expect(isDayPresent(boarding, '2025-01-18')).toBe(true); // Departure day
  });

  it('returns false for arrival day if arrived after 5 PM', () => {
    const eveningBoarding = {
      arrivalDateTime: '2025-01-15T18:00:00', // 6 PM
      departureDateTime: '2025-01-17T10:00:00',
    };
    expect(isDayPresent(eveningBoarding, '2025-01-15')).toBe(false);
  });

  it('returns true for arrival day if arrived before 5 PM', () => {
    expect(isDayPresent(boarding, '2025-01-15')).toBe(true);
  });

  it('returns false for dates before arrival', () => {
    expect(isDayPresent(boarding, '2025-01-14')).toBe(false);
  });

  it('returns false for dates after departure', () => {
    expect(isDayPresent(boarding, '2025-01-19')).toBe(false);
  });

  it('handles arrival at exactly 5 PM (not day present)', () => {
    const exactlyFiveBoarding = {
      arrivalDateTime: '2025-01-15T17:00:00',
      departureDateTime: '2025-01-17T10:00:00',
    };
    expect(isDayPresent(exactlyFiveBoarding, '2025-01-15')).toBe(false);
  });
});

describe('getDateRange', () => {
  it('generates correct number of dates', () => {
    // Use string input to avoid timezone issues
    const dates = getDateRange('2025-01-15', 7);
    expect(dates).toHaveLength(7);
  });

  it('generates consecutive dates', () => {
    const dates = getDateRange('2025-01-15', 3);
    expect(dates).toEqual(['2025-01-15', '2025-01-16', '2025-01-17']);
  });

  it('handles string input', () => {
    const dates = getDateRange('2025-01-15', 3);
    expect(dates).toEqual(['2025-01-15', '2025-01-16', '2025-01-17']);
  });

  it('handles month boundary', () => {
    const dates = getDateRange('2025-01-30', 5);
    expect(dates).toContain('2025-01-30');
    expect(dates).toContain('2025-01-31');
    expect(dates).toContain('2025-02-01');
  });

  it('generates 14 days by default range', () => {
    const dates = getDateRange('2025-01-01', 14);
    expect(dates).toHaveLength(14);
    expect(dates[0]).toBe('2025-01-01');
    expect(dates[13]).toBe('2025-01-14');
  });
});

describe('formatDateShort', () => {
  it('formats date in short format', () => {
    const result = formatDateShort('2025-01-15');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });
});

describe('getDayOfWeek', () => {
  it('returns day abbreviation', () => {
    // Jan 15, 2025 is a Wednesday
    const result = getDayOfWeek('2025-01-15');
    expect(result).toBe('Wed');
  });

  it('returns correct day for Sunday', () => {
    // Jan 19, 2025 is a Sunday
    const result = getDayOfWeek('2025-01-19');
    expect(result).toBe('Sun');
  });
});
