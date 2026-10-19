/**
 * Session cache tests
 * @requirements REQ-109, REQ-620, REQ-641
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSession, storeSession, clearSession, ensureSession } from '../../lib/scraper/sessionCache.js';

vi.mock('../../lib/scraper/logger.js', () => ({
  syncLogger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock authenticate — sessionCache.js imports it from auth.js.
// We don't want real HTTP calls in unit tests.
const mockAuthenticate = vi.fn();
vi.mock('../../lib/scraper/auth.js', () => ({
  authenticate: (...args) => mockAuthenticate(...args),
}));

// ─── Supabase mock helper ─────────────────────────────────────────────────────

/**
 * Creates a minimal Supabase mock for sync_settings single-row access.
 * Supports select (single), update, and insert operations.
 */
const createMockSupabase = (initialRow = null, { failSelect = false, failUpdate = false, failInsert = false } = {}) => {
  let row = initialRow ? { ...initialRow } : null;

  const buildQueryBuilder = () => {
    const state = { filters: {} };

    const builder = {
      select: () => builder,
      eq: (f, v) => {
        state.filters[f] = v;
        return builder;
      },
      limit: () => builder,
      order: () => builder,
      maybeSingle: () => {
        if (failSelect) return Promise.resolve({ data: null, error: { code: 'DB_ERROR', message: 'Select failed' } });
        return Promise.resolve({ data: row ? { ...row } : null, error: null });
      },
      single: () => {
        if (failSelect) return Promise.resolve({ data: null, error: { code: 'DB_ERROR', message: 'Select failed' } });
        if (!row) return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'No rows' } });
        return Promise.resolve({ data: { ...row }, error: null });
      },
    };
    return builder;
  };

  return {
    _getRow: () => row,
    from: () => ({
      select: () => buildQueryBuilder(),
      update: (data) => ({
        eq: () => {
          if (failUpdate) return Promise.resolve({ error: { message: 'Update failed' } });
          if (row) row = { ...row, ...data };
          return Promise.resolve({ error: null });
        },
      }),
      insert: (data) => {
        if (failInsert) return Promise.resolve({ error: { message: 'Insert failed' } });
        row = { id: 'new-row-id', ...data };
        return Promise.resolve({ error: null });
      },
    }),
  };
};

// ─── getSession() ─────────────────────────────────────────────────────────────

describe('REQ-109: getSession()', () => {
  it('returns null when no row exists in sync_settings', async () => {
    const supabase = createMockSupabase(null);
    expect(await getSession(supabase)).toBeNull();
  });

  it('returns null when session_cookies is null', async () => {
    const supabase = createMockSupabase({ session_cookies: null, session_expires_at: null });
    expect(await getSession(supabase)).toBeNull();
  });

  it('returns null when session has expired', async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const supabase = createMockSupabase({
      session_cookies: 'old-cookie=abc',
      session_expires_at: pastExpiry,
    });
    expect(await getSession(supabase)).toBeNull();
  });

  it('returns the cookie string when session is still valid', async () => {
    const futureExpiry = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
    const supabase = createMockSupabase({
      session_cookies: 'laravel_session=xyz',
      session_expires_at: futureExpiry,
    });
    expect(await getSession(supabase)).toBe('laravel_session=xyz');
  });

  it('throws when the DB query fails (non-PGRST116 error)', async () => {
    const supabase = createMockSupabase(null, { failSelect: true });
    await expect(getSession(supabase)).rejects.toThrow();
  });
});

// ─── storeSession() ───────────────────────────────────────────────────────────

describe('REQ-109: storeSession()', () => {
  it('updates the existing row when one exists', async () => {
    const supabase = createMockSupabase({ id: 'row-1', session_cookies: null });
    await storeSession(supabase, 'new-cookie=abc', 60 * 60 * 1000);
    expect(supabase._getRow().session_cookies).toBe('new-cookie=abc');
  });

  it('inserts a new row when no row exists', async () => {
    const supabase = createMockSupabase(null);
    await storeSession(supabase, 'fresh-cookie=xyz', 60 * 60 * 1000);
    expect(supabase._getRow().session_cookies).toBe('fresh-cookie=xyz');
  });

  it('a failed read of the row id throws and never inserts a second row (#275)', async () => {
    const supabase = createMockSupabase(null, { failSelect: true });
    await expect(storeSession(supabase, 'cookie=a', 60 * 60 * 1000)).rejects.toThrow('sync_settings read failed: Select failed');
    expect(supabase._getRow()).toBeNull();
  });

  it('sets session_expires_at approximately expiryMs from now', async () => {
    const supabase = createMockSupabase({ id: 'row-1', session_cookies: null });
    const before = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;
    await storeSession(supabase, 'cookie=a', ONE_HOUR_MS);
    const after = Date.now();

    const stored = new Date(supabase._getRow().session_expires_at).getTime();
    expect(stored).toBeGreaterThanOrEqual(before + ONE_HOUR_MS);
    expect(stored).toBeLessThanOrEqual(after + ONE_HOUR_MS);
  });

  it('throws when the update fails', async () => {
    const supabase = createMockSupabase({ id: 'row-1' }, { failUpdate: true });
    await expect(storeSession(supabase, 'cookie=x', 1000)).rejects.toThrow();
  });
});

