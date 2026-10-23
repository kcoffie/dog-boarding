/**
 * The rosters on time (#321, REQ-658, REQ-659): the Pacific-hour gates, the once-a-day claims, the
 * alert text for a late, missing or failed send, and the check that each window ran.
 *
 * Vercel crons call /api/notify with no query string, and the Pacific hour picks the window
 * (triggerWindow): 4am, 7am, 8:30am, or Friday pm. Each window claims its own cron_health row first,
 * so a duplicate cron delivery sends nothing. Watchers: ops-watch the same morning, cron-health-check
 * (GitHub) that evening.
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
/** The claim row of each window the on-time trigger sends. */
export const CLAIM_ROWS = {
  '4am': CLAIM_ROW,
  '7am': 'notify-7am-claim',
  '8:30am': 'notify-830am-claim',
  'friday-pm': 'notify-friday-pm-claim',
};
/** Alerts for a failed on-time 7am, 8:30am or Friday pm call (the 4am window has its fallback). */
export const WINDOW_ALERT_JOB = 'notify-alert';
/** A claim still 'started' after this long is a crashed run; another call may take it over. */
export const STALE_CLAIM_MS = 10 * 60 * 1000;
/** The seeded row's date: never today, so the first claim always matches. */
export const NEVER = '1970-01-01';

const PACIFIC = 'America/Los_Angeles';
const UNREADABLE = { unreadable: true };
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const ON_TIME_HOURS = [4, 5];
const FALLBACK_FROM_HOUR = 6;
const HOUR_MS = 3600e3;
const WINDOW_LABELS = { '7am': '7am', '8:30am': '8:30am', 'friday-pm': 'Friday pm' };

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

/**
 * The window an on-time trigger call sends, from the Pacific clock alone; null outside every window.
 * 15:00 UTC is 8:30am in daylight time and 7am in standard time; Friday's 16:00 hour is a retry.
 * @returns {'4am'|'7am'|'8:30am'|'friday-pm'|null}
 */
export function triggerWindow(clock) {
  if (onTimeWindowOpen(clock)) return '4am';
  if (!WEEKDAYS.includes(clock.weekday)) return null;
  if (clock.hour === 7) return '7am';
  if (clock.hour === 8) return '8:30am';
  if (clock.weekday === 'Fri' && (clock.hour === 15 || clock.hour === 16)) return 'friday-pm';
  return null;
}

/** The GitHub fallback may send: 06:00 Pacific or later, after both on-time calls had their chance. */
export function fallbackHourReached(clock) {
  return clock.hour >= FALLBACK_FROM_HOUR;
}

/** The fallback runs Monday to Friday, like the on-time trigger (a manual weekend send uses force=1). */
export function isWeekday(clock) {
  return WEEKDAYS.includes(clock.weekday);
}

/**
 * A roster already went out today: the stored send is for today's Pacific date AND was made today.
 * A roster sent earlier for a future date (a `date=` preview) doesn't count, or it would stop that
 * day's 4am send. A send with no recorded time doesn't count either (the claim still dedupes).
 *
 * @param {{ lastDate: string, sentAt?: string|null }|null} lastState  the `notify` row's last send
 */
export function rosterSentToday(lastState, clock) {
  if (lastState?.lastDate !== clock.date || !lastState.sentAt) return false;
  return pacificClock(new Date(lastState.sentAt)).date === clock.date;
}

/**
 * The claim row as it is now: null when there is none, { unreadable: true } when it can't be read.
 * Used only to word an alert; the claim itself (claimDay) is what decides who sends.
 */
export async function readClaim(supabase, row = CLAIM_ROW) {
  try {
    const { data, error } = await supabase
      .from('cron_health')
      .select('status, result, updated_at')
      .eq('cron_name', row)
      .maybeSingle();
    if (error) {
      console.warn(`[RosterTrigger] Could not read the claim: ${error.message}`);
      return UNREADABLE;
    }
    return data ?? null;
  } catch (err) {
    console.warn(`[RosterTrigger] Could not read the claim: ${err.message}`);
    return UNREADABLE;
  }
}

/**
 * Claim the Pacific day for one 4am send. One conditional update: it matches only when the row is
 * for another day, failed, or was left 'started' by a crash over STALE_CLAIM_MS ago. Postgres
 * re-checks the condition for a second update waiting on the row lock, so two calls at the same
 * moment can't both win. Throws when the database can't be asked (the roster can't be built then
 * either).
 *
 * @param {{ row?: string, date: string, trigger: string, now: Date }} c  row: the window's claim row (default 4am's)
 * @returns {Promise<boolean>}  true when this call owns today's send
 */
