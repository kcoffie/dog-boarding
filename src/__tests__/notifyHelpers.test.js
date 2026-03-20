/**
 * Tests for refreshDaytimeSchedule — all 7 exit paths.
 * @requirements REQ-v5.0-M1-2
 *
 * The function's contract: NEVER throws. Every exit path returns
 * { refreshed: boolean, rowCount: number, warning: string|null }.
 *
 * Exit paths:
 *   1. ensureSession throws             → { refreshed: false, warning: 'Session unavailable: ...' }
 *   2. authenticatedFetch throws SESSION_EXPIRED → clears session → { refreshed: false, warning: '...' }
 *   3. authenticatedFetch throws (other) → { refreshed: false, warning: 'Schedule fetch failed: ...' }
 *   4. rows.length === 0 + large HTML   → { refreshed: true, rowCount: 0, warning: '...access-denied...' }
 *   5. rows.length === 0 + small HTML   → { refreshed: true, rowCount: 0, warning: '...small/empty...' }
 *   6. Normal success (upsert errors)   → { refreshed: true, rowCount: N, warning: null }
 *   7. Unexpected error (outer catch)   → { refreshed: false, warning: 'Unexpected refresh error: ...' }
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshDaytimeSchedule } from '../lib/notifyHelpers.js';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/scraper/sessionCache.js', () => ({
  ensureSession: vi.fn(),
  clearSession: vi.fn(),
}));

vi.mock('../lib/scraper/auth.js', () => ({
  setSession: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

vi.mock('../lib/scraper/daytimeSchedule.js', () => ({
  parseDaytimeSchedulePage: vi.fn(),
  upsertDaytimeAppointments: vi.fn(),
}));

import { ensureSession, clearSession } from '../lib/scraper/sessionCache.js';
import { setSession, authenticatedFetch } from '../lib/scraper/auth.js';
import { parseDaytimeSchedulePage, upsertDaytimeAppointments } from '../lib/scraper/daytimeSchedule.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_SUPABASE = {}; // refreshDaytimeSchedule passes it through; mocks handle it
const TEST_DATE = new Date(2026, 2, 20); // March 20 2026 (local)

const SMALL_HTML = '<html>tiny</html>';
const LARGE_HTML = 'x'.repeat(11000); // > 10000 bytes → access-denied heuristic

function makeHtmlResponse(body) {
  return { text: () => Promise.resolve(body) };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: happy path
  ensureSession.mockResolvedValue('session-cookies');
  setSession.mockReturnValue(undefined);
  authenticatedFetch.mockResolvedValue(makeHtmlResponse('<valid html>'));
  parseDaytimeSchedulePage.mockReturnValue([{ id: 'appt1' }, { id: 'appt2' }]);
  upsertDaytimeAppointments.mockResolvedValue({ upserted: 2, errors: 0 });
});

// ---------------------------------------------------------------------------
// Exit path 1: ensureSession throws
// ---------------------------------------------------------------------------

describe('exit path 1: ensureSession throws', () => {
  it('returns { refreshed: false } with session warning', async () => {
    ensureSession.mockRejectedValue(new Error('No credentials'));

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(false);
    expect(result.rowCount).toBe(0);
    expect(result.warning).toMatch(/Session unavailable/);
    expect(result.warning).toMatch(/No credentials/);
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Exit path 2: authenticatedFetch throws SESSION_EXPIRED
// ---------------------------------------------------------------------------

describe('exit path 2: SESSION_EXPIRED', () => {
  it('clears session and returns { refreshed: false } with expiry warning', async () => {
    authenticatedFetch.mockRejectedValue(new Error('SESSION_EXPIRED'));
    clearSession.mockResolvedValue(undefined);

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(false);
    expect(result.rowCount).toBe(0);
    expect(result.warning).toMatch(/Session expired/);
    expect(clearSession).toHaveBeenCalledWith(MOCK_SUPABASE);
    expect(parseDaytimeSchedulePage).not.toHaveBeenCalled();
  });

  it('returns { refreshed: false } even if clearSession also fails', async () => {
    authenticatedFetch.mockRejectedValue(new Error('SESSION_EXPIRED'));
    clearSession.mockRejectedValue(new Error('DB unavailable'));

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(false);
    expect(result.warning).toMatch(/Session expired/);
  });
});

// ---------------------------------------------------------------------------
// Exit path 3: authenticatedFetch throws (non-SESSION_EXPIRED)
// ---------------------------------------------------------------------------

describe('exit path 3: authenticatedFetch throws (other)', () => {
  it('returns { refreshed: false } with fetch error warning', async () => {
    authenticatedFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(false);
    expect(result.rowCount).toBe(0);
    expect(result.warning).toMatch(/Schedule fetch failed/);
    expect(result.warning).toMatch(/ECONNREFUSED/);
    expect(clearSession).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Exit path 4: 0 rows parsed + large HTML (access-denied heuristic)
// ---------------------------------------------------------------------------

describe('exit path 4: 0 rows + large HTML', () => {
  it('returns { refreshed: true, rowCount: 0 } with access-denied warning', async () => {
    authenticatedFetch.mockResolvedValue(makeHtmlResponse(LARGE_HTML));
    parseDaytimeSchedulePage.mockReturnValue([]);
    upsertDaytimeAppointments.mockResolvedValue({ upserted: 0, errors: 0 });

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(true);
    expect(result.rowCount).toBe(0);
    expect(result.warning).toMatch(/access-denied/);
    expect(result.warning).toMatch(/0 daytime events/);
  });
});

// ---------------------------------------------------------------------------
// Exit path 5: 0 rows parsed + small HTML
// ---------------------------------------------------------------------------

describe('exit path 5: 0 rows + small HTML', () => {
  it('returns { refreshed: true, rowCount: 0 } with small/empty warning', async () => {
    authenticatedFetch.mockResolvedValue(makeHtmlResponse(SMALL_HTML));
    parseDaytimeSchedulePage.mockReturnValue([]);
    upsertDaytimeAppointments.mockResolvedValue({ upserted: 0, errors: 0 });

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(true);
    expect(result.rowCount).toBe(0);
    expect(result.warning).toMatch(/small\/empty/);
  });
});

// ---------------------------------------------------------------------------
// Exit path 6: normal success (upsert may have errors, warning is null)
// ---------------------------------------------------------------------------

describe('exit path 6: normal success', () => {
  it('returns { refreshed: true, rowCount: N, warning: null } on clean upsert', async () => {
    upsertDaytimeAppointments.mockResolvedValue({ upserted: 5, errors: 0 });

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(true);
    expect(result.rowCount).toBe(5);
    expect(result.warning).toBeNull();
  });

  it('still returns { refreshed: true } when upsert has partial errors', async () => {
    upsertDaytimeAppointments.mockResolvedValue({ upserted: 3, errors: 2 });

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(true);
    expect(result.rowCount).toBe(3);
    expect(result.warning).toBeNull();
  });

  it('calls setSession with the cookies from ensureSession', async () => {
    await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(setSession).toHaveBeenCalledWith('session-cookies');
  });
});

// ---------------------------------------------------------------------------
// Exit path 7: unexpected error caught by outer try/catch
// ---------------------------------------------------------------------------

describe('exit path 7: unexpected outer error', () => {
  it('returns { refreshed: false } with unexpected error warning when parseDaytimeSchedulePage throws', async () => {
    parseDaytimeSchedulePage.mockImplementation(() => {
      throw new Error('parse crash');
    });
    authenticatedFetch.mockResolvedValue(makeHtmlResponse('<valid html>'));

    const result = await refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE);

    expect(result.refreshed).toBe(false);
    expect(result.rowCount).toBe(0);
    expect(result.warning).toMatch(/Unexpected refresh error/);
    expect(result.warning).toMatch(/parse crash/);
  });

  it('never throws — always returns an object', async () => {
    upsertDaytimeAppointments.mockRejectedValue(new Error('DB exploded'));

    await expect(refreshDaytimeSchedule(MOCK_SUPABASE, TEST_DATE)).resolves.toMatchObject({
      refreshed: expect.any(Boolean),
      rowCount: expect.any(Number),
    });
  });
});
