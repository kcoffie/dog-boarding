import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock dependencies before imports
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123', email: 'test@test.com' } }),
}));

// Create stable mock data reference
const mockData = { dogs: [], error: null };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockData.dogs, error: mockData.error })),
      })),
    })),
  },
}));

import { useDogs } from '../../hooks/useDogs';

/**
 * @requirements REQ-010, REQ-012, REQ-013
 */
describe('REQ-010, REQ-012, REQ-013: useDogs Hook - dogs come only from the sync (#351)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.dogs = [
      { id: 'dog-1', name: 'Luna', day_rate: 35, night_rate: 45, notes: '', active: true },
      { id: 'dog-2', name: 'Max', day_rate: 40, night_rate: 50, notes: 'Friendly', active: true },
    ];
    mockData.error = null;
  });

  it('returns initial state with expected properties', () => {
    const { result } = renderHook(() => useDogs());

    expect(result.current).toHaveProperty('dogs');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
  });

  it("can't add, import, edit, delete or deactivate a dog by hand (the booking site is the source of truth)", () => {
    const { result } = renderHook(() => useDogs());
    for (const write of ['addDog', 'addDogs', 'updateDog', 'deleteDog', 'toggleDogActive']) {
      expect(result.current).not.toHaveProperty(write);
    }
  });

  it('provides refresh as a function', () => {
    const { result } = renderHook(() => useDogs());
    expect(typeof result.current.refresh).toBe('function');
  });

  it('starts with loading state true', () => {
    const { result } = renderHook(() => useDogs());
    expect(result.current.loading).toBe(true);
  });

  it('initializes with empty dogs array', () => {
    const { result } = renderHook(() => useDogs());
    expect(Array.isArray(result.current.dogs)).toBe(true);
  });

  describe('Fetch dogs', () => {
    it('fetches dogs from supabase on mount', async () => {
      const { result } = renderHook(() => useDogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.dogs.length).toBe(2);
    });
  });

  describe('Dog active status (set by the sync)', () => {
    it('dogs have active property', async () => {
      const { result } = renderHook(() => useDogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.dogs[0]).toHaveProperty('active');
      expect(result.current.dogs[0].active).toBe(true);
    });

    it('can filter active dogs from list', async () => {
      mockData.dogs = [
        { id: 'dog-1', name: 'Luna', day_rate: 35, night_rate: 45, notes: '', active: true },
        { id: 'dog-2', name: 'Max', day_rate: 40, night_rate: 50, notes: '', active: false },
      ];

      const { result } = renderHook(() => useDogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const activeDogs = result.current.dogs.filter(d => d.active);
      expect(activeDogs.length).toBe(1);
      expect(activeDogs[0].name).toBe('Luna');

      const inactiveDogs = result.current.dogs.filter(d => !d.active);
      expect(inactiveDogs.length).toBe(1);
      expect(inactiveDogs[0].name).toBe('Max');
    });
  });

  describe('Dog Data Structure', () => {
    it('transforms dogs from DB format to app format', async () => {
      const { result } = renderHook(() => useDogs());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const dog = result.current.dogs[0];
      expect(dog).toHaveProperty('id');
      expect(dog).toHaveProperty('name');
      expect(dog).toHaveProperty('dayRate');
      expect(dog).toHaveProperty('nightRate');
      expect(dog).toHaveProperty('notes');
      expect(dog).toHaveProperty('active');
    });
  });
});
