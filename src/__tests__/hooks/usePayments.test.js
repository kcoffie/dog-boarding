import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock dependencies before imports
const mockUser = { id: 'user-123', email: 'test@test.com' };
const mockAuth = { user: mockUser };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

// Create stable mock data and capture insert calls
const mockData = { payments: [], error: null };
const mockInsertData = { capturedData: null, error: null };

const mockInsert = vi.fn((data) => {
  mockInsertData.capturedData = data;
  return {
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve(mockInsertData.error ? { data: null, error: mockInsertData.error } : {
        data: {
          id: 'new-payment-id',
          employee_id: 'emp-1',
          amount: 100,
          start_date: '2025-01-15',
          end_date: '2025-01-17',
          nights: 3,
          dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
          paid_date: '2025-01-20',
          user_id: mockUser.id,
        },
        error: null,
      })),
    })),
  };
});

const mockDelete = vi.fn(() => ({
  eq: vi.fn(() => Promise.resolve({ error: null })),
}));

// Soft delete (#389): update(...).eq('id', id).is('deleted_at', null).select()
const mockUpdateData = { captured: null, eqArgs: null, isArgs: null, rows: null, error: null };
const mockUpdate = vi.fn((data) => {
  mockUpdateData.captured = data;
  return {
    eq: vi.fn((...eqArgs) => {
      mockUpdateData.eqArgs = eqArgs;
      return {
        is: vi.fn((...isArgs) => {
          mockUpdateData.isArgs = isArgs;
          return {
            select: vi.fn(() => Promise.resolve(mockUpdateData.error
              ? { data: null, error: mockUpdateData.error }
              : { data: mockUpdateData.rows, error: null })),
          };
        }),
      };
    }),
  };
});

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockData.payments, error: mockData.error })),
      })),
      insert: mockInsert,
      delete: mockDelete,
      update: mockUpdate,
    })),
  },
}));

import { usePayments, ALREADY_PAID_MESSAGE, ALREADY_PAID_NO_REFRESH, ALREADY_DELETED_MESSAGE } from '../../hooks/usePayments';
import { paidNightOwners } from '../../utils/payroll';

const mockEmployees = [
  { id: 'emp-1', name: 'Kate', active: true },
  { id: 'emp-2', name: 'Nick', active: true },
];

/**
 * @requirements REQ-041, REQ-044
 */
