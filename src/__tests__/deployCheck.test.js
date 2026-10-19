/**
 * Post-merge deploy check. Expected values come from REQ-654's acceptance criteria.
 * @requirements REQ-654
 *
 * GitHub and production are the boundaries: statuses are the shape of
 * GET /repos/{owner}/{repo}/commits/{sha}/statuses entries, and the clock and sleep are fakes.
 */

import { describe, it, expect } from 'vitest';
import { latestStatus, deployVerdict, waitForDeploy, productionProblems, productionUrls, runDeployCheck } from '../lib/deployCheck.js';

const status = (state, description, updated_at = '2026-10-20T20:40:00Z', context = 'Vercel – qboard') =>
  ({ context, state, description, updated_at });

/** Each poll returns the next answer; the clock moves by the slept time. */
function fakePolls(answers) {
  let t = 0;
  let i = 0;
  const slept = [];
  return {
    slept,
    polls: () => i,
    getStatuses: async () => answers[Math.min(i++, answers.length - 1)],
    sleep: async (ms) => { slept.push(ms); t += ms; },
    now: () => t,
  };
}

describe('latestStatus', () => {
  it('only the Vercel – qboard status counts; other contexts are ignored', () => {
    const s = latestStatus([status('failure', 'other', '2026-10-20T21:00:00Z', 'Vercel – dog-boarding'), status('success', 'ours')]);
    expect(s.description).toBe('ours');
  });

  it('with no Vercel – qboard status there is nothing yet', () => {
    expect(latestStatus([status('success', 'x', '2026-10-20T20:40:00Z', 'codecov')])).toBe(null);
  });

  it('when posted more than once, the newest by updated_at wins, whatever the list order', () => {
    const older = status('pending', 'Building', '2026-10-20T20:40:00Z');
    const newer = status('success', 'Deployment has completed', '2026-10-20T20:42:00Z');
    expect(latestStatus([older, newer]).state).toBe('success');
    expect(latestStatus([newer, older]).state).toBe('success');
  });
});

describe('deployVerdict', () => {
  it('no status yet means waiting', () => expect(deployVerdict(null)).toBe('waiting'));
  it('pending means waiting', () => expect(deployVerdict(status('pending', 'Building'))).toBe('waiting'));
  it('success means deployed', () => expect(deployVerdict(status('success', 'Deployment has completed'))).toBe('deployed'));
  it('failure means failed', () => expect(deployVerdict(status('failure', 'Deployment rate limited'))).toBe('failed'));
  it('error means failed', () => expect(deployVerdict(status('error', 'Build error'))).toBe('failed'));
});

describe('waitForDeploy', () => {
  it('waits through no status and pending, then reports the deploy, polling every 20 s by default', async () => {
    const f = fakePolls([[], [status('pending', 'Building')], [status('success', 'Deployment has completed')]]);
    const r = await waitForDeploy(f);
    expect(r).toEqual({ ok: true, message: 'deploy success: Deployment has completed' });
    expect(f.slept).toEqual([20_000, 20_000]);
  });

  it('a failed deploy fails at once with its state and Vercel\'s description', async () => {
    const f = fakePolls([[status('failure', 'Deployment rate limited — retry in 24 hours.')]]);
    const r = await waitForDeploy(f);
    expect(r).toEqual({ ok: false, message: 'deploy failure: Deployment rate limited — retry in 24 hours.' });
    expect(f.slept).toEqual([]);
  });

  it('a status with no description is reported by its state alone', async () => {
    const r = await waitForDeploy(fakePolls([[{ context: 'Vercel – qboard', state: 'error', updated_at: '2026-10-20T20:40:00Z' }]]));
    expect(r).toEqual({ ok: false, message: 'deploy error' });
  });

  it('a pending status with no description times out naming the state alone', async () => {
    const pending = { context: 'Vercel – qboard', state: 'pending', updated_at: '2026-10-20T20:40:00Z' };
    const r = await waitForDeploy({ ...fakePolls([[pending]]), timeoutMs: 20_000 });
    expect(r).toEqual({ ok: false, message: 'timed out after 20 s, still pending' });
  });

  it('a success with no description still counts as deployed', async () => {
    const done = { context: 'Vercel – qboard', state: 'success', updated_at: '2026-10-20T20:40:00Z' };
    expect(await waitForDeploy(fakePolls([[done]]))).toEqual({ ok: true, message: 'deploy success' });
  });

  it('a GitHub error while polling fails with one line naming it', async () => {
    const r = await waitForDeploy({ ...fakePolls([[]]), getStatuses: async () => { throw new Error('GitHub /commits/abc/statuses returned 502'); } });
    expect(r).toEqual({ ok: false, message: "could not read the commit's statuses from GitHub: GitHub /commits/abc/statuses returned 502" });
  });

  it('an error status fails at once too', async () => {
    const r = await waitForDeploy(fakePolls([[status('error', 'Build error')]]));
    expect(r).toEqual({ ok: false, message: 'deploy error: Build error' });
  });

  it('still pending when the 10-minute default timeout runs out fails, naming the last state', async () => {
    const f = fakePolls([[status('pending', 'Building')]]);
    const r = await waitForDeploy(f);
    expect(r).toEqual({ ok: false, message: 'timed out after 600 s, still pending: Building' });
    expect(f.polls()).toBe(31); // at 0 s, every 20 s, and once at 600 s
  });

  it('no Vercel status ever arriving times out and says so', async () => {
    const r = await waitForDeploy({ ...fakePolls([[]]), timeoutMs: 60_000, intervalMs: 30_000 });
    expect(r).toEqual({ ok: false, message: 'timed out after 60 s, no "Vercel – qboard" status' });
  });

  it('a status that arrives exactly at the deadline still counts', async () => {
    const f = fakePolls([[], [], [status('success', 'Deployment has completed')]]);
    const r = await waitForDeploy({ ...f, timeoutMs: 40_000 });
    expect(r).toEqual({ ok: true, message: 'deploy success: Deployment has completed' });
  });
});

