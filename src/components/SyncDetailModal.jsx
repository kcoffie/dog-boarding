/**
 * Modal showing detailed information about a sync run
 * @requirements REQ-212
 */

import { useEffect, useRef } from 'react';

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms) {
  if (!ms || ms < 1000) return 'Less than 1s';
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
function formatDateTime(isoString) {
  if (!isoString) return 'N/A';
  const date = new Date(isoString);
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
        label: 'Success',
      };
    case 'partial':
      return {
        bg: 'bg-amber-100',
        text: 'text-amber-700',
        label: 'Partial',
      };
    case 'failed':
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        label: 'Failed',
      };
    case 'running':
      return {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        label: 'Running',
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        label: status || 'Unknown',
      };
  }
}

/**
 * Format a change value for display (handles dates, nulls, etc.)
 */
function formatChangeValue(value, field) {
  if (value === null || value === undefined || value === '') return '(empty)';

  // Handle datetime fields
  if (field.includes('datetime') || field.includes('date')) {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      }
    } catch {
      // Fall through to default
    }
  }

  // Truncate long strings
  const strValue = String(value);
  if (strValue.length > 50) {
    return strValue.substring(0, 47) + '...';
  }

  return strValue;
}

/**
 * Get action badge for appointment changes
 */
function _getActionBadge(action) {
  switch (action) {
    case 'created':
      return {
        bg: 'bg-emerald-100',
        text: 'text-emerald-700',
        label: 'New',
      };
    case 'updated':
      return {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        label: 'Updated',
      };
    case 'unchanged':
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-500',
        label: 'Unchanged',
      };
    case 'failed':
      return {
        bg: 'bg-red-100',
        text: 'text-red-700',
        label: 'Failed',
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-600',
        label: action || 'Unknown',
      };
  }
}

export default function SyncDetailModal({ isOpen, onClose, log, details, loading }) {
  const modalRef = useRef(null);

  // Handle escape key
  useEffect(() => {
    function handleEscape(e) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const statusBadge = log ? getStatusBadge(log.status) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Sync Details</h2>
              {log && (
                <p className="text-sm text-slate-500">{formatDateTime(log.started_at)}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : log ? (
            <>
              {/* Summary Section */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</p>
                  <div className="mt-1">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                      {statusBadge.label}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Duration</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{formatDuration(log.duration_ms)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Found</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">{log.appointments_found || 0}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Type</p>
                  <p className="mt-1 text-sm font-medium text-slate-900 capitalize">{log.sync_type || 'incremental'}</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-emerald-600 font-medium">Created</p>
                    <p className="text-lg font-bold text-emerald-700">{log.appointments_created || 0}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-blue-600 font-medium">Updated</p>
                    <p className="text-lg font-bold text-blue-700">{log.appointments_updated || 0}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                    <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Unchanged</p>
                    <p className="text-lg font-bold text-slate-600">{log.appointments_unchanged || 0}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-red-600 font-medium">Failed</p>
                    <p className="text-lg font-bold text-red-700">{log.appointments_failed || 0}</p>
                  </div>
                </div>
              </div>

              {/* Errors Section */}
              {log.errors && log.errors.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Errors</h3>
                  <div className="bg-red-50 rounded-xl border border-red-200 divide-y divide-red-200">
                    {log.errors.map((err, idx) => (
                      <div key={idx} className="p-3">
                        {err.external_id && (
                          <p className="text-xs font-medium text-red-600 mb-1">
                            Appointment: {err.external_id}
                          </p>
                        )}
                        <p className="text-sm text-red-700">{err.error || 'Unknown error'}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Change Details Section */}
              {log.change_details && log.change_details.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">Boarding Changes</h3>

                  {/* Created boardings */}
                  {log.change_details.filter(c => c.action === 'created').length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-medium text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        New Boardings ({log.change_details.filter(c => c.action === 'created').length})
                      </h4>
                      <div className="bg-emerald-50 rounded-xl border border-emerald-200 divide-y divide-emerald-100">
                        {log.change_details.filter(c => c.action === 'created').map((change, idx) => (
                          <div key={idx} className="p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-slate-900">{change.dog_name}</p>
                              {change.status && (
                                <span className="text-xs text-slate-500 capitalize">{change.status}</span>
                              )}
                            </div>
                            {(change.check_in || change.check_out) && (
                              <p className="text-xs text-emerald-700 mt-1">
                                {change.check_in && new Date(change.check_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                {change.check_out && (
                                  <> → {new Date(change.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                )}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Updated boardings */}
                  {log.change_details.filter(c => c.action === 'updated').length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Updated Boardings ({log.change_details.filter(c => c.action === 'updated').length})
                      </h4>
                      <div className="bg-blue-50 rounded-xl border border-blue-200 divide-y divide-blue-100">
                        {log.change_details.filter(c => c.action === 'updated').map((change, idx) => (
                          <div key={idx} className="p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-medium text-slate-900">{change.dog_name}</p>
                              {(change.check_in || change.check_out) && (
                                <span className="text-xs text-slate-500">
                                  {change.check_in && new Date(change.check_in).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  {change.check_out && <> - {new Date(change.check_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</>}
                                </span>
                              )}
                            </div>
                            {change.changes && Object.keys(change.changes).length > 0 && (
                              <div className="mt-2 space-y-1">
                                {Object.entries(change.changes).map(([field, values]) => (
                                  <div key={field} className="text-xs">
                                    <span className="text-blue-600 font-medium">{field.replace(/_/g, ' ')}:</span>{' '}
                                    <span className="text-slate-500 line-through">{formatChangeValue(values.old, field)}</span>
                                    <span className="text-slate-400 mx-1">→</span>
                                    <span className="text-blue-700 font-medium">{formatChangeValue(values.new, field)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Unchanged summary (collapsed) */}
                  {log.change_details.filter(c => c.action === 'unchanged').length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                        Unchanged ({log.change_details.filter(c => c.action === 'unchanged').length})
                      </h4>
                      <p className="text-xs text-slate-500">
                        {log.change_details.filter(c => c.action === 'unchanged').map(c => c.dog_name).join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Appointments Section */}
              {details?.appointments && details.appointments.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Appointments Processed ({details.appointments.length})
                  </h3>
                  <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {details.appointments.map((appt, idx) => (
                      <div key={idx} className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-900">{appt.pet_name}</p>
                          <span className="text-xs text-slate-500">{appt.service_type}</span>
                        </div>
                        {appt.check_in_datetime && (
                          <p className="text-xs text-slate-500 mt-1">
                            {new Date(appt.check_in_datetime).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                            {appt.check_out_datetime && (
                              <> - {new Date(appt.check_out_datetime).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}</>
                            )}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-slate-500">
              No sync details available
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
