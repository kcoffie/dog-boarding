/**
 * Ops watch (REQ-651): daily outcome checks that run on Vercel, outside GitHub's scheduler.
 *
 * Every check asks "did the outcome happen?", not "did the job run?". A check that can't run is a
 * finding too: silence is never success. The I/O (Supabase, GitHub, the image endpoint, WhatsApp,
 * the email dispatch) is passed in, so the rules can be tested without it. Wiring: api/ops-watch.js.
 * Design: docs/specs/ops-watch-design-note.md.
 * @requirements REQ-651
 */

const HOUR_MS = 3600e3;
const BACKLOG_HOURS = 48;
const STALLED_HOURS = 36;

/** Hours since each scheduled workflow's last successful run before it's a finding. */
export const WORKFLOW_MAX_AGE_HOURS = {
  'gmail-monitor.yml': 3,
  'integration-check.yml': 12,
  'cron-health-check.yml': 26,
  'notify-4am.yml': 96, // 4 days: covers Friday → Monday
  'keepalive.yml': 192, // weekly, plus a day
};

const hoursSince = (iso, now) => (now.getTime() - new Date(iso).getTime()) / HOUR_MS;

/** 'YYYY-MM-DD' and weekday ('Mon'…) of `date` in Pacific time (handles DST). */
function pacific(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday };
}

/** @param {{ pendingCount:number, oldestPendingAt:string|null, lastDoneAt:string|null }} q */
export function checkQueue(q, now) {
  if (q.pendingCount === 0) return [];
  const findings = [];
  if (q.oldestPendingAt && hoursSince(q.oldestPendingAt, now) > BACKLOG_HOURS) {
    const h = Math.round(hoursSince(q.oldestPendingAt, now));
    findings.push(`Sync backlog: ${q.pendingCount} items pending, oldest queued ${h}h ago`);
  }
  if (!q.lastDoneAt || hoursSince(q.lastDoneAt, now) > STALLED_HOURS) {
    findings.push(`Sync stalled: ${q.pendingCount} items pending and none processed in ${STALLED_HOURS}h`);
  }
  return findings;
}

/**
 * @param {{ sent: Array<{wamid:string, sent_at:string}>, deliveredWamids: string[] }} r
 *   notify-4am rows with status 'sent' (any recent ones), and wamids with a delivered/read webhook row.
 */
export function checkRoster({ sent, deliveredWamids }, now) {
  const today = pacific(now);
  if (today.weekday === 'Sat' || today.weekday === 'Sun') return [];
  const todays = sent.filter((m) => pacific(new Date(m.sent_at)).day === today.day);
  if (todays.length === 0) return [`No morning roster sent today (${today.day})`];
  const delivered = new Set(deliveredWamids);
  if (!todays.some((m) => delivered.has(m.wamid))) {
    return [`Morning roster sent but not delivered to anyone (${todays.length} sends, no delivery receipt)`];
  }
  return [];
}

/** @param {Record<string, string|null>} lastSuccess  workflow file → ISO time of its last successful run */
export function checkWorkflowRuns(lastSuccess, now) {
  const findings = [];
  for (const [file, maxHours] of Object.entries(WORKFLOW_MAX_AGE_HOURS)) {
    // Stryker disable next-line Regex: the keys are fixed file names, so the $ anchor changes nothing
    const name = file.replace(/\.yml$/, '');
    const at = lastSuccess[file];
    if (!at) findings.push(`Workflow ${name} has never succeeded (disabled or failing?)`);
    else if (hoursSince(at, now) > maxHours) {
      findings.push(`Workflow ${name}: last success ${Math.round(hoursSince(at, now))}h ago (limit ${maxHours}h)`);
    }
  }
  return findings;
}

/** @param {{ status:number, contentType:string }} r  response from the production weekend roster image */
export function checkImage({ status, contentType }) {
  if (status === 200 && contentType === 'image/png') return [];
  return [`Roster image broken: HTTP ${status} (${contentType})`];
}

/**
 * Run every check, then alert once on WhatsApp and by email when there are findings.
 * `ok` is false when a check couldn't run or an alert couldn't be sent.
 */
export async function runOpsWatch(d) {
  const now = d.now();
  const findings = [];
  let allChecksRan = true;

  const checks = [
    ['the sync queue', async () => checkQueue(await d.loadQueueStats(), now)],
    ['the morning roster', async () => checkRoster(await d.loadRosterRows(), now)],
    ['the scheduled workflows', async () => checkWorkflowRuns(await d.loadLastSuccess(), now)],
    ['the roster image', async () => checkImage(await d.fetchImage())],
  ];
  for (const [what, run] of checks) {
    try {
      findings.push(...(await run()));
    } catch (err) {
      allChecksRan = false;
      findings.push(`Couldn't check ${what}: ${err.message}`);
    }
  }

  if (findings.length === 0) return { ok: true, findings };

  const text = `⚠️ Q Boarding ops watch (${pacific(now).day})\n${findings.map((f) => `• ${f}`).join('\n')}`;
  // A channel counts as delivered only when its sender resolves true; a throw counts as not delivered.
  // Stryker disable next-line ArrowFunction: () => undefined is as falsy as () => false here
  const delivered = await Promise.all([d.sendWhatsApp(text), d.sendEmail(text)].map((p) => p.then((v) => v === true, () => false)));
  return { ok: allChecksRan && delivered.every((x) => x), findings };
}
