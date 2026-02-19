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

  // Toggle sync enabled
  const toggleEnabled = useCallback(async () => {
    try {
      const newEnabled = !settings?.enabled;
      console.log('[SyncSettings] toggleEnabled:', newEnabled);
      await updateSyncSettings(supabase, { enabled: newEnabled });
      setSettings(prev => ({ ...prev, enabled: newEnabled }));
    } catch (err) {
      console.error('[SyncSettings] toggleEnabled error:', err);
      console.error('[SyncSettings] Error details:', {
        message: err.message,
        code: err.code,
        details: err.details,
        hint: err.hint,
      });
      setError(err.message);
    }
  }, [settings?.enabled]);

  // Update sync interval with validation
  const setInterval = useCallback(async (minutes) => {
    // Validate input
    const parsedMinutes = parseInt(minutes, 10);
    if (isNaN(parsedMinutes) || parsedMinutes < 15 || parsedMinutes > 1440) {
      setError('Sync interval must be between 15 minutes and 24 hours');
      return;
    }

    try {
      console.log('[SyncSettings] setInterval:', parsedMinutes);
      await updateSyncSettings(supabase, { interval_minutes: parsedMinutes });
      setSettings(prev => ({ ...prev, interval_minutes: parsedMinutes }));
      setError(null);
    } catch (err) {
      console.error('[SyncSettings] setInterval error:', err);
      console.error('[SyncSettings] Error details:', {
        message: err.message,
        code: err.code,
        details: err.details,
        hint: err.hint,
      });
      setError(err.message);
    }
  }, []);

  // Toggle setup mode
  const toggleSetupMode = useCallback(async () => {
    try {
      const newSetupMode = !settings?.setup_mode;
      console.log('[SyncSettings] toggleSetupMode:', newSetupMode);

      const updates = { setup_mode: newSetupMode };
      // Record when setup mode was completed
      if (!newSetupMode) {
        updates.setup_mode_completed_at = new Date().toISOString();
      }

      await updateSyncSettings(supabase, updates);
      setSettings(prev => ({ ...prev, ...updates }));
      setError(null);
    } catch (err) {
      console.error('[SyncSettings] toggleSetupMode error:', err);
      setError(err.message);
    }
  }, [settings?.setup_mode]);

  // Trigger manual sync
  const triggerSync = useCallback(async () => {
    if (syncing) return;

    try {
      console.log('[SyncSettings] triggerSync started');
      setSyncing(true);
      setSyncProgress({ stage: 'starting' });
      setError(null);

      const result = await runSync({
        supabase,
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
    toggleEnabled,
    setInterval,
    toggleSetupMode,
    triggerSync,
    refresh,
    SyncStatus,
  };
}

export default useSyncSettings;
