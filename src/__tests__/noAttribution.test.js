/**
 * Kate's rule: no AI attribution in commits or PR descriptions (scripts/no-attribution.sh,
 * used by .husky/commit-msg and the attribution workflow). See docs/ENGINEERING_PROCESS.md.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

const check = (text) => spawnSync('sh', ['scripts/no-attribution.sh'], { input: text }).status;

describe('no-attribution', () => {
  it('a Co-Authored-By trailer naming Claude is rejected', () => {
    expect(check('fix: x (#1)\n\nCo-Authored-By: Claude Opus <noreply@anthropic.com>\n')).toBe(1);
  });
  it('a Co-Authored-By trailer with only an Anthropic address is rejected', () => {
    expect(check('fix: x (#1)\n\nco-authored-by: Bot <noreply@anthropic.com>\n')).toBe(1);
  });
  it('a Claude-Session trailer is rejected', () => {
    expect(check('fix: x (#1)\n\nClaude-Session: https://example.com/s\n')).toBe(1);
  });
  it('a claude.ai session link anywhere is rejected', () => {
    expect(check('docs: y (#1)\n\nsee https://claude.ai/code/session_abc\n')).toBe(1);
  });
  it('"Generated with Claude" is rejected', () => {
    expect(check('## What\nstuff\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)\n')).toBe(1);
  });
  it('a human co-author is allowed', () => {
    expect(check('fix: x (#1)\n\nCo-authored-by: Pat Lee <pat@example.com>\n')).toBe(0);
  });
  it('a dependabot co-author is allowed', () => {
    expect(check('chore: bump (#1)\n\nCo-authored-by: dependabot[bot] <support@github.com>\n')).toBe(0);
  });
  it('a line that only mentions a trailer mid-sentence is allowed', () => {
    expect(check('chore: x (#1)\n\nThe hook rejects a Claude-Session line.\n')).toBe(0);
  });
});
