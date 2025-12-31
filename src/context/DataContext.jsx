import { createContext, useContext, useMemo } from 'react';
import { useSettings as useSupabaseSettings } from '../hooks/useSettings';
import { useEmployees as useSupabaseEmployees } from '../hooks/useEmployees';
import { useDogs as useSupabaseDogs } from '../hooks/useDogs';
import { useBoardings as useSupabaseBoardings } from '../hooks/useBoardings';
import { useNightAssignments as useSupabaseNightAssignments } from '../hooks/useNightAssignments';
import { usePayments as useSupabasePayments } from '../hooks/usePayments';
import { useAuth } from './AuthContext';
import { logger } from '../utils/logger';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { user } = useAuth();

  // Use Supabase for net percentage settings when logged in
  const {
    settings: supabaseSettings,
    loading: settingsLoading,
    updateNetPercentage: updateSupabaseNetPercentage,
    getNetPercentageForDate: getSupabaseNetPercentageForDate,
  } = useSupabaseSettings();

  // Use Supabase for employees
  const {
    employees: supabaseEmployees,
    loading: employeesLoading,
    addEmployee: addSupabaseEmployee,
    deleteEmployee: deleteSupabaseEmployee,
    toggleEmployeeActive: toggleSupabaseEmployeeActive,
    reorderEmployees: reorderSupabaseEmployees,
  } = useSupabaseEmployees();

  // Use Supabase for dogs
  const {
    dogs,
    loading: dogsLoading,
    addDog: addSupabaseDog,
    addDogs: addSupabaseDogs,
    updateDog: updateSupabaseDog,
    deleteDog: deleteSupabaseDog,
    toggleDogActive: toggleSupabaseDogActive,
  } = useSupabaseDogs();

  // Use Supabase for boardings
  const {
    boardings,
    loading: boardingsLoading,
    addBoarding: addSupabaseBoarding,
    addBoardings: addSupabaseBoardings,
    updateBoarding: updateSupabaseBoarding,
    deleteBoarding: deleteSupabaseBoarding,
    deleteBoardingsForDog: deleteSupabaseBoardingsForDog,
  } = useSupabaseBoardings();

  // Use Supabase for night assignments (needs employees for name<->ID conversion)
  const {
    nightAssignments,
    loading: nightAssignmentsLoading,
    setNightAssignment: setSupabaseNightAssignment,
    getNightAssignment: getSupabaseNightAssignment,
    deleteAssignmentsForEmployee: deleteSupabaseAssignmentsForEmployee,
  } = useSupabaseNightAssignments(supabaseEmployees);

  // Use Supabase for payments (needs employees for name<->ID conversion)
  const {
    payments,
    loading: paymentsLoading,
    addPayment: addSupabasePayment,
    deletePayment: deleteSupabasePayment,
    getPaidDatesForEmployee: getSupabasePaidDatesForEmployee,
  } = useSupabasePayments(supabaseEmployees);

  // Combine Supabase settings with employees into unified settings object
  const settings = useMemo(() => ({
    netPercentage: supabaseSettings?.netPercentage ?? 65,
    netPercentageHistory: supabaseSettings?.netPercentageHistory ?? [],
    employees: supabaseEmployees ?? [],
  }), [supabaseSettings, supabaseEmployees]);

  // Dog operations (using Supabase)
  const addDog = async (dog) => {
    try {
      const newDog = await addSupabaseDog(dog);
      logger.dog('Added', newDog.name);
      return newDog;
    } catch (err) {
      console.error('Failed to add dog:', err);
      throw err;
    }
  };

  const updateDog = async (id, updates) => {
    const dog = dogs.find(d => d.id === id);
    try {
      await updateSupabaseDog(id, updates);
      logger.dog('Updated', dog?.name);
    } catch (err) {
      console.error('Failed to update dog:', err);
      throw err;
    }
  };

  const deleteDog = async (id) => {
    const dog = dogs.find(d => d.id === id);
    try {
      // Boardings are cascade deleted in Supabase, but we need to refresh local state
      await deleteSupabaseBoardingsForDog(id);
      await deleteSupabaseDog(id);
      logger.dog('Deleted', dog?.name);
    } catch (err) {
      console.error('Failed to delete dog:', err);
      throw err;
    }
  };

  const toggleDogActive = async (id) => {
    const dog = dogs.find(d => d.id === id);
    const newActive = !dog?.active;
    try {
      await toggleSupabaseDogActive(id);
      logger.dog(newActive ? 'Activated' : 'Deactivated', dog?.name);
    } catch (err) {
      console.error('Failed to toggle dog:', err);
      throw err;
    }
  };

  const addDogs = async (newDogs) => {
    try {
      await addSupabaseDogs(newDogs);
      logger.dog('Imported', `${newDogs.length} dogs`);
    } catch (err) {
      console.error('Failed to import dogs:', err);
      throw err;
    }
  };

  // Boarding operations (using Supabase)
  const addBoarding = async (boarding) => {
    try {
      const newBoarding = await addSupabaseBoarding(boarding);
      const dog = dogs.find(d => d.id === boarding.dogId);
      logger.boarding('Added', `${dog?.name || 'Unknown'}: ${boarding.arrivalDateTime.split('T')[0]} → ${boarding.departureDateTime.split('T')[0]}`);
      return newBoarding;
    } catch (err) {
      console.error('Failed to add boarding:', err);
      throw err;
    }
  };

  const updateBoarding = async (id, updates) => {
    const boarding = boardings.find(b => b.id === id);
    const dog = dogs.find(d => d.id === boarding?.dogId);
    try {
      await updateSupabaseBoarding(id, updates);
      logger.boarding('Updated', dog?.name || 'Unknown');
    } catch (err) {
      console.error('Failed to update boarding:', err);
      throw err;
    }
  };

  const deleteBoarding = async (id) => {
    const boarding = boardings.find(b => b.id === id);
    const dog = dogs.find(d => d.id === boarding?.dogId);
    try {
      await deleteSupabaseBoarding(id);
      logger.boarding('Deleted', dog?.name || 'Unknown');
    } catch (err) {
      console.error('Failed to delete boarding:', err);
      throw err;
    }
  };

  const addBoardings = async (newBoardings) => {
    try {
      await addSupabaseBoardings(newBoardings);
      logger.boarding('Imported', `${newBoardings.length} boardings`);
    } catch (err) {
      console.error('Failed to import boardings:', err);
      throw err;
    }
  };

  // Settings operations
  const updateSettings = (updates) => {
    // Handle employee updates locally
    if (updates.employees !== undefined) {
      setLocalSettings(prev => ({ ...prev, employees: updates.employees }));
    }
    // Net percentage updates are handled by setNetPercentage
    if (updates.netPercentage !== undefined) {
      logger.settings('Net percentage', `${updates.netPercentage}%`);
    }
  };

  const getNetPercentageForDate = (dateStr) => {
    // Use Supabase function if available
    if (getSupabaseNetPercentageForDate) {
      return getSupabaseNetPercentageForDate(dateStr);
    }
    // Fallback for when not logged in
    return 65;
  };

  const setNetPercentage = async (percentage, effectiveDate = null) => {
    try {
      await updateSupabaseNetPercentage(percentage, effectiveDate);
      if (effectiveDate) {
        logger.settings('Net percentage', `${percentage}% from ${effectiveDate}`);
      } else {
        logger.settings('Net percentage', `${percentage}% (all dates)`);
      }
    } catch (err) {
      console.error('Failed to update net percentage:', err);
      throw err;
    }
  };

  const addEmployee = async (name) => {
    try {
      await addSupabaseEmployee(name);
      logger.settings('Added employee', name);
    } catch (err) {
      console.error('Failed to add employee:', err);
      throw err;
    }
  };

  const deleteEmployee = async (name) => {
    try {
      await deleteSupabaseAssignmentsForEmployee(name);
      await deleteSupabaseEmployee(name);
      logger.settings('Deleted employee', name);
    } catch (err) {
      console.error('Failed to delete employee:', err);
      throw err;
    }
  };

  const toggleEmployeeActive = async (name) => {
    try {
      await toggleSupabaseEmployeeActive(name);
    } catch (err) {
      console.error('Failed to toggle employee:', err);
      throw err;
    }
  };

  const reorderEmployees = (fromIndex, toIndex) => {
    reorderSupabaseEmployees(fromIndex, toIndex);
  };

  // Night assignment operations (using Supabase)
  const setNightAssignment = async (date, employeeName) => {
    try {
      await setSupabaseNightAssignment(date, employeeName);
      if (employeeName) {
        logger.settings('Assigned', `${date} → ${employeeName}`);
      } else {
        logger.settings('Unassigned', date);
      }
    } catch (err) {
      console.error('Failed to set night assignment:', err);
      throw err;
    }
  };

  const getNightAssignment = (date) => {
    return getSupabaseNightAssignment(date);
  };

  // Payment operations (using Supabase)
  const addPayment = async (payment) => {
    try {
      const newPayment = await addSupabasePayment(payment);
      logger.settings('Payment recorded', `${payment.employeeName}: $${payment.amount.toFixed(2)}`);
      return newPayment;
    } catch (err) {
      console.error('Failed to add payment:', err);
      throw err;
    }
  };

  const deletePayment = async (id) => {
    const payment = payments.find(p => p.id === id);
    try {
      await deleteSupabasePayment(id);
      if (payment) {
        logger.settings('Payment deleted', `${payment.employeeName}: $${payment.amount.toFixed(2)}`);
      }
    } catch (err) {
      console.error('Failed to delete payment:', err);
      throw err;
    }
  };

  const getPaidDatesForEmployee = (employeeName) => {
    return getSupabasePaidDatesForEmployee(employeeName);
  };

  const value = {
    // Data
    dogs,
    boardings,
    settings,
    settingsLoading,
    employeesLoading,
    dogsLoading,
    boardingsLoading,
    nightAssignmentsLoading,
    paymentsLoading,
    nightAssignments,
    payments,
    // Dog operations
    addDog,
    addDogs,
    updateDog,
    deleteDog,
    toggleDogActive,
    // Boarding operations
    addBoarding,
    updateBoarding,
    deleteBoarding,
    addBoardings,
    // Settings operations
    updateSettings,
    getNetPercentageForDate,
    setNetPercentage,
    addEmployee,
    deleteEmployee,
    toggleEmployeeActive,
    reorderEmployees,
    // Night assignment operations
    setNightAssignment,
    getNightAssignment,
    // Payment operations
    addPayment,
    deletePayment,
    getPaidDatesForEmployee,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
