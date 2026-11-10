import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getEmployeeNameById, getEmployeeIdByName } from '../utils/employeeHelpers';
import { businessToday } from '../utils/dateUtils';

/** Postgres unique violation: payment_nights refuses a night that's already paid (#370). */
const UNIQUE_VIOLATION = '23505';
export const ALREADY_PAID_MESSAGE = 'One of these nights has already been paid. The list has been refreshed.';
export const ALREADY_PAID_NO_REFRESH = 'One of these nights has already been paid. Reload the page to see it.';
export const ALREADY_DELETED_MESSAGE = 'This payment was already deleted. The list has been refreshed.';

const toAppPayment = (p, employeeName) => ({
  id: p.id,
  employeeId: p.employee_id,
  employeeName,
  startDate: p.start_date,
  endDate: p.end_date,
  amount: parseFloat(p.amount),
  nights: p.nights,
  dates: p.dates || [],
  nightAmounts: p.night_amounts || {},
  followingDayNights: p.following_day_nights || [],
  paidDate: p.paid_date,
  // Soft delete (#389): set by the database, never by the app.
  deletedAt: p.deleted_at ?? null,
  deletedByEmail: p.deleted_by_email ?? null,
  deleteNote: p.delete_note ?? null,
});

const byDeletedAtDesc = (a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || '');

export function usePayments(employees = []) {
  const { user } = useAuth();
  // Live payments only: every reader of `payments` (Outstanding, totals, history) skips deleted
  // ones by default (#389, rule 7). Deleted payments are kept apart, for the history toggle.
  const [payments, setPayments] = useState([]);
  const [deletedPayments, setDeletedPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPayments = useCallback(async () => {
    if (!user) {
      setPayments([]);
      setDeletedPayments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('paid_date', { ascending: false });

      if (error) throw error;

      const all = data.map(p => toAppPayment(p, getEmployeeNameById(employees, p.employee_id)));
      setPayments(all.filter(p => !p.deletedAt));
      setDeletedPayments(all.filter(p => p.deletedAt).sort(byDeletedAtDesc));
      return true;
    } catch (err) {
      console.error('Error fetching payments:', err);
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [user, employees]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Re-fetch when employees change to update names
  useEffect(() => {
    if (employees.length > 0) {
      const rename = (p) => ({ ...p, employeeName: getEmployeeNameById(employees, p.employeeId) });
      if (payments.length > 0) setPayments(prev => prev.map(rename));
      if (deletedPayments.length > 0) setDeletedPayments(prev => prev.map(rename));
    }
  }, [employees]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Saves one payment with each night's amount (`night_amounts`, whole cents in dollars). The
   * database refuses a night that's already paid; then the list is refreshed and a clear error thrown.
   * @requirements REQ-041
   */
  const addPayment = async (payment) => {
    if (!user) throw new Error('Not signed in: the payment was not saved.');

    const employeeId = getEmployeeIdByName(employees, payment.employeeName);
    if (!employeeId) {
      throw new Error('Employee not found');
    }

    try {
      const { data, error } = await supabase
        .from('payments')
        .insert([{
          employee_id: employeeId,
          start_date: payment.startDate,
          end_date: payment.endDate,
          amount: payment.amount,
          nights: payment.nights,
          dates: payment.dates,
          night_amounts: payment.nightAmounts,
          // The nights priced with "worked following day" ticked: the database refuses the payment
          // if that changed since the page loaded (#389, Q3).
          following_day_nights: payment.followingDayNights || [],
          paid_date: businessToday(),
          user_id: user.id,
        }])
        .select()
        .single();

      if (error?.code === UNIQUE_VIOLATION) {
        const refreshed = await fetchPayments();
        throw new Error(refreshed ? ALREADY_PAID_MESSAGE : ALREADY_PAID_NO_REFRESH);
      }
      if (error) throw error;

      const newPayment = toAppPayment(data, payment.employeeName);

      setPayments(prev => [newPayment, ...prev]);
      return newPayment;
    } catch (err) {
      console.error('Error adding payment:', err);
      setError(err.message);
      throw err;
    }
  };

  /**
   * Soft delete (#389): the payment stays as history and its nights are released. The database sets
   * the time and who deleted it; the app sends only the request and the optional note.
   * @requirements REQ-042
   */
  const deletePayment = async (id, note = '') => {
    if (!user) throw new Error('Not signed in: the payment was not deleted.');

    try {
      const { data, error } = await supabase
        .from('payments')
        .update({
          deleted_at: new Date().toISOString(),
          delete_note: (note || '').trim() || null,
        })
        .eq('id', id)
        .is('deleted_at', null)
        .select();

      if (error) throw error;
      if (!data || data.length !== 1) {
        // Nothing live matched: another tab deleted it first.
        await fetchPayments();
        throw new Error(ALREADY_DELETED_MESSAGE);
      }

      const deleted = toAppPayment(data[0], getEmployeeNameById(employees, data[0].employee_id));
      setPayments(prev => prev.filter(p => p.id !== id));
      setDeletedPayments(prev => [deleted, ...prev.filter(p => p.id !== id)].sort(byDeletedAtDesc));
    } catch (err) {
      console.error('Error deleting payment:', err);
      setError(err.message);
      throw err;
    }
  };

  return {
    payments,
    deletedPayments,
    loading,
    error,
    addPayment,
    deletePayment,
    refresh: fetchPayments,
  };
}
