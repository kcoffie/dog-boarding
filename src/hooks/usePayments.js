import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getEmployeeNameById, getEmployeeIdByName } from '../utils/employeeHelpers';
import { businessToday } from '../utils/dateUtils';

/** Postgres unique violation: payment_nights refuses a night that's already paid (#370). */
const UNIQUE_VIOLATION = '23505';
export const ALREADY_PAID_MESSAGE = 'One of these nights has already been paid. The list has been refreshed.';

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
  paidDate: p.paid_date,
});

export function usePayments(employees = []) {
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPayments = useCallback(async () => {
    if (!user) {
      setPayments([]);
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

      // Transform from DB format to app format
      setPayments(data.map(p => toAppPayment(p, getEmployeeNameById(employees, p.employee_id))));
    } catch (err) {
      console.error('Error fetching payments:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, employees]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Re-fetch when employees change to update names
  useEffect(() => {
    if (employees.length > 0 && payments.length > 0) {
      setPayments(prev => prev.map(p => ({
        ...p,
        employeeName: getEmployeeNameById(employees, p.employeeId),
      })));
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
          paid_date: businessToday(),
          user_id: user.id,
        }])
        .select()
        .single();

      if (error?.code === UNIQUE_VIOLATION) {
        await fetchPayments();
        throw new Error(ALREADY_PAID_MESSAGE);
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

  const deletePayment = async (id) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPayments(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('Error deleting payment:', err);
      setError(err.message);
      throw err;
    }
  };

  return {
    payments,
    loading,
    error,
    addPayment,
    deletePayment,
    refresh: fetchPayments,
  };
}
