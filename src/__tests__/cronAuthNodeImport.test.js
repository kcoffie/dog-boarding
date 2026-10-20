// @vitest-environment node
/**
 * The server jobs import src/lib/scraper/auth.js. On Vercel there is no import.meta.env, so
 * src/lib/supabase.js would throw at load: the scraper may load it only inside the browser path.
 * Vitest defines import.meta.env, so the test makes any load of supabase.js throw instead.
 * @requirements REQ-656
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => {
  throw new Error('src/lib/supabase.js was loaded on the server path');
});

describe('REQ-656: scraper auth stays importable by the server jobs', () => {
  it('api/cron-auth.js loads without loading supabase.js', async () => {
    const mod = await import('../../api/cron-auth.js');
    expect(typeof mod.default).toBe('function');
  });

  it('server-side authenticate without credentials fails without touching the browser path', async () => {
    const { authenticate } = await import('../lib/scraper/auth.js');
    expect(await authenticate()).toEqual({ success: false, error: 'Username and password are required' });
  });
});
