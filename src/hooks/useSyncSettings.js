/**
 * Hook for managing external sync settings and operations
 * @requirements REQ-104, REQ-107
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  SyncStatus,
  getSyncSettings,
  getRecentSyncLogs,
  isSyncRunning,
  abortStuckSync,
  runSync,
} from '../lib/scraper/sync.js';

export function useSyncSettings() {
  const [settings, setSettings] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [error, setError] = useState(null);

  // Load settings and logs
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Clean up any sync logs stuck in 'running' state for more than 30 minutes.
      // This prevents the UI from being permanently blocked after a browser crash
      // or page close during a previous sync.
      await abortStuckSync(supabase, 30).catch(() => {});

      const [settingsData, logsData, running] = await Promise.all([
        getSyncSettings(supabase),
        getRecentSyncLogs(supabase, 10),
        isSyncRunning(supabase),
      ]);

      console.log('[SyncSettings] loadData result:', { settingsData, logsData, running });

      setSettings(settingsData || {
        enabled: false,
        interval_minutes: 60,
        last_sync_at: null,
        last_sync_status: null,
        last_sync_message: null,
        setup_mode: true,
        setup_mode_completed_at: null,
      });
      setSyncLogs(logsData);
      setSyncing(running);
    } catch (err) {
      console.error('[SyncSettings] loadData error:', err);
      console.error('[SyncSettings] Error details:', {
        message: err.message,
        code: err.code,
        details: err.details,
        hint: err.hint,
      });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Trigger manual sync with optional date range.
  // startDate/endDate are local-time Date objects (use new Date(y, m-1, d) — NOT new Date('YYYY-MM-DD')).
  // Pass null for either to run a full sync with no date bounds.
  const triggerSync = useCallback(async (startDate = null, endDate = null) => {
    if (syncing) return;

    try {
      console.log('[SyncSettings] triggerSync started', { startDate, endDate });
      setSyncing(true);
      setSyncProgress({ stage: 'starting' });
      setError(null);

      const result = await runSync({
        supabase,
        ...(startDate != null ? { startDate } : {}),
        ...(endDate != null ? { endDate } : {}),
        onProgress: (progress) => {
          console.log('[SyncSettings] sync progress:', progress);
          setSyncProgress(progress);
        },
      });

      console.log('[SyncSettings] sync completed:', result);

      // Reload data after sync
      await loadData();

      return result;
    } catch (err) {
      console.error('[SyncSettings] triggerSync error:', err);
      console.error('[SyncSettings] Error details:', {
        message: err.message,
        code: err.code,
        details: err.details,
        hint: err.hint,
        stack: err.stack,
      });
      setError(err.message);
      throw err;
    } finally {
      setSyncing(false);
      setSyncProgress(null);
    }
  }, [syncing, loadData]);

  // Refresh data
  const refresh = useCallback(() => {
    return loadData();
  }, [loadData]);

  return {
    settings,
    syncLogs,
    loading,
    syncing,
    syncProgress,
    error,
    triggerSync,
    refresh,
    SyncStatus,
  };
}

export default useSyncSettings;
