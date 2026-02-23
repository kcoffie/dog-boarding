import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import RevenueView from '../../components/RevenueView';
import { useData } from '../../context/DataContext';

vi.mock('../../context/DataContext', () => ({
  useData: vi.fn(),
}));

const mockDogs = [
  { id: '1', name: 'Luna', nightRate: 45 },
  { id: '2', name: 'Cooper', nightRate: 55 },
];

// startDate = Jan 15 (7-day range: Jan 15–21)
const START_DATE = new Date('2025-01-15T00:00:00');

/**
 * @requirements REQ-202
 */
describe('REQ-202: RevenueView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Section header', () => {
    it('renders the Revenue section heading', () => {
      useData.mockReturnValue({ dogs: mockDogs, boardings: [] });
      render(<RevenueView startDate={START_DATE} days={7} />);
      expect(screen.getByText('Revenue')).toBeInTheDocument();
    });
  });

  describe('Empty state', () => {
    it('shows empty message when no boardings exist', () => {
      useData.mockReturnValue({ dogs: mockDogs, boardings: [] });
      render(<RevenueView startDate={START_DATE} days={7} />);
      expect(screen.getByText(/No boardings starting/)).toBeInTheDocument();
    });

    it('excludes boardings whose check-in is before the range', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [
          { id: '1', dogId: '1', arrivalDateTime: '2025-01-10T14:00:00', departureDateTime: '2025-01-12T10:00:00' },
        ],
      });
      render(<RevenueView startDate={START_DATE} days={7} />);
      expect(screen.getByText(/No boardings starting/)).toBeInTheDocument();
    });

    it('excludes boardings whose check-in is after the range', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [
          { id: '1', dogId: '1', arrivalDateTime: '2025-01-25T14:00:00', departureDateTime: '2025-01-27T10:00:00' },
        ],
      });
      render(<RevenueView startDate={START_DATE} days={7} />);
      expect(screen.getByText(/No boardings starting/)).toBeInTheDocument();
    });
  });

  describe('Boarding rows', () => {
    it('shows dog name for boarding whose check-in is in range', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [
          { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00' },
        ],
      });
      render(<RevenueView startDate={START_DATE} days={7} />);
      expect(screen.getByText('Luna')).toBeInTheDocument();
    });

    it('shows billed_amount when set, with no "est." label', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [
          { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', billedAmount: 750, source: 'external' },
        ],
      });
      render(<RevenueView startDate={START_DATE} days={7} />);
      // Amount appears in both row cell and period total footer
      expect(screen.getAllByText('$750').length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText('est.')).not.toBeInTheDocument();
    });

    it('shows estimated revenue with "est." label when no billedAmount', () => {
      // Luna: 2 nights (Jan 15–17), dog.nightRate=45 → 2 × 45 = $90
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [
          { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00' },
        ],
      });
      render(<RevenueView startDate={START_DATE} days={7} />);
      expect(screen.getAllByText('$90').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('est.')).toBeInTheDocument();
    });

    it('uses boarding.nightRate over dog.nightRate for estimated revenue', () => {
      // boarding.nightRate=65, dog.nightRate=45 → 2 nights × 65 = $130
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [
          { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', nightRate: 65 },
        ],
      });
      render(<RevenueView startDate={START_DATE} days={7} />);
      expect(screen.getAllByText('$130').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Period Total', () => {
    it('shows Period Total row', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [
          { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', billedAmount: 200 },
        ],
      });
      render(<RevenueView startDate={START_DATE} days={7} />);
      expect(screen.getByText('Period Total')).toBeInTheDocument();
    });

    it('sums all boarding revenues in range for the period total', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [
          { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00', billedAmount: 200 },
          { id: '2', dogId: '2', arrivalDateTime: '2025-01-16T14:00:00', departureDateTime: '2025-01-18T10:00:00', billedAmount: 300 },
        ],
      });
      render(<RevenueView startDate={START_DATE} days={7} />);
      // $200 + $300 = $500
      expect(screen.getByText('$500')).toBeInTheDocument();
    });
  });
});
