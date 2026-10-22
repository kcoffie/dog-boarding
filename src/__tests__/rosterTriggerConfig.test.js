/**
 * The 4am roster's schedules, as configured (REQ-658): two Vercel crons for the on-time send, and
 * the GitHub workflow as the late fallback with a manual force.
 * @requirements REQ-658
 *
 * Reads vercel.json and the workflow file as text (no YAML dependency). Skipped where those files
 * aren't present.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const VERCEL = resolve(process.cwd(), 'vercel.json');
const WORKFLOW = resolve(process.cwd(), '.github/workflows/notify-4am.yml');

describe.skipIf(!existsSync(VERCEL))('vercel.json: the on-time trigger', () => {
  const config = existsSync(VERCEL) ? JSON.parse(readFileSync(VERCEL, 'utf8')) : {};
  const notifyCrons = () => (config.crons ?? []).filter((c) => c.path.startsWith('/api/notify'));

  it('two crons call /api/notify, at 11:00 and 12:00 UTC every day (the endpoint picks the 4am Pacific one)', () => {
    expect(notifyCrons()).toStrictEqual([
      { path: '/api/notify', schedule: '0 11 * * *' },
      { path: '/api/notify', schedule: '0 12 * * *' },
    ]);
  });

  it('the cron path carries no query string (no secret or window in a public file)', () => {
    expect(notifyCrons().every((c) => !c.path.includes('?'))).toBe(true);
  });

  it('notify may run 60 s (a send takes about 10 s)', () => {
    expect(config.functions['api/notify.js']).toStrictEqual({ maxDuration: 60 });
  });
});

describe.skipIf(!existsSync(WORKFLOW))('notify-4am.yml: the late fallback', () => {
  const text = existsSync(WORKFLOW) ? readFileSync(WORKFLOW, 'utf8') : '';
  const crons = () => [...text.matchAll(/^\s*- cron: '([^']+)'/gm)].map((m) => m[1]);

  it('runs at 14:00 UTC on weekdays (7am PDT / 6am PST), and only then', () => {
    expect(crons()).toStrictEqual(['0 14 * * 1-5']);
  });

  it('a manual run has a force checkbox, off by default', () => {
    // Line by line (no backtracking regex): the lines from `force:` up to the next blank line.
    const lines = text.split('\n').map((l) => l.trim());
    const dispatch = lines.indexOf('workflow_dispatch:');
    expect(lines.slice(dispatch + 1, dispatch + 3)).toStrictEqual(['inputs:', 'force:']);
    const force = lines.slice(dispatch + 3, lines.indexOf('', dispatch));
    expect(force).toContain('type: boolean');
    expect(force).toContain('default: false');
  });

  it('force adds &force=1 to the call; a scheduled run adds nothing', () => {
    expect(text).toContain("FORCE: ${{ inputs.force && '&force=1' || '' }}");
    expect(text).toContain('/api/notify?window=4am&token=${{ secrets.INTERNAL_API_TOKEN }}${FORCE}');
  });

  it('a non-200 answer still fails the run', () => {
    expect(text).toContain('if [ "$RESPONSE" != "200" ]; then');
    expect(text).toContain('exit 1');
  });
});
