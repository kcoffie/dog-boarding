/**
 * Message Log page — shows the last 5 days of outbound WhatsApp sends.
 *
 * Decouples "did the job run?" from "did the message go out?" — open this
 * page when delivery is in question to see exactly what was sent, to whom,
 * and whether the roster image looks correct.
 *
 * @requirements REQ-v5.0-F2
 */

import { useMessageLog } from '../hooks/useMessageLog';

const STATUS_STYLES = {
  sent:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

const TYPE_STYLES = {
  image: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
  text:  'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
};

function Badge({ text, className }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${className}`}>
      {text}
    </span>
  );
}

function formatTime(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function truncateWamid(wamid) {
  if (!wamid) return '—';
  return wamid.length > 24 ? `${wamid.slice(0, 12)}…${wamid.slice(-8)}` : wamid;
}

function ImageCell({ row }) {
  if (!row.image_path) return <span className="text-slate-400 text-sm">—</span>;

  if (!row.signedUrl) {
    return (
      <span className="text-slate-400 text-sm italic">
        {row.status === 'failed' ? 'send failed' : 'no image stored'}
      </span>
    );
  }

  return (
    <a href={row.signedUrl} target="_blank" rel="noopener noreferrer">
      <img
        src={row.signedUrl}
        alt={`Roster for ${row.job_name}`}
        className="h-16 w-auto rounded border border-slate-200 hover:opacity-90 transition-opacity"
      />
    </a>
  );
}

function ContentCell({ row }) {
  if (row.message_type === 'image') return <ImageCell row={row} />;

  if (!row.content) return <span className="text-slate-400 text-sm">—</span>;

  return (
    <span className="text-sm text-slate-700 font-mono whitespace-pre-wrap break-words max-w-xs block">
      {row.content.length > 120 ? `${row.content.slice(0, 120)}…` : row.content}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="py-16 text-center">
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </div>
      <p className="text-slate-500 text-sm">No messages in the last 5 days</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="py-16 flex items-center justify-center">
      <svg className="w-6 h-6 text-indigo-500 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

export default function MessageLogPage() {
  const { rows, loading, error, refresh } = useMessageLog();

  const sentCount  = rows.filter(r => r.status === 'sent').length;
  const failedCount = rows.filter(r => r.status === 'failed').length;
  const imageCount  = rows.filter(r => r.message_type === 'image').length;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Messages</h1>
          <p className="text-slate-500 mt-1">Outbound WhatsApp sends — last 5 days</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
        >
          <svg
            className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-red-800">Error loading messages</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{rows.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Sent</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{sentCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Failed</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{failedCount}</p>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm">
        {/* Card Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Send Log</h2>
            {!loading && (
              <p className="text-xs text-slate-500 mt-0.5">{imageCount} image{imageCount !== 1 ? 's' : ''}, {rows.filter(r => r.message_type === 'text').length} text message{rows.filter(r => r.message_type === 'text').length !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>

        {/* Table or State */}
        <div className="p-6">
          {loading && <LoadingState />}
          {!loading && rows.length === 0 && !error && <EmptyState />}
          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left pb-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Time (PT)</th>
                    <th className="text-left pb-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Job</th>
                    <th className="text-left pb-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="text-left pb-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Recipient</th>
                    <th className="text-left pb-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Content</th>
                    <th className="text-left pb-3 pr-4 text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="text-left pb-3 text-xs font-medium text-slate-500 uppercase tracking-wider">WAMID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 pr-4 text-slate-600 whitespace-nowrap">{formatTime(row.sent_at)}</td>
                      <td className="py-3 pr-4 font-mono text-slate-700 whitespace-nowrap">{row.job_name}</td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Badge text={row.message_type} className={TYPE_STYLES[row.message_type] ?? TYPE_STYLES.text} />
                      </td>
                      <td className="py-3 pr-4 font-mono text-slate-600 whitespace-nowrap">{row.recipient}</td>
                      <td className="py-3 pr-4 max-w-xs">
                        <ContentCell row={row} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">
                        <Badge text={row.status} className={STATUS_STYLES[row.status] ?? STATUS_STYLES.sent} />
                      </td>
                      <td className="py-3 font-mono text-xs text-slate-400 whitespace-nowrap">
                        {truncateWamid(row.wamid)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
