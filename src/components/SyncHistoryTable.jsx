/**
 * Table component for displaying sync history
 * @requirements REQ-211
 */

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms) {
  if (!ms || ms < 1000) return '<1s';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Format date/time for display
 */
function formatDateTime(isoString, compact = false) {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
  if (compact) {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get status badge styling
 */
function getStatusBadge(status) {
  switch (status) {
    case 'success':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ),
        label: 'Success',
      };
    case 'partial':
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        ),
        label: 'Partial',
      };
    case 'failed':
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        icon: (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ),
        label: 'Failed',
      };
    case 'running':
      return {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        icon: (
          <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ),
        label: 'Running',
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        icon: null,
        label: status || 'Unknown',
      };
  }
}

export default function SyncHistoryTable({ logs, loading, onSelectLog }) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <p className="text-slate-600 font-medium">No sync history</p>
        <p className="text-slate-500 text-sm mt-1">Syncs will appear here once you run them.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card Layout */}
      <div className="md:hidden divide-y divide-slate-100 -mx-6">
        {logs.map((log) => {
          const statusBadge = getStatusBadge(log.status);
          return (
            <button
              key={log.id}
              onClick={() => onSelectLog(log.id)}
              className="w-full px-6 py-4 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                      {statusBadge.icon}
                      {statusBadge.label}
                    </span>
                    {log.sync_type && log.sync_type !== 'incremental' && (
                      <span className="text-xs text-slate-500 capitalize">{log.sync_type}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">
                    {formatDateTime(log.started_at, true)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-medium text-slate-900">{log.appointments_found || 0} found</p>
                  <p className="text-xs text-slate-500">{formatDuration(log.duration_ms)}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-4 text-xs">
                <span className="text-emerald-600">+{log.appointments_created || 0} new</span>
                <span className="text-blue-600">{log.appointments_updated || 0} updated</span>
                {log.appointments_failed > 0 && (
                  <span className="text-red-600">{log.appointments_failed} failed</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Found</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Created</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Updated</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Unchanged</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Failed</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Duration</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {logs.map((log) => {
              const statusBadge = getStatusBadge(log.status);
              return (
                <tr
                  key={log.id}
                  onClick={() => onSelectLog(log.id)}
                  className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {formatDateTime(log.started_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                      {statusBadge.icon}
                      {statusBadge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-900 text-right tabular-nums font-medium">
                    {log.appointments_found || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-emerald-600 text-right tabular-nums">
                    {log.appointments_created > 0 ? `+${log.appointments_created}` : '0'}
                  </td>
                  <td className="px-4 py-3 text-sm text-blue-600 text-right tabular-nums">
                    {log.appointments_updated || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400 text-right tabular-nums">
                    {log.appointments_unchanged || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums">
                    {log.appointments_failed > 0 ? (
                      <span className="text-red-600 font-medium">{log.appointments_failed}</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 text-right tabular-nums">
                    {formatDuration(log.duration_ms)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <svg className="w-4 h-4 text-slate-400 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
