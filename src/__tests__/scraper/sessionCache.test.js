/**
 * Session cache tests
 * @requirements REQ-109
 */

import { describe, it, expect, vi } from 'vitest';
import { getSession, storeSession, clearSession } from '../../lib/scraper/sessionCache.js';

vi.mock('../../lib/scraper/logger.js', () => ({
  syncLogger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
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