// ─── clearSession() ───────────────────────────────────────────────────────────

describe('REQ-109: clearSession()', () => {
  it('sets session_cookies and session_expires_at to null', async () => {
    const futureExpiry = new Date(Date.now() + 3600000).toISOString();
    const supabase = createMockSupabase({
      id: 'row-1',
      session_cookies: 'laravel=abc',
      session_expires_at: futureExpiry,
    });

    await clearSession(supabase);

    expect(supabase._getRow().session_cookies).toBeNull();
    expect(supabase._getRow().session_expires_at).toBeNull();
  });

  it('does nothing and does not throw when no row exists', async () => {
    const supabase = createMockSupabase(null);
    await expect(clearSession(supabase)).resolves.toBeUndefined();
  });

  it('throws when the update fails', async () => {
    const supabase = createMockSupabase({ id: 'row-1' }, { failUpdate: true });
    await expect(clearSession(supabase)).rejects.toThrow();
  });

  it('after clearSession, getSession returns null', async () => {
    const futureExpiry = new Date(Date.now() + 3600000).toISOString();
    const supabase = createMockSupabase({
      id: 'row-1',
      session_cookies: 'laravel=abc',
      session_expires_at: futureExpiry,
    });

    await clearSession(supabase);
    expect(await getSession(supabase)).toBeNull();
  });
});

// ─── ensureSession() ──────────────────────────────────────────────────────────

