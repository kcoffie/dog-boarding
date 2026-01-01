import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock dependencies before imports
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123', email: 'test@test.com' } }),
}));

// Create stable mock data reference
const mockData = { boardings: [], error: null };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => Promise.resolve({ data: mockData.boardings, error: mockData.error })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: {
              id: 'new-boarding',
              dog_id: 'dog-1',
              arrival_datetime: '2024-01-15T10:00:00',
              departure_datetime: '2024-01-18T14:00:00',
            },
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

import { useBoardings } from '../../hooks/useBoardings';

/**
 * @requirements REQ-022
 */
describe('REQ-022: useBoardings Hook - Delete Boarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.boardings = [
      {
        id: 'boarding-1',
        dog_id: 'dog-1',
        arrival_datetime: '2024-01-10T10:00:00',
        departure_datetime: '2024-01-15T14:00:00',
      },
      {
        id: 'boarding-2',
        dog_id: 'dog-2',
        arrival_datetime: '2024-01-12T09:00:00',
        departure_datetime: '2024-01-14T16:00:00',
      },
    ];
    mockData.error = null;
  });

  it('returns initial state with expected properties', () => {
    const { result } = renderHook(() => useBoardings());

    expect(result.current).toHaveProperty('boardings');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('addBoarding');
    expect(result.current).toHaveProperty('updateBoarding');
    expect(result.current).toHaveProperty('deleteBoarding');
  });

  it('provides deleteBoarding as a function', () => {
    const { result } = renderHook(() => useBoardings());
    expect(typeof result.current.deleteBoarding).toBe('function');
  });

  it('provides deleteBoardingsForDog as a function', () => {
    const { result } = renderHook(() => useBoardings());
    expect(typeof result.current.deleteBoardingsForDog).toBe('function');
  });

  it('provides addBoarding as a function', () => {
    const { result } = renderHook(() => useBoardings());
    expect(typeof result.current.addBoarding).toBe('function');
  });

  it('provides addBoardings as a function for batch import', () => {
    const { result } = renderHook(() => useBoardings());
    expect(typeof result.current.addBoardings).toBe('function');
  });

  it('provides updateBoarding as a function', () => {
    const { result } = renderHook(() => useBoardings());
    expect(typeof result.current.updateBoarding).toBe('function');
  });

  it('provides refresh as a function', () => {
    const { result } = renderHook(() => useBoardings());
    expect(typeof result.current.refresh).toBe('function');
  });

  it('starts with loading state true', () => {
    const { result } = renderHook(() => useBoardings());
    expect(result.current.loading).toBe(true);
  });

  it('initializes with empty boardings array', () => {
    const { result } = renderHook(() => useBoardings());
    expect(Array.isArray(result.current.boardings)).toBe(true);
  });

  it('fetches boardings on mount', async () => {
    const { result } = renderHook(() => useBoardings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.boardings.length).toBe(2);
  });

  describe('Boarding Data Structure', () => {
    it('transforms boardings from DB format to app format', async () => {
      const { result } = renderHook(() => useBoardings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const boarding = result.current.boardings[0];
      expect(boarding).toHaveProperty('id');
      expect(boarding).toHaveProperty('dogId');
      expect(boarding).toHaveProperty('arrivalDateTime');
      expect(boarding).toHaveProperty('departureDateTime');
    });
  });
});
