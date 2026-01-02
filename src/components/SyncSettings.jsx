/**
 * External Sync Settings Component
 * @requirements REQ-107
 */

import { useState } from 'react';
import { useSyncSettings } from '../hooks/useSyncSettings';

export default function SyncSettings() {
  const {
    settings,
    syncLogs,
    loading,
    syncing,
    syncProgress,
    error,
    toggleEnabled,
    setInterval,
    triggerSync,
    SyncStatus,
  } = useSyncSettings();

  const [showHistory, setShowHistory] = useState(false);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case SyncStatus.SUCCESS:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">Success</span>;
      case SyncStatus.PARTIAL:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Partial</span>;
      case SyncStatus.FAILED:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Failed</span>;
      case SyncStatus.RUNNING:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Running</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">Never</span>;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getProgressMessage = () => {
    if (!syncProgress) return null;

    switch (syncProgress.stage) {
      case 'starting':
        return 'Starting sync...';
      case 'authenticating':
        return 'Authenticating...';
      case 'authenticated':
        return 'Authenticated';
      case 'fetching_schedule':
        return 'Fetching schedule...';
      case 'schedule_fetched':
        return `Found ${syncProgress.count} appointments`;
      case 'processing':
        return `Processing ${syncProgress.current}/${syncProgress.total}...`;
      case 'error':
        return `Error: ${syncProgress.error}`;
      case 'completed':
        return 'Sync completed';
      case 'failed':
        return `Failed: ${syncProgress.error}`;
      default:
        return syncProgress.stage;
    }
  };

  const handleSync = async () => {
    try {
      await triggerSync();
    } catch {
      // Error is already handled by the hook
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-slate-900">External Sync</h2>
          <p className="text-slate-500 text-sm mt-1">
            Automatically sync appointments from external booking system.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Sync Status */}
      <div className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-700">Automatic Sync</p>
            <p className="text-xs text-slate-500">Enable scheduled syncing</p>
          </div>
          <button
            onClick={toggleEnabled}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
              settings?.enabled ? 'bg-indigo-600' : 'bg-slate-200'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                settings?.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Sync Interval */}
        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-700">Sync Interval</p>
            <p className="text-xs text-slate-500">How often to sync (when enabled)</p>
          </div>
          <select
            value={settings?.interval_minutes || 60}
            onChange={(e) => setInterval(parseInt(e.target.value))}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value={30}>Every 30 minutes</option>
            <option value={60}>Every hour</option>
            <option value={120}>Every 2 hours</option>
            <option value={360}>Every 6 hours</option>
            <option value={720}>Every 12 hours</option>
            <option value={1440}>Once daily</option>
          </select>
        </div>

        {/* Last Sync Status */}
        <div className="flex items-center justify-between py-3 border-b border-slate-100">
          <div>
            <p className="text-sm font-medium text-slate-700">Last Sync</p>
            <p className="text-xs text-slate-500">{formatDate(settings?.last_sync_at)}</p>
          </div>
          {getStatusBadge(settings?.last_sync_status)}
        </div>

        {settings?.last_sync_message && (
          <div className="py-2">
            <p className="text-xs text-slate-500">{settings.last_sync_message}</p>
          </div>
        )}

        {/* Manual Sync Button */}
        <div className="pt-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`w-full inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium rounded-lg transition-all shadow-sm ${
              syncing
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'text-white bg-cyan-600 hover:bg-cyan-700 active:scale-[0.98]'
            }`}
          >
            {syncing ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {getProgressMessage() || 'Syncing...'}
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync Now
              </>
            )}
          </button>
        </div>

        {/* Sync History Toggle */}
        <div className="pt-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            {showHistory ? 'Hide History' : 'Show Sync History'}
          </button>
        </div>

        {/* Sync History */}
        {showHistory && (
          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recent Syncs</p>
            {syncLogs.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No sync history yet</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {syncLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 bg-slate-50 rounded-lg text-sm"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-600">{formatDate(log.started_at)}</span>
                      {getStatusBadge(log.status)}
                    </div>
                    <div className="text-xs text-slate-500 space-x-3">
                      <span>Found: {log.appointments_found || 0}</span>
                      <span>Created: {log.appointments_created || 0}</span>
                      <span>Updated: {log.appointments_updated || 0}</span>
                      {log.appointments_failed > 0 && (
                        <span className="text-red-600">Failed: {log.appointments_failed}</span>
                      )}
                    </div>
                    {log.duration_ms && (
                      <div className="text-xs text-slate-400 mt-1">
                        Duration: {(log.duration_ms / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
