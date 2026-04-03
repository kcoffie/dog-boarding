/**
 * Tests for src/lib/messageDeliveryStatus.js
 * @requirements REQ-v5.0-F1
 *
 * Covers both write paths:
 *   recordSentMessages  — called at send time
 *   upsertDeliveryStatus — called by the Meta webhook handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordSentMessages, upsertDeliveryStatus } from '../lib/messageDeliveryStatus.js';

// ---------------------------------------------------------------------------
// Supabase mock factory
// ---------------------------------------------------------------------------

/**
 * Build a lightweight Supabase client mock.
 * upsertResponse: { error: null } by default (success).
 */
function makeSupabase({ upsertError = null } = {}) {
  const upsertSpy = vi.fn().mockResolvedValue({ error: upsertError });
  return {
    from: vi.fn().mockReturnValue({
      upsert: upsertSpy,
    }),
    _upsertSpy: upsertSpy,
  };
}

// ---------------------------------------------------------------------------
// recordSentMessages
// ---------------------------------------------------------------------------

describe('recordSentMessages', () => {
  it('inserts one row per successful send result', async () => {
    const supabase = makeSupabase();
    const results = [
      { to: '***-***-7375', status: 'sent', messageId: 'wamid.aaa' },
      { to: '***-***-1234', status: 'sent', messageId: 'wamid.bbb' },
    ];

    await recordSentMessages(supabase, results, 'notify-4am');

    expect(supabase.from).toHaveBeenCalledWith('message_delivery_status');
    const [rows, opts] = supabase._upsertSpy.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows[0].wamid).toBe('wamid.aaa');
    expect(rows[0].recipient).toBe('***-***-7375');
    expect(rows[0].send_job).toBe('notify-4am');
    expect(rows[0].status).toBe('sent');
    expect(rows[1].wamid).toBe('wamid.bbb');
    expect(opts).toEqual({ onConflict: 'wamid,status' });
  });

  it('skips results with status !== "sent"', async () => {
    const supabase = makeSupabase();
    const results = [
      { to: '***-***-7375', status: 'failed', error: 'Meta API error' },
      { to: '***-***-1234', status: 'sent',   messageId: 'wamid.ccc' },
    ];

    await recordSentMessages(supabase, results, 'cron-health-check');

    const [rows] = supabase._upsertSpy.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].wamid).toBe('wamid.ccc');
  });

  it('skips results where messageId is missing', async () => {
    const supabase = makeSupabase();
    const results = [
      { to: '***-***-7375', status: 'sent', messageId: undefined },
      { to: '***-***-1234', status: 'sent', messageId: 'wamid.ddd' },
    ];

    await recordSentMessages(supabase, results, 'gmail-monitor');

    const [rows] = supabase._upsertSpy.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].wamid).toBe('wamid.ddd');
  });

  it('does not call supabase when all results are non-sent', async () => {
    const supabase = makeSupabase();
    const results = [{ to: '***-***-7375', status: 'failed', error: 'err' }];

    await recordSentMessages(supabase, results, 'notify-7am');

    expect(supabase._upsertSpy).not.toHaveBeenCalled();
  });

  it('does not call supabase when results array is empty', async () => {
    const supabase = makeSupabase();

    await recordSentMessages(supabase, [], 'notify-friday-pm');

    expect(supabase._upsertSpy).not.toHaveBeenCalled();
  });

  it('is non-fatal — swallows DB errors without throwing', async () => {
    const supabase = makeSupabase({ upsertError: { message: 'connection refused' } });
    const results = [{ to: '***-***-7375', status: 'sent', messageId: 'wamid.eee' }];

    // Should not throw
    await expect(recordSentMessages(supabase, results, 'integration-check')).resolves.toBeUndefined();
  });

  it('skips DB write when supabase is null', async () => {
    // startup-crash case in integration-check.js
    const results = [{ to: '***-***-7375', status: 'sent', messageId: 'wamid.fff' }];

    await expect(recordSentMessages(null, results, 'integration-check')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// upsertDeliveryStatus
// ---------------------------------------------------------------------------

describe('upsertDeliveryStatus', () => {
  let supabase;

  beforeEach(() => {
    supabase = makeSupabase();
  });

  it('upserts with correct payload for a delivered event', async () => {
    await upsertDeliveryStatus(supabase, {
      wamid:       'wamid.aaa',
      status:      'delivered',
      statusAt:    '2026-04-03T04:05:06.000Z',
      recipient:   '***-***-7375',
      errorCode:   null,
      errorTitle:  null,
      rawPayload:  { id: 'wamid.aaa', status: 'delivered' },
    });

    expect(supabase.from).toHaveBeenCalledWith('message_delivery_status');
    const [row, opts] = supabase._upsertSpy.mock.calls[0];
    expect(row.wamid).toBe('wamid.aaa');
    expect(row.status).toBe('delivered');
    expect(row.status_at).toBe('2026-04-03T04:05:06.000Z');
    expect(row.recipient).toBe('***-***-7375');
    expect(row.send_job).toBe('webhook');
    expect(row.error_code).toBeNull();
    expect(row.error_title).toBeNull();
    expect(row.raw_payload).toEqual({ id: 'wamid.aaa', status: 'delivered' });
    expect(opts).toEqual({ onConflict: 'wamid,status' });
  });

  it('stores error_code and error_title for failed events', async () => {
    await upsertDeliveryStatus(supabase, {
      wamid:      'wamid.bbb',
      status:     'failed',
      statusAt:   '2026-04-03T04:05:06.000Z',
      recipient:  '***-***-7375',
      errorCode:  131026,
      errorTitle: 'Message undeliverable',
      rawPayload: {},
    });

    const [row] = supabase._upsertSpy.mock.calls[0];
    expect(row.error_code).toBe(131026);
    expect(row.error_title).toBe('Message undeliverable');
  });

  it('skips and does not throw for unknown status values', async () => {
    await expect(
      upsertDeliveryStatus(supabase, {
        wamid: 'wamid.ccc', status: 'unknown_future_status',
        statusAt: '2026-04-03T04:05:06.000Z', recipient: '***-***-7375',
        errorCode: null, errorTitle: null, rawPayload: {},
      })
    ).resolves.toBeUndefined();

    expect(supabase._upsertSpy).not.toHaveBeenCalled();
  });

  it('throws on DB error so webhook handler can count errors', async () => {
    supabase = makeSupabase({ upsertError: { message: 'DB write failed' } });

    await expect(
      upsertDeliveryStatus(supabase, {
        wamid: 'wamid.ddd', status: 'read',
        statusAt: '2026-04-03T04:05:06.000Z', recipient: '***-***-7375',
        errorCode: null, errorTitle: null, rawPayload: {},
      })
    ).rejects.toMatchObject({ message: 'DB write failed' });
  });
});
