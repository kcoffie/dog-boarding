/* global process */
/**
 * Keep-alive for scheduled workflows (REQ-650). Run weekly by .github/workflows/keepalive.yml.
 * The rules live in src/lib/workflowHealth.js; this file only talks to GitHub.
 *
 * Env: GITHUB_TOKEN (needs actions: write), GITHUB_REPOSITORY (owner/repo; set by Actions).
 * Exit 1 when a workflow was disabled for inactivity, an enable call failed, or the listing failed.
 */

import { runKeepalive } from '../src/lib/workflowHealth.js';

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!token || !repo) {
  console.error('[Keepalive] Missing GITHUB_TOKEN or GITHUB_REPOSITORY');
  process.exit(1);
}

const api = (path, init = {}) =>
  fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

async function listWorkflows() {
  const res = await api('/actions/workflows?per_page=100');
  if (!res.ok) throw new Error(`List workflows: HTTP ${res.status}`);
  return (await res.json()).workflows;
}

async function enableWorkflow(id) {
  const res = await api(`/actions/workflows/${id}/enable`, { method: 'PUT' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

try {
  const r = await runKeepalive({ listWorkflows, enableWorkflow });
  console.log(`[Keepalive] Refreshed ${r.refreshed.length}: ${r.refreshed.join(', ') || '-'}`);
  if (r.manual.length) console.log(`[Keepalive] Disabled on purpose (left alone): ${r.manual.join(', ')}`);
  for (const name of r.inactive) {
    console.log(`::error::${name} was disabled for inactivity. Re-enable it in the Actions tab (Kate's call).`);
  }
  for (const f of r.failed) console.log(`::error::Could not refresh ${f.name}: ${f.error}`);
  if (!r.ok && !r.inactive.length && !r.failed.length) {
    console.log('::error::No workflows from .github/workflows/ were listed; the keep-alive itself should be there.');
  }
  process.exit(r.ok ? 0 : 1);
} catch (err) {
  console.log(`::error::Keep-alive crashed: ${err.message}`);
  process.exit(1);
}
