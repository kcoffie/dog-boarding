import { createContext, useContext, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useSettings as useSupabaseSettings } from '../hooks/useSettings';
import { useEmployees as useSupabaseEmployees } from '../hooks/useEmployees';
import { useDogs as useSupabaseDogs } from '../hooks/useDogs';
import { useAuth } from './AuthContext';
import { logger } from '../utils/logger';

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const { user } = useAuth();
  const [boardings, setBoardings] = useLocalStorage('boardings', []);
  const [nightAssignments, setNightAssignments] = useLocalStorage('nightAssignments', []);
  const [payments, setPayments] = useLocalStorage('payments', []);

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
      await deleteSupabaseDog(id);
      setBoardings(boardings.filter((b) => b.dogId !== id));
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

  // Boarding operations
  const addBoarding = (boarding) => {
    const newBoarding = {
      ...boarding,
      id: crypto.randomUUID(),
    };
    setBoardings([...boardings, newBoarding]);
    const dog = dogs.find(d => d.id === boarding.dogId);
    logger.boarding('Added', `${dog?.name || 'Unknown'}: ${boarding.arrivalDateTime.split('T')[0]} → ${boarding.departureDateTime.split('T')[0]}`);
    return newBoarding;
  };

  const updateBoarding = (id, updates) => {
    const boarding = boardings.find(b => b.id === id);
    const dog = dogs.find(d => d.id === boarding?.dogId);
    setBoardings(boardings.map((b) => (b.id === id ? { ...b, ...updates } : b)));
    logger.boarding('Updated', dog?.name || 'Unknown');
  };

  const deleteBoarding = (id) => {
    const boarding = boardings.find(b => b.id === id);
    const dog = dogs.find(d => d.id === boarding?.dogId);
    setBoardings(boardings.filter((b) => b.id !== id));
    logger.boarding('Deleted', dog?.name || 'Unknown');
  };

  const addBoardings = (newBoardings) => {
    const boardingsWithIds = newBoardings.map((b) => ({
      ...b,
      id: crypto.randomUUID(),
    }));
    setBoardings([...boardings, ...boardingsWithIds]);
    logger.boarding('Imported', `${newBoardings.length} boardings`);
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
      await deleteSupabaseEmployee(name);
      setNightAssignments(nightAssignments.filter((a) => a.employeeName !== name));
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

  // Night assignment operations
  const setNightAssignment = (date, employeeName) => {
    const existing = nightAssignments.find((a) => a.date === date);
    if (existing) {
      if (employeeName) {
        setNightAssignments(
          nightAssignments.map((a) =>
            a.date === date ? { ...a, employeeName } : a
          )
        );
        logger.settings('Assigned', `${date} → ${employeeName}`);
      } else {
        setNightAssignments(nightAssignments.filter((a) => a.date !== date));
        logger.settings('Unassigned', date);
      }
    } else if (employeeName) {
      setNightAssignments([...nightAssignments, { date, employeeName }]);
      logger.settings('Assigned', `${date} → ${employeeName}`);
    }
  };

  const getNightAssignment = (date) => {
    return nightAssignments.find((a) => a.date === date)?.employeeName || '';
  };

  // Payment operations
  const addPayment = (payment) => {
    const newPayment = {
      ...payment,
      id: crypto.randomUUID(),
      paidDate: new Date().toISOString().split('T')[0],
    };
    setPayments([...payments, newPayment]);
    logger.settings('Payment recorded', `${payment.employeeName}: $${payment.amount.toFixed(2)}`);
    return newPayment;
  };

  const deletePayment = (id) => {
    const payment = payments.find(p => p.id === id);
    setPayments(payments.filter(p => p.id !== id));
    if (payment) {
      logger.settings('Payment deleted', `${payment.employeeName}: $${payment.amount.toFixed(2)}`);
    }
  };

  const getPaidDatesForEmployee = (employeeName) => {
    return payments
      .filter(p => p.employeeName === employeeName)
      .flatMap(p => p.dates);
  };

  const value = {
    // Data
    dogs,
    boardings,
    settings,
    settingsLoading,
    employeesLoading,
    dogsLoading,
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
