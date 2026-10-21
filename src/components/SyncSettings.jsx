/**
 * External Sync Settings Component
 * @requirements REQ-107, REQ-216
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
    triggerSync,
    SyncStatus,
  } = useSyncSettings();

  const [showHistory, setShowHistory] = useState(false);

  // Date range for manual sync (today → today+60 days by default).
  // Use local-time constructor to avoid UTC midnight = wrong day in PST.
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate())
      .toISOString().slice(0, 10);
  });
  const [syncEndDate, setSyncEndDate] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 60)
      .toISOString().slice(0, 10);
  });


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
      case SyncStatus.PARSE_DEGRADED:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Degraded</span>;
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

  const handleSync = async (fullSync = false) => {
    try {
      let startDate = null;
      let endDate = null;
      if (!fullSync) {
        if (syncStartDate) {
          const [y, m, d] = syncStartDate.split('-').map(Number);
          startDate = new Date(y, m - 1, d); // local time — NOT new Date('YYYY-MM-DD')
        }
        if (syncEndDate) {
          const [y, m, d] = syncEndDate.split('-').map(Number);
          endDate = new Date(y, m - 1, d);
        }
      }
      await triggerSync(startDate, endDate);
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

        {/* Parse Degradation Warning (REQ-110) */}
        {settings?.last_sync_status === SyncStatus.PARSE_DEGRADED && (
          <div className="py-3 px-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">HTML Parse Warning</p>
                <p className="text-xs text-amber-700 mt-1">
                  The last sync detected an unusually high rate of missing fields. The external
                  site&apos;s HTML structure may have changed. Verify synced data quality and check
                  the selectors in <code className="font-mono">extraction.js</code> if the problem persists.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Manual Sync — Date Range + Button */}
        <div className="pt-2 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">From</label>
              <input
                type="date"
                value={syncStartDate}
                onChange={(e) => setSyncStartDate(e.target.value)}
                disabled={syncing}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 disabled:bg-slate-100"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">To</label>
              <input
                type="date"
                value={syncEndDate}
                onChange={(e) => setSyncEndDate(e.target.value)}
                disabled={syncing}
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 disabled:bg-slate-100"
              />
            </div>
          </div>

          <button
            onClick={() => handleSync(false)}
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

          <div className="text-center">
            <button
              onClick={() => handleSync(true)}
              disabled={syncing}
              className="text-xs text-slate-400 hover:text-slate-600 disabled:cursor-not-allowed"
            >
              Full sync (no date filter, ~5 min)
            </button>
          </div>
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
