/**
 * Hook for fetching and managing sync history data
 * @requirements REQ-211, REQ-212
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fetch sync logs with pagination and filtering
 * @param {Object} options
 * @param {number} [options.limit=25] - Number of records per page
 * @param {number} [options.offset=0] - Offset for pagination
 * @param {string} [options.status] - Filter by status ('success', 'partial', 'failed', 'running')
 * @param {Date} [options.startDate] - Filter logs after this date
 * @param {Date} [options.endDate] - Filter logs before this date
 * @returns {Promise<{data: Array, count: number}>}
 */
async function fetchSyncLogs(options = {}) {
  const {
    limit = 25,
    offset = 0,
    status,
    startDate,
    endDate,
  } = options;

  let query = supabase
    .from('sync_logs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Apply filters
  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  if (startDate) {
    query = query.gte('started_at', startDate.toISOString());
  }

  if (endDate) {
    // Add a day to include the entire end date
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    query = query.lte('started_at', endOfDay.toISOString());
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('[useSyncHistory] fetchSyncLogs error:', error);
    throw error;
  }

  return { data: data || [], count: count || 0 };
}

/**
 * Fetch details for a specific sync log
 * @param {string} logId - Sync log ID
 * @returns {Promise<Object>}
 */
async function fetchSyncLogDetails(logId) {
  const { data, error } = await supabase
    .from('sync_logs')
    .select('*')
    .eq('id', logId)
    .single();

  if (error) {
    console.error('[useSyncHistory] fetchSyncLogDetails error:', error);
    throw error;
  }

  return data;
}

/**
 * Fetch appointments synced during a specific sync run
 * @param {string} logId - Sync log ID
 * @param {Date} syncStartedAt - When the sync started
 * @returns {Promise<Array>}
 */
async function fetchSyncedAppointments(logId, syncStartedAt) {
  // Fetch appointments that were updated around the sync time
  // This is a workaround since we don't have a direct FK from sync_appointments to sync_logs
  const syncStart = new Date(syncStartedAt);
  const syncEnd = new Date(syncStart.getTime() + 30 * 60 * 1000); // 30 min window

  const { data, error } = await supabase
    .from('sync_appointments')
    .select('external_id, pet_name, service_type, check_in_datetime, check_out_datetime, last_synced_at')
    .gte('last_synced_at', syncStart.toISOString())
    .lte('last_synced_at', syncEnd.toISOString())
    .order('pet_name', { ascending: true });

  if (error) {
    console.error('[useSyncHistory] fetchSyncedAppointments error:', error);
    throw error;
  }

  return data || [];
}

/**
 * Custom hook for sync history management
 */
export function useSyncHistory() {
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [selectedLogDetails, setSelectedLogDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Filter state
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState({ start: null, end: null });

  // Load sync logs
  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const offset = (page - 1) * pageSize;
      const { data, count } = await fetchSyncLogs({
        limit: pageSize,
        offset,
        status: statusFilter,
        startDate: dateRange.start,
        endDate: dateRange.end,
      });

      setLogs(data);
      setTotalCount(count);
    } catch (err) {
      console.error('[useSyncHistory] loadLogs error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, dateRange]);

  // Load logs on mount and when filters change
  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Load details for a specific sync log
  const loadLogDetails = useCallback(async (logId) => {
    if (!logId) {
      setSelectedLog(null);
      setSelectedLogDetails(null);
      return;
    }

    try {
      setLoadingDetails(true);
      setError(null);

      const logDetails = await fetchSyncLogDetails(logId);
      setSelectedLog(logDetails);

      // Also fetch appointments if the log has a started_at timestamp
      if (logDetails.started_at) {
        const appointments = await fetchSyncedAppointments(logId, logDetails.started_at);
        setSelectedLogDetails({
          ...logDetails,
          appointments,
        });
      } else {
        setSelectedLogDetails(logDetails);
      }
    } catch (err) {
      console.error('[useSyncHistory] loadLogDetails error:', err);
      setError(err.message);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  // Clear selected log
  const clearSelection = useCallback(() => {
    setSelectedLog(null);
    setSelectedLogDetails(null);
  }, []);

  // Refresh data
  const refresh = useCallback(() => {
    return loadLogs();
  }, [loadLogs]);

  // Update filters (resets to page 1)
  const updateStatusFilter = useCallback((status) => {
    setStatusFilter(status);
    setPage(1);
  }, []);

  const updateDateRange = useCallback((start, end) => {
    setDateRange({ start, end });
    setPage(1);
  }, []);

  // Pagination helpers
  const totalPages = Math.ceil(totalCount / pageSize);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  const goToNextPage = useCallback(() => {
    if (hasNextPage) setPage(p => p + 1);
  }, [hasNextPage]);

  const goToPrevPage = useCallback(() => {
    if (hasPrevPage) setPage(p => p - 1);
  }, [hasPrevPage]);

  const goToPage = useCallback((pageNum) => {
    if (pageNum >= 1 && pageNum <= totalPages) {
      setPage(pageNum);
    }
  }, [totalPages]);

  return {
    // Data
    logs,
    totalCount,
    selectedLog,
    selectedLogDetails,

    // Loading states
    loading,
    loadingDetails,
    error,

    // Pagination
    page,
    pageSize,
    totalPages,
    hasNextPage,
    hasPrevPage,
    setPageSize,
    goToNextPage,
    goToPrevPage,
    goToPage,

    // Filters
    statusFilter,
    dateRange,
    updateStatusFilter,
    updateDateRange,

    // Actions
    loadLogDetails,
    clearSelection,
    refresh,
  };
}

export default useSyncHistory;