describe('REQ-109: ensureSession()', () => {
  // Save and restore process.env so tests are isolated
  let savedUsername;
  let savedPassword;

  beforeEach(() => {
    mockAuthenticate.mockReset();
    savedUsername = process.env.EXTERNAL_SITE_USERNAME;
    savedPassword = process.env.EXTERNAL_SITE_PASSWORD;
    process.env.EXTERNAL_SITE_USERNAME = 'test@example.com';
    process.env.EXTERNAL_SITE_PASSWORD = 'test-password';
  });

  afterEach(() => {
    // Restore original values (may be undefined if they weren't set)
    if (savedUsername === undefined) {
      delete process.env.EXTERNAL_SITE_USERNAME;
    } else {
      process.env.EXTERNAL_SITE_USERNAME = savedUsername;
    }
    if (savedPassword === undefined) {
      delete process.env.EXTERNAL_SITE_PASSWORD;
    } else {
      process.env.EXTERNAL_SITE_PASSWORD = savedPassword;
    }
  });

  it('fast path: returns cached session without calling authenticate', async () => {
    const futureExpiry = new Date(Date.now() + 3600000).toISOString();
    const supabase = createMockSupabase({
      id: 'row-1',
      session_cookies: 'cached-cookie=abc',
      session_expires_at: futureExpiry,
    });

    const result = await ensureSession(supabase);

    expect(result).toBe('cached-cookie=abc');
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  it('a fresh login whose session can\'t be cached still returns the cookies (#275)', async () => {
    const supabase = createMockSupabase(null, { failInsert: true });
    mockAuthenticate.mockResolvedValue({ success: true, cookies: 'fresh-cookie=xyz' });
    expect(await ensureSession(supabase)).toBe('fresh-cookie=xyz');
  });

  it('a failed read of the cached session is thrown, not taken as "no session"', async () => {
    const supabase = createMockSupabase(null, { failSelect: true });
    await expect(ensureSession(supabase)).rejects.toThrow('sync_settings read failed');
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  it('re-auth path: calls authenticate and stores session when cache is empty', async () => {
    const supabase = createMockSupabase(null);
    mockAuthenticate.mockResolvedValue({ success: true, cookies: 'fresh-cookie=xyz' });

    const result = await ensureSession(supabase);

    expect(mockAuthenticate).toHaveBeenCalledWith('test@example.com', 'test-password');
    expect(result).toBe('fresh-cookie=xyz');
    // Confirm session was persisted to DB
    expect(supabase._getRow().session_cookies).toBe('fresh-cookie=xyz');
  });

  it('re-auth path: calls authenticate when cached session is expired', async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString();
    const supabase = createMockSupabase({
      id: 'row-1',
      session_cookies: 'old-cookie=stale',
      session_expires_at: pastExpiry,
    });
    mockAuthenticate.mockResolvedValue({ success: true, cookies: 'new-cookie=fresh' });

    const result = await ensureSession(supabase);

    expect(mockAuthenticate).toHaveBeenCalledOnce();
    expect(result).toBe('new-cookie=fresh');
    expect(supabase._getRow().session_cookies).toBe('new-cookie=fresh');
  });

  it('throws when EXTERNAL_SITE_USERNAME is not set', async () => {
    delete process.env.EXTERNAL_SITE_USERNAME;
    const supabase = createMockSupabase(null);

    await expect(ensureSession(supabase)).rejects.toThrow('credentials not configured');
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  it('throws when EXTERNAL_SITE_PASSWORD is not set', async () => {
    delete process.env.EXTERNAL_SITE_PASSWORD;
    const supabase = createMockSupabase(null);

    await expect(ensureSession(supabase)).rejects.toThrow('credentials not configured');
    expect(mockAuthenticate).not.toHaveBeenCalled();
  });

  it('throws when authenticate returns success=false', async () => {
    const supabase = createMockSupabase(null);
    mockAuthenticate.mockResolvedValue({ success: false, error: 'invalid credentials' });

    await expect(ensureSession(supabase)).rejects.toThrow('authentication failed');
    // Nothing written to DB
    expect(supabase._getRow()).toBeNull();
  });

  it('throws when authenticate itself throws', async () => {
    const supabase = createMockSupabase(null);
    mockAuthenticate.mockRejectedValue(new Error('network timeout'));

    await expect(ensureSession(supabase)).rejects.toThrow('network timeout');
    expect(supabase._getRow()).toBeNull();
  });

  it('re-auth: stored session has a future expiry ~24h from now', async () => {
    const supabase = createMockSupabase(null);
    mockAuthenticate.mockResolvedValue({ success: true, cookies: 'cookie=abc' });

    const before = Date.now();
    await ensureSession(supabase);
    const after = Date.now();

    const stored = new Date(supabase._getRow().session_expires_at).getTime();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
    expect(stored).toBeGreaterThanOrEqual(before + TWENTY_FOUR_HOURS_MS);
    expect(stored).toBeLessThanOrEqual(after + TWENTY_FOUR_HOURS_MS);
  });
});

// ─── What the session cache asks Supabase for (#275) ─────────────────────────

describe('REQ-109: session cache queries', () => {
  // Records every call; the settings row is { id: 7 } with a session expiring in an hour.
  function recordingDb(row = { id: 7, session_cookies: 'c=1', session_expires_at: new Date(Date.now() + 3600e3).toISOString() }) {
    const calls = [];
    const chain = (table) => {
      const c = {
        select: (cols) => { calls.push(['select', table, cols]); return c; },
        order: () => c, limit: () => c,
        maybeSingle: () => Promise.resolve({ data: row, error: null }),
        update: (values) => ({ eq: (col, val) => { calls.push(['update', table, Object.keys(values).sort(), col, val]); return Promise.resolve({ error: null }); } }),
        insert: () => { calls.push(['insert', table]); return Promise.resolve({ error: null }); },
      };
      return c;
    };
    return { calls, from: (t) => chain(t) };
  }

  it('getSession reads the cookies and expiry of the sync_settings row', async () => {
    const db = recordingDb();
    expect(await getSession(db)).toBe('c=1');
    expect(db.calls).toEqual([['select', 'sync_settings', 'session_cookies, session_expires_at']]);
  });

  it('storeSession reads the row id and updates that row of sync_settings', async () => {
    const db = recordingDb({ id: 7 });
    await storeSession(db, 'c=2', 3600e3);
    expect(db.calls).toEqual([
      ['select', 'sync_settings', 'id'],
      ['update', 'sync_settings', ['session_cookies', 'session_expires_at'], 'id', 7],
    ]);
  });

  it('clearSession reads the row id and clears that row of sync_settings', async () => {
    const db = recordingDb({ id: 7 });
    await clearSession(db);
    expect(db.calls).toEqual([
      ['select', 'sync_settings', 'id'],
      ['update', 'sync_settings', ['session_cookies', 'session_expires_at'], 'id', 7],
    ]);
  });

  it('a session expiring this very millisecond is already expired', async () => {
    const now = new Date('2026-10-19T12:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    try {
      expect(await getSession(recordingDb({ id: 7, session_cookies: 'c=1', session_expires_at: now.toISOString() }))).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a row with cookies but no expiry is no session', async () => {
    expect(await getSession(recordingDb({ id: 7, session_cookies: 'c=1', session_expires_at: null }))).toBeNull();
  });
});

