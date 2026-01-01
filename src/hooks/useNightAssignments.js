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
        id: a.id,
        date: a.date,
        employeeId: a.employee_id,
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

  const setNightAssignment = useCallback(async (date, employeeName) => {
    if (!user) return;

    const existing = nightAssignments.find(a => a.date === date);
    const employeeId = employeeName === 'N/A' ? null : getEmployeeIdByName(employees, employeeName);

    try {
      if (existing) {
        if (employeeName) {
          // Update existing assignment using id
          const { error } = await supabase
            .from('night_assignments')
            .update({
              employee_id: employeeId,
            })
            .eq('id', existing.id);

          if (error) throw error;

          setNightAssignments(prev => prev.map(a =>
            a.id === existing.id ? { ...a, employeeId } : a
          ));
        } else {
          // Delete assignment (empty string means remove)
          const { error } = await supabase
            .from('night_assignments')
            .delete()
            .eq('id', existing.id);

          if (error) throw error;

          setNightAssignments(prev => prev.filter(a => a.id !== existing.id));
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
          id: data.id,
          date: data.date,
          employeeId: data.employee_id,
        }]);
      }
    } catch (err) {
      console.error('Error setting night assignment:', err);
      setError(err.message);
      throw err;
    }
  }, [user, nightAssignments, employees]);

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
