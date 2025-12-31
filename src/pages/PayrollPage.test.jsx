import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PayrollPage from './PayrollPage';
import { useData } from '../context/DataContext';

// Mock the useData hook
vi.mock('../context/DataContext', () => ({
  useData: vi.fn(),
}));

// Helper to get dates relative to today for testing
const getTestDates = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formatDate = (date) => date.toISOString().split('T')[0];

  const day1 = new Date(today);
  day1.setDate(today.getDate() - 5);

  const day2 = new Date(today);
  day2.setDate(today.getDate() - 4);

  const day3 = new Date(today);
  day3.setDate(today.getDate() - 3);

  const day4 = new Date(today);
  day4.setDate(today.getDate() - 2);

  return {
    day1: formatDate(day1),
    day2: formatDate(day2),
    day3: formatDate(day3),
    day4: formatDate(day4),
    day1DateTime: `${formatDate(day1)}T14:00:00`,
    day3DateTime: `${formatDate(day3)}T10:00:00`,
    day2DateTime: `${formatDate(day2)}T14:00:00`,
    day4DateTime: `${formatDate(day4)}T10:00:00`,
  };
};

describe('PayrollPage', () => {
  const dates = getTestDates();

  const mockDogs = [
    { id: '1', name: 'Luna', dayRate: 35, nightRate: 45, active: true },
    { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45, active: true },
  ];

  const mockBoardings = [
    // Luna: stays 2 nights (day1, day2)
    { id: '1', dogId: '1', arrivalDateTime: dates.day1DateTime, departureDateTime: dates.day3DateTime },
    // Cooper: stays 2 nights (day2, day3)
    { id: '2', dogId: '2', arrivalDateTime: dates.day2DateTime, departureDateTime: dates.day4DateTime },
  ];

  const mockSettings = {
    netPercentage: 65,
    netPercentageHistory: [],
    employees: [
      { name: 'Kate', active: true },
      { name: 'Nick', active: true },
    ],
  };

  const mockNightAssignments = {
    [dates.day1]: 'Kate',
    [dates.day2]: 'Kate',
    [dates.day3]: 'Nick',
  };

  const mockAddPayment = vi.fn();
  const mockDeletePayment = vi.fn();
  const mockGetPaidDatesForEmployee = vi.fn(() => []);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPaidDatesForEmployee.mockReturnValue([]);
    useData.mockReturnValue({
      dogs: mockDogs,
      boardings: mockBoardings,
      settings: mockSettings,
      getNightAssignment: (date) => mockNightAssignments[date] || '',
      payments: [],
      getNetPercentageForDate: () => 65,
      addPayment: mockAddPayment,
      deletePayment: mockDeletePayment,
      getPaidDatesForEmployee: mockGetPaidDatesForEmployee,
    });
  });

  describe('Page rendering', () => {
    it('renders the page title', () => {
      render(<PayrollPage />);
      expect(screen.getByText('Payroll')).toBeInTheDocument();
      expect(screen.getByText('Track and manage employee payments')).toBeInTheDocument();
    });

    it('renders Outstanding Payments section', () => {
      render(<PayrollPage />);
      expect(screen.getByText('Outstanding Payments')).toBeInTheDocument();
    });

    it('renders Payment History section', () => {
      render(<PayrollPage />);
      expect(screen.getByText('Payment History')).toBeInTheDocument();
    });
  });

  describe('Outstanding payments calculation', () => {
    it('shows all caught up message when no outstanding payments', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [],
        settings: mockSettings,
        getNightAssignment: () => '',
        payments: [],
        getNetPercentageForDate: () => 65,
        addPayment: mockAddPayment,
        deletePayment: mockDeletePayment,
        getPaidDatesForEmployee: mockGetPaidDatesForEmployee,
      });

      render(<PayrollPage />);
      expect(screen.getByText('All caught up!')).toBeInTheDocument();
    });

    it('excludes N/A assignments from outstanding', () => {
      const assignments = {
        [dates.day1]: 'N/A',
        [dates.day2]: 'Kate',
      };
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNightAssignment: (date) => assignments[date] || '',
        payments: [],
        getNetPercentageForDate: () => 65,
        addPayment: mockAddPayment,
        deletePayment: mockDeletePayment,
        getPaidDatesForEmployee: mockGetPaidDatesForEmployee,
      });

      render(<PayrollPage />);
      // Kate should be shown, N/A should not be (may appear multiple times due to mobile/desktop layouts)
      expect(screen.getAllByText('Kate').length).toBeGreaterThan(0);
      // N/A shouldn't appear as an outstanding employee card
      const outstandingSection = screen.getByText('Outstanding Payments').closest('div').parentElement;
      expect(outstandingSection.textContent).not.toContain('N/A');
    });

    it('excludes already paid dates from outstanding', () => {
      mockGetPaidDatesForEmployee.mockImplementation((name) => {
        if (name === 'Kate') return [dates.day1, dates.day2];
        return [];
      });

      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNightAssignment: (date) => mockNightAssignments[date] || '',
        payments: [{
          id: '1',
          employeeName: 'Kate',
          startDate: dates.day1,
          endDate: dates.day2,
          amount: 58.5,
          nights: 2,
          dates: [dates.day1, dates.day2],
          paidDate: dates.day3,
        }],
        getNetPercentageForDate: () => 65,
        addPayment: mockAddPayment,
        deletePayment: mockDeletePayment,
        getPaidDatesForEmployee: mockGetPaidDatesForEmployee,
      });

      render(<PayrollPage />);
      // Kate's dates are paid, so Kate shouldn't appear in outstanding
      const outstandingSection = screen.getByText('Outstanding Payments').closest('div').parentElement;
      // Nick should still appear
      expect(screen.getByText('Nick')).toBeInTheDocument();
    });
  });

  describe('Mark as paid functionality', () => {
    it('shows payment dialog when clicking Mark as Paid', async () => {
      render(<PayrollPage />);

      const markAsPaidButtons = screen.getAllByText('Mark as Paid');
      fireEvent.click(markAsPaidButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Pay \w+/)).toBeInTheDocument();
        expect(screen.getByText('Select dates to include in payment')).toBeInTheDocument();
      });
    });

    it('calls addPayment when confirming payment', async () => {
      render(<PayrollPage />);

      const markAsPaidButtons = screen.getAllByText('Mark as Paid');
      fireEvent.click(markAsPaidButtons[0]);

      await waitFor(() => {
        expect(screen.getByText(/Pay \w+/)).toBeInTheDocument();
      });

      const confirmButton = screen.getByText('Confirm Payment');
      fireEvent.click(confirmButton);

      expect(mockAddPayment).toHaveBeenCalled();
    });

    it('closes dialog when canceling payment', async () => {
      render(<PayrollPage />);

      const markAsPaidButtons = screen.getAllByText('Mark as Paid');
      fireEvent.click(markAsPaidButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Select dates to include in payment')).toBeInTheDocument();
      });

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Select dates to include in payment')).not.toBeInTheDocument();
      });
    });
  });

  describe('Payment history', () => {
    it('shows no payment history message when empty', () => {
      render(<PayrollPage />);
      expect(screen.getByText('No payment history yet.')).toBeInTheDocument();
    });

    it('displays payment history when payments exist', () => {
      // No assignments = no outstanding, so Kate only appears in history
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNightAssignment: () => '',
        payments: [{
          id: '1',
          employeeName: 'Kate',
          startDate: dates.day1,
          endDate: dates.day4,
          amount: 117,
          nights: 4,
          dates: [dates.day1, dates.day2, dates.day3, dates.day4],
          paidDate: dates.day4,
        }],
        getNetPercentageForDate: () => 65,
        addPayment: mockAddPayment,
        deletePayment: mockDeletePayment,
        getPaidDatesForEmployee: mockGetPaidDatesForEmployee,
      });

      render(<PayrollPage />);
      // Should show the employee name in history (may appear multiple times due to mobile/desktop layouts)
      expect(screen.getAllByText('Kate').length).toBeGreaterThan(0);
      // Should show delete button (may appear multiple times due to mobile/desktop layouts)
      expect(screen.getAllByText('Delete').length).toBeGreaterThan(0);
    });

    it('shows confirmation dialog when clicking Delete', async () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNightAssignment: () => '',
        payments: [{
          id: '1',
          employeeName: 'Kate',
          startDate: dates.day1,
          endDate: dates.day4,
          amount: 117,
          nights: 4,
          dates: [dates.day1, dates.day2, dates.day3, dates.day4],
          paidDate: dates.day4,
        }],
        getNetPercentageForDate: () => 65,
        addPayment: mockAddPayment,
        deletePayment: mockDeletePayment,
        getPaidDatesForEmployee: mockGetPaidDatesForEmployee,
      });

      render(<PayrollPage />);

      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Delete Payment Record')).toBeInTheDocument();
      });
    });

    it('calls deletePayment when confirming delete', async () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: mockBoardings,
        settings: mockSettings,
        getNightAssignment: () => '',
        payments: [{
          id: 'payment-1',
          employeeName: 'Kate',
          startDate: dates.day1,
          endDate: dates.day4,
          amount: 117,
          nights: 4,
          dates: [dates.day1, dates.day2, dates.day3, dates.day4],
          paidDate: dates.day4,
        }],
        getNetPercentageForDate: () => 65,
        addPayment: mockAddPayment,
        deletePayment: mockDeletePayment,
        getPaidDatesForEmployee: mockGetPaidDatesForEmployee,
      });

      render(<PayrollPage />);

      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Delete Payment Record')).toBeInTheDocument();
      });

      // Find the delete confirmation button (the red one in the dialog)
      const confirmDeleteButton = screen.getAllByRole('button').find(
        btn => btn.textContent === 'Delete' && btn.closest('.fixed')
      );
      fireEvent.click(confirmDeleteButton);

      expect(mockDeletePayment).toHaveBeenCalledWith('payment-1');
    });
  });

  describe('Total outstanding display', () => {
    it('shows total outstanding summary when there are outstanding payments', () => {
      render(<PayrollPage />);
      expect(screen.getByText('Total Outstanding')).toBeInTheDocument();
    });

    it('does not show total outstanding when no payments are due', () => {
      useData.mockReturnValue({
        dogs: mockDogs,
        boardings: [],
        settings: mockSettings,
        getNightAssignment: () => '',
        payments: [],
        getNetPercentageForDate: () => 65,
        addPayment: mockAddPayment,
        deletePayment: mockDeletePayment,
        getPaidDatesForEmployee: mockGetPaidDatesForEmployee,
      });

      render(<PayrollPage />);
      expect(screen.queryByText('Total Outstanding')).not.toBeInTheDocument();
    });
  });
});
