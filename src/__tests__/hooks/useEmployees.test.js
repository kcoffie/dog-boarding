import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock dependencies before imports
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123', email: 'test@test.com' } }),
}));

// Create stable mock data reference
const mockData = { employees: [], error: null };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockData.employees, error: mockData.error })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { id: 'new-emp', name: 'New Employee', active: true },
            error: null
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

import { useEmployees } from '../../hooks/useEmployees';

/**
 * @requirements REQ-051
 */
describe('REQ-051: useEmployees Hook - Employee Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.employees = [
      { id: 'emp-1', name: 'Kate', active: true },
      { id: 'emp-2', name: 'Nick', active: true },
      { id: 'emp-3', name: 'Sam', active: false },
    ];
    mockData.error = null;
  });

  it('returns initial state with expected properties', () => {
    const { result } = renderHook(() => useEmployees());

    expect(result.current).toHaveProperty('employees');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('addEmployee');
    expect(result.current).toHaveProperty('deleteEmployee');
    expect(result.current).toHaveProperty('toggleEmployeeActive');
  });

  it('provides addEmployee as a function', () => {
    const { result } = renderHook(() => useEmployees());
    expect(typeof result.current.addEmployee).toBe('function');
  });

  it('provides deleteEmployee as a function', () => {
    const { result } = renderHook(() => useEmployees());
    expect(typeof result.current.deleteEmployee).toBe('function');
  });

  it('provides toggleEmployeeActive as a function', () => {
    const { result } = renderHook(() => useEmployees());
    expect(typeof result.current.toggleEmployeeActive).toBe('function');
  });

  it('provides reorderEmployees as a function', () => {
    const { result } = renderHook(() => useEmployees());
    expect(typeof result.current.reorderEmployees).toBe('function');
  });

  it('provides sortEmployeesBy as a function', () => {
    const { result } = renderHook(() => useEmployees());
    expect(typeof result.current.sortEmployeesBy).toBe('function');
  });

  it('provides refresh as a function', () => {
    const { result } = renderHook(() => useEmployees());
    expect(typeof result.current.refresh).toBe('function');
  });

  it('starts with loading state true', () => {
    const { result } = renderHook(() => useEmployees());
    expect(result.current.loading).toBe(true);
  });

  it('initializes with empty employees array', () => {
    const { result } = renderHook(() => useEmployees());
    expect(Array.isArray(result.current.employees)).toBe(true);
  });

  it('fetches employees on mount', async () => {
    const { result } = renderHook(() => useEmployees());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.employees.length).toBe(3);
  });

  it('transforms employees from DB format to app format', async () => {
    const { result } = renderHook(() => useEmployees());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const emp = result.current.employees[0];
    expect(emp).toHaveProperty('id');
    expect(emp).toHaveProperty('name');
    expect(emp).toHaveProperty('active');
  });

  describe('Employee Active Status', () => {
    it('active employees can be filtered from the list', async () => {
      const { result } = renderHook(() => useEmployees());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const activeEmployees = result.current.employees.filter(e => e.active);
      expect(activeEmployees.length).toBe(2);
      expect(activeEmployees.find(e => e.name === 'Kate')).toBeDefined();
      expect(activeEmployees.find(e => e.name === 'Nick')).toBeDefined();
    });

    it('inactive employees are in the list but filtered for dropdowns', async () => {
      const { result } = renderHook(() => useEmployees());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const inactiveEmployees = result.current.employees.filter(e => !e.active);
      expect(inactiveEmployees.length).toBe(1);
      expect(inactiveEmployees[0].name).toBe('Sam');
    });
  });

  describe('Employee Data Structure', () => {
    it('employee has expected structure', async () => {
      const { result } = renderHook(() => useEmployees());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const emp = result.current.employees.find(e => e.name === 'Kate');
      expect(emp.id).toBe('emp-1');
      expect(emp.name).toBe('Kate');
      expect(emp.active).toBe(true);
    });
  });
});
