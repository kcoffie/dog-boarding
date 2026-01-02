/**
 * Small sync status indicator for header
 * @requirements REQ-107
 */

import { useSyncSettings } from '../hooks/useSyncSettings';

export default function SyncStatusIndicator() {
  const { settings, syncing, loading, SyncStatus } = useSyncSettings();

  if (loading) return null;

  // Show indicator when syncing or when there's an error
  const showIndicator = syncing || settings?.last_sync_status === SyncStatus.FAILED;

  if (!showIndicator) return null;

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

  if (settings?.last_sync_status === SyncStatus.FAILED) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded-lg" title={settings?.last_sync_message || 'Sync failed'}>
        <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-xs font-medium text-red-700 hidden sm:inline">Sync Error</span>
      </div>
    );
  }

  return null;
}
