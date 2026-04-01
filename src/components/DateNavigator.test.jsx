import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateNavigator from './DateNavigator';

/**
 * @requirements REQ-031
 */
describe('REQ-031: DateNavigator', () => {
  const defaultProps = {
    startDate: new Date('2025-01-15'),
    endDate: new Date('2025-01-28'),
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders navigation buttons', () => {
    render(<DateNavigator {...defaultProps} />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    // Week and Day buttons appear multiple times
    expect(screen.getAllByText('Week').length).toBe(2);
    expect(screen.getAllByText('Day').length).toBe(2);
  });

  it('displays day count', () => {
    render(<DateNavigator {...defaultProps} />);
    // 14 days from Jan 15 to Jan 28
    expect(screen.getByText('14 days')).toBeInTheDocument();
  });

  it('shifts range forward by one day', () => {
    render(<DateNavigator {...defaultProps} />);

    const dayButtons = screen.getAllByText('Day');
    // Second "Day" button is the forward one
    fireEvent.click(dayButtons[1]);

    expect(defaultProps.onStartDateChange).toHaveBeenCalled();
    expect(defaultProps.onEndDateChange).toHaveBeenCalled();

    const newStart = defaultProps.onStartDateChange.mock.calls[0][0];
    // Should be 1 day after original start
    const diffMs = newStart - defaultProps.startDate;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(1);
  });

  it('shifts range backward by one day', () => {
    render(<DateNavigator {...defaultProps} />);

    const dayButtons = screen.getAllByText('Day');
    // First "Day" button is the backward one
    fireEvent.click(dayButtons[0]);

    expect(defaultProps.onStartDateChange).toHaveBeenCalled();
    expect(defaultProps.onEndDateChange).toHaveBeenCalled();

    const newStart = defaultProps.onStartDateChange.mock.calls[0][0];
    // Should be 1 day before original start
    const diffMs = defaultProps.startDate - newStart;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(1);
  });

  it('shifts range forward by one week', () => {
    render(<DateNavigator {...defaultProps} />);

    const weekButtons = screen.getAllByText('Week');
    // Second "Week" button is the forward one
    fireEvent.click(weekButtons[1]);

    const newStart = defaultProps.onStartDateChange.mock.calls[0][0];
    // Should be 7 days after original start
    const diffMs = newStart - defaultProps.startDate;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it('shifts range backward by one week', () => {
    render(<DateNavigator {...defaultProps} />);

    const weekButtons = screen.getAllByText('Week');
    // First "Week" button is the backward one
    fireEvent.click(weekButtons[0]);

    const newStart = defaultProps.onStartDateChange.mock.calls[0][0];
    // Should be 7 days before original start
    const diffMs = defaultProps.startDate - newStart;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it('clicking Today moves range to today', () => {
    // Pin clock to noon on 2025 spring-forward day (hardest DST case) so
    // new Date() inside the component and in the assertion are identical.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-09T20:00:00.000Z')); // noon PDT (UTC-8→UTC-7 day)

    render(<DateNavigator {...defaultProps} />);
    fireEvent.click(screen.getByText('Today'));

    expect(defaultProps.onStartDateChange).toHaveBeenCalled();
    expect(defaultProps.onEndDateChange).toHaveBeenCalled();

    const newStart = defaultProps.onStartDateChange.mock.calls[0][0];
    const pinnedToday = new Date();
    expect(newStart.getDate()).toBe(pinnedToday.getDate());
    expect(newStart.getMonth()).toBe(pinnedToday.getMonth());
  });

  it('preserves range length when clicking Today', () => {
    // Pin clock to noon on 2025 spring-forward day. The 13-day range
    // end (Mar 22) is well past the DST boundary — without fake timers
    // the ms-based diff could round incorrectly on DST transition days.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-09T20:00:00.000Z')); // noon PDT

    render(<DateNavigator {...defaultProps} />);
    fireEvent.click(screen.getByText('Today'));

    const newStart = defaultProps.onStartDateChange.mock.calls[0][0];
    const newEnd = defaultProps.onEndDateChange.mock.calls[0][0];

    // Original range was 13 days (Jan 15 to Jan 28 inclusive)
    const diffMs = newEnd - newStart;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(13);
  });
});

describe('DateNavigator displays', () => {
  it('shows correct day count for 7 day range', () => {
    const props = {
      startDate: new Date('2025-01-15'),
      endDate: new Date('2025-01-21'),
      onStartDateChange: vi.fn(),
      onEndDateChange: vi.fn(),
    };

    render(<DateNavigator {...props} />);
    expect(screen.getByText('7 days')).toBeInTheDocument();
  });

  it('shows correct day count for single day', () => {
    const props = {
      startDate: new Date('2025-01-15'),
      endDate: new Date('2025-01-15'),
      onStartDateChange: vi.fn(),
      onEndDateChange: vi.fn(),
    };

    render(<DateNavigator {...props} />);
    expect(screen.getByText('1 days')).toBeInTheDocument();
  });
});
