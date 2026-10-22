/**
 * Shared helper: upsert a row to cron_health after each cron run,
 * and append a row to cron_health_log for historical visibility.
 * Files prefixed with _ are not treated as Vercel API routes.
 * @requirements REQ-401
 */

/**
 * Record a cron run outcome in cron_health (latest-only upsert) and
 * cron_health_log (append-only history).
 *
 * Both writes are non-fatal — a failure in either logs a warning but does
 * not throw, so health tracking never breaks the cron that called us.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} cronName - 'auth' | 'schedule' | 'detail' | 'notify' | etc.
 * @param {'success'|'failure'} status
 * @param {object|null} result - Stats/metadata to store as JSONB
 * @param {string|null} errorMsg - Error message on failure
 * @param {{ keepResult?: boolean }} [options] - keepResult: leave cron_health.result as stored (the
 *   upsert only sets the columns it's given). notify's failures use it so the 7am/8:30am baseline
 *   (lastHash/lastDate) survives a failed run (REQ-658). The log row still records `result`.
 */
export async function writeCronHealth(supabase, cronName, status, result, errorMsg, { keepResult = false } = {}) {
  const now = new Date().toISOString();

  // ── cron_health: single-row upsert (latest run per cron) ──────────────────
  const row = {
    cron_name:   cronName,
    last_ran_at: now,
    status,
    error_msg:   errorMsg ?? null,
    updated_at:  now,
  };
  if (!keepResult) row.result = result ?? null;
  const { error: upsertError } = await supabase
    .from('cron_health')
    .upsert(row, { onConflict: 'cron_name' });

  if (upsertError) {
    console.error(`[CronHealth] ⚠️ Failed to upsert health for '${cronName}':`, upsertError.message);
  }

  // ── cron_health_log: append-only history ──────────────────────────────────
  // Gives us a full timeline for debugging (e.g. cron-auth ran at 00:12 and
  // skipped re-auth because session "looked" valid — visible in log even after
  // the next cron_health upsert overwrites the latest row).
  const { error: logError } = await supabase
    .from('cron_health_log')
    .insert({
      cron_name: cronName,
      status,
      result:    result ?? null,
      error_msg: errorMsg ?? null,
      ran_at:    now,
    });

  if (logError) {
    console.error(`[CronHealth] ⚠️ Failed to append log for '${cronName}':`, logError.message);
  }
}
