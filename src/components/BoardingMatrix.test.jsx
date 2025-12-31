import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
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
    // Dog names may appear in both mobile and desktop views
    expect(screen.getAllByText('Luna').length).toBeGreaterThan(0);
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
    // Labels may appear in both mobile and desktop views
    expect(screen.getAllByText('Gross').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Net/).length).toBeGreaterThan(0);
  });

  it('renders employee row when employees exist', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    // Employee label may appear in both mobile and desktop views
    expect(screen.getAllByText('Employee').length).toBeGreaterThan(0);
  });

  it('renders legend', () => {
    renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
    // Legend appears in both mobile and desktop views
    expect(screen.getAllByText('Overnight').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Day only').length).toBeGreaterThan(0);
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
  // Dogs with names that sort differently: A, C, Z
  const mockDogsForSorting = [
    { id: '1', name: 'Charlie', dayRate: 35, nightRate: 45, active: true },
    { id: '2', name: 'Apollo', dayRate: 40, nightRate: 50, active: true },
    { id: '3', name: 'Zeus', dayRate: 30, nightRate: 40, active: true },
  ];

  // All three dogs have boardings in range, but different presence patterns
  // Apollo: overnight on Jan 15, 16
  // Charlie: overnight on Jan 16 only
  // Zeus: day-only on Jan 15, overnight on Jan 17
  const mockBoardingsForSorting = [
    { id: '1', dogId: '2', arrivalDateTime: '2025-01-15T14:00:00', departureDateTime: '2025-01-17T10:00:00' }, // Apollo: overnight 15, 16
    { id: '2', dogId: '1', arrivalDateTime: '2025-01-16T14:00:00', departureDateTime: '2025-01-18T10:00:00' }, // Charlie: overnight 16, 17
    { id: '3', dogId: '3', arrivalDateTime: '2025-01-15T08:00:00', departureDateTime: '2025-01-15T18:00:00' }, // Zeus: day-only Jan 15
    { id: '4', dogId: '3', arrivalDateTime: '2025-01-17T14:00:00', departureDateTime: '2025-01-19T10:00:00' }, // Zeus: overnight 17, 18
  ];

  const mockSettings = {
    netPercentage: 65,
    employees: [],
  };

  // Helper to get dog names in order from the table body
  const getDogNamesInOrder = () => {
    const table = document.querySelector('table');
    if (!table) return [];
    const tbody = table.querySelector('tbody');
    if (!tbody) return [];
    const rows = tbody.querySelectorAll('tr');
    return Array.from(rows).map(row => {
      // The name is in the second span (first is the avatar initial)
      const firstTd = row.querySelector('td');
      const spans = firstTd.querySelectorAll('span');
      // spans[0] is the avatar initial, spans[1] is the name
      return spans[1]?.textContent || '';
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useData.mockReturnValue({
      dogs: mockDogsForSorting,
      boardings: mockBoardingsForSorting,
      settings: mockSettings,
      getNetPercentageForDate: () => 65,
      getNightAssignment: () => '',
    });
  });

  describe('Dog name sorting', () => {
    it('renders sortable dog column header', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
      const dogHeader = screen.getByText('Dog');
      expect(dogHeader).toBeInTheDocument();
      expect(dogHeader.closest('th')).toHaveClass('cursor-pointer');
    });

    it('defaults to ascending alphabetical sort (A-Z)', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
      const dogNames = getDogNamesInOrder();
      expect(dogNames).toEqual(['Apollo', 'Charlie', 'Zeus']);
    });

    it('shows ascending arrow indicator by default', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);
      const dogHeader = screen.getByText('Dog').closest('th');
      expect(dogHeader.textContent).toContain('↑');
    });

    it('toggles to descending sort (Z-A) when clicking Dog header', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);

      const dogHeader = screen.getByText('Dog').closest('th');
      fireEvent.click(dogHeader);

      const dogNames = getDogNamesInOrder();
      expect(dogNames).toEqual(['Zeus', 'Charlie', 'Apollo']);
    });

    it('shows descending arrow after clicking Dog header', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);

      const dogHeader = screen.getByText('Dog').closest('th');
      fireEvent.click(dogHeader);

      expect(dogHeader.textContent).toContain('↓');
    });

    it('toggles back to ascending when clicking Dog header twice', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={7} />);

      const dogHeader = screen.getByText('Dog').closest('th');
      fireEvent.click(dogHeader); // Now Z-A
      fireEvent.click(dogHeader); // Back to A-Z

      const dogNames = getDogNamesInOrder();
      expect(dogNames).toEqual(['Apollo', 'Charlie', 'Zeus']);
    });
  });

  describe('Date column sorting', () => {
    it('defaults to oldest first (ascending dates)', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      // Get all date column headers
      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      // First 3 are Dog, Day, Night, then dates
      const dateHeaders = Array.from(headers).slice(3);
      const dates = dateHeaders.map(th => th.textContent).filter(t => t.includes('Jan'));

      // Should be in ascending order: Jan 15, Jan 16, Jan 17
      expect(dates[0]).toContain('Jan 15');
      expect(dates[1]).toContain('Jan 16');
      expect(dates[2]).toContain('Jan 17');
    });

    it('shows Oldest button only on first date column, not on other columns', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      // First date column should have Oldest button
      expect(screen.getByText('Oldest')).toBeInTheDocument();

      // Get all date column headers
      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const dateHeaders = Array.from(headers).slice(3); // Skip Dog, Day, Night

      // Only the first date column should contain Oldest
      expect(dateHeaders[0].textContent).toContain('Oldest');
      expect(dateHeaders[1].textContent).not.toContain('Oldest');
      expect(dateHeaders[2].textContent).not.toContain('Oldest');
    });

    it('reverses date order when clicking date sort button', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      const sortButton = screen.getByText('Oldest');
      fireEvent.click(sortButton);

      // Now should show Newest
      expect(screen.getByText('Newest')).toBeInTheDocument();

      // Get date headers - should be reversed
      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const dateHeaders = Array.from(headers).slice(3);
      const dates = dateHeaders.map(th => th.textContent).filter(t => t.includes('Jan'));

      // Should be in descending order: Jan 17, Jan 16, Jan 15
      expect(dates[0]).toContain('Jan 17');
      expect(dates[1]).toContain('Jan 16');
      expect(dates[2]).toContain('Jan 15');
    });

    it('toggles back to oldest first when clicking twice', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      const sortButton = screen.getByText('Oldest');
      fireEvent.click(sortButton);

      const newestButton = screen.getByText('Newest');
      fireEvent.click(newestButton);

      expect(screen.getByText('Oldest')).toBeInTheDocument();
    });
  });

  describe('Presence sorting by date column', () => {
    it('first column shows Oldest/Newest, other columns show Present when clicked', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const dateHeaders = Array.from(headers).slice(3); // Skip Dog, Day, Night
      const jan15Header = dateHeaders[0]; // First date column
      const jan16Header = dateHeaders[1]; // Second date column
      const jan17Header = dateHeaders[2]; // Third date column

      // Initially: first column has Oldest, others have nothing special
      expect(jan15Header.textContent).toContain('Oldest');
      expect(jan16Header.textContent).not.toContain('Present');
      expect(jan17Header.textContent).not.toContain('Present');

      // Click the second date column (Jan 16)
      fireEvent.click(jan16Header);

      // Now: first column still has Oldest, second column shows Present
      expect(jan15Header.textContent).toContain('Oldest');
      expect(jan16Header.textContent).toContain('Present');
      expect(jan17Header.textContent).not.toContain('Present');

      // Click the third date column (Jan 17)
      fireEvent.click(jan17Header);

      // Now: first column still has Oldest, third column shows Present, second doesn't
      expect(jan15Header.textContent).toContain('Oldest');
      expect(jan16Header.textContent).not.toContain('Present');
      expect(jan17Header.textContent).toContain('Present');
    });

    it('clicking first date column activates presence sort and hides Oldest button', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const jan15Header = Array.from(headers).find(th => th.textContent.includes('Jan 15'));

      // Initially has Oldest button
      expect(jan15Header.textContent).toContain('Oldest');

      // Click to activate presence sort
      fireEvent.click(jan15Header);

      // Now shows Present instead of Oldest
      expect(jan15Header.textContent).toContain('Present');
      expect(jan15Header.textContent).not.toContain('Oldest');
    });

    it('clicking a date column activates presence sort', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      // Find Jan 16 header (second date column) and click it
      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const jan16Header = Array.from(headers).find(th => th.textContent.includes('Jan 16'));

      fireEvent.click(jan16Header);

      // Should show active sort indicator
      expect(jan16Header.textContent).toContain('Present');
    });

    it('sorts dogs by presence on clicked date (present first)', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      // On Jan 15: Apollo=overnight, Zeus=day-only, Charlie=empty
      // Presence values: overnight=1, day-only=2, empty=0
      // desc sort (present first) should be: Zeus (2), Apollo (1), Charlie (0)

      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const jan15Header = Array.from(headers).find(th => th.textContent.includes('Jan 15'));

      fireEvent.click(jan15Header);

      const dogNames = getDogNamesInOrder();
      // desc = present first: day-only (2) > overnight (1) > empty (0)
      expect(dogNames).toEqual(['Zeus', 'Apollo', 'Charlie']);
    });

    it('toggles presence sort direction when clicking same date again', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const jan15Header = Array.from(headers).find(th => th.textContent.includes('Jan 15'));

      fireEvent.click(jan15Header); // Present first
      fireEvent.click(jan15Header); // Empty first

      // Should show Empty indicator
      expect(jan15Header.textContent).toContain('Empty');

      const dogNames = getDogNamesInOrder();
      // asc = empty first: empty (0) < overnight (1) < day-only (2)
      expect(dogNames).toEqual(['Charlie', 'Apollo', 'Zeus']);
    });

    it('switches to different date when clicking another date column', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const jan15Header = Array.from(headers).find(th => th.textContent.includes('Jan 15'));
      const jan16Header = Array.from(headers).find(th => th.textContent.includes('Jan 16'));

      fireEvent.click(jan15Header);
      fireEvent.click(jan16Header);

      // Jan 16 should now be active, Jan 15 should not
      expect(jan16Header.textContent).toContain('Present');
      expect(jan15Header.textContent).not.toContain('Present');

      // On Jan 16: Apollo=overnight, Charlie=overnight, Zeus=empty
      // desc (present first): Apollo, Charlie (alphabetically), Zeus
      const dogNames = getDogNamesInOrder();
      expect(dogNames).toEqual(['Apollo', 'Charlie', 'Zeus']);
    });

    it('clears presence sort when clicking Dog header', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const jan15Header = Array.from(headers).find(th => th.textContent.includes('Jan 15'));
      const dogHeader = screen.getByText('Dog').closest('th');

      fireEvent.click(jan15Header); // Activate presence sort
      fireEvent.click(dogHeader); // Clear presence sort

      // Should no longer show Present indicator
      expect(jan15Header.textContent).not.toContain('Present');

      // Should be back to alphabetical
      const dogNames = getDogNamesInOrder();
      // After clicking Dog header, it toggles - was asc, now desc
      expect(dogNames).toEqual(['Zeus', 'Charlie', 'Apollo']);
    });

    it('shows A-Z hint on Dog header when presence sort is active', () => {
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const jan15Header = Array.from(headers).find(th => th.textContent.includes('Jan 15'));
      const dogHeader = screen.getByText('Dog').closest('th');

      fireEvent.click(jan15Header); // Activate presence sort

      // Dog header should show A-Z hint instead of arrow
      expect(dogHeader.textContent).toContain('A-Z');
    });
  });

  describe('Sorting with ties', () => {
    it('falls back to alphabetical sort for dogs with same presence', () => {
      // Use days=3 so all dogs are included (Zeus has presence on Jan 15 and 17)
      renderWithProviders(<BoardingMatrix startDate="2025-01-15" days={3} />);

      // On Jan 16: Apollo=overnight, Charlie=overnight (both present equally), Zeus=empty
      // Should fall back to alphabetical within the same presence level

      const table = document.querySelector('table');
      const headers = table.querySelectorAll('thead th');
      const jan16Header = Array.from(headers).find(th => th.textContent.includes('Jan 16'));

      fireEvent.click(jan16Header);

      const dogNames = getDogNamesInOrder();
      // Apollo and Charlie both overnight (1), Zeus empty (0)
      // desc: overnight first, then alphabetically
      expect(dogNames[0]).toBe('Apollo'); // First alphabetically among overnight
      expect(dogNames[1]).toBe('Charlie'); // Second alphabetically among overnight
      expect(dogNames[2]).toBe('Zeus'); // Empty last
    });
  });
});
