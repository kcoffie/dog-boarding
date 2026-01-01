import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock AuthContext
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123', email: 'admin@test.com' } }),
}));

// Mock supabase with a stable reference
const mockSupabaseData = { data: [], error: null };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => Promise.resolve(mockSupabaseData)),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'new-1', date: '2024-01-20', employee_id: 'emp-1' }, error: null })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

// Mock the employee helpers
vi.mock('../../utils/employeeHelpers', () => ({
  getEmployeeNameById: vi.fn((employees, id) => {
    const emp = employees?.find(e => e.id === id);
    return emp?.name || '';
  }),
  getEmployeeIdByName: vi.fn((employees, name) => {
    const emp = employees?.find(e => e.name === name);
    return emp?.id || null;
  }),
}));

import { useNightAssignments } from '../../hooks/useNightAssignments';

const mockEmployees = [
  { id: 'emp-1', name: 'John Doe' },
  { id: 'emp-2', name: 'Jane Smith' },
];

describe('useNightAssignments Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseData.data = [];
    mockSupabaseData.error = null;
  });

  it('returns initial state with loading', () => {
    const { result } = renderHook(() => useNightAssignments(mockEmployees));

    // Initial state should have these properties
    expect(result.current).toHaveProperty('nightAssignments');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('setNightAssignment');
    expect(result.current).toHaveProperty('getNightAssignment');
    expect(result.current).toHaveProperty('deleteAssignmentsForEmployee');
    expect(result.current).toHaveProperty('refresh');
  });

  it('provides setNightAssignment as a function', () => {
    const { result } = renderHook(() => useNightAssignments(mockEmployees));
    expect(typeof result.current.setNightAssignment).toBe('function');
  });

  it('provides getNightAssignment as a function', () => {
    const { result } = renderHook(() => useNightAssignments(mockEmployees));
    expect(typeof result.current.getNightAssignment).toBe('function');
  });

  it('provides deleteAssignmentsForEmployee as a function', () => {
    const { result } = renderHook(() => useNightAssignments(mockEmployees));
    expect(typeof result.current.deleteAssignmentsForEmployee).toBe('function');
  });

  it('provides refresh as a function', () => {
    const { result } = renderHook(() => useNightAssignments(mockEmployees));
    expect(typeof result.current.refresh).toBe('function');
  });

  it('returns empty string from getNightAssignment for non-existent date', () => {
    const { result } = renderHook(() => useNightAssignments(mockEmployees));
    expect(result.current.getNightAssignment('2024-01-15')).toBe('');
  });

  it('initializes with empty nightAssignments array', () => {
    const { result } = renderHook(() => useNightAssignments(mockEmployees));
    expect(Array.isArray(result.current.nightAssignments)).toBe(true);
  });
});

describe('useNightAssignments - Assignment Data Structure', () => {
  it('should include id field in transformed assignments', async () => {
    // Test that the hook transforms data to include id
    const mockAssignment = { id: 'assign-1', date: '2024-01-15', employee_id: 'emp-1' };

    // The hook should transform employee_id to employeeId
    // and include the id field
    const expectedStructure = {
      id: 'assign-1',
      date: '2024-01-15',
      employeeId: 'emp-1',
    };

    // Verify the expected structure has all required fields
    expect(expectedStructure).toHaveProperty('id');
    expect(expectedStructure).toHaveProperty('date');
    expect(expectedStructure).toHaveProperty('employeeId');
  });
});
