/**
 * Hook for managing external sync settings and operations
 * @requirements REQ-104, REQ-107, REQ-108
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  SyncStatus,
  getSyncSettings,
  updateSyncSettings,
  getRecentSyncLogs,
  isSyncRunning,
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

  // Update sync interval with validation
  const setInterval = useCallback(async (minutes) => {
    // Validate input
    const parsedMinutes = parseInt(minutes, 10);
    if (isNaN(parsedMinutes) || parsedMinutes < 15 || parsedMinutes > 1440) {
      setError('Sync interval must be between 15 minutes and 24 hours');
      return;
    }

    try {
      await updateSyncSettings(supabase, { interval_minutes: parsedMinutes });
      setSettings(prev => ({ ...prev, interval_minutes: parsedMinutes }));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  // Trigger manual sync via server-side API
  // @requirements REQ-108 - Uses server-side proxy to bypass CORS
  const triggerSync = useCallback(async () => {
    if (syncing) return;

    try {
      setSyncing(true);
      setSyncProgress({ stage: 'starting' });
      setError(null);

      // Call server-side API to handle sync (bypasses CORS)
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Handle non-JSON responses (e.g., server errors, empty responses)
      let result;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          result = await response.json();
        } catch (parseError) {
          throw new Error('Server returned invalid response');
        }
      } else {
        // Non-JSON response - likely a server error
        const text = await response.text();
        throw new Error(text || 'Server error occurred');
      }

      if (!response.ok) {
        throw new Error(result.error || 'Sync failed');
      }

      setSyncProgress({ stage: 'completed', result });

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
