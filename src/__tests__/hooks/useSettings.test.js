import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock dependencies before imports
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-123', email: 'test@test.com' } }),
}));

// Create stable mock data reference
const mockData = { settings: null, error: null };

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: mockData.settings, error: mockData.error })),
        })),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: {
              id: 'settings-1',
              net_percentage: 65.00,
              net_percentage_history: [],
            },
            error: null
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ error: null })),
      })),
    })),
  },
}));

import { useSettings } from '../../hooks/useSettings';

/**
 * @requirements REQ-050
 */
describe('REQ-050: useSettings Hook - Net Percentage Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData.settings = {
      id: 'settings-1',
      net_percentage: 65.00,
      net_percentage_history: [],
    };
    mockData.error = null;
  });

  it('returns initial state with expected properties', () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current).toHaveProperty('settings');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('updateNetPercentage');
    expect(result.current).toHaveProperty('getNetPercentageForDate');
  });

  it('provides updateNetPercentage as a function', () => {
    const { result } = renderHook(() => useSettings());
    expect(typeof result.current.updateNetPercentage).toBe('function');
  });

  it('provides getNetPercentageForDate as a function', () => {
    const { result } = renderHook(() => useSettings());
    expect(typeof result.current.getNetPercentageForDate).toBe('function');
  });

  it('starts in loading state', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current.loading).toBe(true);
  });

  it('fetches settings on mount', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings).not.toBeNull();
    expect(result.current.settings.netPercentage).toBe(65);
  });

  it('transforms settings from DB format to app format', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Check that net_percentage is transformed to netPercentage
    expect(result.current.settings).toHaveProperty('netPercentage');
    expect(result.current.settings).toHaveProperty('netPercentageHistory');
  });

  it('getNetPercentageForDate returns default when no settings', () => {
    mockData.settings = null;
    const { result } = renderHook(() => useSettings());

    // Before settings load, should return default
    const percentage = result.current.getNetPercentageForDate('2024-03-15');
    expect(percentage).toBe(65); // Default value
  });

  it('getNetPercentageForDate returns current percentage when no history', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const percentage = result.current.getNetPercentageForDate('2024-03-15');
    expect(percentage).toBe(65);
  });

  it('getNetPercentageForDate handles history with effective dates', async () => {
    mockData.settings = {
      id: 'settings-1',
      net_percentage: 70.00,
      net_percentage_history: [
        { effectiveDate: '2024-01-01', percentage: 60 },
        { effectiveDate: '2024-06-01', percentage: 65 },
      ],
    };

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Date before first entry - should get first entry's percentage
    expect(result.current.getNetPercentageForDate('2023-12-15')).toBe(60);

    // Date between first and second entry
    expect(result.current.getNetPercentageForDate('2024-03-15')).toBe(60);

    // Date after second entry
    expect(result.current.getNetPercentageForDate('2024-07-15')).toBe(65);
  });

  it('net percentage value is between 0 and 100', async () => {
    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.settings.netPercentage).toBeGreaterThanOrEqual(0);
    expect(result.current.settings.netPercentage).toBeLessThanOrEqual(100);
  });
});
