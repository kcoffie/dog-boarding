/**
 * Tests for src/lib/messageDeliveryStatus.js
 * @requirements REQ-v5.0-F1, REQ-v5.0-F2
 *
 * Covers all three write paths:
 *   recordSentMessages   — called at send time (successful sends only)
 *   recordMessageLog     — called at send time (ALL sends, for message_log table)
 *   upsertDeliveryStatus — called by the Meta webhook handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordSentMessages, recordMessageLog, upsertDeliveryStatus } from '../lib/messageDeliveryStatus.js';

// ---------------------------------------------------------------------------
// Supabase mock factory
// ---------------------------------------------------------------------------

/**
 * Build a lightweight Supabase client mock.
 * upsertError / insertError control which operation fails.
 */
function makeSupabase({ upsertError = null, insertError = null } = {}) {
  const upsertSpy = vi.fn().mockResolvedValue({ error: upsertError });
  const insertSpy = vi.fn().mockResolvedValue({ error: insertError });
  return {
    from: vi.fn().mockReturnValue({
      upsert: upsertSpy,
      insert: insertSpy,
    }),
    _upsertSpy: upsertSpy,
    _insertSpy: insertSpy,
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
// recordMessageLog
// ---------------------------------------------------------------------------

describe('recordMessageLog', () => {
  it('inserts one row per result — records both sent and failed sends', async () => {
    const supabase = makeSupabase();
    const results = [
      { to: '***-***-7375', status: 'sent',   messageId: 'wamid.aaa' },
      { to: '***-***-5462', status: 'failed', error: 'Meta API 500' },
    ];

    await recordMessageLog(supabase, results, 'notify-4am', 'text', 'hello world', null);

    expect(supabase.from).toHaveBeenCalledWith('message_log');
    const [rows] = supabase._insertSpy.mock.calls[0];
    expect(rows).toHaveLength(2);

    const sentRow = rows.find(r => r.recipient === '***-***-7375');
    expect(sentRow.status).toBe('sent');
    expect(sentRow.wamid).toBe('wamid.aaa');
    expect(sentRow.job_name).toBe('notify-4am');
    expect(sentRow.message_type).toBe('text');
    expect(sentRow.content).toBe('hello world');
    expect(sentRow.image_path).toBeNull();

    const failedRow = rows.find(r => r.recipient === '***-***-5462');
    expect(failedRow.status).toBe('failed');
    expect(failedRow.wamid).toBeNull();
  });

  it('records image rows with imagePath and null content', async () => {
    const supabase = makeSupabase();
    const results = [{ to: '***-***-7375', status: 'sent', messageId: 'wamid.bbb' }];

    await recordMessageLog(supabase, results, 'notify-friday-pm', 'image', null, 'roster-images/notify-friday-pm/2026-04-22.png');

    const [rows] = supabase._insertSpy.mock.calls[0];
    expect(rows[0].message_type).toBe('image');
    expect(rows[0].content).toBeNull();
    expect(rows[0].image_path).toBe('roster-images/notify-friday-pm/2026-04-22.png');
    expect(rows[0].wamid).toBe('wamid.bbb');
  });

  it('failed send rows have null wamid even if messageId is present', async () => {
    const supabase = makeSupabase();
    const results = [{ to: '***-***-7375', status: 'failed', messageId: 'should-be-ignored' }];

    await recordMessageLog(supabase, results, 'cron-health-check', 'text', 'alert', null);

    const [rows] = supabase._insertSpy.mock.calls[0];
    expect(rows[0].status).toBe('failed');
    expect(rows[0].wamid).toBeNull();
  });

  it('is non-fatal — swallows DB errors without throwing', async () => {
    const supabase = makeSupabase({ insertError: { message: 'DB unavailable' } });
    const results = [{ to: '***-***-7375', status: 'sent', messageId: 'wamid.ccc' }];

    await expect(
      recordMessageLog(supabase, results, 'gmail-monitor', 'text', 'msg', null)
    ).resolves.toBeUndefined();
  });

  it('skips DB write when supabase is null', async () => {
    const results = [{ to: '***-***-7375', status: 'sent', messageId: 'wamid.ddd' }];

    await expect(
      recordMessageLog(null, results, 'integration-check', 'text', 'msg', null)
    ).resolves.toBeUndefined();
  });

  it('skips DB write when results array is empty', async () => {
    const supabase = makeSupabase();

    await recordMessageLog(supabase, [], 'notify-4am', 'text', null, null);

    expect(supabase._insertSpy).not.toHaveBeenCalled();
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
