import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { DataProvider, useData } from './DataContext';

// Mock useLocalStorage to control test data
let mockSettings;
let mockPayments;
let mockNightAssignments;

const mockSetSettings = vi.fn((newSettings) => {
  if (typeof newSettings === 'function') {
    mockSettings = newSettings(mockSettings);
  } else {
    mockSettings = newSettings;
  }
});

const mockSetPayments = vi.fn((newPayments) => {
  if (typeof newPayments === 'function') {
    mockPayments = newPayments(mockPayments);
  } else {
    mockPayments = newPayments;
  }
});

const mockSetNightAssignments = vi.fn((newAssignments) => {
  if (typeof newAssignments === 'function') {
    mockNightAssignments = newAssignments(mockNightAssignments);
  } else {
    mockNightAssignments = newAssignments;
  }
});

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: vi.fn((key, defaultValue) => {
    if (key === 'settings') {
      return [mockSettings, mockSetSettings];
    }
    if (key === 'payments') {
      return [mockPayments, mockSetPayments];
    }
    if (key === 'nightAssignments') {
      return [mockNightAssignments, mockSetNightAssignments];
    }
    return [defaultValue, vi.fn()];
  }),
}));

// Mock crypto.randomUUID for predictable IDs in tests
vi.stubGlobal('crypto', {
  randomUUID: vi.fn(() => 'test-uuid-123'),
});

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
    mockPayments = [];
    mockNightAssignments = [];
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
    mockPayments = [];
    mockNightAssignments = [];
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

// Note: Night assignment operations are tested implicitly through
// EmployeeTotals and SummaryCards tests, and through the useLocalStorage mock

describe('Employee operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [],
    };
    mockPayments = [];
    mockNightAssignments = [];
  });

  it('addEmployee adds new employee', () => {
    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.addEmployee('Kate');
    });

    expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({
      employees: [{ name: 'Kate', active: true }],
    }));
  });

  it('addEmployee prevents duplicates (case insensitive)', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [{ name: 'Kate', active: true }],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.addEmployee('KATE');
    });

    // Should not have been called since Kate already exists
    expect(mockSetSettings).not.toHaveBeenCalled();
  });

  it('toggleEmployeeActive toggles active status', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [{ name: 'Kate', active: true }],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.toggleEmployeeActive('Kate');
    });

    expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({
      employees: [{ name: 'Kate', active: false }],
    }));
  });

  it('toggleEmployeeActive handles legacy string employees', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: ['Kate', 'Nick'], // Legacy format: strings instead of objects
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.toggleEmployeeActive('Kate');
    });

    expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({
      employees: [
        { name: 'Kate', active: false },
        { name: 'Nick', active: true },
      ],
    }));
  });

  it('deleteEmployee removes employee from settings', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [
        { name: 'Kate', active: true },
        { name: 'Nick', active: true },
      ],
    };
    mockNightAssignments = [
      { date: '2025-01-15', employeeName: 'Kate' },
      { date: '2025-01-16', employeeName: 'Nick' },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.deleteEmployee('Kate');
    });

    expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({
      employees: [{ name: 'Nick', active: true }],
    }));
  });

  it('deleteEmployee removes employee assignments', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [
        { name: 'Kate', active: true },
        { name: 'Nick', active: true },
      ],
    };
    mockNightAssignments = [
      { date: '2025-01-15', employeeName: 'Kate' },
      { date: '2025-01-16', employeeName: 'Nick' },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.deleteEmployee('Kate');
    });

    expect(mockSetNightAssignments).toHaveBeenCalledWith([
      { date: '2025-01-16', employeeName: 'Nick' },
    ]);
  });

  it('reorderEmployees changes employee order', () => {
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [
        { name: 'Kate', active: true },
        { name: 'Nick', active: true },
        { name: 'Sam', active: true },
      ],
    };

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.reorderEmployees(0, 2); // Move Kate from index 0 to index 2
    });

    expect(mockSetSettings).toHaveBeenCalledWith(expect.objectContaining({
      employees: [
        { name: 'Nick', active: true },
        { name: 'Sam', active: true },
        { name: 'Kate', active: true },
      ],
    }));
  });
});

