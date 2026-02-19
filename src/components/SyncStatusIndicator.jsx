/**
 * Small sync status indicator for header
 * @requirements REQ-107, REQ-221
 */

import { Link } from 'react-router-dom';
import { useSyncSettings } from '../hooks/useSyncSettings';

/**
 * Get relative time string (e.g., "2h ago")
 */
function getRelativeTime(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Check if sync is stale (last sync > 24 hours ago when enabled)
 */
function isSyncStale(settings) {
  if (!settings?.enabled || !settings?.last_sync_at) return false;
  const lastSync = new Date(settings.last_sync_at);
  const now = new Date();
  const hoursSinceSync = (now - lastSync) / (1000 * 60 * 60);
  // Stale if more than 2x the configured interval
  const staleThreshold = (settings.interval_minutes * 2) / 60;
  return hoursSinceSync > staleThreshold;
}

export default function SyncStatusIndicator() {
  const { settings, syncing, loading, SyncStatus } = useSyncSettings();

  if (loading) return null;

  // Always show some indicator if sync is enabled
  const isEnabled = settings?.enabled;
  const lastStatus = settings?.last_sync_status;
  const isStale = isSyncStale(settings);
  const relativeTime = getRelativeTime(settings?.last_sync_at);

  // Syncing indicator
  if (syncing) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-cyan-50 rounded-lg" title="Sync in progress">
        <svg className="animate-spin h-4 w-4 text-cyan-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="text-xs font-medium text-cyan-700 hidden sm:inline">Syncing</span>
      </div>
    );
  }

  // Failed indicator
  if (lastStatus === SyncStatus.FAILED) {
    return (
      <Link
        to="/sync-history"
        className="flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
        title={settings?.last_sync_message || 'Sync failed'}
      >
        <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-xs font-medium text-red-700 hidden sm:inline">Sync Error</span>
      </Link>
    );
  }

  // Partial indicator
  if (lastStatus === SyncStatus.PARTIAL) {
    return (
      <Link
        to="/sync-history"
        className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
        title={`Partial sync ${relativeTime || ''}`}
      >
        <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-xs font-medium text-amber-700 hidden sm:inline">Partial</span>
      </Link>
    );
  }

  // Stale indicator (sync enabled but hasn't run in a while)
  if (isStale) {
    return (
      <Link
        to="/sync-history"
        className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
        title={`Last sync ${relativeTime || 'unknown'}`}
      >
        <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs font-medium text-amber-700 hidden sm:inline">Stale</span>
      </Link>
    );
  }

  // Success indicator (only show if enabled and recently synced)
  if (isEnabled && lastStatus === SyncStatus.SUCCESS && relativeTime) {
    return (
      <Link
        to="/sync-history"
        className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
        title={`Last sync ${relativeTime}`}
      >
        <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-xs font-medium text-emerald-700 hidden sm:inline">{relativeTime}</span>
      </Link>
    );
  }

  return null;
}
