/**
 * Sync History page - shows history of all sync runs with details
 * @requirements REQ-211, REQ-212
 */

import { useState } from 'react';
import { useSyncHistory } from '../hooks/useSyncHistory';
import SyncHistoryTable from '../components/SyncHistoryTable';
import SyncDetailModal from '../components/SyncDetailModal';

export default function SyncHistoryPage() {
  const {
    logs,
    totalCount,
    selectedLog,
    selectedLogDetails,
    loading,
    loadingDetails,
    error,
    page,
    totalPages,
    hasNextPage,
    hasPrevPage,
    goToNextPage,
    goToPrevPage,
    statusFilter,
    updateStatusFilter,
    loadLogDetails,
    clearSelection,
    refresh,
  } = useSyncHistory();

  const [showDetailModal, setShowDetailModal] = useState(false);

  const handleSelectLog = (logId) => {
    loadLogDetails(logId);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    clearSelection();
  };

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'success', label: 'Success' },
    { value: 'partial', label: 'Partial' },
    { value: 'failed', label: 'Failed' },
    { value: 'running', label: 'Running' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sync History</h1>
          <p className="text-slate-500 mt-1">View past sync runs and what data was processed</p>
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
              <h3 className="text-sm font-medium text-red-800">Error loading sync history</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Syncs</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{totalCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Successful</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">
              {logs.filter(l => l.status === 'success').length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Partial</p>
            <p className="text-2xl font-bold text-amber-600 mt-1">
              {logs.filter(l => l.status === 'partial').length}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Failed</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {logs.filter(l => l.status === 'failed').length}
            </p>
          </div>
        </div>
      )}

      {/* Main Content Card */}
      <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm">
        {/* Filters Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Sync Runs</h2>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="status-filter" className="text-sm text-slate-500">
              Filter:
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => updateStatusFilter(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table Content */}
        <div className="p-6">
          <SyncHistoryTable
            logs={logs}
            loading={loading}
            onSelectLog={handleSelectLog}
          />
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
            <p className="text-sm text-slate-600">
              Page {page} of {totalPages} ({totalCount} total)
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={goToPrevPage}
                disabled={!hasPrevPage}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                onClick={goToNextPage}
                disabled={!hasNextPage}
                className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      <SyncDetailModal
        isOpen={showDetailModal}
        onClose={handleCloseModal}
        log={selectedLog}
        details={selectedLogDetails}
        loading={loadingDetails}
      />
    </div>
  );
}
