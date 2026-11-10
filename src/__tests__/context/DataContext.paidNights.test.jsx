import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Each hook is a fake with spies; the hooks themselves have their own tests.
const h = vi.hoisted(() => ({
  employees: [],
  payments: [],
  deletedPayments: [],
  deleteEmployee: null,
  deleteAssignmentsForEmployee: null,
  refreshNights: null,
  refreshPayments: null,
  setNightAssignment: null,
  setWorkedFollowingDay: null,
  addPayment: null,
  deletePayment: null,
}));

vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ settings: null, loading: false, updateNetPercentage: vi.fn(), getNetPercentageForDate: vi.fn() }),
}));
vi.mock('../../hooks/useEmployees', () => ({
  useEmployees: () => ({ employees: h.employees, loading: false, deleteEmployee: h.deleteEmployee }),
}));
vi.mock('../../hooks/useDogs', () => ({ useDogs: () => ({ dogs: [], loading: false }) }));
vi.mock('../../hooks/useBoardings', () => ({ useBoardings: () => ({ boardings: [], loading: false }) }));
vi.mock('../../hooks/useNightAssignments', () => ({
  useNightAssignments: () => ({
    nightAssignments: [],
    loading: false,
    setNightAssignment: h.setNightAssignment,
    setWorkedFollowingDay: h.setWorkedFollowingDay,
    deleteAssignmentsForEmployee: h.deleteAssignmentsForEmployee,
    refresh: h.refreshNights,
  }),
}));
vi.mock('../../hooks/usePayments', () => ({
  usePayments: () => ({
    payments: h.payments,
    deletedPayments: h.deletedPayments,
    loading: false,
    addPayment: h.addPayment,
    deletePayment: h.deletePayment,
    refresh: h.refreshPayments,
  }),
}));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { DataProvider, useData } from '../../context/DataContext';
import {
  NIGHT_PAID_MESSAGE, NIGHT_TAKEN_MESSAGE, NIGHT_CHANGED_MESSAGE, EMPLOYEE_HAS_PAYMENTS_MESSAGE,
} from '../../utils/paidNights';

const dbError = (code, message = 'refused') => Object.assign(new Error(message), { code });
const render = () => renderHook(() => useData(), { wrapper: DataProvider }).result;
const caught = async (fn) => {
  try { await fn(); } catch (err) { return err; }
  return null;
};

/**
 * #389: the screens are told, in words, when the database refuses a change to a paid night.
 * @requirements REQ-041, REQ-042, REQ-051
 */
