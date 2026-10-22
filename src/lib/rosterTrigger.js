/**
 * The 4am roster on time (#321, REQ-658): the Pacific-hour gates, the once-a-day claim, and the
 * alert text for a late or missing send.
 *
 * Two callers send the 4am roster automatically:
 *   - 'vercel': the on-time trigger (Vercel crons at 11:00 and 12:00 UTC), allowed 04:00–05:59 Pacific, Mon–Fri
 *   - 'github': the late fallback (notify-4am.yml at 14:00 UTC), allowed from 06:00 Pacific
 * Both claim the Pacific day on one cron_health row before doing any work, so the roster goes out
 * once a day however many calls arrive. Design: docs/specs/roster-trigger-design-note.md.
 *
 * @requirements REQ-658
 */

export const CLAIM_ROW = 'notify-4am-claim';
export const ALERT_JOB = 'notify-4am-alert';
/** A claim still 'started' after this long is a crashed run; another call may take it over. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;
/** The seeded row's date: never today, so the first claim always matches. */
export const NEVER = '1970-01-01';

const PACIFIC = 'America/Los_Angeles';
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ON_TIME_HOURS = [4, 5];
const FALLBACK_FROM_HOUR = 6;

/**
 * The Pacific wall clock at `now`.
 * @param {Date} now
 * @returns {{ date: string, hour: number, weekday: string, time: string }}  date 'YYYY-MM-DD',
 *   hour 0–23, weekday 'Mon'…'Sun', time '4:07 AM'
 */
export function pacificClock(now) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PACIFIC, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23', weekday: 'short',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const time = new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, hour: 'numeric', minute: '2-digit' }).format(now);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    weekday: parts.weekday,
    time,
  };
}

/** The on-time trigger may send: 04:00–05:59 Pacific, Monday to Friday. */
export function onTimeWindowOpen(clock) {
  return WEEKDAYS.includes(clock.weekday) && ON_TIME_HOURS.includes(clock.hour);
}

/** The GitHub fallback may send: 06:00 Pacific or later, after both on-time calls had their chance. */
export function fallbackHourReached(clock) {
  return clock.hour >= FALLBACK_FROM_HOUR;
}

/**
 * The claim row as it is now, or null when it doesn't exist or can't be read. Used only to word an
 * alert; the claim itself (claimDay) is what decides who sends.
 */
export async function readClaim(supabase) {
  try {
    const { data, error } = await supabase
      .from('cron_health')
      .select('status, result, updated_at')
      .eq('cron_name', CLAIM_ROW)
      .maybeSingle();
    if (error) {
      console.warn(`[RosterTrigger] Could not read the claim: ${error.message}`);
      return null;
    }
    return data ?? null;
  } catch (err) {
    console.warn(`[RosterTrigger] Could not read the claim: ${err.message}`);
    return null;
  }
}

/**
 * Claim the Pacific day for one 4am send. One conditional update: it matches only when the row is
 * for another day, failed, or was left 'started' by a crash over STALE_CLAIM_MS ago. Postgres
 * re-checks the condition for a second update waiting on the row lock, so two calls at the same
 * moment can't both win. Throws when the database can't be asked (the roster can't be built then
 * either).
 *
 * @returns {Promise<boolean>}  true when this call owns today's send
 */
export async function claimDay(supabase, { date, trigger, now }) {
  const at = now.toISOString();
  const { error: seedError } = await supabase
    .from('cron_health')
    .upsert(
      { cron_name: CLAIM_ROW, status: 'success', result: { date: NEVER }, last_ran_at: at, updated_at: at },
      { onConflict: 'cron_name', ignoreDuplicates: true },
    );
  if (seedError) throw new Error(`Could not create the 4am claim row: ${seedError.message}`);

  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await supabase
    .from('cron_health')
    .update({ status: 'started', result: { date, trigger, claimedAt: at }, error_msg: null, last_ran_at: at, updated_at: at })
    .eq('cron_name', CLAIM_ROW)
    .or(`result->>date.is.null,result->>date.neq.${date},status.eq.failure,and(status.eq.started,updated_at.lt."${staleBefore}")`)
    .select('cron_name');
  if (error) throw new Error(`Could not claim the 4am send: ${error.message}`);
  const won = (data ?? []).length === 1;
  console.log(`[RosterTrigger] Claim for ${date} by ${trigger}: ${won ? 'won' : 'lost (already claimed)'}`);
  return won;
}

/**
 * Record how a claimed send ended. 'success' closes the day; 'failure' leaves it open for a later
 * call. Only today's claim is touched. Never throws: the send has already happened or failed, and a
 * claim left 'started' is taken over after STALE_CLAIM_MS.
 *
 * @param {{ date: string, trigger: string, status: 'success'|'failure', outcome: 'sent'|'no_data'|'failed',
 *   error?: string, now: Date }} end
 */
export async function finishClaim(supabase, { date, trigger, status, outcome, error, now }) {
  const at = now.toISOString();
  const result = { date, trigger, outcome, at };
  if (error) result.error = error;
  try {
    const { error: writeError } = await supabase
      .from('cron_health')
      .update({ status, result, error_msg: error ?? null, last_ran_at: at, updated_at: at })
      .eq('cron_name', CLAIM_ROW)
      .eq('result->>date', date);
    if (writeError) console.warn(`[RosterTrigger] Could not record the claim's end (${outcome}): ${writeError.message}`);
  } catch (err) {
    console.warn(`[RosterTrigger] Could not record the claim's end (${outcome}): ${err.message}`);
  }
}

/**
 * Why the on-time send didn't go out today, read from the claim as it was before this call.
 * @returns {string|null}  null when today's on-time send succeeded
 */
export function missReason(prior, date) {
  const r = prior?.result;
  if (!prior || r?.date !== date) return 'never ran today';
  if (prior.status === 'success') return null;
  // Stryker disable next-line ConditionalExpression: only finishClaim's 'failure' writes an outcome of no_data
  if (prior.status === 'failure' && r.outcome === 'no_data') return 'found no roster data';
  if (prior.status === 'failure') return `failed: ${r.error ?? 'no error recorded'}`;
  return "started but didn't finish";
}

/** True when the claim already recorded today's no-data outcome (its alert went out then). */
export function noDataAlreadyReported(prior, date) {
  return prior?.result?.date === date && prior.result.outcome === 'no_data';
}

/** The fallback sent the roster because the on-time send didn't. */
export function lateSendAlert(clock, reason) {
  return `⚠️ The 4am roster went out late, at ${clock.time} (GitHub fallback). The on-time send ${reason}.`;
}

/** The on-time send never happened, and a later window already sent today's roster. */
export function missedAlert(clock, reason) {
  return `⚠️ The 4am roster didn't go out on time on ${clock.date}: the on-time send ${reason}. A later roster already went out, so nothing was re-sent.`;
}

/** A claimed 4am call found no roster to send. */
export function noDataAlert(clock, trigger) {
  const next = trigger === 'vercel'
    ? 'Later calls will try again (the 5am retry, then the GitHub fallback after 6am).'
    : 'The 7am and 8:30am windows send it once the data is there.';
  return `⚠️ No roster data for ${clock.date} at ${clock.time}, so the 4am roster wasn't sent. ${next}`;
}
