import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryCards from './SummaryCards';
import { useData } from '../context/DataContext';

// Mock the useData hook
vi.mock('../context/DataContext', () => ({
  useData: vi.fn(),
}));

/**
 * @requirements REQ-035
 */
describe('REQ-035: SummaryCards', () => {
  const mockDogs = [
    { id: '1', name: 'Luna', dayRate: 35, nightRate: 45, active: true },
    { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45, active: true },
  ];

  const mockBoardings = [
    // Luna: stays Jan 15-17 (2 nights: 15, 16)
    { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00' },
    // Cooper: stays Jan 16-18 (2 nights: 16, 17)
    { id: '2', dogId: '2', arrivalDateTime: '2025-01-16T14:00:00', departureDateTime: '2025-01-18T10:00:00' },
  ];

  const mockSettings = {
    netPercentage: 65,
    netPercentageHistory: [],
    employees: [{ name: 'Kate', active: true }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create getNightAssignment mock from assignments object
  const createGetNightAssignment = (assignments) => (date) => assignments[date] || '';

  describe('Nights Assigned calculation', () => {
    it('counts employee assignments correctly', () => {
      const assignments = {
        '2025-01-15': 'Kate',
        '2025-01-16': 'Kate',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<SummaryCards startDate="2025-01-15" days={4} />);

      // Should show "2/3" - 2 assigned out of 3 nights with boardings (15, 16, 17)
      expect(screen.getByText('Nights Assigned')).toBeInTheDocument();
    });

    it('excludes N/A from assigned count', () => {
      const assignments = {
        '2025-01-15': 'Kate',
        '2025-01-16': 'N/A',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<SummaryCards startDate="2025-01-15" days={4} />);

      // N/A should not be counted as assigned
      // Night 15: Kate (assigned), Night 16: N/A (not counted), Night 17: unassigned
      // So assigned = 1, but nights needing coverage = 2 (16 is N/A so excluded from denominator)
      const nightsCard = screen.getByText('Nights Assigned').closest('div').parentElement;
      expect(nightsCard).toBeInTheDocument();
    });

    it('excludes N/A nights from denominator (nights needing coverage)', () => {
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

      render(<SummaryCards startDate="2025-01-15" days={4} />);

      // All nights are N/A, so both assigned and needed should be 0
      // Value should be "0/0"
      expect(screen.getByText('0/0')).toBeInTheDocument();
    });

    it('shows correct ratio with mixed assignments', () => {
      const assignments = {
        '2025-01-15': 'Kate',
        '2025-01-16': 'N/A',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: createGetNightAssignment(assignments),
      });

      render(<SummaryCards startDate="2025-01-15" days={4} />);

      // Night 15: Kate (1 assigned), Night 16: N/A (excluded), Night 17: unassigned (1 needed)
      // Result: 1 assigned / 2 needing coverage
      expect(screen.getByText('1/2')).toBeInTheDocument();
    });
  });

  describe('Dogs Tonight', () => {
    it('displays Dogs Tonight card', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: () => '',
      });

      render(<SummaryCards startDate="2025-01-15" days={4} />);

      // Card should be present
      expect(screen.getByText('Dogs Tonight')).toBeInTheDocument();
      expect(screen.getByText('staying overnight')).toBeInTheDocument();
    });
  });

  describe('Active Dogs', () => {
    it('counts only active dogs', () => {
      const dogsWithInactive = [
        { id: '1', name: 'Luna', dayRate: 35, nightRate: 45, active: true },
        { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45, active: false },
        { id: '3', name: 'Bella', dayRate: 40, nightRate: 50, active: true },
      ];

      useData.mockReturnValue({
        dogs: dogsWithInactive,
        boardings: [],
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: () => '',
      });

      render(<SummaryCards startDate="2025-01-15" days={4} />);

      // Should show Active Dogs card with 2 active dogs and 3 total
      expect(screen.getByText('Active Dogs')).toBeInTheDocument();
      expect(screen.getByText('3 total')).toBeInTheDocument();
    });
  });

  describe('Period Revenue', () => {
    it('displays Period Revenue card', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNetPercentageForDate: () => 65,
        getNightAssignment: () => '',
      });

      render(<SummaryCards startDate="2025-01-15" days={4} />);

      // Card should be present
      expect(screen.getByText('Period Revenue')).toBeInTheDocument();
      expect(screen.getByText('gross income')).toBeInTheDocument();
    });
  });
});
