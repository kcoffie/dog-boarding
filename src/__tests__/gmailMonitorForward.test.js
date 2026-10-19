/**
 * gmail-monitor forwardEmail: an email whose alert wasn't delivered is never marked processed (REQ-652).
 * @requirements REQ-652
 *
 * Boundaries faked: Supabase (gmail_processed_emails insert) and alertAndLog (tested in alertKate.test.js).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/alertKate.js', () => ({ alertAndLog: vi.fn() }));
const { alertAndLog } = await import('../lib/alertKate.js');
const { forwardEmail, main, GMAIL_QUERY, GMAIL_MAX_RESULTS } = await import('../../scripts/gmail-monitor.js');

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

describe('REQ-652: an undelivered email stays reachable for the retry', () => {
  it("the search leaves out Gmail Monitor's own failure emails, so they can't crowd it out", () => {
    expect(GMAIL_QUERY).toContain('-subject:"Gmail Monitor"');
    expect(GMAIL_QUERY).toContain('is:unread');
  });

  it('each run looks at up to 50 unread emails', () => {
    expect(GMAIL_MAX_RESULTS).toBe(50);
  });
});

describe('REQ-652: a gmail-monitor run goes red when any alert was not delivered', () => {
  const emails = {
    a: { id: 'a', from: 'Vercel <notifications@vercel.com>', subject: 'Deployment failed', snippet: '' },
    b: { id: 'b', from: 'GitHub <notifications@github.com>', subject: 'Run failed: Integration Check', snippet: '' },
  };
  const run = (ids) => main({
    getSupabase: () => supabase,
    getAccessToken: async () => 'gmail-token',
    searchGmail: async () => ids,
    fetchMessage: async (_t, id) => emails[id],
    isAlreadyProcessed: async () => false,
    buildAlertMessage: async (e) => `alert for ${e.id}`,
  });

  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));

  it('no unread emails: exit 0, nothing sent', async () => {
    expect(await run([])).toBe(0);
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('every alert delivered: exit 0, every email marked processed', async () => {
    alertAndLog.mockResolvedValue(true);
    expect(await run(['a', 'b'])).toBe(0);
    expect(inserts.map(([, row]) => row.email_id)).toEqual(['a', 'b']);
  });

  it('one alert not delivered: exit 1, and only the delivered email is marked processed', async () => {
    alertAndLog.mockImplementation(async (_s, _j, text) => text === 'alert for a');
    expect(await run(['a', 'b'])).toBe(1);
    expect(inserts.map(([, row]) => row.email_id)).toEqual(['a']);
  });
});