describe('REQ-041, REQ-044: usePayments Hook - Mark as Paid & Payment Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.payments = [
      {
        id: 'payment-1',
        employee_id: 'emp-1',
        amount: 150,
        start_date: '2025-01-01',
        end_date: '2025-01-03',
        nights: 3,
        dates: ['2025-01-01', '2025-01-02', '2025-01-03'],
        paid_date: '2025-01-05',
      },
    ];
    mockData.error = null;
    // The row the database returns for a soft delete of payment-1: who and when are its own.
    mockUpdateData.rows = [{
      ...mockData.payments[0],
      deleted_at: '2026-11-10T03:30:00+00:00',
      deleted_by: 'user-123',
      deleted_by_email: 'test@test.com',
      delete_note: 'wrong night',
    }];
    mockUpdateData.error = null;
    mockUpdateData.captured = null;
    mockInsertData.capturedData = null;
    mockInsertData.error = null;
    mockAuth.user = mockUser;
  });

  describe('Hook Initialization', () => {
    it('returns initial state with expected properties', () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      expect(result.current).toHaveProperty('payments');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('addPayment');
      expect(result.current).toHaveProperty('deletePayment');
      expect(result.current).not.toHaveProperty('getPaidDatesForEmployee');
    });

    it('provides addPayment as a function', () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      expect(typeof result.current.addPayment).toBe('function');
    });

    it('provides deletePayment as a function', () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      expect(typeof result.current.deletePayment).toBe('function');
    });


    it('starts with loading state true', () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      expect(result.current.loading).toBe(true);
    });

    it('fetches payments on mount', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.payments.length).toBe(1);
    });
  });

  describe('addPayment - Database Insert', () => {
    it('includes user_id when inserting payment', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Kate',
          startDate: '2025-01-15',
          endDate: '2025-01-17',
          amount: 100,
          nights: 3,
          dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
        });
      });

      // Verify insert was called with user_id
      expect(mockInsert).toHaveBeenCalled();
      const insertedData = mockInsertData.capturedData[0];
      expect(insertedData).toHaveProperty('user_id');
      expect(insertedData.user_id).toBe('user-123');
    });

    it('includes all required fields when inserting payment', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Kate',
          startDate: '2025-01-15',
          endDate: '2025-01-17',
          amount: 100,
          nights: 3,
          dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
        });
      });

      const insertedData = mockInsertData.capturedData[0];
      expect(insertedData).toHaveProperty('employee_id', 'emp-1');
      expect(insertedData).toHaveProperty('start_date', '2025-01-15');
      expect(insertedData).toHaveProperty('end_date', '2025-01-17');
      expect(insertedData).toHaveProperty('amount', 100);
      expect(insertedData).toHaveProperty('nights', 3);
      expect(insertedData).toHaveProperty('dates');
      expect(insertedData).toHaveProperty('paid_date');
      expect(insertedData).toHaveProperty('user_id', 'user-123');
    });

    it('resolves employee name to employee ID', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Nick',
          startDate: '2025-01-15',
          endDate: '2025-01-17',
          amount: 100,
          nights: 3,
          dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
        });
      });

      const insertedData = mockInsertData.capturedData[0];
      expect(insertedData.employee_id).toBe('emp-2');
    });

    it('throws error if employee not found', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.addPayment({
            employeeName: 'Unknown',
            startDate: '2025-01-15',
            endDate: '2025-01-17',
            amount: 100,
            nights: 3,
            dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
          });
        })
      ).rejects.toThrow('Employee not found');
    });

    it("sets paid_date to San Francisco's date (9pm Pacific is still 10-26)", async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-27T04:00:00Z'));
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const today = '2026-10-26';

      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Kate',
          startDate: '2025-01-15',
          endDate: '2025-01-17',
          amount: 100,
          nights: 3,
          dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
        });
      });

      const insertedData = mockInsertData.capturedData[0];
      expect(insertedData.paid_date).toBe(today);
      vi.useRealTimers();
    });
  });


  describe('Payment Data Transformation', () => {
    it('transforms payments from DB format to app format', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const payment = result.current.payments[0];
      expect(payment).toHaveProperty('id');
      expect(payment).toHaveProperty('employeeId');
      expect(payment).toHaveProperty('employeeName');
      expect(payment).toHaveProperty('startDate');
      expect(payment).toHaveProperty('endDate');
      expect(payment).toHaveProperty('amount');
      expect(payment).toHaveProperty('nights');
      expect(payment).toHaveProperty('dates');
      expect(payment).toHaveProperty('paidDate');
    });

    it('resolves employee ID to employee name', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const payment = result.current.payments[0];
      expect(payment.employeeName).toBe('Kate');
    });
  });

  describe('REQ-044: Payment Flow Integration', () => {
    it('new payment appears in payments list after addPayment', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialCount = result.current.payments.length;

      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Kate',
          startDate: '2025-01-15',
          endDate: '2025-01-17',
          amount: 100,
          nights: 3,
          dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
        });
      });

      expect(result.current.payments.length).toBe(initialCount + 1);
    });

    it('new payment contains correct employee, amount, and dates', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Kate',
          startDate: '2025-01-15',
          endDate: '2025-01-17',
          amount: 100,
          nights: 3,
          dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
        });
      });

      const newPayment = result.current.payments[0]; // Most recent first
      expect(newPayment.employeeName).toBe('Kate');
      expect(newPayment.amount).toBe(100);
      expect(newPayment.dates).toEqual(['2025-01-15', '2025-01-16', '2025-01-17']);
    });

    it('paid nights show as paid to the employee after payment', async () => {
      // Start with no payments for Nick
      mockData.payments = [];
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Initially no paid dates
      expect(paidNightOwners(result.current.payments)).toEqual({});

      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Kate',
          startDate: '2025-01-15',
          endDate: '2025-01-17',
          amount: 100,
          nights: 3,
          dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
        });
      });

      // Now dates should be marked as paid
      expect(paidNightOwners(result.current.payments)).toEqual({
        '2025-01-15': 'Kate', '2025-01-16': 'Kate', '2025-01-17': 'Kate',
      });
    });

    it('deleting payment removes it from payments list', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const initialCount = result.current.payments.length;
      const paymentToDelete = result.current.payments[0];

      await act(async () => {
        await result.current.deletePayment(paymentToDelete.id);
      });

      expect(result.current.payments.length).toBe(initialCount - 1);
      expect(result.current.payments.find(p => p.id === paymentToDelete.id)).toBeUndefined();
    });

    it('deleting payment returns its nights to unpaid', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Initially Kate has paid dates from mock data
      expect(Object.keys(paidNightOwners(result.current.payments))).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);

      const paymentToDelete = result.current.payments[0];

      await act(async () => {
        await result.current.deletePayment(paymentToDelete.id);
      });

      // After deletion, dates should no longer be marked as paid
      expect(paidNightOwners(result.current.payments)).toEqual({});
    });
  });
  describe('#370: a payment carries each night\'s amount, and a night is paid once', () => {
    const pay = {
      employeeName: 'Kate',
      startDate: '2026-10-16',
      endDate: '2026-10-17',
      amount: 318.5,
      nights: 2,
      dates: ['2026-10-16', '2026-10-17'],
      nightAmounts: { '2026-10-16': 139.75, '2026-10-17': 178.75 },
    };

    it('sends night_amounts with the payment', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.addPayment(pay); });
      expect(mockInsertData.capturedData[0].night_amounts).toEqual({ '2026-10-16': 139.75, '2026-10-17': 178.75 });
      expect(mockInsertData.capturedData[0].amount).toBe(318.5);
    });

    it('an already-paid night refreshes the list and throws a clear error', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      // Another tab paid Kate's nights meanwhile: the refresh must bring that payment in.
      mockData.payments = [...mockData.payments, {
        id: 'payment-other-tab', employee_id: 'emp-1', amount: 318.5, nights: 2,
        dates: ['2026-10-16', '2026-10-17'], paid_date: '2026-11-05',
      }];
      mockInsertData.error = { code: '23505', message: 'duplicate key value violates unique constraint "payment_nights_pkey"' };
      let thrown;
      await act(async () => {
        try { await result.current.addPayment(pay); } catch (err) { thrown = err; }
      });
      expect(thrown?.message).toBe(ALREADY_PAID_MESSAGE);
      expect(ALREADY_PAID_MESSAGE).toBe('One of these nights has already been paid. The list has been refreshed.');
      expect(result.current.payments.map((p) => p.id)).toContain('payment-other-tab');
    });

    it('if the refresh after an already-paid night fails, the message says to reload instead', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      mockData.error = { message: 'network down' };
      mockInsertData.error = { code: '23505', message: 'duplicate key' };
      let thrown;
      await act(async () => {
        try { await result.current.addPayment(pay); } catch (err) { thrown = err; }
      });
      expect(thrown?.message).toBe(ALREADY_PAID_NO_REFRESH);
      expect(ALREADY_PAID_NO_REFRESH).toBe('One of these nights has already been paid. Reload the page to see it.');
    });

    it('any other database error is thrown as it is and nothing is added', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const before = result.current.payments.length;
      mockInsertData.error = { code: '42501', message: 'permission denied for table payments' };
      let thrown;
      await act(async () => {
        try { await result.current.addPayment(pay); } catch (err) { thrown = err; }
      });
      expect(thrown?.message).toBe('permission denied for table payments');
      expect(result.current.payments.length).toBe(before);
    });

    it('with no signed-in user, the save throws instead of looking done', async () => {
      mockAuth.user = null;
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await expect(result.current.addPayment(pay)).rejects.toThrow('Not signed in');
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it('reads each payment\'s night amounts', async () => {
      mockData.payments[0].night_amounts = { '2025-01-01': 50, '2025-01-02': 50, '2025-01-03': 50 };
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.payments[0].nightAmounts).toEqual({ '2025-01-01': 50, '2025-01-02': 50, '2025-01-03': 50 });
    });
  });
  describe('#389: a deleted payment is kept as history, and readers skip it', () => {
    const deletedRow = {
      id: 'payment-deleted', employee_id: 'emp-2', amount: 80, nights: 1,
      dates: ['2025-01-10'], paid_date: '2025-01-11',
      deleted_at: '2025-01-12T18:00:00+00:00', deleted_by: 'user-9',
      deleted_by_email: 'admin@example.invalid', delete_note: 'paid the wrong person',
    };

    it('payments holds only live payments; deleted ones are in deletedPayments', async () => {
      mockData.payments = [...mockData.payments, deletedRow];
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.payments.map((p) => p.id)).toEqual(['payment-1']);
      expect(result.current.deletedPayments.map((p) => p.id)).toEqual(['payment-deleted']);
    });

    it('a deleted payment\'s nights are not paid', async () => {
      mockData.payments = [...mockData.payments, deletedRow];
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(Object.keys(paidNightOwners(result.current.payments))).not.toContain('2025-01-10');
    });

    it('a deleted payment carries who deleted it, when, the note, and the person paid', async () => {
      mockData.payments = [...mockData.payments, deletedRow];
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      const d = result.current.deletedPayments[0];
      expect(d.deletedAt).toBe('2025-01-12T18:00:00+00:00');
      expect(d.deletedByEmail).toBe('admin@example.invalid');
      expect(d.deleteNote).toBe('paid the wrong person');
      expect(d.employeeName).toBe('Nick');
    });

    it('delete is an update of that live payment, never a DELETE', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.deletePayment('payment-1', '  wrong night  '); });
      expect(mockDelete).not.toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdateData.eqArgs).toEqual(['id', 'payment-1']);
      expect(mockUpdateData.isArgs).toEqual(['deleted_at', null]);
      expect(typeof mockUpdateData.captured.deleted_at).toBe('string');
      expect(mockUpdateData.captured.delete_note).toBe('wrong night');
    });

    it('an empty note is sent as no note', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.deletePayment('payment-1', '   '); });
      expect(mockUpdateData.captured.delete_note).toBeNull();
    });

    it('the client never sends who deleted it (the database sets it)', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.deletePayment('payment-1', 'x'); });
      expect(Object.keys(mockUpdateData.captured).sort()).toEqual(['delete_note', 'deleted_at']);
    });

    it('after a delete, the payment moves from payments to deletedPayments as the database returned it', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => { await result.current.deletePayment('payment-1', 'wrong night'); });
      expect(result.current.payments).toEqual([]);
      expect(result.current.deletedPayments.map((p) => p.id)).toEqual(['payment-1']);
      expect(result.current.deletedPayments[0].deletedByEmail).toBe('test@test.com');
    });

    it('a refused delete throws the database message and changes nothing', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      mockUpdateData.error = { code: 'QB003', message: 'payment x was deleted' };
      let thrown;
      await act(async () => {
        try { await result.current.deletePayment('payment-1', ''); } catch (err) { thrown = err; }
      });
      expect(thrown?.message).toBe('payment x was deleted');
      expect(result.current.payments.map((p) => p.id)).toEqual(['payment-1']);
      expect(result.current.deletedPayments).toEqual([]);
    });

    it('a delete that matched no live payment (deleted in another tab) refreshes and says so', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      mockUpdateData.rows = [];
      mockData.payments = [{ ...mockData.payments[0], ...deletedRow, id: 'payment-1' }];
      let thrown;
      await act(async () => {
        try { await result.current.deletePayment('payment-1', ''); } catch (err) { thrown = err; }
      });
      expect(thrown?.message).toBe(ALREADY_DELETED_MESSAGE);
      expect(ALREADY_DELETED_MESSAGE).toBe('This payment was already deleted. The list has been refreshed.');
      expect(result.current.payments).toEqual([]);
      expect(result.current.deletedPayments.map((p) => p.id)).toEqual(['payment-1']);
    });

    it('with no signed-in user, delete throws instead of looking done', async () => {
      mockAuth.user = null;
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await expect(result.current.deletePayment('payment-1', '')).rejects.toThrow('Not signed in');
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('sends the nights priced with "worked following day"', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Kate', startDate: '2026-10-16', endDate: '2026-10-17', amount: 318.5, nights: 2,
          dates: ['2026-10-16', '2026-10-17'], nightAmounts: { '2026-10-16': 139.75, '2026-10-17': 178.75 },
          followingDayNights: ['2026-10-17'],
        });
      });
      expect(mockInsertData.capturedData[0].following_day_nights).toEqual(['2026-10-17']);
    });

    it('a payment priced with no ticks sends an empty list, not nothing', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      await act(async () => {
        await result.current.addPayment({
          employeeName: 'Kate', startDate: '2026-10-16', endDate: '2026-10-16', amount: 10, nights: 1,
          dates: ['2026-10-16'], nightAmounts: { '2026-10-16': 10 },
        });
      });
      expect(mockInsertData.capturedData[0].following_day_nights).toEqual([]);
    });

    it('a refused payment keeps the database error code, so the page can name it', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      mockInsertData.error = { code: 'QB002', message: 'the night is no longer assigned to this employee' };
      let thrown;
      await act(async () => {
        try {
          await result.current.addPayment({
            employeeName: 'Kate', amount: 10, nights: 1, dates: ['2026-10-16'], nightAmounts: { '2026-10-16': 10 },
          });
        } catch (err) { thrown = err; }
      });
      expect(thrown?.code).toBe('QB002');
    });

    it('renaming an employee renames them in deleted payments too', async () => {
      mockData.payments = [...mockData.payments, deletedRow];
      let employees = mockEmployees;
      const { result, rerender } = renderHook(() => usePayments(employees));
      await waitFor(() => expect(result.current.loading).toBe(false));
      employees = [mockEmployees[0], { id: 'emp-2', name: 'Nicholas', active: true }];
      rerender();
      await waitFor(() => expect(result.current.deletedPayments[0]?.employeeName).toBe('Nicholas'));
    });
  });
});
