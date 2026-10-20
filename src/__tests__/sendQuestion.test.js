/**
 * Tests for api/send-question.js — a user's question or comment, forwarded to Kate's alert channel.
 * @requirements REQ-700, REQ-652, REQ-656
 *
 * Boundaries faked: sendAlert (Telegram), Supabase (createClient), the message_log writer, and
 * Supabase's Auth API (global fetch → GET /auth/v1/user, answering with its documented shapes).
 * alertDelivered and verifyUser stay real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

const USER_JWT = 'user-jwt';
const USER = { id: 'user-1', email: 'staff-a@example.com' };

/** Supabase's GET /auth/v1/user: 200 + the user for USER_JWT, 401 for anything else. */
function supabaseAuth(status = null) {
  return vi.fn(async (url, init) => {
    if (status) return { status, json: async () => ({}) };
    return init.headers.Authorization === `Bearer ${USER_JWT}`
      ? { status: 200, json: async () => USER }
      : { status: 401, json: async () => ({ msg: 'invalid JWT' }) };
  });
}

function makeReq({ method = 'POST', token = USER_JWT, body = { message: 'Hello' } } = {}) {
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
  process.env.VITE_SUPABASE_URL = 'https://db.example.com';
  process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
  vi.stubGlobal('fetch', supabaseAuth());
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  sendAlert.mockResolvedValue(SENT);
  recordMessageLog.mockImplementation(async () => {});
});

afterEach(() => {
  delete process.env.INTERNAL_API_TOKEN;
});

describe('REQ-700: Send a Question API', () => {
  it('a valid question goes to Kate as "Question from <signed-in email>:" plus the trimmed text, and the user is told ok', async () => {
    const res = await call({ body: { message: '  Is Biscuit staying Friday?  ' } });
    expect(sendAlert).toHaveBeenCalledWith('Question from staff-a@example.com:\nIs Biscuit staying Friday?');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('a missing message → 400, no send', async () => {
    const res = await call({ body: {} });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a message that is not text → 400, no send', async () => {
    const res = await call({ body: { message: 42 } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a request with no authorization header → 401, no send', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { message: 'Hello' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a verified user without an email is named by their user id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, json: async () => ({ id: 'user-9' }) })));
    await call({ body: { message: 'Hello' } });
    expect(sendAlert).toHaveBeenCalledWith('Question from user-9:\nHello');
  });

  it('the sender is the verified user, never a username in the body (REQ-656)', async () => {
    await call({ body: { message: 'Hello', username: 'someone-else' } });
    expect(sendAlert).toHaveBeenCalledWith('Question from staff-a@example.com:\nHello');
  });

  it('wrong HTTP method → 405, no send', async () => {
    const res = await call({ method: 'GET' });
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Method not allowed' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a token Supabase rejects → 401, no send', async () => {
    const res = await call({ token: 'wrong-token' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Unauthorized' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('the old shared server token is not accepted (REQ-656)', async () => {
    process.env.INTERNAL_API_TOKEN = 'server-token';
    const res = await call({ token: 'server-token' });
    expect(res.status).toHaveBeenCalledWith(401);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("when Supabase's sign-in check is down → 503, no send", async () => {
    vi.stubGlobal('fetch', supabaseAuth(500));
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('without the Supabase anon key → 500, no send (fails closed)', async () => {
    delete process.env.VITE_SUPABASE_ANON_KEY;
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Server misconfigured' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('empty message → 400, no send', async () => {
    const res = await call({ body: { message: '   ' } });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Message is required' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('message over 1000 chars → 400, no send', async () => {
    const res = await call({ body: { message: 'a'.repeat(1001)} });
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Message must be 1000 characters or fewer' });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('a message of exactly 1000 chars is sent', async () => {
    const res = await call({ body: { message: 'a'.repeat(1000)} });
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
    expect(recordMessageLog).toHaveBeenCalledWith({ fake: 'supabase' }, FAILED, 'send-question', 'text', 'Question from staff-a@example.com:\nHello', null);
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