describe('Payment operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [],
    };
    mockPayments = [];
    mockNightAssignments = [];
    // Reset the mock to return fresh UUID each time
    crypto.randomUUID.mockReturnValue('test-uuid-123');
  });

  it('addPayment creates a new payment record', () => {
    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    const paymentData = {
      employeeName: 'Kate',
      startDate: '2025-01-15',
      endDate: '2025-01-17',
      amount: 90,
      nights: 3,
      dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
    };

    act(() => {
      contextData.addPayment(paymentData);
    });

    expect(mockSetPayments).toHaveBeenCalled();
    const newPayments = mockSetPayments.mock.calls[0][0];
    expect(newPayments).toHaveLength(1);
    expect(newPayments[0]).toMatchObject({
      ...paymentData,
      id: 'test-uuid-123',
    });
    expect(newPayments[0].paidDate).toBeDefined();
  });

  it('addPayment returns the created payment', () => {
    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    let result;
    act(() => {
      result = contextData.addPayment({
        employeeName: 'Kate',
        amount: 90,
        nights: 3,
        dates: ['2025-01-15', '2025-01-16', '2025-01-17'],
      });
    });

    expect(result.id).toBe('test-uuid-123');
    expect(result.employeeName).toBe('Kate');
  });

  it('addPayment sets paidDate to today', () => {
    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.addPayment({
        employeeName: 'Kate',
        amount: 90,
        nights: 3,
        dates: ['2025-01-15'],
      });
    });

    const today = new Date().toISOString().split('T')[0];
    const newPayments = mockSetPayments.mock.calls[0][0];
    expect(newPayments[0].paidDate).toBe(today);
  });

  it('deletePayment removes payment by id', () => {
    mockPayments = [
      { id: 'payment-1', employeeName: 'Kate', amount: 90, dates: ['2025-01-15'] },
      { id: 'payment-2', employeeName: 'Nick', amount: 60, dates: ['2025-01-16'] },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.deletePayment('payment-1');
    });

    expect(mockSetPayments).toHaveBeenCalled();
    const remainingPayments = mockSetPayments.mock.calls[0][0];
    expect(remainingPayments).toHaveLength(1);
    expect(remainingPayments[0].id).toBe('payment-2');
  });

  it('deletePayment handles non-existent id gracefully', () => {
    mockPayments = [
      { id: 'payment-1', employeeName: 'Kate', amount: 90, dates: ['2025-01-15'] },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.deletePayment('non-existent-id');
    });

    expect(mockSetPayments).toHaveBeenCalled();
    const remainingPayments = mockSetPayments.mock.calls[0][0];
    expect(remainingPayments).toHaveLength(1);
  });

  it('getPaidDatesForEmployee returns dates from all payments for employee', () => {
    mockPayments = [
      { id: '1', employeeName: 'Kate', dates: ['2025-01-15', '2025-01-16'] },
      { id: '2', employeeName: 'Nick', dates: ['2025-01-17'] },
      { id: '3', employeeName: 'Kate', dates: ['2025-01-20', '2025-01-21'] },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    const kateDates = contextData.getPaidDatesForEmployee('Kate');
    expect(kateDates).toEqual(['2025-01-15', '2025-01-16', '2025-01-20', '2025-01-21']);
  });

  it('getPaidDatesForEmployee returns empty array for employee with no payments', () => {
    mockPayments = [
      { id: '1', employeeName: 'Kate', dates: ['2025-01-15'] },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    const samDates = contextData.getPaidDatesForEmployee('Sam');
    expect(samDates).toEqual([]);
  });

  it('getPaidDatesForEmployee returns empty array when no payments exist', () => {
    mockPayments = [];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    const kateDates = contextData.getPaidDatesForEmployee('Kate');
    expect(kateDates).toEqual([]);
  });
});

describe('Night assignment operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {
      netPercentage: 65,
      netPercentageHistory: [],
      employees: [],
    };
    mockPayments = [];
    mockNightAssignments = [];
  });

  it('setNightAssignment creates new assignment', () => {
    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNightAssignment('2025-01-15', 'Kate');
    });

    expect(mockSetNightAssignments).toHaveBeenCalledWith([
      { date: '2025-01-15', employeeName: 'Kate' },
    ]);
  });

  it('setNightAssignment updates existing assignment', () => {
    mockNightAssignments = [
      { date: '2025-01-15', employeeName: 'Kate' },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNightAssignment('2025-01-15', 'Nick');
    });

    expect(mockSetNightAssignments).toHaveBeenCalledWith([
      { date: '2025-01-15', employeeName: 'Nick' },
    ]);
  });

  it('setNightAssignment removes assignment when employeeName is empty', () => {
    mockNightAssignments = [
      { date: '2025-01-15', employeeName: 'Kate' },
      { date: '2025-01-16', employeeName: 'Nick' },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNightAssignment('2025-01-15', '');
    });

    expect(mockSetNightAssignments).toHaveBeenCalledWith([
      { date: '2025-01-16', employeeName: 'Nick' },
    ]);
  });

  it('setNightAssignment does nothing when removing non-existent assignment', () => {
    mockNightAssignments = [
      { date: '2025-01-15', employeeName: 'Kate' },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    act(() => {
      contextData.setNightAssignment('2025-01-20', '');
    });

    // Should not be called since there's nothing to remove
    expect(mockSetNightAssignments).not.toHaveBeenCalled();
  });

  it('getNightAssignment returns employee name for date', () => {
    mockNightAssignments = [
      { date: '2025-01-15', employeeName: 'Kate' },
    ];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    expect(contextData.getNightAssignment('2025-01-15')).toBe('Kate');
  });

  it('getNightAssignment returns empty string for unassigned date', () => {
    mockNightAssignments = [];

    let contextData;
    render(
      <DataProvider>
        <TestComponent onMount={(data) => { contextData = data; }} />
      </DataProvider>
    );

    expect(contextData.getNightAssignment('2025-01-15')).toBe('');
  });
});
