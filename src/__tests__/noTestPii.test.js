/**
 * The repo is public: tests use fictional contact details only (scripts/no-test-pii.sh, run in CI as
 * `npm run check:test-pii` over every test file). See docs/ENGINEERING_PROCESS.md, good tests rule 7, and #264.
 * @requirements REQ-653
 *
 * Phone numbers and emails that must be rejected are built at runtime (unassigned 999 area code, joined
 * addresses), so this file never holds a literal the check itself would flag.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const run = (text) => spawnSync('sh', ['scripts/no-test-pii.sh'], { input: text, encoding: 'utf8' });
const check = (text) => run(text).status;
const join = (...parts) => parts.join('');
const at = (user, domain) => [user, domain].join('@');

describe('no-test-pii: phone numbers', () => {
  it('a +1 mobile outside the 555 range is rejected', () => {
    expect(check(`data-value="${join('+1', '999', '123', '4567')}"`)).toBe(1);
  });

  it('a dashed 3-3-4 number outside the 555 range is rejected', () => {
    expect(check(`Cell: ${['999', '123', '4567'].join('-')}`)).toBe(1);
  });

  it('a dotted 3-3-4 number is rejected', () => {
    expect(check(`Cell: ${['999', '123', '4567'].join('.')}`)).toBe(1);
  });

  it('a space-separated 3-3-4 number is rejected', () => {
    expect(check(`Cell: ${['999', '123', '4567'].join(' ')}`)).toBe(1);
  });

  it('a (area) exchange-line number outside the 555 range is rejected', () => {
    expect(check(`Clinic, (999) ${['123', '4567'].join('-')}`)).toBe(1);
  });

  it('a +1 (area) exchange-line number is rejected', () => {
    expect(check(`${join('+1 (999) 123', '-4567')}`)).toBe(1);
  });

  it('a number with a 555 exchange passes', () => {
    expect(check('data-value="+19995550142"')).toBe(0);
  });

  it('a number with a 555 area code passes', () => {
    expect(check('Cell: 555-123-4567')).toBe(0);
  });

  it('a real number right after a fictional one on the same line is still rejected', () => {
    expect(check(`+15551234567${join('+1', '999', '123', '4567')}`)).toBe(1);
  });

  it('a bare 10-digit run with no +1 or separators passes (a timestamp, not a phone)', () => {
    expect(check('data-start_scheduled="9999999999"')).toBe(0);
  });

  it('a 3-3-4 group inside a longer dashed number passes (an ID, not a phone)', () => {
    expect(check('ref 1999-123-45670')).toBe(0);
  });

  it('a 3-3-4 group right after more digits passes (the tail of an ID)', () => {
    expect(check('id 7999-123-4567')).toBe(0);
  });

  it('a 13-digit millisecond timestamp passes', () => {
    expect(check('const ts = 1772812800000;')).toBe(0);
  });
});

describe('no-test-pii: email addresses', () => {
  it('a personal email address is rejected', () => {
    expect(check(`data-emails="${at('someone', 'gmail.com')}"`)).toBe(1);
  });

  it('an @example.com address passes', () => {
    expect(check('data-emails="robin.sample@example.com"')).toBe(0);
  });

  it('an allowed domain in another case passes', () => {
    expect(check('Robin.Sample@Example.COM')).toBe(0);
  });

  it('a subdomain of an allowed domain passes', () => {
    expect(check('robin@mail.example.com')).toBe(0);
  });

  it('a lookalike that only starts with an allowed domain is rejected', () => {
    expect(check(at('robin', 'example.com.evil.io'))).toBe(1);
  });

  it.each(['github.com', 'vercel.com', 'supabase.com', 'anthropic.com', 'someothertool.io', 'test.com', 'domain.com'])(
    'the %s sender passes', (domain) => {
      expect(check(`const FROM = '${at('notifications', domain)}';`)).toBe(0);
    },
  );

  it('one bad address among allowed ones is still rejected', () => {
    expect(check(`a@example.com ${at('b', 'gmail.com')}`)).toBe(1);
  });
});

describe('no-test-pii: output and scope', () => {
  it('a failing check prints the offending line', () => {
    const line = `src/x.test.js:7: data-emails="${at('someone', 'gmail.com')}"`;
    const result = run(`clean line\n${line}\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(line);
    expect(result.stderr).not.toContain('clean line');
  });

  it('the check covers colocated test files, not just src/__tests__', () => {
    const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts['check:test-pii'];
    const pathspec = script.match(/--(.*)\|/)[1].trim();
    const files = execSync(`git ls-files -- ${pathspec}`, { encoding: 'utf8' }).split('\n');
    expect(files).toContain('src/components/DogForm.test.jsx');
    expect(files).toContain('src/__tests__/noTestPii.test.js');
  });

  it('every tracked test file passes the check', () => {
    const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts['check:test-pii'];
    expect(spawnSync('sh', ['-c', script]).status).toBe(0);
  });
});
