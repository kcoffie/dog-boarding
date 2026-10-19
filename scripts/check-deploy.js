/* global process */
/**
 * Post-merge deploy check (REQ-654): `npm run check:deploy [sha]` (default: origin/main).
 * Waits for the commit's `Vercel – qboard` status, then checks the home page and the roster image
 * in production. The rules live in src/lib/deployCheck.js; this file only talks to GitHub and Vercel.
 *
 * Env (from .env.local): VITE_SYNC_PROXY_TOKEN for the roster image. GITHUB_TOKEN is optional
 * (the repo is public; a token only raises GitHub's rate limit).
 * Exit 1 when the deploy failed or timed out, or production answered wrong.
 */

import { execFileSync } from 'node:child_process';
import { waitForDeploy, productionProblems } from '../src/lib/deployCheck.js';

const REPO = 'kcoffie/dog-boarding';
const PROD = 'https://qboarding.vercel.app';

const sha = process.argv[2]
  ?? execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
const imageToken = process.env.VITE_SYNC_PROXY_TOKEN;
if (!imageToken) {
  console.error('[check-deploy] Missing VITE_SYNC_PROXY_TOKEN (run from the repo root with .env.local present)');
  process.exit(1);
}

async function getStatuses() {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${sha}/statuses?per_page=100`, { headers });
  if (!res.ok) throw new Error(`GitHub statuses returned ${res.status}`);
  return res.json();
}

console.log(`[check-deploy] ${sha.slice(0, 7)}: waiting for Vercel…`);
const deploy = await waitForDeploy({
  getStatuses,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
});
console.log(`[check-deploy] ${deploy.message}`);
if (!deploy.ok) process.exit(1);

const home = await fetch(PROD);
const image = await fetch(`${PROD}/api/roster-image?type=weekend&token=${encodeURIComponent(imageToken)}`);
const problems = productionProblems({
  home: { status: home.status },
  image: { status: image.status, contentType: image.headers.get('content-type') },
});
for (const p of problems) console.error(`[check-deploy] ${p}`);
if (problems.length) process.exit(1);
console.log('[check-deploy] production OK: home page 200, roster image 200 image/png');
