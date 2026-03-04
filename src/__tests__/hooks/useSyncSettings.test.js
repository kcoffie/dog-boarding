/**
 * useSyncSettings hook tests
 * @requirements REQ-107
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
    last_sync_at: null,
    last_sync_status: null,
    last_sync_message: null,
  }),
  getRecentSyncLogs: vi.fn().mockResolvedValue([]),
  isSyncRunning: vi.fn().mockResolvedValue(false),
  abortStuckSync: vi.fn().mockResolvedValue({}),
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

  describe('initialization', () => {
    it('loads settings on mount', async () => {
      const { result } = renderHook(() => useSyncSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.settings).toBeTruthy();
      expect(result.current.error).toBeNull();
    });

    it('exposes triggerSync', async () => {
      const { result } = renderHook(() => useSyncSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(typeof result.current.triggerSync).toBe('function');
    });

    it('does not expose removed functions', async () => {
      const { result } = renderHook(() => useSyncSettings());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.toggleEnabled).toBeUndefined();
      expect(result.current.setInterval).toBeUndefined();
      expect(result.current.toggleSetupMode).toBeUndefined();
    });
  });
});