describe('REQ-041, REQ-042, REQ-051: DataContext and paid nights (#389)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.employees = [{ id: 'e1', name: 'Avery', active: true }, { id: 'e2', name: 'Blake', active: true }];
    h.payments = [{ id: 'p1', employeeId: 'e1', employeeName: 'Avery', amount: 20, dates: ['2026-11-02'], paidDate: '2026-11-06' }];
    h.deletedPayments = [{ id: 'p2', employeeId: 'e2', employeeName: 'Blake', amount: 10, dates: ['2026-11-04'], paidDate: '2026-11-06', deletedAt: '2026-11-07T01:00:00Z' }];
    h.deleteEmployee = vi.fn().mockResolvedValue(undefined);
    h.deleteAssignmentsForEmployee = vi.fn().mockResolvedValue(undefined);
    h.refreshNights = vi.fn().mockResolvedValue(undefined);
    h.refreshPayments = vi.fn().mockResolvedValue(true);
    h.setNightAssignment = vi.fn().mockResolvedValue(undefined);
    h.setWorkedFollowingDay = vi.fn().mockResolvedValue(undefined);
    h.addPayment = vi.fn().mockResolvedValue({ id: 'p3' });
    h.deletePayment = vi.fn().mockResolvedValue(undefined);
  });

  describe('a paid night', () => {
    it('is reported with who was paid and when', () => {
      const data = render();
      expect(data.current.getNightPayment('2026-11-02')).toEqual({ employeeName: 'Avery', paidDate: '2026-11-06' });
    });

    it('a night of a deleted payment is not paid', () => {
      expect(render().current.getNightPayment('2026-11-04')).toBeNull();
    });

    it('a night with no payment is not paid', () => {
      expect(render().current.getNightPayment('2026-11-03')).toBeNull();
    });
  });

  describe('a refused night edit is named and the page refreshes', () => {
    it('reassigning a paid night', async () => {
      h.setNightAssignment.mockRejectedValue(dbError('QB001'));
      const data = render();
      let err;
      await act(async () => { err = await caught(() => data.current.setNightAssignment('2026-11-02', 'Blake')); });
      expect(err?.message).toBe(NIGHT_PAID_MESSAGE);
      expect(h.refreshNights).toHaveBeenCalledTimes(1);
      expect(h.refreshPayments).toHaveBeenCalledTimes(1);
    });

    it('ticking "worked following day" on a paid night', async () => {
      h.setWorkedFollowingDay.mockRejectedValue(dbError('QB001'));
      const data = render();
      let err;
      await act(async () => { err = await caught(() => data.current.setWorkedFollowingDay('2026-11-02', true)); });
      expect(err?.message).toBe(NIGHT_PAID_MESSAGE);
      expect(h.refreshNights).toHaveBeenCalledTimes(1);
      expect(h.refreshPayments).toHaveBeenCalledTimes(1);
    });

    it('a night another tab just set (one assignment per night)', async () => {
      h.setNightAssignment.mockRejectedValue(dbError('23505'));
      const data = render();
      let err;
      await act(async () => { err = await caught(() => data.current.setNightAssignment('2026-11-03', 'Blake')); });
      expect(err?.message).toBe(NIGHT_TAKEN_MESSAGE);
      expect(h.refreshNights).toHaveBeenCalledTimes(1);
    });

    it('any other error is passed on as it is, with no refresh', async () => {
      h.setNightAssignment.mockRejectedValue(dbError('42501', 'permission denied'));
      const data = render();
      let err;
      await act(async () => { err = await caught(() => data.current.setNightAssignment('2026-11-03', 'Blake')); });
      expect(err?.message).toBe('permission denied');
      expect(h.refreshNights).not.toHaveBeenCalled();
    });

    it('a successful edit passes through', async () => {
      const data = render();
      await act(async () => { await data.current.setWorkedFollowingDay('2026-11-03', true); });
      expect(h.setWorkedFollowingDay).toHaveBeenCalledWith('2026-11-03', true);
    });
  });

  describe('a payment refused because a night changed (QB002)', () => {
    it('is named, and nights and payments are refreshed', async () => {
      h.addPayment.mockRejectedValue(dbError('QB002'));
      const data = render();
      let err;
      await act(async () => {
        err = await caught(() => data.current.addPayment({ employeeName: 'Avery', amount: 10, dates: ['2026-11-03'] }));
      });
      expect(err?.message).toBe(NIGHT_CHANGED_MESSAGE);
      expect(h.refreshNights).toHaveBeenCalledTimes(1);
      expect(h.refreshPayments).toHaveBeenCalledTimes(1);
    });

    it('an already-paid night keeps the hook\'s own message', async () => {
      h.addPayment.mockRejectedValue(new Error('One of these nights has already been paid. The list has been refreshed.'));
      const data = render();
      let err;
      await act(async () => {
        err = await caught(() => data.current.addPayment({ employeeName: 'Avery', amount: 10, dates: ['2026-11-03'] }));
      });
      expect(err?.message).toBe('One of these nights has already been paid. The list has been refreshed.');
      // The hook already refreshed payments; only a changed night (QB002) refreshes here.
      expect(h.refreshNights).not.toHaveBeenCalled();
      expect(h.refreshPayments).not.toHaveBeenCalled();
    });
  });

  describe('deleting a payment', () => {
    it('passes the note to the soft delete', async () => {
      const data = render();
      await act(async () => { await data.current.deletePayment('p1', 'wrong night'); });
      expect(h.deletePayment).toHaveBeenCalledWith('p1', 'wrong night');
    });

    it('with no note given, an empty note is sent', async () => {
      const data = render();
      await act(async () => { await data.current.deletePayment('p1'); });
      expect(h.deletePayment).toHaveBeenCalledWith('p1', '');
    });

    it('deleted payments are offered for the history', () => {
      expect(render().current.deletedPayments.map((p) => p.id)).toEqual(['p2']);
    });
  });

  describe('deleting an employee (Q1, Q4)', () => {
    it('is one delete of the employee; their nights go with it in the database', async () => {
      const data = render();
      await act(async () => { await data.current.deleteEmployee('Avery'); });
      expect(h.deleteEmployee).toHaveBeenCalledWith('Avery');
      expect(h.deleteAssignmentsForEmployee).not.toHaveBeenCalled();
      expect(h.refreshNights).toHaveBeenCalledTimes(1);
    });

    it('refused for an employee with payments, named in words', async () => {
      h.deleteEmployee.mockRejectedValue(dbError('23503'));
      const data = render();
      let err;
      await act(async () => { err = await caught(() => data.current.deleteEmployee('Avery')); });
      expect(err?.message).toBe(EMPLOYEE_HAS_PAYMENTS_MESSAGE);
    });

    it('an employee with only a deleted payment has payments', () => {
      expect(render().current.employeeHasPayments('Blake')).toBe(true);
    });

    it('an employee with a live payment has payments', () => {
      expect(render().current.employeeHasPayments('Avery')).toBe(true);
    });

    it('a name not in the list has no payments', () => {
      expect(render().current.employeeHasPayments('Nobody')).toBe(false);
    });

    it('an employee with none can be deleted', () => {
      h.employees = [...h.employees, { id: 'e3', name: 'Casey', active: true }];
      expect(render().current.employeeHasPayments('Casey')).toBe(false);
    });
  });
});
