/**
 * Tests for the Meta Cloud API WhatsApp wrapper.
 * @requirements REQ-v5.0-M0
 *
 * All tests mock `fetch` (global) — no real network calls.
 * Meta API creds are injected via process.env.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRecipients, getAlertRecipients, sendRosterImage, sendTextMessage } from '../lib/notifyWhatsApp.js';

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
 *
 * Used by sendTextMessage tests (no image fetch / media upload involved).
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

/**
 * Build a URL-aware fetch mock for sendRosterImage tests.
 *
 * Routes three distinct call patterns:
 *   graph.facebook.com + /media    → media upload response (single, configurable)
 *   graph.facebook.com + /messages → message send responses (queue)
 *   other URLs (image host, /api/log) → image fetch response (with arrayBuffer)
 *
 * Returns { fetchMock, mediaCalls, messageCalls } for targeted assertions.
 */
function makeImageFetchMock({
  mediaResponse = null,
  messageResponses = [],
  imageFetchOk = true,
} = {}) {
  const messageQueue = [...messageResponses];
  const defaultMessage = metaOk();
  const defaultMedia = { ok: true, json: () => Promise.resolve({ id: 'media-default-id' }) };

  const fetchMock = vi.fn().mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('graph.facebook.com')) {
      if (url.includes('/media')) {
        return Promise.resolve(mediaResponse ?? defaultMedia);
      }
      // /messages
      const next = messageQueue.shift();
      return Promise.resolve(next ?? defaultMessage);
    }
    // Image fetch (example.com) or logger (/api/log)
    if (!imageFetchOk) {
      return Promise.resolve({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service Unavailable'),
      });
    }
    return Promise.resolve({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
      json: () => Promise.resolve({}),
    });
  });

  return {
    fetchMock,
    mediaCalls: () => fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/media')
    ),
    messageCalls: () => fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/messages')
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
  it('sends template with { image: { id } } using media_id from upload — not { link }', async () => {
    const { fetchMock, mediaCalls, messageCalls } = makeImageFetchMock({
      mediaResponse: { ok: true, json: () => Promise.resolve({ id: 'media-upload-001' }) },
      messageResponses: [metaOk('wamid.img001')],
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendRosterImage(
      'https://example.com/api/roster-image?token=secret',
      ['+18312477375'],
    );

    // One media upload call
    expect(mediaCalls()).toHaveLength(1);
    const [uploadUrl, uploadOpts] = mediaCalls()[0];
    expect(uploadUrl).toContain('phone-id-123/media');
    expect(uploadUrl).toContain('graph.facebook.com');
    expect(uploadOpts.headers.Authorization).toBe('Bearer token-abc');

    // One message send call
    expect(messageCalls()).toHaveLength(1);
    const [msgUrl, msgOpts] = messageCalls()[0];
    expect(msgUrl).toContain('phone-id-123/messages');
    const body = JSON.parse(msgOpts.body);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('+18312477375');
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('dog_boarding_roster');
    expect(body.template.language.code).toBe('en');
    const header = body.template.components[0];
    expect(header.type).toBe('header');
    expect(header.parameters[0].type).toBe('image');
    // Must use media_id — NOT the original URL
    expect(header.parameters[0].image.id).toBe('media-upload-001');
    expect(header.parameters[0].image.link).toBeUndefined();

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('sent');
    expect(results[0].messageId).toBe('wamid.img001');
  });

  it('masks phone numbers in result to field', async () => {
    const { fetchMock } = makeImageFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendRosterImage('https://example.com/img.png', ['+18312477375']);
    expect(results[0].to).toBe('***-***-7375');
  });

  it('throws when media upload returns non-2xx', async () => {
    const { fetchMock } = makeImageFetchMock({
      mediaResponse: { ok: false, status: 500, text: () => Promise.resolve('Internal Server Error') },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendRosterImage('https://example.com/img.png', ['+18312477375'])
    ).rejects.toThrow(/Upload failed.*500/);
  });

  it('throws when image fetch fails', async () => {
    const { fetchMock } = makeImageFetchMock({ imageFetchOk: false });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendRosterImage('https://example.com/img.png', ['+18312477375'])
    ).rejects.toThrow(/Image fetch failed/);
  });

  it('returns failed result when message send returns non-2xx', async () => {
    const { fetchMock } = makeImageFetchMock({
      messageResponses: [metaError(400, '{"error":"invalid number"}')],
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendRosterImage('https://example.com/img.png', ['+18312477375']);
    expect(results[0].status).toBe('failed');
    expect(results[0].error).toMatch(/Meta API error 400/);
  });

  it('uploads image once and sends to multiple recipients', async () => {
    const { fetchMock, mediaCalls, messageCalls } = makeImageFetchMock({
      messageResponses: [metaOk('wamid.001'), metaOk('wamid.002')],
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendRosterImage('https://example.com/img.png', [
      '+18312477375',
      '+14085551234',
    ]);

    // Only 1 media upload regardless of recipient count
    expect(mediaCalls()).toHaveLength(1);
    expect(messageCalls()).toHaveLength(2);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('sent');
    expect(results[1].status).toBe('sent');
  });

  it('continues to next recipient if one message send fails', async () => {
    const { fetchMock, messageCalls } = makeImageFetchMock({
      messageResponses: [metaError(400), metaOk('wamid.002')],
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendRosterImage('https://example.com/img.png', [
      '+18312477375',
      '+14085551234',
    ]);

    expect(messageCalls()).toHaveLength(2);
    expect(results[0].status).toBe('failed');
    expect(results[1].status).toBe('sent');
  });

  it('returns failed results for all recipients when credentials missing', async () => {
    delete process.env.META_PHONE_NUMBER_ID;
    const { fetchMock, mediaCalls } = makeImageFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendRosterImage('https://example.com/img.png', [
      '+18312477375',
      '+14085551234',
    ]);

    // Short-circuits before any fetch — no upload, no send
    expect(mediaCalls()).toHaveLength(0);
    expect(results).toHaveLength(2);
    results.forEach(r => {
      expect(r.status).toBe('failed');
      expect(r.error).toMatch(/credentials not configured/i);
    });
  });

  it('returns empty array when recipients list is empty', async () => {
    const { fetchMock, mediaCalls, messageCalls } = makeImageFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const results = await sendRosterImage('https://example.com/img.png', []);
    // Short-circuits before any fetch
    expect(mediaCalls()).toHaveLength(0);
    expect(messageCalls()).toHaveLength(0);
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
    expect(body.to).toBe('+18312477375');
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('dog_boarding_alert');
    expect(body.template.language.code).toBe('en');
    const bodyComp = body.template.components[0];
    expect(bodyComp.type).toBe('body');
    expect(bodyComp.parameters[0].type).toBe('text');
    expect(bodyComp.parameters[0].text).toBe('⚠️ Alert message');

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

  it('sanitizes newlines — multi-line message is collapsed to single line with " | " separator', async () => {
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock([metaOk()]);
    vi.stubGlobal('fetch', fm);

    const multiLine = '⚠️ Integration check found issues (3/25/26)\nBoarding:\n• Missing from DB: Tula\n• Missing from DB: Fergus';
    await sendTextMessage(multiLine, ['+18312477375']);

    const body = JSON.parse(mc()[0][1].body);
    const paramText = body.template.components[0].parameters[0].text;
    expect(paramText).not.toContain('\n');
    expect(paramText).toBe('⚠️ Integration check found issues (3/25/26) | Boarding: | • Missing from DB: Tula | • Missing from DB: Fergus');
  });

  it('sanitizes newlines — trims whitespace per line and drops empty lines', async () => {
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock([metaOk()]);
    vi.stubGlobal('fetch', fm);

    // Leading/trailing spaces on lines, empty lines in between
    const messy = '  First line  \n\n  Second line  \n\n';
    await sendTextMessage(messy, ['+18312477375']);

    const body = JSON.parse(mc()[0][1].body);
    const paramText = body.template.components[0].parameters[0].text;
    expect(paramText).toBe('First line | Second line');
  });

  it('sanitizes newlines — plain single-line message is unchanged', async () => {
    const { fetchMock: fm, metaCalls: mc } = makeFetchMock([metaOk()]);
    vi.stubGlobal('fetch', fm);

    await sendTextMessage('✅ All good', ['+18312477375']);

    const body = JSON.parse(mc()[0][1].body);
    const paramText = body.template.components[0].parameters[0].text;
    expect(paramText).toBe('✅ All good');
  });
});

// ---------------------------------------------------------------------------
// getAlertRecipients
// ---------------------------------------------------------------------------

describe('getAlertRecipients', () => {
  afterEach(() => {
    if (ORIG_ENV.INTEGRATION_CHECK_RECIPIENTS === undefined) delete process.env.INTEGRATION_CHECK_RECIPIENTS;
    else process.env.INTEGRATION_CHECK_RECIPIENTS = ORIG_ENV.INTEGRATION_CHECK_RECIPIENTS;
  });

  it('parses comma-separated E.164 numbers from INTEGRATION_CHECK_RECIPIENTS', () => {
    process.env.INTEGRATION_CHECK_RECIPIENTS = '+18312477375,+14085551234';
    expect(getAlertRecipients()).toEqual(['+18312477375', '+14085551234']);
  });

  it('returns empty array when env var is unset', () => {
    delete process.env.INTEGRATION_CHECK_RECIPIENTS;
    expect(getAlertRecipients()).toEqual([]);
  });

  it('trims whitespace and filters blank entries', () => {
    process.env.INTEGRATION_CHECK_RECIPIENTS = '  +18312477375  ,  ,+14085551234  ';
    expect(getAlertRecipients()).toEqual(['+18312477375', '+14085551234']);
  });
});
