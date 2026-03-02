/**
 * Tests for the cron health write helper.
 * @requirements REQ-401
 */

import { describe, it, expect, vi } from 'vitest';
import { writeCronHealth } from '../../../api/_cronHealth.js';

function makeMockSupabase(upsertResult = { error: null }) {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const from = vi.fn().mockReturnValue({ upsert });
  return { supabase: { from }, upsert };
}

describe('REQ-401: Cron Health Monitoring — writeCronHealth', () => {
  it('calls supabase.from(cron_health) with upsert on success', async () => {
    const { supabase, upsert } = makeMockSupabase();

    await writeCronHealth(supabase, 'schedule', 'success', { queued: 5 }, null);

    expect(supabase.from).toHaveBeenCalledWith('cron_health');
    const [payload, options] = upsert.mock.calls[0];
    expect(payload.cron_name).toBe('schedule');
    expect(payload.status).toBe('success');
    expect(payload.result).toEqual({ queued: 5 });
    expect(payload.error_msg).toBeNull();
    expect(options).toEqual({ onConflict: 'cron_name' });
  });

  it('writes failure status and error message', async () => {
    const { supabase, upsert } = makeMockSupabase();

    await writeCronHealth(supabase, 'auth', 'failure', null, 'Auth failed');

    const [payload] = upsert.mock.calls[0];
    expect(payload.cron_name).toBe('auth');
    expect(payload.status).toBe('failure');
    expect(payload.result).toBeNull();
    expect(payload.error_msg).toBe('Auth failed');
  });

  it('includes last_ran_at and updated_at timestamps', async () => {
    const { supabase, upsert } = makeMockSupabase();
    const before = new Date().toISOString();

    await writeCronHealth(supabase, 'detail', 'success', {}, null);

    const [payload] = upsert.mock.calls[0];
    expect(payload.last_ran_at).toBeDefined();
    expect(payload.updated_at).toBeDefined();
    expect(payload.last_ran_at >= before).toBe(true);
  });

  it('does not throw when supabase returns an error', async () => {
    const { supabase } = makeMockSupabase({ error: { message: 'DB unavailable' } });

    await expect(
      writeCronHealth(supabase, 'schedule', 'success', {}, null)
    ).resolves.toBeUndefined();
  });
});
