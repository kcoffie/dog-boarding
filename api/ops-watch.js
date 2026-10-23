/**
 * GET /api/ops-watch — daily outcome checks on Vercel, outside GitHub's scheduler (REQ-651).
 * Vercel cron: 17:00 UTC (vercel.json). Rules: src/lib/opsWatch.js. Design: docs/specs/ops-watch-design-note.md.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel cron sends it). Fails closed when CRON_SECRET is unset.
 * `?dryRun=1` returns the findings without alerting or writing cron_health.
 *
 * Env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, GH_ACTIONS_TOKEN (fine-grained,
 * this repo only, Actions read + write), INTERNAL_API_TOKEN (roster image), TELEGRAM_BOT_TOKEN and
 * TELEGRAM_ALERT_CHAT_ID (Kate's alert channel, REQ-652). Optional: GITHUB_REPO (default kcoffie/dog-boarding).
 */
import { createClient } from '@supabase/supabase-js';
import { runOpsWatch, WORKFLOW_MAX_AGE_HOURS, ALERT_JOBS } from '../src/lib/opsWatch.js';
import { CLAIM_ROWS } from '../src/lib/rosterTrigger.js';
import { alertAndLog } from '../src/lib/alertKate.js';
import { writeCronHealth } from './_cronHealth.js';

export const config = { runtime: 'nodejs' };

const REPO = process.env.GITHUB_REPO || 'kcoffie/dog-boarding';
const APP_URL = 'https://qboarding.vercel.app';
// Every outside call gets a deadline, so a hang (like the #246 image crash) becomes a finding
// instead of killing the function before it can alert.
const FETCH_TIMEOUT_MS = 15000;

function github(path, init = {}) {
  const token = process.env.GH_ACTIONS_TOKEN;
  if (!token) throw new Error('GH_ACTIONS_TOKEN not set in Vercel');
  return fetch(`https://api.github.com/repos/${REPO}${path}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
}

async function must(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message);
  return data;
}

function makeDeps(supabase) {
  return {
    now: () => new Date(),

    async loadQueueStats() {
      const { count, error } = await supabase.from('sync_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending');
      if (error) throw new Error(error.message);
      const oldest = await must(supabase.from('sync_queue').select('queued_at').eq('status', 'pending').order('queued_at').limit(1));
      const lastDone = await must(supabase.from('sync_queue').select('processed_at').eq('status', 'done')
        .not('processed_at', 'is', null).order('processed_at', { ascending: false }).limit(1));
      return { pendingCount: count ?? 0, oldestPendingAt: oldest[0]?.queued_at ?? null, lastDoneAt: lastDone[0]?.processed_at ?? null };
    },

    async loadScheduleHealth() {
      const rows = await must(supabase.from('cron_health').select('last_ran_at, status, result, error_msg')
        .eq('cron_name', 'schedule').limit(1));
      return rows[0] ?? null;
    },

    async loadSiteAccess() {
      const rows = await must(supabase.from('site_access').select('blocked_at, blocked_reason').eq('id', true).limit(1));
      return rows[0] ?? null;
    },

    async loadRosterRows() {
      const since = new Date(Date.now() - 48 * 3600e3).toISOString();
      const sent = await must(supabase.from('message_log').select('wamid, sent_at, recipient')
        .in('job_name', ['notify-4am', 'notify-7am', 'notify-8:30am']).eq('status', 'sent').gte('sent_at', since));
      const wamids = sent.map((m) => m.wamid).filter(Boolean);
      if (wamids.length === 0) return { sent, deliveredWamids: [] };
      const delivered = await must(supabase.from('message_delivery_status').select('wamid')
        .in('wamid', wamids).in('status', ['delivered', 'read']));
      return { sent, deliveredWamids: delivered.map((d) => d.wamid) };
    },

    /** The 7am, 8:30am and Friday pm claim rows, by cron_name (REQ-659). */
    async loadWindowClaims() {
      const rows = await must(supabase.from('cron_health').select('cron_name, status, result')
        .in('cron_name', [CLAIM_ROWS['7am'], CLAIM_ROWS['8:30am'], CLAIM_ROWS['friday-pm']]));
      return Object.fromEntries(rows.map((r) => [r.cron_name, r]));
    },

    async loadLastSuccess() {
      if (!process.env.GH_ACTIONS_TOKEN) throw new Error('GH_ACTIONS_TOKEN not set in Vercel');
      // Scheduled runs only: a manual run must not hide a schedule that stopped. One failed lookup
      // is reported for that workflow alone; the others are still checked.
      const files = Object.keys(WORKFLOW_MAX_AGE_HOURS);
      const entries = await Promise.all(files.map(async (file) => {
        try {
          const res = await github(`/actions/workflows/${file}/runs?status=success&event=schedule&per_page=1`);
          if (!res.ok) return [file, { error: `HTTP ${res.status}` }];
          const body = await res.json();
          return [file, body.workflow_runs?.[0]?.updated_at ?? null];
        } catch (err) {
          return [file, { error: err.message }];
        }
      }));
      return Object.fromEntries(entries);
    },

    async fetchImage() {
      const token = encodeURIComponent(process.env.INTERNAL_API_TOKEN ?? '');
      const res = await fetch(`${APP_URL}/api/roster-image?type=weekend&token=${token}`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      return { status: res.status, contentType: res.headers.get('content-type') ?? '' };
    },

    async loadFailedAlerts() {
      const since = new Date(Date.now() - 24 * 3600e3).toISOString();
      return must(supabase.from('message_log').select('job_name')
        .eq('status', 'failed').in('job_name', ALERT_JOBS).gte('sent_at', since));
    },

    async sendAlert(text) {
      return alertAndLog(supabase, 'ops-watch', text);
    },

    async sendEmail(text) {
      // ops-alert.yml fails on purpose, so GitHub emails the token's owner (Kate).
      const res = await github('/actions/workflows/ops-alert.yml/dispatches', {
        method: 'POST',
        body: JSON.stringify({ ref: 'main', inputs: { findings: text.slice(0, 1000) } }),
      });
      if (!res.ok) throw new Error(`ops-alert dispatch: HTTP ${res.status}`);
      return true;
    },
  };
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const deps = makeDeps(supabase);

  if (req.query?.dryRun === '1') {
    const silent = { ...deps, sendAlert: async () => true, sendEmail: async () => true };
    const result = await runOpsWatch(silent);
    return res.status(200).json({ dryRun: true, findings: result.findings });
  }

  const result = await runOpsWatch(deps);
  console.log('[OpsWatch] ok=%s findings=%d', result.ok, result.findings.length, result.findings);
  await writeCronHealth(supabase, 'ops-watch', result.ok ? 'success' : 'failure', { findings: result.findings }, null);
  return res.status(200).json(result);
}
