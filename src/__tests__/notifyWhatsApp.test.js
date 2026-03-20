/**
 * Tests for the Meta Cloud API WhatsApp wrapper.
 * @requirements REQ-v5.0-M0
 *
 * All tests mock `fetch` (global) — no real network calls.
 * Meta API creds are injected via process.env.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRecipients, sendRosterImage, sendTextMessage } from '../lib/notifyWhatsApp.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a successful Meta API fetch response. */
function metaOk(messageId = 'wamid.test123') {
  return {
    ok: true,
    json: () => Promise.resolve({ messages: [{ id: messageId }] }),
  };
}

/** Build a failed Meta API fetch response. */
function metaError(status = 400, body = '{"error":"Bad request"}') {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
  };
}

/**
 * Build a URL-aware fetch mock. The logger posts to /api/log — those calls
 * return a trivial 200. Meta API calls (graph.facebook.com) return responses
 * from the provided queue (in order). When the queue is exhausted, returns
 * the default response.
 *
 * Returns { fetchMock, metaCalls } where metaCalls is a getter for the
 * subset of fetch.mock.calls that targeted the Meta API.
 */
function makeFetchMock(metaResponses = []) {
  const queue = [...metaResponses];
  const defaultMeta = metaOk();

  const fetchMock = vi.fn().mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('graph.facebook.com')) {
      const next = queue.shift();
      return Promise.resolve(next ?? defaultMeta);
    }
    // Logger calls (/api/log) — ignore silently
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });

  return {
    fetchMock,
    /** Return only the Meta API calls (not logger /api/log calls). */
    metaCalls: () => fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('graph.facebook.com')
    ),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env.META_PHONE_NUMBER_ID = 'phone-id-123';
  process.env.META_WHATSAPP_TOKEN = 'token-abc';
  process.env.NOTIFY_RECIPIENTS = '+18312477375,+14085551234';

  // Default fetch mock: Meta calls succeed, logger calls (/api/log) are silenced.
  const { fetchMock } = makeFetchMock();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  for (const key of ['META_PHONE_NUMBER_ID', 'META_WHATSAPP_TOKEN', 'NOTIFY_RECIPIENTS']) {
    if (ORIG_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIG_ENV[key];
  }
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getRecipients
// ---------------------------------------------------------------------------

describe('getRecipients', () => {
  it('parses comma-separated E.164 numbers from NOTIFY_RECIPIENTS', () => {
    process.env.NOTIFY_RECIPIENTS = '+18312477375,+14085551234';
    expect(getRecipients()).toEqual(['+18312477375', '+14085551234']);
  });

  it('returns empty array when env var is unset', () => {
    delete process.env.NOTIFY_RECIPIENTS;
    expect(getRecipients()).toEqual([]);
  });

  it('trims whitespace and filters blank entries', () => {
    process.env.NOTIFY_RECIPIENTS = '  +18312477375  ,  ,+14085551234  ';
    expect(getRecipients()).toEqual(['+18312477375', '+14085551234']);
  });
});

// ---------------------------------------------------------------------------
// sendRosterImage
// ---------------------------------------------------------------------------

describe('sendRosterImage', () => {
  it('calls Meta API with image type and correct payload', async () => {
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock([metaOk('wamid.img001')]);
    vi.stubGlobal('fetch', fm);

    const results = await sendRosterImage(
      'https://example.com/api/roster-image?token=secret',
      ['+18312477375'],
    );

    expect(mc()).toHaveLength(1);
    const [url, options] = mc()[0];
    expect(url).toContain('phone-id-123/messages');
    expect(url).toContain('graph.facebook.com');

    const body = JSON.parse(options.body);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('+18312477375');
    expect(body.type).toBe('image');
    expect(body.image.link).toBe('https://example.com/api/roster-image?token=secret');

    expect(options.headers.Authorization).toBe('Bearer token-abc');
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('sent');
    expect(results[0].messageId).toBe('wamid.img001');
  });

  it('masks phone numbers in result to field', async () => {
    const results = await sendRosterImage('https://example.com/img.png', ['+18312477375']);
    expect(results[0].to).toBe('***-***-7375');
  });

  it('returns failed result when Meta API returns non-2xx', async () => {
    const { fetchMock: fm } = makeFetchMock([metaError(400, '{"error":"invalid number"}')]);
    vi.stubGlobal('fetch', fm);

    const results = await sendRosterImage('https://example.com/img.png', ['+18312477375']);
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toMatch(/Meta API error 400/);
  });

  it('sends to multiple recipients sequentially and collects results', async () => {
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock([metaOk('wamid.001'), metaOk('wamid.002')]);
    vi.stubGlobal('fetch', fm);

    const results = await sendRosterImage('https://example.com/img.png', [
      '+18312477375',
      '+14085551234',
    ]);

    expect(mc()).toHaveLength(2);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('sent');
    expect(results[1].status).toBe('sent');
  });

  it('continues to next recipient if one fails', async () => {
    const { fetchMock: fm } = makeFetchMock([metaError(400), metaOk('wamid.002')]);
    vi.stubGlobal('fetch', fm);

    const results = await sendRosterImage('https://example.com/img.png', [
      '+18312477375',
      '+14085551234',
    ]);

    expect(results[0].status).toBe('failed');
    expect(results[1].status).toBe('sent');
  });

  it('returns failed results for all recipients when credentials missing', async () => {
    delete process.env.META_PHONE_NUMBER_ID;
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock();
    vi.stubGlobal('fetch', fm);

    const results = await sendRosterImage('https://example.com/img.png', [
      '+18312477375',
      '+14085551234',
    ]);

    expect(mc()).toHaveLength(0);
    expect(results).toHaveLength(2);
    results.forEach(r => {
      expect(r.status).toBe('failed');
      expect(r.error).toMatch(/credentials not configured/i);
    });
  });

  it('returns empty array when recipients list is empty', async () => {
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock();
    vi.stubGlobal('fetch', fm);

    const results = await sendRosterImage('https://example.com/img.png', []);
    expect(mc()).toHaveLength(0);
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sendTextMessage
// ---------------------------------------------------------------------------

describe('sendTextMessage', () => {
  it('calls Meta API with text type and correct body', async () => {
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock([metaOk('wamid.txt001')]);
    vi.stubGlobal('fetch', fm);

    const results = await sendTextMessage('⚠️ Alert message', ['+18312477375']);

    expect(mc()).toHaveLength(1);
    const body = JSON.parse(mc()[0][1].body);
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('⚠️ Alert message');
    expect(body.to).toBe('+18312477375');

    expect(results[0].status).toBe('sent');
    expect(results[0].messageId).toBe('wamid.txt001');
  });

  it('returns failed results when credentials missing', async () => {
    delete process.env.META_WHATSAPP_TOKEN;
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock();
    vi.stubGlobal('fetch', fm);

    const results = await sendTextMessage('test', ['+18312477375']);
    expect(mc()).toHaveLength(0);
    expect(results[0].status).toBe('failed');
  });

  it('returns empty array when recipients list is empty', async () => {
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock();
    vi.stubGlobal('fetch', fm);

    const results = await sendTextMessage('test', []);
    expect(mc()).toHaveLength(0);
    expect(results).toEqual([]);
  });
});
