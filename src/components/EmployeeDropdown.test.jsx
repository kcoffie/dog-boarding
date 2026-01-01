import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import EmployeeDropdown from './EmployeeDropdown';
import { useData } from '../context/DataContext';

vi.mock('../context/DataContext', () => ({
  useData: vi.fn(),
}));

describe('EmployeeDropdown', () => {
  const mockSettings = {
    employees: [
      { id: '1', name: 'Kate', active: true },
      { id: '2', name: 'Nick', active: true },
      { id: '3', name: 'Sam', active: false },
    ],
  };

  const mockSetNightAssignment = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
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
});
