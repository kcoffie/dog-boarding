/**
 * The repo is public: tests use fictional contact details only (scripts/no-test-pii.sh, run in CI over
 * src/__tests__). See docs/ENGINEERING_PROCESS.md, good tests rule 7, and #264.
 * @requirements REQ-653
 *
 * Numbers that must be rejected are built at runtime (unassigned 999 area code), so this file never holds
 * a phone-shaped literal the check itself would flag.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

const check = (text) => spawnSync('sh', ['scripts/no-test-pii.sh'], { input: text }).status;
const digits = (...groups) => groups.join('');

describe('no-test-pii', () => {
  it('a +1 mobile outside the 555 range is rejected', () => {
    expect(check(`data-value="${digits('+1', '999', '123', '4567')}"`)).toBe(1);
  });

  it('a dashed 3-3-4 number outside the 555 range is rejected', () => {
    expect(check(`Cell: ${['999', '123', '4567'].join('-')}`)).toBe(1);
  });

  it('a (area) exchange-line number outside the 555 range is rejected', () => {
    expect(check(`Clinic, (999) ${['123', '4567'].join('-')}`)).toBe(1);
  });

  it('a number with a 555 exchange passes', () => {
    expect(check('data-value="+19995550142"')).toBe(0);
  });

  it('a number with a 555 area code passes', () => {
    expect(check('Cell: 555-123-4567')).toBe(0);
  });

  it('a bare 10-digit run with no +1 or separators passes (a timestamp, not a phone)', () => {
    expect(check('data-start_scheduled="9999999999"')).toBe(0);
  });

  it('a 3-3-4 group inside a longer dashed number passes (an ID, not a phone)', () => {
    expect(check('ref 1999-123-45670')).toBe(0);
  });

  it('a 13-digit millisecond timestamp passes', () => {
    expect(check('const ts = 1772812800000;')).toBe(0);
  });

  it('a personal email address is rejected', () => {
    expect(check('data-emails="someone@gmail.com"')).toBe(1);
  });

  it('an @example.com address passes', () => {
    expect(check('data-emails="robin.sample@example.com"')).toBe(0);
  });

  it('a service sender the gmail-monitor tests match on passes', () => {
    expect(check("const FROM = 'notifications@github.com';")).toBe(0);
  });

  it('one bad address among allowed ones is still rejected', () => {
    expect(check('a@example.com b@gmail.com')).toBe(1);
  });
});
