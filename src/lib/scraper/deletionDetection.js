/**
 * Deletion detection module - detects when appointments are removed from source
 * @requirements REQ-202, REQ-219
 */

import { createClient } from '@supabase/supabase-js';
import { deletionLogger } from './logger.js';

const log = deletionLogger.log;

/**
 * Get Supabase client
 */
function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase URL and key required');
  return createClient(url, key);
}

/**
 * Sync status enum for deletion tracking
 */
export const SyncAppointmentStatus = {
  ACTIVE: 'active',
  MISSING_FROM_SOURCE: 'missing_from_source',
  CONFIRMED_DELETED: 'confirmed_deleted',
};

/**
 * Number of consecutive misses before marking as deleted
 */
const DELETION_THRESHOLD = 3;

/**
 * Detect appointments that are in the database but not in the fetched results
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<string>} fetchedExternalIds - External IDs from current sync
 * @param {Date} startDate - Start of sync date range
 * @param {Date} endDate - End of sync date range
 * @returns {Promise<Array>} List of missing appointments
 */
export async function detectMissingAppointments(supabase, fetchedExternalIds, startDate, endDate) {
  // Get appointments in DB that fall within the sync date range
  const { data: existingAppointments, error } = await supabase
    .from('sync_appointments')
    .select('id, external_id, pet_name, check_in_datetime, sync_status, missing_sync_count, missing_since')
    .gte('check_in_datetime', startDate.toISOString())
    .lte('check_in_datetime', endDate.toISOString())
    .neq('sync_status', SyncAppointmentStatus.CONFIRMED_DELETED);

  if (error) throw error;

  // Find appointments that weren't in the fetch results
  const fetchedSet = new Set(fetchedExternalIds);
  const missingAppointments = existingAppointments.filter(
    appt => !fetchedSet.has(appt.external_id)
  );

  return missingAppointments;
}

/**
 * Mark appointments as missing from source
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array} missingAppointments - Appointments to mark as missing
 * @returns {Promise<{marked: number, deleted: number}>}
 */
export async function markMissingAppointments(supabase, missingAppointments) {
  const now = new Date().toISOString();
  let markedCount = 0;
  let deletedCount = 0;

  for (const appt of missingAppointments) {
    const newMissCount = (appt.missing_sync_count || 0) + 1;
    const updates = {
      sync_status: SyncAppointmentStatus.MISSING_FROM_SOURCE,
      missing_sync_count: newMissCount,
    };

    // Set missing_since on first miss
    if (!appt.missing_since) {
      updates.missing_since = now;
    }

    // Check if we've hit the deletion threshold
    if (newMissCount >= DELETION_THRESHOLD) {
      updates.sync_status = SyncAppointmentStatus.CONFIRMED_DELETED;
      deletedCount++;
      log(`[DeletionDetection] Appointment ${appt.external_id} (${appt.pet_name}) confirmed deleted after ${newMissCount} consecutive misses`);
    } else {
      markedCount++;
      log(`[DeletionDetection] Appointment ${appt.external_id} (${appt.pet_name}) missing (${newMissCount}/${DELETION_THRESHOLD})`);
    }

    await supabase
      .from('sync_appointments')
      .update(updates)
      .eq('id', appt.id);
  }

  return { marked: markedCount, deleted: deletedCount };
}

/**
 * Reset missing status for appointments that reappeared
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<string>} fetchedExternalIds - External IDs that were fetched
 * @returns {Promise<number>} Number of appointments restored
 */
export async function resetReappearedAppointments(supabase, fetchedExternalIds) {
  if (fetchedExternalIds.length === 0) return 0;

  const { data, error } = await supabase
    .from('sync_appointments')
    .update({
      sync_status: SyncAppointmentStatus.ACTIVE,
      missing_sync_count: 0,
      missing_since: null,
    })
    .in('external_id', fetchedExternalIds)
    .eq('sync_status', SyncAppointmentStatus.MISSING_FROM_SOURCE)
    .select('id');

  if (error) throw error;

  const restoredCount = data?.length || 0;
  if (restoredCount > 0) {
    log(`[DeletionDetection] ${restoredCount} appointments reappeared and were restored`);
  }

  return restoredCount;
}

/**
 * Cancel boardings for confirmed deleted appointments
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number>} Number of boardings cancelled
 */
export async function cancelDeletedBoardings(supabase) {
  const now = new Date().toISOString();

  // Find confirmed deleted sync_appointments with linked boardings
  const { data: deletedAppts, error: fetchError } = await supabase
    .from('sync_appointments')
    .select('mapped_boarding_id')
    .eq('sync_status', SyncAppointmentStatus.CONFIRMED_DELETED)
    .not('mapped_boarding_id', 'is', null);

  if (fetchError) throw fetchError;

  const boardingIds = deletedAppts
    .map(a => a.mapped_boarding_id)
    .filter(Boolean);

  if (boardingIds.length === 0) return 0;

  // Cancel the boardings (but don't delete them - preserve for audit)
  const { data, error: updateError } = await supabase
    .from('boardings')
    .update({
      cancelled_at: now,
      cancellation_reason: 'Removed from external system',
    })
    .in('id', boardingIds)
    .is('cancelled_at', null)
    .select('id');

  if (updateError) throw updateError;

  const cancelledCount = data?.length || 0;
  if (cancelledCount > 0) {
    log(`[DeletionDetection] ${cancelledCount} boardings cancelled due to deletion from source`);
  }

  return cancelledCount;
}

/**
 * Get summary of missing/deleted appointments
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabase]
 * @returns {Promise<Object>} Summary stats
 */
export async function getDeletionSummary(supabase = getSupabaseClient()) {
  const { data: missingData, error: missingError } = await supabase
    .from('sync_appointments')
    .select('id', { count: 'exact' })
    .eq('sync_status', SyncAppointmentStatus.MISSING_FROM_SOURCE);

  if (missingError) throw missingError;

  const { data: deletedData, error: deletedError } = await supabase
    .from('sync_appointments')
    .select('id', { count: 'exact' })
    .eq('sync_status', SyncAppointmentStatus.CONFIRMED_DELETED);

  if (deletedError) throw deletedError;

  return {
    missingFromSource: missingData?.length || 0,
    confirmedDeleted: deletedData?.length || 0,
  };
}

/**
 * Run full deletion detection after a sync
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<string>} fetchedExternalIds - External IDs from sync
 * @param {Date} startDate - Sync start date
 * @param {Date} endDate - Sync end date
 * @returns {Promise<Object>} Detection results
 */
export async function runDeletionDetection(supabase, fetchedExternalIds, startDate, endDate) {
  // Reset any previously missing appointments that reappeared
  const restored = await resetReappearedAppointments(supabase, fetchedExternalIds);

  // Detect newly missing appointments
  const missing = await detectMissingAppointments(supabase, fetchedExternalIds, startDate, endDate);

  // Mark them appropriately
  const { marked, deleted } = await markMissingAppointments(supabase, missing);

  // Cancel boardings for confirmed deleted appointments
  const cancelled = await cancelDeletedBoardings(supabase);

  return {
    restored,
    marked,
    deleted,
    cancelledBoardings: cancelled,
  };
}

export default {
  SyncAppointmentStatus,
  detectMissingAppointments,
  markMissingAppointments,
  resetReappearedAppointments,
  cancelDeletedBoardings,
  getDeletionSummary,
  runDeletionDetection,
};
