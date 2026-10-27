import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// Only what DataProvider reads from each hook; the hooks themselves have their own tests.
vi.mock('../../hooks/useSettings', () => ({
  useSettings: () => ({ settings: null, loading: false, updateNetPercentage: vi.fn(), getNetPercentageForDate: vi.fn() }),
}));
vi.mock('../../hooks/useEmployees', () => ({
  useEmployees: () => ({ employees: [], loading: false }),
}));
vi.mock('../../hooks/useDogs', () => ({
  useDogs: () => ({ dogs: [], loading: false }),
}));
vi.mock('../../hooks/useBoardings', () => ({
  useBoardings: () => ({ boardings: [], loading: false }),
}));
vi.mock('../../hooks/useNightAssignments', () => ({
  useNightAssignments: () => ({ nightAssignments: [], loading: false }),
}));
vi.mock('../../hooks/usePayments', () => ({
  usePayments: () => ({ payments: [], loading: false }),
}));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { DataProvider, useData } from '../../context/DataContext';

/**
 * @requirements REQ-010, REQ-012, REQ-013
 */
describe('REQ-010, REQ-012, REQ-013: no screen can change a dog or boarding by hand (#351, #342)', () => {
  it('useData offers no dog or boarding write', () => {
    const { result } = renderHook(() => useData(), { wrapper: DataProvider });
    expect(result.current.dogs).toEqual([]);
    for (const write of [
      'addDog', 'addDogs', 'updateDog', 'deleteDog', 'toggleDogActive',
      'addBoarding', 'addBoardings', 'updateBoarding', 'deleteBoarding', 'deleteBoardingsForDog',
    ]) {
      expect(result.current).not.toHaveProperty(write);
    }
  });
});
