import { createContext, useContext } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

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
    };
    setDogs([...dogs, newDog]);
    return newDog;
  };

  const updateDog = (id, updates) => {
    setDogs(dogs.map((dog) => (dog.id === id ? { ...dog, ...updates } : dog)));
  };

  const deleteDog = (id) => {
    setDogs(dogs.filter((dog) => dog.id !== id));
    // Also delete associated boardings
    setBoardings(boardings.filter((b) => b.dogId !== id));
  };

  const addDogs = (newDogs) => {
    const dogsWithIds = newDogs.map((d) => ({
      ...d,
      id: crypto.randomUUID(),
    }));
    setDogs([...dogs, ...dogsWithIds]);
  };

  // Boarding operations
  const addBoarding = (boarding) => {
    const newBoarding = {
      ...boarding,
      id: crypto.randomUUID(),
    };
    setBoardings([...boardings, newBoarding]);
    return newBoarding;
  };

  const updateBoarding = (id, updates) => {
    setBoardings(boardings.map((b) => (b.id === id ? { ...b, ...updates } : b)));
  };

  const deleteBoarding = (id) => {
    setBoardings(boardings.filter((b) => b.id !== id));
  };

  const addBoardings = (newBoardings) => {
    const boardingsWithIds = newBoardings.map((b) => ({
      ...b,
      id: crypto.randomUUID(),
    }));
    setBoardings([...boardings, ...boardingsWithIds]);
  };

  // Settings operations
  const updateSettings = (updates) => {
    setSettings({ ...settings, ...updates });
  };

  const addEmployee = (name) => {
    if (!settings.employees.includes(name)) {
      setSettings({
        ...settings,
        employees: [...settings.employees, name],
      });
    }
  };

  const deleteEmployee = (name) => {
    setSettings({
      ...settings,
      employees: settings.employees.filter((e) => e !== name),
    });
    // Also remove their night assignments
    setNightAssignments(nightAssignments.filter((a) => a.employeeName !== name));
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
      } else {
        setNightAssignments(nightAssignments.filter((a) => a.date !== date));
      }
    } else if (employeeName) {
      setNightAssignments([...nightAssignments, { date, employeeName }]);
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
    // Boarding operations
    addBoarding,
    updateBoarding,
    deleteBoarding,
    addBoardings,
    // Settings operations
    updateSettings,
    addEmployee,
    deleteEmployee,
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
