import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BoardingForm from './BoardingForm';
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

const renderWithProvider = (ui) => {
  return render(
    <DataProvider>
      {ui}
    </DataProvider>
  );
};

// Helper to get inputs - date inputs come first, then time inputs
const getDateInputs = () => screen.getAllByRole('textbox').filter(i => i.type === 'date') || document.querySelectorAll('input[type="date"]');
const getTimeInputs = () => document.querySelectorAll('input[type="time"]');

describe('BoardingForm', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form fields', () => {
    renderWithProvider(<BoardingForm onSave={mockOnSave} />);

    expect(screen.getByText(/^dog$/i)).toBeInTheDocument();
    expect(screen.getByText(/arrival date/i)).toBeInTheDocument();
    expect(screen.getByText(/arrival time/i)).toBeInTheDocument();
    expect(screen.getByText(/departure date/i)).toBeInTheDocument();
    expect(screen.getByText(/departure time/i)).toBeInTheDocument();
  });

  it('renders Add Boarding button', () => {
    renderWithProvider(<BoardingForm onSave={mockOnSave} />);
    expect(screen.getByRole('button', { name: /add boarding/i })).toBeInTheDocument();
  });

  it('renders Save Changes button when editing', () => {
    const existingBoarding = {
      id: '1',
      dogId: '1',
      arrivalDateTime: '2025-01-15T14:00:00',
      departureDateTime: '2025-01-18T10:00:00',
    };
    renderWithProvider(<BoardingForm boarding={existingBoarding} onSave={mockOnSave} />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('renders cancel button when onCancel provided', () => {
    renderWithProvider(<BoardingForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('validates required dog selection', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProvider(<BoardingForm onSave={mockOnSave} />);

    // Fill dates but leave dog empty
    const dateInputs = container.querySelectorAll('input[type="date"]');

    await user.type(dateInputs[0], '2025-01-15');
    await user.type(dateInputs[1], '2025-01-18');
    await user.click(screen.getByRole('button', { name: /add boarding/i }));

    expect(screen.getByText(/please select a dog/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates required arrival date', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProvider(<BoardingForm onSave={mockOnSave} />);

    // Only fill departure
    const dateInputs = container.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[1], '2025-01-18');
    await user.click(screen.getByRole('button', { name: /add boarding/i }));

    expect(screen.getByText(/arrival date is required/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates required departure date', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProvider(<BoardingForm onSave={mockOnSave} />);

    // Only fill arrival
    const dateInputs = container.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[0], '2025-01-15');
    await user.click(screen.getByRole('button', { name: /add boarding/i }));

    expect(screen.getByText(/departure date is required/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates departure after arrival', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProvider(<BoardingForm onSave={mockOnSave} />);

    const dateInputs = container.querySelectorAll('input[type="date"]');

    await user.type(dateInputs[0], '2025-01-18');
    await user.type(dateInputs[1], '2025-01-15');
    await user.click(screen.getByRole('button', { name: /add boarding/i }));

    expect(screen.getByText(/departure must be after arrival/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('has default times set', () => {
    const { container } = renderWithProvider(<BoardingForm onSave={mockOnSave} />);

    const timeInputs = container.querySelectorAll('input[type="time"]');
    expect(timeInputs[0]).toHaveValue('14:00');
    expect(timeInputs[1]).toHaveValue('10:00');
  });
});
