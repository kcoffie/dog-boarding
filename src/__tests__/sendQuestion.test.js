/**
 * Tests for api/send-question.js — a user's question or comment, forwarded to Kate's alert channel.
 * @requirements REQ-700, REQ-652
 *
 * Boundaries faked: sendAlert (Telegram), Supabase (createClient) and the message_log writer.
 * alertDelivered stays real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/alertKate.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendAlert: vi.fn(),
}));
vi.mock('../../src/lib/messageDeliveryStatus.js', () => ({ recordMessageLog: vi.fn(async () => {}) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ fake: 'supabase' })) }));

import handler from '../../api/send-question.js';
import { sendAlert } from '../../src/lib/alertKate.js';
import { recordMessageLog } from '../../src/lib/messageDeliveryStatus.js';

const SENT = [{ to: 'telegram', status: 'sent' }];
const FAILED = [{ to: 'telegram', status: 'failed', error: 'Telegram sendMessage 403: Forbidden' }];
const NOT_CONFIGURED = [{ to: 'telegram', status: 'failed', error: 'Telegram alert channel not configured' }];
const UNDELIVERED = { ok: false, error: 'Your message could not be delivered. Please try again later.' };

function makeReq({ method = 'POST', token = 'test-token', body = { message: 'Hello', username: 'staff-a' } } = {}) {
  return { method, headers: { authorization: `Bearer ${token}` }, body };
}

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

async function call(reqOpts) {
  const res = makeRes();
  await handler(makeReq(reqOpts), res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VITE_SYNC_PROXY_TOKEN = 'test-token';
  process.env.VITE_SUPABASE_URL = 'https://db.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  sendAlert.mockResolvedValue(SENT);
  recordMessageLog.mockImplementation(async () => {});
});

describe('REQ-700: Send a Question API', () => {
  it('a valid question goes to Kate as "Question from <user>:" plus the trimmed text, and the user is told ok', async () => {
    const res = await call({ body: { message: '  Is Biscuit staying Friday?  ', username: ' staff-a ' } });
    expect(sendAlert).toHaveBeenCalledWith('Question from staff-a:\nIs Biscuit staying Friday?');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('a missing message → 400, no send', async () => {
    const res = await call({ body: { username: 'staff-a' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a message that is not text → 400, no send', async () => {
    const res = await call({ body: { message: 42, username: 'staff-a' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a request with no authorization header → 401, no send', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { message: 'Hello' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a blank username counts as "unknown"', async () => {
    await call({ body: { message: 'Hello', username: '   ' } });
    expect(sendAlert).toHaveBeenCalledWith('Question from unknown:\nHello');
  });

  it('a question without a username is from "unknown"', async () => {
    await call({ body: { message: 'Hello' } });
    expect(sendAlert).toHaveBeenCalledWith('Question from unknown:\nHello');
  });

  it('wrong HTTP method → 405, no send', async () => {
    const res = await call({ method: 'GET' });
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Method not allowed' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('bad token → 401, no send', async () => {
    const res = await call({ token: 'wrong-token' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Unauthorized' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('empty message → 400, no send', async () => {
    const res = await call({ body: { message: '   ', username: 'staff-a' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Message is required' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('message over 1000 chars → 400, no send', async () => {
    const res = await call({ body: { message: 'a'.repeat(1001), username: 'staff-a' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Message must be 1000 characters or fewer' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a message of exactly 1000 chars is sent', async () => {
    const res = await call({ body: { message: 'a'.repeat(1000), username: 'staff-a' } });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('Vercel runtime', () => {
  it('runs on the Node.js runtime, not edge', async () => {
    const { config } = await import('../../api/send-question.js');
    expect(config).toStrictEqual({ runtime: 'nodejs' });
  });
});

describe('REQ-652: a question is never silently lost', () => {
  it('when Telegram rejects it, the user gets 502 and is told it was not delivered', async () => {
    sendAlert.mockResolvedValue(FAILED);
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(UNDELIVERED);
  });

  it('when the alert channel is not configured, the user gets 502 (not "Sent!")', async () => {
    sendAlert.mockResolvedValue(NOT_CONFIGURED);
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(UNDELIVERED);
  });

  it('every attempt is written to message_log under send-question, failed ones included', async () => {
    sendAlert.mockResolvedValue(FAILED);
    await call();
    expect(recordMessageLog).toHaveBeenCalledWith({ fake: 'supabase' }, FAILED, 'send-question', 'text', 'Question from staff-a:\nHello', null);
  });

  it('a message_log failure does not change what the user is told', async () => {
    recordMessageLog.mockRejectedValue(new Error('db down'));
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('without Supabase settings, the question is still delivered (only the log is skipped)', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const res = await call();
    expect(recordMessageLog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('an unexpected error → 500', async () => {
    sendAlert.mockRejectedValue(new Error('boom'));
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Failed to send message' });
  });
});
