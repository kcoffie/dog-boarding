import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import BoardingMatrix from './BoardingMatrix';
import { useData } from '../context/DataContext';
import { BrowserRouter } from 'react-router-dom';

// Mock the useData hook
vi.mock('../context/DataContext', () => ({
  useData: vi.fn(),
}));

const renderWithProviders = (ui) => {
  return render(
    <BrowserRouter>
      {ui}
    </BrowserRouter>
  );
};

describe('BoardingMatrix', () => {
  const mockDogs = [
    { id: '1', name: 'Luna', dayRate: 35, nightRate: 45, active: true },
    { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45, active: true },
  ];

  const mockBoardings = [
    { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-18T10:00:00' },
  ];

  const mockSettings = {
    netPercentage: 65,
    employees: ['Kate', 'Nick'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useData.mockReturnValue({
      dogs: mockDogs,
      boardings: mockBoardings,
      settings: mockSettings,
      getNetPercentageForDate: () => 65,
      getNightAssignment: () => '',
    });
  });

  it('renders dog names', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    expect(screen.getByText('Luna')).toBeInTheDocument();
  });

  it('renders date columns', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    // Should show date column headers - may appear multiple times
    expect(screen.getAllByText('Jan 15').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jan 16').length).toBeGreaterThan(0);
  });

  it('renders rate columns', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    // Luna has day rate 35 and night rate 45
    expect(screen.getAllByText('$35').length).toBeGreaterThan(0); // Luna's day rate
    expect(screen.getAllByText('$45').length).toBeGreaterThan(0); // Luna's night rate
  });

  it('renders gross and net labels', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    expect(screen.getByText('Gross')).toBeInTheDocument();
    expect(screen.getByText(/Net/)).toBeInTheDocument();
  });

  it('renders employee row when employees exist', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    expect(screen.getByText('Employee')).toBeInTheDocument();
  });

  it('renders legend', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    expect(screen.getByText('Overnight')).toBeInTheDocument();
    expect(screen.getByText('Day only')).toBeInTheDocument();
  });
});

describe('BoardingMatrix empty states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows message when no dogs', () => {
    useData.mockReturnValue({
      dogs: [],
      boardings: [],
      settings: { netPercentage: 65, employees: [] },
      getNetPercentageForDate: () => 65,
      getNightAssignment: () => '',
    });

    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    expect(screen.getByText('No dogs yet')).toBeInTheDocument();
  });
});

describe('BoardingMatrix sorting', () => {
  const mockDogs = [
    { id: '1', name: 'Luna', dayRate: 35, nightRate: 45, active: true },
    { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45, active: true },
  ];

  const mockBoardings = [
    { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-18T10:00:00' },
  ];

  const mockSettings = {
    netPercentage: 65,
    employees: ['Kate', 'Nick'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useData.mockReturnValue({
      dogs: mockDogs,
      boardings: mockBoardings,
      settings: mockSettings,
      getNetPercentageForDate: () => 65,
      getNightAssignment: () => '',
    });
  });

  it('renders sortable dog column header', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);

    // Dog header should be clickable
    const dogHeader = screen.getByText('Dog');
    expect(dogHeader).toBeInTheDocument();
    expect(dogHeader.closest('th')).toHaveClass('cursor-pointer');
  });
});
