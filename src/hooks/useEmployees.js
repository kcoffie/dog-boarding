import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export function useEmployees() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEmployees = useCallback(async () => {
    if (!user) {
      setEmployees([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Transform to app format
      setEmployees(data.map(emp => ({
        id: emp.id,
        name: emp.name,
        active: emp.active,
      })));
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const addEmployee = async (name) => {
    if (!user) return;

    // Check for duplicate
    const exists = employees.some(
      e => e.name.toLowerCase() === name.toLowerCase()
    );
    if (exists) return;

    try {
      const { data, error } = await supabase
        .from('employees')
        .insert([{
          user_id: user.id,
          name,
          active: true,
        }])
        .select()
        .single();

      if (error) throw error;

      setEmployees(prev => [...prev, {
        id: data.id,
        name: data.name,
        active: data.active,
      }]);
    } catch (err) {
      console.error('Error adding employee:', err);
      setError(err.message);
      throw err;
    }
  };

  const deleteEmployee = async (name) => {
    if (!user) return;

    const employee = employees.find(e => e.name === name);
    if (!employee) return;

    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', employee.id);

      if (error) throw error;

      setEmployees(prev => prev.filter(e => e.name !== name));
    } catch (err) {
      console.error('Error deleting employee:', err);
      setError(err.message);
      throw err;
    }
  };

  const toggleEmployeeActive = async (name) => {
    if (!user) return;

    const employee = employees.find(e => e.name === name);
    if (!employee) return;

    const newActive = !employee.active;

    try {
      const { error } = await supabase
        .from('employees')
        .update({ active: newActive })
        .eq('id', employee.id);

      if (error) throw error;

      setEmployees(prev => prev.map(e =>
        e.name === name ? { ...e, active: newActive } : e
      ));
    } catch (err) {
      console.error('Error toggling employee:', err);
      setError(err.message);
      throw err;
    }
  };

  const reorderEmployees = async (fromIndex, toIndex) => {
    // For now, just update local state
    // Could add an 'order' column later for persistence
    setEmployees(prev => {
      const newEmployees = [...prev];
      const [removed] = newEmployees.splice(fromIndex, 1);
      newEmployees.splice(toIndex, 0, removed);
      return newEmployees;
    });
  };

  const sortEmployeesBy = (direction) => {
    setEmployees(prev => {
      const sorted = [...prev].sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        const result = nameA.localeCompare(nameB);
        return direction === 'asc' ? result : -result;
      });
      return sorted;
    });
  };

  return {
    employees,
    loading,
    error,
    addEmployee,
    deleteEmployee,
    toggleEmployeeActive,
    reorderEmployees,
    sortEmployeesBy,
    refresh: fetchEmployees,
  };
}
