/* global process */
/**
 * Post-merge deploy check (REQ-654): `npm run check:deploy [sha]`. With no SHA it checks main's
 * current head on GitHub (not the local origin/main, which is stale until you fetch).
 * The rules live in src/lib/deployCheck.js; this file only talks to GitHub and Vercel.
 *
 * Env (from .env.local): VITE_SYNC_PROXY_TOKEN for the roster image. GITHUB_TOKEN is optional
 * (the repo is public; a token only raises GitHub's rate limit).
 * Exit 1 when the deploy failed or timed out, or production answered wrong.
 */

import { runDeployCheck } from '../src/lib/deployCheck.js';

const REPO = 'kcoffie/dog-boarding';

const imageToken = process.env.VITE_SYNC_PROXY_TOKEN;
if (!imageToken) {
  console.error('[check-deploy] Missing VITE_SYNC_PROXY_TOKEN (run from the repo root with .env.local present)');
  process.exit(1);
}

async function github(path) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${path} returned ${res.status}`);
  return res.json();
}

console.log('[check-deploy] waiting for Vercel…');
const { exitCode, lines } = await runDeployCheck({
  sha: process.argv[2],
  getHead: async () => {
    const c = await github('/commits/main');
    return { sha: c.sha, subject: c.commit.message.split('\n')[0] };
  },
  getStatuses: (sha) => github(`/commits/${sha}/statuses?per_page=100`),
  fetchAnswer: async (url) => {
    const res = await fetch(url);
    return { status: res.status, contentType: res.headers.get('content-type') };
  },
  imageToken,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
});
for (const line of lines) (exitCode ? console.error : console.log)(`[check-deploy] ${line}`);
process.exit(exitCode);
