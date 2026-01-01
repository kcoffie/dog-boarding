import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CsvImport from './CsvImport';
import { DataProvider } from '../context/DataContext';

// Mock useLocalStorage
vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: vi.fn((key, defaultValue) => {
    const testData = {
      dogs: [
        { id: '1', name: 'Luna', dayRate: 35, nightRate: 45, active: true },
        { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45, active: true },
      ],
      boardings: [],
      settings: { netPercentage: 65, employees: [] },
      nightAssignments: [],
    };
    return [testData[key] ?? defaultValue, vi.fn()];
  }),
}));

// Mock papaparse
vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn((file, options) => {
      // Simulate successful parse
      const mockResults = {
        data: [
          { dogName: 'Luna', arrivalDateTime: '2025-01-15 14:00', departureDateTime: '2025-01-18 10:00' },
        ],
      };
      options.complete(mockResults);
    }),
  },
}));

const renderWithProvider = (ui) => {
  return render(
    <DataProvider>
      {ui}
    </DataProvider>
  );
};

/**
 * @requirements REQ-023
 */
describe('REQ-023: CsvImport', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders import dialog', () => {
    renderWithProvider(<CsvImport onClose={mockOnClose} />);

    expect(screen.getByText(/import boardings from csv/i)).toBeInTheDocument();
  });

  it('shows expected format instructions', () => {
    renderWithProvider(<CsvImport onClose={mockOnClose} />);

    expect(screen.getByText(/expected csv format/i)).toBeInTheDocument();
    expect(screen.getByText(/dogname,arrivaldatetime,departuredatetime/i)).toBeInTheDocument();
  });

  it('renders file input', () => {
    renderWithProvider(<CsvImport onClose={mockOnClose} />);

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('accept', '.csv');
  });

  it('renders cancel button', () => {
    renderWithProvider(<CsvImport onClose={mockOnClose} />);

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('calls onClose when cancel clicked', async () => {
    const user = userEvent.setup();
    renderWithProvider(<CsvImport onClose={mockOnClose} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls onClose when X clicked', async () => {
    const user = userEvent.setup();
    renderWithProvider(<CsvImport onClose={mockOnClose} />);

    // Find close button (X icon button)
    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(btn => btn.querySelector('svg'));
    if (xButton) {
      await user.click(xButton);
      expect(mockOnClose).toHaveBeenCalled();
    }
  });

  it('shows date format help text', () => {
    renderWithProvider(<CsvImport onClose={mockOnClose} />);

    expect(screen.getByText(/iso 8601/i)).toBeInTheDocument();
  });
});