export async function claimDay(supabase, { row = CLAIM_ROW, date, trigger, now }) {
  const at = now.toISOString();
  const { error: seedError } = await supabase
    .from('cron_health')
    .upsert(
      { cron_name: row, status: 'success', result: { date: NEVER }, last_ran_at: at, updated_at: at },
      { onConflict: 'cron_name', ignoreDuplicates: true },
    );
  if (seedError) throw new Error(`Could not create the claim row ${row}: ${seedError.message}`);

  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const { data, error } = await supabase
    .from('cron_health')
    .update({ status: 'started', result: { date, trigger, claimedAt: at }, error_msg: null, last_ran_at: at, updated_at: at })
    .eq('cron_name', row)
    .or(`result->>date.is.null,result->>date.neq.${date},status.eq.failure,and(status.eq.started,updated_at.lt."${staleBefore}")`)
    .select('cron_name');
  if (error) throw new Error(`Could not claim ${row}: ${error.message}`);
  const won = (data ?? []).length === 1;
  console.log(`[RosterTrigger] Claim ${row} for ${date} by ${trigger}: ${won ? 'won' : 'lost (already claimed)'}`);
  return won;
}

/**
 * Record how a claimed send ended. 'success' closes the day; 'failure' leaves it open for a later
 * call. Only today's claim is touched. Never throws: the send has already happened or failed, and a
 * claim left 'started' is taken over after STALE_CLAIM_MS.
 *
 * @param {{ row?: string, date: string, trigger: string, status: 'success'|'failure',
 *   outcome: 'sent'|'unchanged'|'no_data'|'failed', error?: string, now: Date }} end
 */
export async function finishClaim(supabase, { row = CLAIM_ROW, date, trigger, status, outcome, error, now }) {
  const at = now.toISOString();
  const result = { date, trigger, outcome, at };
  if (error) result.error = error;
  try {
    const { error: writeError } = await supabase
      .from('cron_health')
      .update({ status, result, error_msg: error ?? null, last_ran_at: at, updated_at: at })
      .eq('cron_name', row)
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
  if (prior?.unreadable) return "couldn't be checked (the claim row couldn't be read)";
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
    ? 'Later calls will try again, up to the GitHub fallback after 6am.'
    : 'The 7am and 8:30am windows send it once the data is there.';
  return `⚠️ No roster data for ${clock.date} at ${clock.time}, so the 4am roster wasn't sent. ${next}`;
}

/** A claimed on-time 7am, 8:30am or Friday pm call failed. */
export function windowFailedAlert(window, clock, error) {
  return `⚠️ The ${WINDOW_LABELS[window]} roster failed at ${clock.time} on ${clock.date}: ${error}`;
}

/**
 * The windows to check and their day, for ops-watch (Vercel, 17:00 UTC, after the last 8:30am call
 * in both seasons): today's 7am and 8:30am on a weekday, and on Saturday the Friday pm of the day before.
 * @returns {{ date: string, windows: string[] }}
 */
export function morningWindowsDue(now) {
  const today = pacificClock(now);
  if (WEEKDAYS.includes(today.weekday)) return { date: today.date, windows: ['7am', '8:30am'] };
  if (today.weekday === 'Sat') return { date: pacificClock(new Date(now.getTime() - 24 * HOUR_MS)).date, windows: ['friday-pm'] };
  return { date: today.date, windows: [] };
}

/**
 * The windows to check and their day, for cron-health-check (GitHub, 00:30 UTC, often hours late):
 * the Pacific day of (now − 12 h), the same day for any run up to 11 h late. Its weekday windows,
 * plus Friday pm on a Friday.
 * @returns {{ date: string, windows: string[] }}
 */
export function eveningWindowsDue(now) {
  const day = pacificClock(new Date(now.getTime() - 12 * HOUR_MS));
  if (!WEEKDAYS.includes(day.weekday)) return { date: day.date, windows: [] };
  return { date: day.date, windows: day.weekday === 'Fri' ? ['7am', '8:30am', 'friday-pm'] : ['7am', '8:30am'] };
}

/**
 * One line per window whose claim row doesn't show a finished run on `date`.
 * @param {Record<string, {status: string, result: object|null}>} rows  cron_health rows by cron_name
 * @param {{ date: string, windows: string[] }} due
 */
export function checkWindowRuns(rows, { date, windows }) {
  const issues = [];
  for (const window of windows) {
    const claim = rows[CLAIM_ROWS[window]];
    const label = `The ${WINDOW_LABELS[window]} roster`;
    if (claim?.result?.date !== date) issues.push(`${label} didn't run on ${date}`);
    else if (claim.status === 'failure') issues.push(`${label} failed on ${date}: ${claim.result.error ?? 'no error recorded'}`);
    else if (claim.status !== 'success') issues.push(`${label} started on ${date} but didn't finish`);
  }
  return issues;
}
