/**
 * gmail-monitor forwardEmail: an email whose alert wasn't delivered is never marked processed (REQ-652).
 * @requirements REQ-652
 *
 * Boundaries faked: Supabase (gmail_processed_emails insert) and alertAndLog (tested in alertKate.test.js).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/alertKate.js', () => ({ alertAndLog: vi.fn() }));
const { alertAndLog } = await import('../lib/alertKate.js');
const { forwardEmail } = await import('../../scripts/gmail-monitor.js');

const EMAIL = { id: 'msg-1', from: 'alerts@example.com', subject: 'Deployment failed' };
const MESSAGE = '⚠️ Infrastructure Alert\nFrom: Vercel\nSubject: Deployment failed';

let inserts;
const supabase = { from: (table) => ({ insert: async (row) => { inserts.push([table, row]); return { error: null }; } }) };

beforeEach(() => {
  vi.clearAllMocks();
  inserts = [];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('REQ-652: gmail-monitor forwards each email until it is delivered', () => {
  it('a delivered alert marks the email processed and returns true', async () => {
    alertAndLog.mockResolvedValue(true);
    expect(await forwardEmail(supabase, EMAIL, MESSAGE)).toBe(true);
    expect(alertAndLog).toHaveBeenCalledWith(supabase, 'gmail-monitor', MESSAGE);
    expect(inserts).toStrictEqual([['gmail_processed_emails', {
      email_id: 'msg-1', sender: 'alerts@example.com', subject: 'Deployment failed', alert_sent: true,
    }]]);
  });

  it('an undelivered alert leaves the email unprocessed (retried next run) and returns false', async () => {
    alertAndLog.mockResolvedValue(false);
    expect(await forwardEmail(supabase, EMAIL, MESSAGE)).toBe(false);
    expect(inserts).toStrictEqual([]);
  });
});
