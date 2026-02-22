/**
 * Archive reconciliation — detects and archives appointments that no longer
 * appear on the schedule page (e.g., amended bookings where the old URL is gone).
 * @requirements REQ-108
 */

import { SCRAPER_CONFIG } from './config.js';
import { authenticatedFetch } from './auth.js';
import { syncLogger } from './logger.js';

const syncLog = syncLogger.log;
const syncError = syncLogger.error;
const syncWarn = syncLogger.warn;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Detect if a fetched page is an access-denied page rather than a valid appointment.
 *
 * Valid appointment pages always contain `data-start_scheduled` on #when-wrapper.
 * When an appointment is inaccessible, the server serves the /schedule page HTML
 * (the "You cannot view appointment" popup is JS-rendered — not in the raw source).
 *
 * @param {string} html
 * @param {{ ok: boolean }} response
 * @returns {boolean}
 */
export function isAccessDeniedPage(html, response) {
  if (!response.ok) return true;
  const isLoginPage = html.includes('login') && html.includes('password');
  const isAppointmentPage = html.includes('data-start_scheduled');
  return !isLoginPage && !isAppointmentPage;
}

/**
 * Find active sync_appointments that were not seen during this sync and overlap
 * the sync window. These are candidates for archival.
 *
 * For full syncs (no startDate/endDate), returns ALL active records not in seenIds.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Set<string>} seenExternalIds
 * @param {Date|null} startDate
 * @param {Date|null} endDate
 * @returns {Promise<Array>}
 */
export async function findReconciliationCandidates(supabase, seenExternalIds, startDate, endDate) {
  let query = supabase
    .from('sync_appointments')
    .select('id, external_id, source_url, check_in_datetime, check_out_datetime')
    .eq('sync_status', 'active');

  // Filter to records that overlap the fetch window. Apply each bound independently
  // so callers can supply only startDate (e.g. full sync defaulting to today) without
  // requiring an endDate. Without any filter, past-ended records generate false-positive
  // "possible sync bug" warnings because the schedule never shows them.
  if (startDate) {
    query = query.gte('check_out_datetime', startDate.toISOString());
  }
  if (endDate) {
    query = query.lt('check_in_datetime', endDate.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;

  // Filter out seen external IDs in JS (Supabase .not('col', 'in', [...]) works
  // but can be verbose; JS filter is simpler for a small result set).
  return (data || []).filter(row => !seenExternalIds.has(row.external_id));
}

/**
 * Mark a sync_appointment as archived.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} externalId
 */
export async function archiveSyncAppointment(supabase, externalId) {
  const { error } = await supabase
    .from('sync_appointments')
    .update({
      sync_status: 'archived',
      last_change_type: 'archived',
      last_changed_at: new Date().toISOString(),
    })
    .eq('external_id', externalId);

  if (error) throw error;
}

/**
 * Reconcile archived appointments after the main sync loop.
 *
 * Finds active records not seen during this sync, fetches each source_url to
 * confirm inaccessibility, then marks confirmed records as archived.
 *
 * Does NOT throw — all errors are logged and counted so the sync result is
 * not affected by reconciliation failures.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Set<string>} seenExternalIds
 * @param {Date|null} startDate
 * @param {Date|null} endDate
 * @returns {Promise<{archived: number, warnings: number, errors: number}>}
 */
export async function reconcileArchivedAppointments(supabase, seenExternalIds, startDate, endDate) {
  const counts = { archived: 0, warnings: 0, errors: 0 };

  let candidates;
  try {
    candidates = await findReconciliationCandidates(supabase, seenExternalIds, startDate, endDate);
  } catch (err) {
    syncError('[Reconcile] ❌ Failed to query reconciliation candidates:', err.message, err.stack);
    counts.errors++;
    return counts;
  }

  syncLog(`[Reconcile] Starting reconciliation: ${candidates.length} candidates`, {
    startDate: startDate?.toISOString() ?? 'full sync',
    endDate: endDate?.toISOString() ?? 'full sync',
  });

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    if (i > 0) {
      await delay(SCRAPER_CONFIG.delayBetweenRequests);
    }

    syncLog(`[Reconcile] Checking ${i + 1}/${candidates.length}: ${candidate.external_id} (${candidate.source_url})`);

    try {
      const response = await authenticatedFetch(candidate.source_url);
      const html = await response.text();

      if (isAccessDeniedPage(html, response)) {
        syncLog(`[Reconcile] ✅ Confirmed inaccessible: ${candidate.external_id} (HTTP ${response.status})`);
        try {
          await archiveSyncAppointment(supabase, candidate.external_id);
          counts.archived++;
        } catch (archiveErr) {
          syncError(`[Reconcile] ❌ Failed to archive ${candidate.external_id}:`, archiveErr.message);
          counts.errors++;
        }
      } else {
        syncWarn(`[Reconcile] ⚠️ ${candidate.external_id} loaded a valid appointment page but was NOT seen during sync — NOT archiving. Possible sync bug.`);
        counts.warnings++;
      }
    } catch (fetchErr) {
      syncError(`[Reconcile] ❌ Fetch error for ${candidate.external_id}:`, fetchErr.message, fetchErr.stack);
      counts.errors++;
    }
  }

  syncLog(`[Reconcile] Done: ${counts.archived} archived, ${counts.warnings} warnings, ${counts.errors} errors`);
  return counts;
}

export default {
  isAccessDeniedPage,
  findReconciliationCandidates,
  archiveSyncAppointment,
  reconcileArchivedAppointments,
};
