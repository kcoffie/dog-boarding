import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import EmployeeDropdown from '../components/EmployeeDropdown';
import PayrollPage from '../pages/PayrollPage';
import SettingsPage from '../pages/SettingsPage';
import { useData } from '../context/DataContext';
import { NIGHT_PAID_MESSAGE, EMPLOYEE_HAS_PAYMENTS_MESSAGE } from '../utils/paidNights';

vi.mock('../context/DataContext', () => ({ useData: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' }, updatePassword: vi.fn() }) }));
vi.mock('../hooks/useCronHealth', () => ({ useCronHealth: () => ({ cronHealth: [], loading: false }) }));
vi.mock('../components/SiteAccessCard', () => ({ default: () => null }));
vi.mock('../components/SyncSettings', () => ({ default: () => null }));

/**
 * #389: a paid night is locked on screen; deleted payments are history; an employee with payments
 * can only be deactivated. Expected text from the issue's rules.
 * @requirements REQ-033, REQ-041, REQ-042, REQ-051
 */
describe('REQ-033, REQ-041, REQ-042, REQ-051: paid nights on screen (#389)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('the night dropdown', () => {
    const employees = [{ id: 'e1', name: 'Avery', active: true }, { id: 'e2', name: 'Blake', active: true }];
    const data = (over = {}) => ({
      settings: { employees },
      getNightAssignment: () => 'Avery',
      getWorkedFollowingDay: () => null,
      getNightPayment: () => null,
      setNightAssignment: vi.fn().mockResolvedValue(undefined),
      setWorkedFollowingDay: vi.fn().mockResolvedValue(undefined),
      ...over,
    });

    it('a paid night shows who and "Paid" with the date, and no dropdown or checkbox', () => {
      useData.mockReturnValue(data({ getNightPayment: () => ({ employeeName: 'Avery', paidDate: '2026-11-06' }) }));
      render(<EmployeeDropdown date="2026-11-02" />);
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.getByText('Avery')).toBeInTheDocument();
      expect(screen.getByText('Paid Nov 6')).toBeInTheDocument();
      expect(screen.getByTitle(NIGHT_PAID_MESSAGE)).toBeInTheDocument();
    });

    it('a paid night with "worked following day" says so as text', () => {
      useData.mockReturnValue(data({
        getNightPayment: () => ({ employeeName: 'Avery', paidDate: '2026-11-06' }),
        getWorkedFollowingDay: () => true,
      }));
      render(<EmployeeDropdown date="2026-11-02" />);
      expect(screen.getByText('Day boarding Tue, 11/3')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('a paid night without "worked following day" shows no day-boarding line', () => {
      useData.mockReturnValue(data({ getNightPayment: () => ({ employeeName: 'Avery', paidDate: '2026-11-06' }) }));
      render(<EmployeeDropdown date="2026-11-02" />);
      expect(screen.queryByText(/Day boarding/)).not.toBeInTheDocument();
    });

    it('an unpaid night keeps its dropdown and checkbox', () => {
      useData.mockReturnValue(data());
      render(<EmployeeDropdown date="2026-11-02" />);
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByRole('checkbox')).toBeInTheDocument();
      expect(screen.queryByText(/^Paid /)).not.toBeInTheDocument();
    });

    it('a refused reassignment shows why', async () => {
      useData.mockReturnValue(data({ setNightAssignment: vi.fn().mockRejectedValue(new Error(NIGHT_PAID_MESSAGE)) }));
      render(<EmployeeDropdown date="2026-11-02" />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Blake' } });
      expect((await screen.findByRole('alert')).textContent).toBe(NIGHT_PAID_MESSAGE);
    });

    it('a refused "worked following day" tick shows why (it used to fail silently)', async () => {
      useData.mockReturnValue(data({ setWorkedFollowingDay: vi.fn().mockRejectedValue(new Error(NIGHT_PAID_MESSAGE)) }));
      render(<EmployeeDropdown date="2026-11-02" />);
      fireEvent.click(screen.getByRole('checkbox'));
      expect((await screen.findByRole('alert')).textContent).toBe(NIGHT_PAID_MESSAGE);
    });
  });

  describe('Settings: deleting an employee', () => {
    const data = (over = {}) => ({
      settings: { netPercentage: 65, employees: [{ id: 'e1', name: 'Avery', active: true }, { id: 'e2', name: 'Blake', active: true }] },
      settingsLoading: false,
      sortEmployees: vi.fn(),
      nightAssignments: [],
      toggleEmployeeActive: vi.fn(),
      deleteEmployee: vi.fn().mockResolvedValue(undefined),
      employeeHasPayments: (name) => name === 'Avery',
      ...over,
    });
    const rowOf = (name) => screen.getByText(name).closest('li');

    it('an employee with payments has no Delete, says why, and can still be deactivated', () => {
      useData.mockReturnValue(data());
      render(<BrowserRouter><SettingsPage /></BrowserRouter>);
      const row = rowOf('Avery');
      expect(within(row).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(within(row).getByText('Has payments: deactivate instead')).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
    });

    it('an employee with no payments can be deleted', () => {
      useData.mockReturnValue(data());
      render(<BrowserRouter><SettingsPage /></BrowserRouter>);
      expect(within(rowOf('Blake')).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(within(rowOf('Blake')).queryByText('Has payments: deactivate instead')).not.toBeInTheDocument();
    });

    it('a refused delete shows why instead of failing silently', async () => {
      const deleteEmployee = vi.fn().mockRejectedValue(new Error(EMPLOYEE_HAS_PAYMENTS_MESSAGE));
      useData.mockReturnValue(data({ deleteEmployee }));
      render(<BrowserRouter><SettingsPage /></BrowserRouter>);
      fireEvent.click(within(rowOf('Blake')).getByRole('button', { name: 'Delete' }));
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1));
      await waitFor(() => expect(deleteEmployee).toHaveBeenCalledWith('Blake'));
      expect((await screen.findByRole('alert')).textContent).toBe(EMPLOYEE_HAS_PAYMENTS_MESSAGE);
    });
  });

  describe('Payroll: deleted payments are history', () => {
    const live = { id: 'p1', employeeId: 'e1', employeeName: 'Avery', amount: 65, nights: 1, dates: ['2026-11-02'], paidDate: '2026-11-06' };
    const deleted = {
      id: 'p2', employeeId: 'e2', employeeName: 'Blake', amount: 40, nights: 1, dates: ['2026-11-04'], paidDate: '2026-11-05',
      // 01:00 UTC on 11-07 is 5:00 PM on 11-06 in San Francisco.
      deletedAt: '2026-11-07T01:00:00Z', deletedByEmail: 'admin@example.com', deleteNote: 'paid the wrong person',
    };
    const data = (over = {}) => ({
      dogs: [],
      boardings: [],
      payments: [live],
      deletedPayments: [deleted],
      nightAssignments: [],
      getNetPercentageForDate: () => 65,
      getNightAssignment: () => '',
      addPayment: vi.fn().mockResolvedValue(undefined),
      deletePayment: vi.fn().mockResolvedValue(undefined),
      ...over,
    });

    it('deleted payments are hidden until "Show deleted" is ticked', () => {
      useData.mockReturnValue(data());
      render(<PayrollPage />);
      expect(screen.queryByText(/admin@example\.invalid/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Show deleted (1)' }));
      expect(screen.getAllByText('Deleted Nov 6, 5:00 PM by admin@example.com: paid the wrong person').length).toBeGreaterThan(0);
    });

    it('a deleted payment is struck through and has no Delete', () => {
      useData.mockReturnValue(data({ payments: [] }));
      render(<PayrollPage />);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Show deleted (1)' }));
      const rows = screen.getAllByTestId('deleted-payment');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.querySelector('.line-through')).not.toBeNull();
        expect(within(row).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
      }
    });

    it('a deleted payment with no note shows who and when only', () => {
      useData.mockReturnValue(data({ deletedPayments: [{ ...deleted, deleteNote: null }] }));
      render(<PayrollPage />);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Show deleted (1)' }));
      expect(screen.getAllByText('Deleted Nov 6, 5:00 PM by admin@example.com').length).toBeGreaterThan(0);
    });

    it('with no deleted payments there is no toggle', () => {
      useData.mockReturnValue(data({ deletedPayments: [] }));
      render(<PayrollPage />);
      expect(screen.queryByRole('checkbox', { name: /Show deleted/ })).not.toBeInTheDocument();
    });

    it('deleted payments count in no total: the history shows the live payment only', () => {
      useData.mockReturnValue(data());
      render(<PayrollPage />);
      expect(screen.getAllByText('$65.00').length).toBeGreaterThan(0);
      expect(screen.queryByText('$40.00')).not.toBeInTheDocument();
    });

    it('Delete asks for an optional note and sends it', async () => {
      const d = data();
      useData.mockReturnValue(d);
      render(<PayrollPage />);
      fireEvent.click(screen.getAllByText(/^Delete( Payment)?$/)[0]);
      fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'wrong night' } });
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1));
      await waitFor(() => expect(d.deletePayment).toHaveBeenCalledWith('p1', 'wrong night'));
    });

    it('the delete box says the payment is kept as history', () => {
      useData.mockReturnValue(data());
      render(<PayrollPage />);
      fireEvent.click(screen.getAllByText(/^Delete( Payment)?$/)[0]);
      expect(screen.getByText(
        'Delete payment of $65.00 to Avery? Its nights become unpaid and can be paid again. The payment stays in the history, marked deleted.',
      )).toBeInTheDocument();
    });
  });

  describe('Payroll: a payment carries the nights priced with "worked following day" (Q3)', () => {
    const iso = (daysBack) => {
      const d = new Date();
      d.setDate(d.getDate() - daysBack);
      return d.toISOString().slice(0, 10);
    };
    const night = iso(5);

    it('a ticked night is sent in followingDayNights', async () => {
      const addPayment = vi.fn().mockResolvedValue(undefined);
      useData.mockReturnValue({
        dogs: [{ id: '1', name: 'Luna', nightRate: 100, dayRate: 0, active: true }],
        boardings: [{ id: 'b1', dogId: '1', arrivalDateTime: `${iso(5)}T14:00:00Z`, departureDateTime: `${iso(4)}T10:00:00Z` }],
        payments: [],
        deletedPayments: [],
        nightAssignments: [{ id: 'n1', date: night, employeeId: 'e1', workedFollowingDay: true }],
        getNetPercentageForDate: () => 65,
        getNightAssignment: (date) => (date === night ? 'Avery' : ''),
        addPayment,
        deletePayment: vi.fn(),
      });
      render(<PayrollPage />);
      fireEvent.click(screen.getByText('Mark as Paid'));
      fireEvent.click(screen.getByText('Confirm Payment'));
      await waitFor(() => expect(addPayment).toHaveBeenCalledTimes(1));
      expect(addPayment.mock.calls[0][0].followingDayNights).toEqual([night]);
    });

    it('an unticked night is not', async () => {
      const addPayment = vi.fn().mockResolvedValue(undefined);
      useData.mockReturnValue({
        dogs: [{ id: '1', name: 'Luna', nightRate: 100, dayRate: 0, active: true }],
        boardings: [{ id: 'b1', dogId: '1', arrivalDateTime: `${iso(5)}T14:00:00Z`, departureDateTime: `${iso(4)}T10:00:00Z` }],
        payments: [],
        deletedPayments: [],
        nightAssignments: [{ id: 'n1', date: night, employeeId: 'e1', workedFollowingDay: null }],
        getNetPercentageForDate: () => 65,
        getNightAssignment: (date) => (date === night ? 'Avery' : ''),
        addPayment,
        deletePayment: vi.fn(),
      });
      render(<PayrollPage />);
      fireEvent.click(screen.getByText('Mark as Paid'));
      fireEvent.click(screen.getByText('Confirm Payment'));
      await waitFor(() => expect(addPayment).toHaveBeenCalledTimes(1));
      expect(addPayment.mock.calls[0][0].followingDayNights).toEqual([]);
    });
  });
});
