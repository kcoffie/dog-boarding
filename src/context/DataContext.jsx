import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { logger } from '../utils/logger';

const DataContext = createContext(null);

const initialSettings = {
  netPercentage: 65,
  employees: [],
};

export function DataProvider({ children }) {
  const [dogs, setDogs] = useLocalStorage('dogs', []);
  const [boardings, setBoardings] = useLocalStorage('boardings', []);
  const [settings, setSettings] = useLocalStorage('settings', initialSettings);
  const [nightAssignments, setNightAssignments] = useLocalStorage('nightAssignments', []);

  // Dog operations
  const addDog = (dog) => {
    const newDog = {
      ...dog,
      id: crypto.randomUUID(),
      active: true,
    };
    setDogs([...dogs, newDog]);
    logger.dog('Added', newDog.name);
    return newDog;
  };

  const updateDog = (id, updates) => {
    const dog = dogs.find(d => d.id === id);
    setDogs(dogs.map((dog) => (dog.id === id ? { ...dog, ...updates } : dog)));
    logger.dog('Updated', dog?.name);
  };

  const deleteDog = (id) => {
    const dog = dogs.find(d => d.id === id);
    setDogs(dogs.filter((dog) => dog.id !== id));
    setBoardings(boardings.filter((b) => b.dogId !== id));
    logger.dog('Deleted', dog?.name);
  };

  const toggleDogActive = (id) => {
    const dog = dogs.find(d => d.id === id);
    const newActive = !dog?.active;
    setDogs(dogs.map((dog) =>
      dog.id === id ? { ...dog, active: !dog.active } : dog
    ));
    logger.dog(newActive ? 'Activated' : 'Deactivated', dog?.name);
  };

  const addDogs = (newDogs) => {
    const dogsWithIds = newDogs.map((d) => ({
      ...d,
      id: crypto.randomUUID(),
      active: true,
    }));
    setDogs([...dogs, ...dogsWithIds]);
    logger.dog('Imported', `${newDogs.length} dogs`);
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
    setSettings({ ...settings, ...updates });
    if (updates.netPercentage !== undefined) {
      logger.settings('Net percentage', `${updates.netPercentage}%`);
    }
  };

  const addEmployee = (name) => {
    const employeeNames = settings.employees.map(e => typeof e === 'string' ? e : e.name);
    if (!employeeNames.some(n => n.toLowerCase() === name.toLowerCase())) {
      setSettings({
        ...settings,
        employees: [...settings.employees, { name, active: true }],
      });
      logger.settings('Added employee', name);
    }
  };

  const deleteEmployee = (name) => {
    setSettings({
      ...settings,
      employees: settings.employees.filter((e) => (typeof e === 'string' ? e : e.name) !== name),
    });
    setNightAssignments(nightAssignments.filter((a) => a.employeeName !== name));
    logger.settings('Deleted employee', name);
  };

  const toggleEmployeeActive = (name) => {
    setSettings({
      ...settings,
      employees: settings.employees.map((e) => {
        const empName = typeof e === 'string' ? e : e.name;
        if (empName === name) {
          const currentActive = typeof e === 'string' ? true : e.active;
          return { name: empName, active: !currentActive };
        }
        return typeof e === 'string' ? { name: e, active: true } : e;
      }),
    });
  };

  const reorderEmployees = (fromIndex, toIndex) => {
    const newEmployees = [...settings.employees];
    const [removed] = newEmployees.splice(fromIndex, 1);
    newEmployees.splice(toIndex, 0, removed);
    setSettings({ ...settings, employees: newEmployees });
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

  const value = {
    // Data
    dogs,
    boardings,
    settings,
    nightAssignments,
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
    addEmployee,
    deleteEmployee,
    toggleEmployeeActive,
    reorderEmployees,
    // Night assignment operations
    setNightAssignment,
    getNightAssignment,
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
