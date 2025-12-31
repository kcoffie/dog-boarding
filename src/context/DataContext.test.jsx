import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DataProvider, useData } from './DataContext';

// Mock useLocalStorage to control test data
let mockSettings;
const mockSetSettings = vi.fn((newSettings) => {
  if (typeof newSettings === 'function') {
    mockSettings = newSettings(mockSettings);
  } else {
    mockSettings = newSettings;
  }
});

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: vi.fn((key, defaultValue) => {
    if (key === 'settings') {
      return [mockSettings, mockSetSettings];
    }
    return [defaultValue, vi.fn()];
  }),
}));

// Test component to access context
function TestComponent({ onMount }) {
  const data = useData();
  onMount(data);
  return null;
}

describe('getNetPercentageForDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [],
    };
  });

  it('returns current percentage when no history', () => {
    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    expect(contextData.getNetPercentageForDate('2025-01-15')).toBe(65);
  });

  it('returns current percentage for date after single history entry', () => {
    mockSettings = {
      netPercentage: 70,
      netPercentageHistory: [{ effectiveDate: '2025-01-10', percentage: 70 }],
      employees: [],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    expect(contextData.getNetPercentageForDate('2025-01-15')).toBe(70);
  });

  it('returns historical percentage for date before history entry', () => {
    mockSettings = {
      netPercentage: 70,
      netPercentageHistory: [{ effectiveDate: '2025-01-10', percentage: 70 }],
      employees: [],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    // Date before the effective date should return the earliest entry's percentage
    expect(contextData.getNetPercentageForDate('2025-01-05')).toBe(70);
  });

  it('returns correct percentage with multiple history entries', () => {
    mockSettings = {
      netPercentage: 75,
      netPercentageHistory: [
        { effectiveDate: '2025-01-01', percentage: 60 },
        { effectiveDate: '2025-01-15', percentage: 65 },
        { effectiveDate: '2025-02-01', percentage: 75 },
      ],
      employees: [],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    // Should find most recent entry <= date
    expect(contextData.getNetPercentageForDate('2025-01-10')).toBe(60);
    expect(contextData.getNetPercentageForDate('2025-01-15')).toBe(65);
    expect(contextData.getNetPercentageForDate('2025-01-20')).toBe(65);
    expect(contextData.getNetPercentageForDate('2025-02-01')).toBe(75);
    expect(contextData.getNetPercentageForDate('2025-03-01')).toBe(75);
  });

  it('handles exact date match', () => {
    mockSettings = {
      netPercentage: 70,
      netPercentageHistory: [{ effectiveDate: '2025-01-15', percentage: 70 }],
      employees: [],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    expect(contextData.getNetPercentageForDate('2025-01-15')).toBe(70);
  });
});

describe('setNetPercentage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [],
    };
  });

  it('sets percentage retroactively (clears history) when no effective date', () => {
    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNetPercentage(70, null);
    });

    expect(mockSetSettings).toHaveBeenCalledWith({
      netPercentage: 70,
      netPercentageHistory: [],
      employees: [],
    });
  });

  it('adds to history when effective date provided', () => {
    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNetPercentage(70, '2025-01-15');
    });

    expect(mockSetSettings).toHaveBeenCalledWith({
      netPercentage: 70,
      netPercentageHistory: [{ effectiveDate: '2025-01-15', percentage: 70 }],
      employees: [],
    });
  });

  it('replaces existing entry for same effective date', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [{ effectiveDate: '2025-01-15', percentage: 65 }],
      employees: [],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNetPercentage(70, '2025-01-15');
    });

    expect(mockSetSettings).toHaveBeenCalledWith({
      netPercentage: 70,
      netPercentageHistory: [{ effectiveDate: '2025-01-15', percentage: 70 }],
      employees: [],
    });
  });

  it('preserves other history entries when adding new date', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [{ effectiveDate: '2025-01-01', percentage: 60 }],
      employees: [],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNetPercentage(70, '2025-02-01');
    });

    expect(mockSetSettings).toHaveBeenCalledWith({
      netPercentage: 70,
      netPercentageHistory: [
        { effectiveDate: '2025-01-01', percentage: 60 },
        { effectiveDate: '2025-02-01', percentage: 70 },
      ],
      employees: [],
    });
  });

  it('clears all history when setting retroactively after having history', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [
        { effectiveDate: '2025-01-01', percentage: 60 },
        { effectiveDate: '2025-02-01', percentage: 65 },
      ],
      employees: [],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNetPercentage(75, null);
    });

    expect(mockSetSettings).toHaveBeenCalledWith({
      netPercentage: 75,
      netPercentageHistory: [],
      employees: [],
    });
  });
});
