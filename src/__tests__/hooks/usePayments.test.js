import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

// Mock dependencies before imports
const mockUser = { id: 'user-123', email: 'test@test.com' };
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Create stable mock data and capture insert calls
const mockData = { payments: [], error: null };
const mockInsertData = { capturedData: null };

const mockInsert = vi.fn((data) => {
  mockInsertData.capturedData = data;
  return {
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({
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

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockData.payments, error: mockData.error })),
      })),
      insert: mockInsert,
      delete: mockDelete,
    })),
  },
}));

import { usePayments } from '../../hooks/usePayments';

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
    mockInsertData.capturedData = null;
  });

  describe('Hook Initialization', () => {
    it('returns initial state with expected properties', () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      expect(result.current).toHaveProperty('payments');
      expect(result.current).toHaveProperty('loading');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('addPayment');
      expect(result.current).toHaveProperty('deletePayment');
      expect(result.current).toHaveProperty('getPaidDatesForEmployee');
    });

    it('provides addPayment as a function', () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      expect(typeof result.current.addPayment).toBe('function');
    });

    it('provides deletePayment as a function', () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      expect(typeof result.current.deletePayment).toBe('function');
    });

    it('provides getPaidDatesForEmployee as a function', () => {
      const { result } = renderHook(() => usePayments(mockEmployees));
      expect(typeof result.current.getPaidDatesForEmployee).toBe('function');
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

    it('sets paid_date to current date', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const today = new Date().toISOString().split('T')[0];

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
    });
  });

  describe('getPaidDatesForEmployee', () => {
    it('returns paid dates for specified employee', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const paidDates = result.current.getPaidDatesForEmployee('Kate');
      expect(paidDates).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);
    });

    it('returns empty array for employee with no payments', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const paidDates = result.current.getPaidDatesForEmployee('Nick');
      expect(paidDates).toEqual([]);
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

    it('paid dates appear in getPaidDatesForEmployee after payment', async () => {
      // Start with no payments for Nick
      mockData.payments = [];
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Initially no paid dates
      expect(result.current.getPaidDatesForEmployee('Kate')).toEqual([]);

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
      const paidDates = result.current.getPaidDatesForEmployee('Kate');
      expect(paidDates).toContain('2025-01-15');
      expect(paidDates).toContain('2025-01-16');
      expect(paidDates).toContain('2025-01-17');
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

    it('deleting payment removes dates from getPaidDatesForEmployee', async () => {
      const { result } = renderHook(() => usePayments(mockEmployees));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Initially Kate has paid dates from mock data
      expect(result.current.getPaidDatesForEmployee('Kate')).toEqual(['2025-01-01', '2025-01-02', '2025-01-03']);

      const paymentToDelete = result.current.payments[0];

      await act(async () => {
        await result.current.deletePayment(paymentToDelete.id);
      });

      // After deletion, dates should no longer be marked as paid
      expect(result.current.getPaidDatesForEmployee('Kate')).toEqual([]);
    });
  });
});
