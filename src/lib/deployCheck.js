/**
 * Post-merge deploy check (REQ-654).
 *
 * A green PR doesn't mean production changed: on 2026-10-19 a merge to main hit Vercel's daily
 * deploy limit and production silently stayed on the previous commit. After every merge,
 * `npm run check:deploy` waits for the commit's Vercel status, then checks that production
 * answers. GitHub and production are passed in so the rules can be tested without them.
 * @requirements REQ-654
 */

export const VERCEL_CONTEXT = 'Vercel – qboard';

/**
 * The newest status for one context, or null when Vercel hasn't reported on the commit yet.
 * @param {Array<{context:string,state:string,description?:string,updated_at:string}>} statuses
 */
export function latestStatus(statuses, context = VERCEL_CONTEXT) {
  let latest = null;
  for (const s of statuses) {
    if (s.context !== context) continue;
    // Stryker disable next-line EqualityOperator: `>=` only changes which of two same-timestamp statuses wins (no order to keep); `<=` is killed by the order test
    if (!latest || s.updated_at > latest.updated_at) latest = s;
  }
  return latest;
}

/** "failure: Deployment rate limited", or just the state when Vercel gave no description. */
const describe = (s) => (s.description ? `${s.state}: ${s.description}` : s.state);

/** 'deployed', 'failed', or 'waiting' (no status yet, or still building). */
export function deployVerdict(status) {
  if (!status || status.state === 'pending') return 'waiting';
  if (status.state === 'success') return 'deployed';
  return 'failed';
}

/**
 * Poll the commit's statuses until Vercel reports success or failure, or time runs out.
 * @param {{ getStatuses: () => Promise<Array>, sleep: (ms:number) => Promise<void>,
 *           now: () => number, timeoutMs?: number, intervalMs?: number }} deps
 * @returns {Promise<{ok:boolean, message:string}>}
 */
export async function waitForDeploy({ getStatuses, sleep, now, timeoutMs = 600_000, intervalMs = 20_000 }) {
  const deadline = now() + timeoutMs;
  for (;;) {
    let statuses;
    try {
      statuses = await getStatuses();
    } catch (err) {
      return { ok: false, message: `could not read the commit's statuses from GitHub: ${err.message}` };
    }
    const status = latestStatus(statuses);
    const verdict = deployVerdict(status);
    if (verdict === 'deployed') return { ok: true, message: `deploy ${describe(status)}` };
    if (verdict === 'failed') return { ok: false, message: `deploy ${describe(status)}` };
    if (now() >= deadline) {
      const last = status ? `still ${describe(status)}` : `no "${VERCEL_CONTEXT}" status`;
      return { ok: false, message: `timed out after ${Math.round(timeoutMs / 1000)} s, ${last}` };
    }
    await sleep(intervalMs);
  }
}

/**
 * What's wrong with production's answers, as one line each (empty = healthy).
 * @param {{ home: {status:number}, image: {status:number, contentType:string|null} }} answers
 */
export function productionProblems({ home, image }) {
  const problems = [];
  if (home.status !== 200) problems.push(`home page returned ${home.status}`);
  if (image.status !== 200) problems.push(`roster image returned ${image.status}`);
  else if (!image.contentType?.startsWith('image/png')) {
    problems.push(`roster image returned ${image.contentType ?? 'no content type'}, not image/png`);
  }
  return problems;
}

export const PROD_URL = 'https://qboarding.vercel.app';

/** The production URLs the check reads; the roster image is the endpoint a bad dependency crashed (#246). */
export function productionUrls(imageToken) {
  return {
    home: PROD_URL,
    image: `${PROD_URL}/api/roster-image?type=weekend&token=${encodeURIComponent(imageToken)}`,
  };
}

/**
 * The whole check: which commit, its deploy, then production. Production isn't asked when the
 * deploy didn't succeed (it would only describe the previous deploy).
 * @param {{ sha?: string, getHead: () => Promise<{sha:string, subject:string}>,
 *           getStatuses: (sha:string) => Promise<Array>, fetchAnswer: (url:string) => Promise<{status:number, contentType:string|null}>,
 *           imageToken: string, sleep: (ms:number) => Promise<void>, now: () => number,
 *           timeoutMs?: number, intervalMs?: number }} deps
 * @returns {Promise<{exitCode: 0|1, lines: string[]}>}
 */
export async function runDeployCheck({ sha, getHead, getStatuses, fetchAnswer, imageToken, ...timing }) {
  const lines = [];
  let target = sha;
  if (!target) {
    try {
      const head = await getHead();
      target = head.sha;
      lines.push(`main is ${head.sha.slice(0, 7)}: ${head.subject}`);
    } catch (err) {
      return { exitCode: 1, lines: [`could not read main's head from GitHub: ${err.message}`] };
    }
  }
  const deploy = await waitForDeploy({ getStatuses: () => getStatuses(target), ...timing });
  lines.push(`${target.slice(0, 7)}: ${deploy.message}`);
  if (!deploy.ok) return { exitCode: 1, lines };

  const urls = productionUrls(imageToken);
  let problems;
  try {
    problems = productionProblems({ home: await fetchAnswer(urls.home), image: await fetchAnswer(urls.image) });
  } catch (err) {
    problems = [`production did not answer: ${err.message}`];
  }
  if (problems.length) return { exitCode: 1, lines: [...lines, ...problems] };
  return { exitCode: 0, lines: [...lines, 'production OK: home page 200, roster image 200 image/png'] };
}
