import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BoardingForm from './BoardingForm';
import { useData } from '../context/DataContext';

// Mock the useData hook
vi.mock('../context/DataContext', () => ({
  useData: vi.fn(),
}));

const mockDogs = [
  { id: '1', name: 'Luna', dayRate: 35, nightRate: 45, active: true },
  { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45, active: true },
];

const mockSettings = {
  netPercentage: 65,
  employees: [],
};

describe('BoardingForm', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useData.mockReturnValue({
      dogs: mockDogs,
      boardings: [],
      settings: mockSettings,
      getNetPercentageForDate: () => 65,
      getNightAssignment: () => '',
    });
  });

  it('renders form fields', () => {
    render(<BoardingForm onSave={mockOnSave} />);

    expect(screen.getByText(/^dog$/i)).toBeInTheDocument();
    expect(screen.getByText(/arrival date/i)).toBeInTheDocument();
    expect(screen.getByText(/arrival time/i)).toBeInTheDocument();
    expect(screen.getByText(/departure date/i)).toBeInTheDocument();
    expect(screen.getByText(/departure time/i)).toBeInTheDocument();
  });

  it('renders Add Boarding button', () => {
    render(<BoardingForm onSave={mockOnSave} />);
    expect(screen.getByRole('button', { name: /add boarding/i })).toBeInTheDocument();
  });

  it('renders Save Changes button when editing', () => {
    const existingBoarding = {
      id: '1',
      dogId: '1',
      arrivalDateTime: '2025-01-15T14:00:00',
      departureDateTime: '2025-01-18T10:00:00',
    };
    render(<BoardingForm boarding={existingBoarding} onSave={mockOnSave} />);
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('renders cancel button when onCancel provided', () => {
    render(<BoardingForm onSave={mockOnSave} onCancel={mockOnCancel} />);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('validates required dog selection', async () => {
    const user = userEvent.setup();
    const { container } = render(<BoardingForm onSave={mockOnSave} />);

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
    const { container } = render(<BoardingForm onSave={mockOnSave} />);

    // Only fill departure
    const dateInputs = container.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[1], '2025-01-18');
    await user.click(screen.getByRole('button', { name: /add boarding/i }));

    expect(screen.getByText(/arrival date is required/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates required departure date', async () => {
    const user = userEvent.setup();
    const { container } = render(<BoardingForm onSave={mockOnSave} />);

    // Only fill arrival
    const dateInputs = container.querySelectorAll('input[type="date"]');
    await user.type(dateInputs[0], '2025-01-15');
    await user.click(screen.getByRole('button', { name: /add boarding/i }));

    expect(screen.getByText(/departure date is required/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('validates departure after arrival', async () => {
    const user = userEvent.setup();
    const { container } = render(<BoardingForm onSave={mockOnSave} />);

    const dateInputs = container.querySelectorAll('input[type="date"]');

    await user.type(dateInputs[0], '2025-01-18');
    await user.type(dateInputs[1], '2025-01-15');
    await user.click(screen.getByRole('button', { name: /add boarding/i }));

    expect(screen.getByText(/departure must be after arrival/i)).toBeInTheDocument();
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('has default times set', () => {
    const { container } = render(<BoardingForm onSave={mockOnSave} />);

    const timeInputs = container.querySelectorAll('input[type="time"]');
    expect(timeInputs[0]).toHaveValue('14:00');
    expect(timeInputs[1]).toHaveValue('10:00');
  });
});
