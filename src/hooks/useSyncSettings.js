/**
 * Hook for managing external sync settings and operations
 * @requirements REQ-104, REQ-107
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  SyncStatus,
  getSyncSettings,
  updateSyncSettings,
  getRecentSyncLogs,
  isSyncRunning,
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

      const [settingsData, logsData, running] = await Promise.all([
        getSyncSettings(supabase),
        getRecentSyncLogs(supabase, 10),
        isSyncRunning(supabase),
      ]);

      setSettings(settingsData || {
        enabled: false,
        interval_minutes: 60,
        last_sync_at: null,
        last_sync_status: null,
        last_sync_message: null,
      });
      setSyncLogs(logsData);
      setSyncing(running);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Toggle sync enabled
  const toggleEnabled = useCallback(async () => {
    try {
      const newEnabled = !settings?.enabled;
      await updateSyncSettings(supabase, { enabled: newEnabled });
      setSettings(prev => ({ ...prev, enabled: newEnabled }));
    } catch (err) {
      setError(err.message);
    }
  }, [settings?.enabled]);

  // Update sync interval
  const setInterval = useCallback(async (minutes) => {
    try {
      await updateSyncSettings(supabase, { interval_minutes: minutes });
      setSettings(prev => ({ ...prev, interval_minutes: minutes }));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    if (syncing) return;

    try {
      setSyncing(true);
      setSyncProgress({ stage: 'starting' });
      setError(null);

      const result = await runSync({
        supabase,
        onProgress: (progress) => {
          setSyncProgress(progress);
        },
      });

      // Reload data after sync
      await loadData();

      return result;
    } catch (err) {
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
    toggleEnabled,
    setInterval,
    triggerSync,
    refresh,
    SyncStatus,
  };
}

export default useSyncSettings;
