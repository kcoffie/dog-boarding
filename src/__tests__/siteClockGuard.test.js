/**
 * Booking times are site clock values (#353, ADR-009): only src/utils/siteClock.js reads them.
 * This walks src/, api/ and scripts/ with fs (not git: Stryker's sandbox is untracked). In any
 * file that names a booking-time field, a local-zone call fails the test unless its line (or the
 * line above) says `// real-moment: <why>`: a calendar day, "today", or a real moment such as
 * started_at, never a booking time.
 *
 * Limits (accepted, design note): it catches local-zone reads, not comparisons with the real
 * now (`new Date() > new Date(departure)`); the tests of each reader cover those.
 * @requirements REQ-065
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..');

// Files #353 PR 2 (= #350 PR 2) fixes; PR 2 empties this list
const NOT_YET = {
  'src/utils/dateUtils.js': 'PR 2: formatTime, formatDateTime, the day/night helpers',
  'src/pages/DogsPage.jsx': 'PR 2: times, status badge',
  'src/pages/CalendarPage.jsx': 'PR 2: times and day placement',
  'src/components/SyncDetailModal.jsx': 'PR 2: Sync History dates',
  'src/components/BoardingFormModal.jsx': 'PR 2: form view dates',
  'src/hooks/useBoardingForms.js': 'PR 2: upcoming filter',
  'scripts/integration-check.js': "#350: today from the runner's zone (right only on GitHub's UTC)",
};

const BOOKING_FIELD = /\b(arrival_datetime|departure_datetime|arrivalDateTime|departureDateTime|check_in_datetime|check_out_datetime|check_in|check_out|start_ts|day_ts)\b/;
const LOCAL_CALL = /\b(get|set)(Hours|Date|Day|Month|FullYear|Minutes|Seconds)\(|\bto(Time|Date)String\(|new Date\(\s*[^()\s,][^(),]*,/;
const LOCALE_CALL = /\btoLocale(Date|Time)?String\(/;
const MARKER = /\/\/ real-moment: \S/;
const MARKER_LINE = /^\s*\/\/ real-moment: \S/;

// The call's own text, up to its closing parenthesis
function callText(text, from) {
  let depth = 0;
  for (let i = text.indexOf('(', from); i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')' && --depth === 0) return text.slice(from, i + 1);
  }
  return text.slice(from);
}

// Line numbers of local-zone calls without a marker
function unmarkedLocalCalls(source) {
  const lines = source.split('\n');
  const offsets = [];
  lines.reduce((at, line) => { offsets.push(at); return at + line.length + 1; }, 0);
  const found = [];
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    if (MARKER.test(line) || MARKER_LINE.test(lines[i - 1] ?? '')) return;
    const locale = line.match(LOCALE_CALL);
    const bareLocale = locale && !/timeZone/.test(callText(source, offsets[i] + locale.index));
    if (LOCAL_CALL.test(line) || bareLocale) found.push(i + 1);
  });
  return found;
}

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === 'node_modules' || name === '__tests__' || /\.test\./.test(name)) return [];
  if (statSync(path).isDirectory()) return walk(path);
  return /\.(js|jsx|mjs|cjs)$/.test(name) ? [path] : [];
});

describe('REQ-065: only siteClock.js reads booking times', () => {
  it('no file that names a booking-time field uses a local-zone call without a real-moment marker', () => {
    const offenders = [];
    const readers = ['src', 'api', 'scripts']
      .filter((dir) => existsSync(join(ROOT, dir)))
      .flatMap((dir) => walk(join(ROOT, dir)));
    for (const path of readers) {
      const file = relative(ROOT, path).split('\\').join('/');
      if (file === 'src/utils/siteClock.js' || NOT_YET[file]) continue;
      const source = readFileSync(path, 'utf8');
      if (!BOOKING_FIELD.test(source)) continue;
      for (const line of unmarkedLocalCalls(source)) offenders.push(`${file}:${line}`);
    }
    expect(readers.length).toBeGreaterThan(100); // the walk found the code
    expect(offenders).toEqual([]);
  });

  it('every file waiting for PR 2 still exists', () => {
    for (const file of Object.keys(NOT_YET)) expect(existsSync(join(ROOT, file)), file).toBe(true);
  });

  it('catches getHours, setDate, toTimeString and new Date(y, m, d)', () => {
    expect(unmarkedLocalCalls([
      'const h = new Date(b.arrival_datetime).getHours();',
      'd.setDate(1);',
      'const t = d.toTimeString();',
      'const m = new Date(y, m, d);',
    ].join('\n'))).toEqual([1, 2, 3, 4]);
  });

  it('catches toLocaleTimeString without timeZone, even across lines, and not with one', () => {
    expect(unmarkedLocalCalls([
      "d.toLocaleTimeString('en-US', {",
      "  hour: 'numeric',",
      '});',
      "d.toLocaleDateString('en-US', {",
      "  timeZone: 'UTC',",
      '});',
    ].join('\n'))).toEqual([1]);
  });

  it('lets UTC methods, Date.UTC, one-argument dates and marked lines through; a marked line covers only itself', () => {
    expect(unmarkedLocalCalls([
      'd.getUTCHours(); d.setUTCDate(2);',
      'new Date(Date.UTC(y, m, d));',
      "new Date('2026-10-29T10:00:00Z');",
      'd.getDate(); // real-moment: a calendar day',
      'd.getDay();',
      '// real-moment: the picked local day',
      'd.getMonth();',
      '// d.getHours() in a comment',
    ].join('\n'))).toEqual([5]);
  });
});
