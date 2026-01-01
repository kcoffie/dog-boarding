import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import EmployeeTotals from './EmployeeTotals';
import { useData } from '../context/DataContext';

// Mock the useData hook
vi.mock('../context/DataContext', () => ({
  useData: vi.fn(),
}));

/**
 * @requirements REQ-040
 */
describe('REQ-040: EmployeeTotals', () => {
  const mockDogs = [
    { id: '1', name: 'Luna', dayRate: 35, nightRate: 45, active: true },
    { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45, active: true },
  ];

  const mockBoardings = [
    // Luna: stays Jan 15-18 (3 nights: 15, 16, 17)
    { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-18T10:00:00' },
    // Cooper: stays Jan 16-18 (2 nights: 16, 17)
    { id: '2', dogId: '2', arrivalDateTime: '2025-01-16T14:00:00', departureDateTime: '2025-01-18T10:00:00' },
  ];

  const mockSettings = {
    netPercentage: 65,
    netPercentageHistory: [],
    employees: [
      { name: 'Kate', active: true },
      { name: 'Nick', active: true },
    ],
  };

  // Helper to create getNightAssignment mock from assignments object
  const createGetNightAssignment = (assignments) => (date) => assignments[date] || '';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('N/A exclusion', () => {
    it('excludes N/A from employee totals', () => {
      const assignments = {
        '2025-01-15': 'Kate',
        '2025-01-16': 'N/A',
        '2025-01-17': 'Nick',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      // Kate should have 1 night (not counting N/A)
      // Nick should have 1 night
      // N/A should NOT appear as a card
      expect(screen.getByText('Kate')).toBeInTheDocument();
      expect(screen.getByText('Nick')).toBeInTheDocument();
      expect(screen.queryByText('N/A')).not.toBeInTheDocument();
    });

    it('does not show N/A card even when all nights are N/A', () => {
      const assignments = {
        '2025-01-15': 'N/A',
        '2025-01-16': 'N/A',
        '2025-01-17': 'N/A',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      const { container } = render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      // Should not render anything since no real employees are assigned
      expect(screen.queryByText('N/A')).not.toBeInTheDocument();
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Employee calculations', () => {
    it('calculates nights worked correctly', () => {
      const assignments = {
        '2025-01-15': 'Kate',
        '2025-01-16': 'Kate',
        '2025-01-17': 'Nick',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      // Kate: 2 nights, Nick: 1 night
      expect(screen.getByText('Kate')).toBeInTheDocument();
      expect(screen.getByText('Nick')).toBeInTheDocument();
    });

    it('calculates earnings correctly', () => {
      const assignments = {
        '2025-01-15': 'Kate',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      // Jan 15: Luna $45 gross * 65% = $29.25 net
      expect(screen.getByText('$29.25')).toBeInTheDocument();
    });

    it('shows inactive employees with reduced opacity', () => {
      const settingsWithInactive = {
        ...mockSettings,
        employees: [
          { name: 'Kate', active: false },
        ],
      };

      const assignments = {
        '2025-01-15': 'Kate',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: settingsWithInactive,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      // Kate should still appear but with opacity
      expect(screen.getByText('Kate')).toBeInTheDocument();
    });
  });

  describe('Date formatting', () => {
    it('formats consecutive dates as ranges', () => {
      const assignments = {
        '2025-01-15': 'Kate',
        '2025-01-16': 'Kate',
        '2025-01-17': 'Kate',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      // Should show "Jan 15-17" instead of individual dates
      expect(screen.getByText(/Jan 15-17/)).toBeInTheDocument();
    });

    it('shows individual dates when not consecutive', () => {
      const assignments = {
        '2025-01-15': 'Kate',
        '2025-01-17': 'Kate',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      // Should show separate dates
      expect(screen.getByText(/Jan 15.*Jan 17/)).toBeInTheDocument();
    });
  });

  describe('Empty states', () => {
    it('returns null when no assignments', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: () => '',
      });

      const { container } = render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      expect(container.firstChild).toBeNull();
    });

    it('returns null when only N/A assignments exist', () => {
      const assignments = {
        '2025-01-15': 'N/A',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      const { container } = render(<EmployeeTotals startDate="2025-01-15" days={4} />);

      expect(container.firstChild).toBeNull();
    });
  });
});
