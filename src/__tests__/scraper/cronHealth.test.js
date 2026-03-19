/**
 * Tests for the cron health write helper.
 * @requirements REQ-401, REQ-402, REQ-630, REQ-642
 */

import { describe, it, expect, vi } from 'vitest';
import { writeCronHealth } from '../../../api/_cronHealth.js';

/**
 * Build a Supabase mock that supports:
 *   - cron_health  → upsert()
 *   - cron_health_log → insert()
 *
 * Returns the mock client plus named spies for assertions.
 */
function makeMockSupabase({ upsertResult = { error: null }, insertResult = { error: null } } = {}) {
  const upsert = vi.fn().mockResolvedValue(upsertResult);
  const insert = vi.fn().mockResolvedValue(insertResult);

  const from = vi.fn((tableName) => {
    if (tableName === 'cron_health_log') return { insert };
    return { upsert }; // cron_health
  });

  return { supabase: { from }, upsert, insert };
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

  it('does not throw when supabase upsert returns an error', async () => {
    const { supabase } = makeMockSupabase({ upsertResult: { error: { message: 'DB unavailable' } } });

    await expect(
      writeCronHealth(supabase, 'schedule', 'success', {}, null)
    ).resolves.toBeUndefined();
  });

  it('also appends a row to cron_health_log', async () => {
    const { supabase, insert } = makeMockSupabase();

    await writeCronHealth(supabase, 'auth', 'success', { action: 'refreshed' }, null);

    expect(supabase.from).toHaveBeenCalledWith('cron_health_log');
    const [logPayload] = insert.mock.calls[0];
    expect(logPayload.cron_name).toBe('auth');
    expect(logPayload.status).toBe('success');
    expect(logPayload.result).toEqual({ action: 'refreshed' });
    expect(logPayload.ran_at).toBeDefined();
    // cron_health_log uses ran_at (not last_ran_at / updated_at)
    expect(logPayload.last_ran_at).toBeUndefined();
  });

  it('does not throw when cron_health_log insert returns an error', async () => {
    const { supabase } = makeMockSupabase({ insertResult: { error: { message: 'log table missing' } } });

    await expect(
      writeCronHealth(supabase, 'schedule', 'success', {}, null)
    ).resolves.toBeUndefined();
  });
});
