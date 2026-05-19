/**
 * Tests for api/send-question.js — user question/comment → WhatsApp to Kate.
 * @requirements REQ-700
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/notifyWhatsApp.js', () => ({
  sendTextMessage: vi.fn(),
  getAlertRecipients: vi.fn(),
}));

import handler from '../../api/send-question.js';
import { sendTextMessage, getAlertRecipients } from '../../src/lib/notifyWhatsApp.js';

function makeReq({ method = 'POST', token = 'test-token', body = { message: 'Hello', username: 'charlie' } } = {}) {
  return {
    method,
    headers: { authorization: `Bearer ${token}` },
    body,
  };
}

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VITE_SYNC_PROXY_TOKEN = 'test-token';
  sendTextMessage.mockResolvedValue([{ to: '+1***', status: 'sent', messageId: 'wamid.123' }]);
  getAlertRecipients.mockReturnValue(['+18312477375']);
});

describe('REQ-700: Send a Question API', () => {
  it('valid request — calls sendTextMessage with username and message, returns ok', async () => {
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(sendTextMessage).toHaveBeenCalledOnce();
    const [body, recipients] = sendTextMessage.mock.calls[0];
    expect(body).toContain('charlie');
    expect(body).toContain('Hello');
    expect(recipients).toEqual(['+18312477375']);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('wrong HTTP method → 405, no send', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('bad token → 401, no send', async () => {
    const req = makeReq({ token: 'wrong-token' });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('empty message → 400, no send', async () => {
    const req = makeReq({ body: { message: '   ', username: 'charlie' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('message over 1000 chars → 400, no send', async () => {
    const req = makeReq({ body: { message: 'a'.repeat(1001), username: 'charlie' } });
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(sendTextMessage).not.toHaveBeenCalled();
  });

  it('no recipients configured → 200 ok without calling sendTextMessage', async () => {
    getAlertRecipients.mockReturnValue([]);
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(sendTextMessage).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it('sendTextMessage throws → 500', async () => {
    sendTextMessage.mockRejectedValue(new Error('Meta API down'));
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'Failed to send message' });
  });
});
