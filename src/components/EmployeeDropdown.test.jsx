import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import EmployeeDropdown from './EmployeeDropdown';
import { useData } from '../context/DataContext';

vi.mock('../context/DataContext', () => ({
  useData: vi.fn(),
}));

/**
 * @requirements REQ-033
 */
describe('REQ-033: EmployeeDropdown', () => {
  const mockSettings = {
    employees: [
      { id: '1', name: 'Kate', active: true },
      { id: '2', name: 'Nick', active: true },
      { id: '3', name: 'Sam', active: false },
    ],
  };

  const mockSetNightAssignment = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetNightAssignment.mockResolvedValue(undefined);
    useData.mockReturnValue({
      settings: mockSettings,
      getNightAssignment: () => '',
      setNightAssignment: mockSetNightAssignment,
    });
  });

  it('renders dropdown with empty option', () => {
    render(<EmployeeDropdown date="2025-01-15" />);

    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders N/A option', () => {
    render(<EmployeeDropdown date="2025-01-15" />);

    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('renders only active employees', () => {
    render(<EmployeeDropdown date="2025-01-15" />);

    expect(screen.getByText('Kate')).toBeInTheDocument();
    expect(screen.getByText('Nick')).toBeInTheDocument();
    // Sam is inactive, should not appear
    expect(screen.queryByText('Sam')).not.toBeInTheDocument();
  });

  it('calls setNightAssignment when selecting an employee', async () => {
    render(<EmployeeDropdown date="2025-01-15" />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Kate' } });

    expect(mockSetNightAssignment).toHaveBeenCalledWith('2025-01-15', 'Kate');
  });

  it('calls setNightAssignment when selecting N/A', async () => {
    render(<EmployeeDropdown date="2025-01-15" />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'N/A' } });

    expect(mockSetNightAssignment).toHaveBeenCalledWith('2025-01-15', 'N/A');
  });

  it('shows currently selected employee', () => {
    useData.mockReturnValue({
      settings: mockSettings,
      getNightAssignment: () => 'Kate',
      setNightAssignment: mockSetNightAssignment,
    });

    render(<EmployeeDropdown date="2025-01-15" />);

    const select = screen.getByRole('combobox');
    expect(select).toHaveValue('Kate');
  });

  it('includes inactive employee if currently selected', () => {
    useData.mockReturnValue({
      settings: mockSettings,
      getNightAssignment: () => 'Sam', // Sam is inactive but selected
      setNightAssignment: mockSetNightAssignment,
    });

    render(<EmployeeDropdown date="2025-01-15" />);

    // Sam should appear in options because they're currently selected
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('shows error state when setNightAssignment fails', async () => {
    mockSetNightAssignment.mockRejectedValueOnce(new Error('Employee not found'));

    render(<EmployeeDropdown date="2025-01-15" />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Kate' } });

    await waitFor(() => {
      // Should show error styling (red border)
      expect(select.className).toContain('border-red-500');
    });
  });

  it('disables dropdown while saving', async () => {
    // Make the mock take some time to resolve
    let resolvePromise;
    mockSetNightAssignment.mockImplementationOnce(() => new Promise(resolve => {
      resolvePromise = resolve;
    }));

    render(<EmployeeDropdown date="2025-01-15" />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Kate' } });

    // Should be disabled while saving
    await waitFor(() => {
      expect(select).toBeDisabled();
    });

    // Resolve the promise
    resolvePromise();

    // Should be enabled after saving
    await waitFor(() => {
      expect(select).not.toBeDisabled();
    });
  });

  it('clears error state after timeout', async () => {
    vi.useFakeTimers();
    mockSetNightAssignment.mockRejectedValueOnce(new Error('Test error'));

    render(<EmployeeDropdown date="2025-01-15" />);

    const select = screen.getByRole('combobox');

    // Fire the change event and wait for async handler
    await act(async () => {
      fireEvent.change(select, { target: { value: 'Kate' } });
      // Let the promise rejection propagate
      await Promise.resolve();
      await Promise.resolve();
    });

    // Verify error state is shown
    expect(select.className).toContain('border-red-500');

    // Fast-forward 3 seconds and flush state updates
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Error should be cleared
    expect(select.className).not.toContain('border-red-500');

    vi.useRealTimers();
  });
});
