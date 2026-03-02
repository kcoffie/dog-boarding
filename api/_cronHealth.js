/**
 * Shared helper: upsert a row to cron_health after each cron run.
 * Files prefixed with _ are not treated as Vercel API routes.
 * @requirements REQ-401
 */

/**
 * Record a cron run outcome in the cron_health table.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} cronName - 'auth' | 'schedule' | 'detail'
 * @param {'success'|'failure'} status
 * @param {object|null} result - Stats/metadata to store as JSONB
 * @param {string|null} errorMsg - Error message on failure
 */
export async function writeCronHealth(supabase, cronName, status, result, errorMsg) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('cron_health')
    .upsert(
      {
        cron_name:   cronName,
        last_ran_at: now,
        status,
        result:      result ?? null,
        error_msg:   errorMsg ?? null,
        updated_at:  now,
      },
      { onConflict: 'cron_name' }
    );

  if (error) {
    // Non-fatal — log and continue. Don't let health tracking break the cron.
    console.error(`[CronHealth] ⚠️ Failed to write health for '${cronName}':`, error.message);
  }
}
