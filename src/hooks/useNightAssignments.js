import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { getEmployeeNameById, getEmployeeIdByName } from '../utils/employeeHelpers';

export function useNightAssignments(employees = []) {
  const { user } = useAuth();
  const [nightAssignments, setNightAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchNightAssignments = useCallback(async () => {
    if (!user) {
      setNightAssignments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('night_assignments')
        .select('*');

      if (error) throw error;

      // Transform from DB format to app format (using employee names)
      setNightAssignments(data.map(a => ({
        date: a.date,
        employeeId: a.employee_id,
        // employeeName will be resolved when accessed via getNightAssignment
      })));
    } catch (err) {
      console.error('Error fetching night assignments:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchNightAssignments();
  }, [fetchNightAssignments]);

  const setNightAssignment = async (date, employeeName) => {
    if (!user) return;

    const existing = nightAssignments.find(a => a.date === date);
    const employeeId = employeeName === 'N/A' ? null : getEmployeeIdByName(employees, employeeName);

    try {
      if (existing) {
        if (employeeName) {
          // Update existing assignment
          const { error } = await supabase
            .from('night_assignments')
            .update({
              employee_id: employeeId,
            })
            .eq('date', date);

          if (error) throw error;

          setNightAssignments(prev => prev.map(a =>
            a.date === date ? { ...a, employeeId } : a
          ));
        } else {
          // Delete assignment (empty string means remove)
          const { error } = await supabase
            .from('night_assignments')
            .delete()
            .eq('date', date);

          if (error) throw error;

          setNightAssignments(prev => prev.filter(a => a.date !== date));
        }
      } else if (employeeName) {
        // Create new assignment
        const { data, error } = await supabase
          .from('night_assignments')
          .insert([{
            date,
            employee_id: employeeId,
          }])
          .select()
          .single();

        if (error) throw error;

        setNightAssignments(prev => [...prev, {
          date: data.date,
          employeeId: data.employee_id,
        }]);
      }
    } catch (err) {
      console.error('Error setting night assignment:', err);
      setError(err.message);
      throw err;
    }
  };

  const getNightAssignment = useCallback((date) => {
    const assignment = nightAssignments.find(a => a.date === date);
    if (!assignment) return '';
    if (assignment.employeeId === null) return 'N/A';
    return getEmployeeNameById(employees, assignment.employeeId) || '';
  }, [nightAssignments, employees]);

  // For deleting assignments when an employee is deleted
  const deleteAssignmentsForEmployee = async (employeeName) => {
    if (!user) return;

    const employeeId = getEmployeeIdByName(employees, employeeName);
    if (!employeeId) return;

    try {
      const { error } = await supabase
        .from('night_assignments')
        .delete()
        .eq('employee_id', employeeId);

      if (error) throw error;

      setNightAssignments(prev => prev.filter(a => a.employeeId !== employeeId));
    } catch (err) {
      console.error('Error deleting assignments for employee:', err);
      setError(err.message);
      throw err;
    }
  };

  return {
    nightAssignments,
    loading,
    error,
    setNightAssignment,
    getNightAssignment,
    deleteAssignmentsForEmployee,
    refresh: fetchNightAssignments,
  };
}