describe('productionProblems', () => {
  const png = { status: 200, contentType: 'image/png' };

  it('home 200 and roster image 200 image/png is healthy', () => {
    expect(productionProblems({ home: { status: 200 }, image: png })).toEqual([]);
  });

  it('image/png with a header parameter is still a PNG', () => {
    expect(productionProblems({ home: { status: 200 }, image: { status: 200, contentType: 'image/png; charset=binary' } })).toEqual([]);
  });

  it('a home page that is not 200 is a problem', () => {
    expect(productionProblems({ home: { status: 404 }, image: png })).toEqual(['home page returned 404']);
  });

  it('a roster image that is not 200 is a problem (the #246 crash returned 500)', () => {
    expect(productionProblems({ home: { status: 200 }, image: { status: 500, contentType: 'text/plain' } }))
      .toEqual(['roster image returned 500']);
  });

  it('a 200 roster image that is not image/png is a problem', () => {
    expect(productionProblems({ home: { status: 200 }, image: { status: 200, contentType: 'text/html; charset=utf-8' } }))
      .toEqual(['roster image returned text/html; charset=utf-8, not image/png']);
  });

  it('a 200 roster image with no content type is a problem', () => {
    expect(productionProblems({ home: { status: 200 }, image: { status: 200, contentType: null } }))
      .toEqual(['roster image returned no content type, not image/png']);
  });

  it('each wrong answer is reported on its own line', () => {
    expect(productionProblems({ home: { status: 503 }, image: { status: 401, contentType: 'application/json' } }))
      .toEqual(['home page returned 503', 'roster image returned 401']);
  });
});

describe('productionUrls', () => {
  it('checks the production home page and the weekend roster image with the token URL-encoded', () => {
    expect(productionUrls('a b&c')).toEqual({
      home: 'https://qboarding.vercel.app',
      image: 'https://qboarding.vercel.app/api/roster-image?type=weekend&token=a%20b%26c',
    });
  });
});

describe('runDeployCheck', () => {
  const HEAD = 'abcdef1234567890';
  const deployed = [status('success', 'Deployment has completed')];
  const healthy = { 'https://qboarding.vercel.app': { status: 200, contentType: 'text/html' } };
  const imageUrl = 'https://qboarding.vercel.app/api/roster-image?type=weekend&token=tok';

  function deps({ statuses = deployed, answers = { ...healthy, [imageUrl]: { status: 200, contentType: 'image/png' } }, sha, getHead } = {}) {
    const asked = { statusesFor: [], urls: [] };
    const clock = fakePolls([statuses]);
    return {
      asked,
      sha,
      getHead: getHead ?? (async () => ({ sha: HEAD, subject: 'fix: something (#1)' })),
      getStatuses: async (s) => { asked.statusesFor.push(s); return clock.getStatuses(); },
      fetchAnswer: async (url) => { asked.urls.push(url); return answers[url]; },
      imageToken: 'tok',
      sleep: clock.sleep,
      now: clock.now,
    };
  }

  it('with no SHA, checks main\'s head as GitHub reports it and names it with its subject', async () => {
    const d = deps();
    const r = await runDeployCheck(d);
    expect(d.asked.statusesFor[0]).toBe(HEAD);
    expect(r.lines[0]).toBe('main is abcdef1: fix: something (#1)');
  });

  it('a given SHA is checked as is, without asking GitHub for main', async () => {
    const d = deps({ sha: '1111111aaaa', getHead: async () => { throw new Error('must not be called'); } });
    const r = await runDeployCheck(d);
    expect(d.asked.statusesFor[0]).toBe('1111111aaaa');
    expect(r.exitCode).toBe(0);
  });

  it('exits 0 only when the deploy succeeded and production answered right', async () => {
    const r = await runDeployCheck(deps());
    expect(r).toEqual({ exitCode: 0, lines: [
      'main is abcdef1: fix: something (#1)',
      'abcdef1: deploy success: Deployment has completed',
      'production OK: home page 200, roster image 200 image/png',
    ] });
  });

  it('a failed deploy exits 1 and production is not asked', async () => {
    const d = deps({ statuses: [status('failure', 'Deployment rate limited — retry in 24 hours.')] });
    const r = await runDeployCheck(d);
    expect(r.exitCode).toBe(1);
    expect(r.lines[1]).toBe('abcdef1: deploy failure: Deployment rate limited — retry in 24 hours.');
    expect(d.asked.urls).toEqual([]);
  });

  it('a deployed commit whose production answers wrong exits 1 with the problem', async () => {
    const d = deps({ answers: { ...healthy, [imageUrl]: { status: 500, contentType: 'text/plain' } } });
    const r = await runDeployCheck(d);
    expect(r.exitCode).toBe(1);
    expect(r.lines.at(-1)).toBe('roster image returned 500');
  });

  it('production not answering at all exits 1 with one line', async () => {
    const d = deps();
    d.fetchAnswer = async () => { throw new Error('fetch failed'); };
    const r = await runDeployCheck(d);
    expect(r.exitCode).toBe(1);
    expect(r.lines.at(-1)).toBe('production did not answer: fetch failed');
  });

  it('when GitHub can\'t say what main is, exits 1 with one line', async () => {
    const r = await runDeployCheck(deps({ getHead: async () => { throw new Error('GitHub /commits/main returned 503'); } }));
    expect(r).toEqual({ exitCode: 1, lines: ["could not read main's head from GitHub: GitHub /commits/main returned 503"] });
  });
});
