/**
 * useSyncSettings hook tests
 * @requirements REQ-107
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSyncSettings } from '../../hooks/useSyncSettings';

// Mock the sync module
vi.mock('../../lib/scraper/sync.js', () => ({
  SyncStatus: {
    RUNNING: 'running',
    SUCCESS: 'success',
    PARTIAL: 'partial',
    FAILED: 'failed',
  },
  getSyncSettings: vi.fn().mockResolvedValue({
    enabled: false,
    interval_minutes: 60,
    last_sync_at: null,
    last_sync_status: null,
    last_sync_message: null,
  }),
  updateSyncSettings: vi.fn().mockResolvedValue({}),
  getRecentSyncLogs: vi.fn().mockResolvedValue([]),
  isSyncRunning: vi.fn().mockResolvedValue(false),
  runSync: vi.fn().mockResolvedValue({ success: true }),
}));

// Mock supabase
vi.mock('../../lib/supabase', () => ({
  supabase: {},
}));

describe('REQ-107: useSyncSettings Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setInterval validation', () => {
    it('rejects interval less than 15 minutes', async () => {
      const { result } = renderHook(() => useSyncSettings());

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.setInterval(10);
      });

      expect(result.current.error).toBe('Sync interval must be between 15 minutes and 24 hours');
    });

    it('rejects interval greater than 1440 minutes (24 hours)', async () => {
      const { result } = renderHook(() => useSyncSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.setInterval(1500);
      });

      expect(result.current.error).toBe('Sync interval must be between 15 minutes and 24 hours');
    });

    it('rejects non-numeric interval', async () => {
      const { result } = renderHook(() => useSyncSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.setInterval('invalid');
      });

      expect(result.current.error).toBe('Sync interval must be between 15 minutes and 24 hours');
    });

    it('accepts valid interval of 30 minutes', async () => {
      const { result } = renderHook(() => useSyncSettings());
      const { updateSyncSettings } = await import('../../lib/scraper/sync.js');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.setInterval(30);
      });

      expect(updateSyncSettings).toHaveBeenCalledWith(expect.anything(), { interval_minutes: 30 });
      expect(result.current.error).toBeNull();
    });

    it('accepts valid interval at boundary (15 minutes)', async () => {
      const { result } = renderHook(() => useSyncSettings());
      const { updateSyncSettings } = await import('../../lib/scraper/sync.js');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.setInterval(15);
      });

      expect(updateSyncSettings).toHaveBeenCalledWith(expect.anything(), { interval_minutes: 15 });
    });

    it('accepts valid interval at boundary (1440 minutes)', async () => {
      const { result } = renderHook(() => useSyncSettings());
      const { updateSyncSettings } = await import('../../lib/scraper/sync.js');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.setInterval(1440);
      });

      expect(updateSyncSettings).toHaveBeenCalledWith(expect.anything(), { interval_minutes: 1440 });
    });

    it('parses string numbers correctly', async () => {
      const { result } = renderHook(() => useSyncSettings());
      const { updateSyncSettings } = await import('../../lib/scraper/sync.js');

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      await act(async () => {
        await result.current.setInterval('60');
      });

      expect(updateSyncSettings).toHaveBeenCalledWith(expect.anything(), { interval_minutes: 60 });
    });
  });
});
