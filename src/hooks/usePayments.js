import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getEmployeeNameById, getEmployeeIdByName } from '../utils/employeeHelpers';

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
      setPayments(data.map(p => ({
        id: p.id,
        employeeId: p.employee_id,
        employeeName: getEmployeeNameById(employees, p.employee_id),
        startDate: p.start_date,
        endDate: p.end_date,
        amount: parseFloat(p.amount),
        nights: p.nights,
        dates: p.dates || [],
        paidDate: p.paid_date,
      })));
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
  }, [employees]);

  const addPayment = async (payment) => {
    if (!user) return null;

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
          paid_date: new Date().toISOString().split('T')[0],
          user_id: user.id,
        }])
        .select()
        .single();

      if (error) throw error;

      const newPayment = {
        id: data.id,
        employeeId: data.employee_id,
        employeeName: payment.employeeName,
        startDate: data.start_date,
        endDate: data.end_date,
        amount: parseFloat(data.amount),
        nights: data.nights,
        dates: data.dates || [],
        paidDate: data.paid_date,
      };

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

  const getPaidDatesForEmployee = useCallback((employeeName) => {
    return payments
      .filter(p => p.employeeName === employeeName)
      .flatMap(p => p.dates);
  }, [payments]);

  return {
    payments,
    loading,
    error,
    addPayment,
    deletePayment,
    getPaidDatesForEmployee,
    refresh: fetchPayments,
  };
}
