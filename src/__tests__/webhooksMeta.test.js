/**
 * Tests for api/webhooks/meta.js
 * @requirements REQ-v5.0-F1
 *
 * Tests the two exported pure helpers (verifySignature, readRawBody) plus
 * the full handler via mocked dependencies.
 *
 * The handler requires Node.js crypto and Supabase — both are mocked here.
 * upsertDeliveryStatus is mocked at the module level to isolate handler logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock Supabase and upsertDeliveryStatus before importing the handler.
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ _isMock: true })),
}));

vi.mock('../../src/lib/messageDeliveryStatus.js', () => ({
  upsertDeliveryStatus: vi.fn().mockResolvedValue(undefined),
}));

import { verifySignature, readRawBody, default as handler } from '../../api/webhooks/meta.js';
import { upsertDeliveryStatus } from '../../src/lib/messageDeliveryStatus.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET      = 'test-app-secret';
const TEST_VERIFY_TOKEN = 'test-verify-token';

/**
 * Compute a valid HMAC-SHA256 signature for a given body + secret.
 * Use this to build correctly-signed POST requests in tests.
 */
function signBody(body, secret = TEST_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Build a minimal mock req object for GET requests.
 */
function makeGetReq(query = {}) {
  return { method: 'GET', query, headers: {} };
}

/**
 * Build a mock req for POST requests with a raw body stream.
 * body: string or Buffer — will be chunked through the stream events.
 */
function makePostReq(body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const listeners = {};

  return {
    method: 'POST',
    headers,
    query: {},
    on(event, cb) {
      listeners[event] = cb;
      // Emit immediately so readRawBody resolves synchronously in tests.
      if (event === 'data') cb(buf);
      if (event === 'end')  cb();
    },
  };
}

/**
 * Build a minimal mock res object. Returns a chainable spy.
 */
function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status: vi.fn().mockImplementation((code) => { res.statusCode = code; return res; }),
    json:   vi.fn().mockImplementation((data) => { res.body = data; return res; }),
    send:   vi.fn().mockImplementation((data) => { res.body = data; return res; }),
  };
  return res;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env.META_APP_SECRET          = TEST_SECRET;
  process.env.META_WEBHOOK_VERIFY_TOKEN = TEST_VERIFY_TOKEN;
  process.env.VITE_SUPABASE_URL        = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  vi.clearAllMocks();
});

afterEach(() => {
  for (const key of [
    'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN',
    'VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (ORIG_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIG_ENV[key];
  }
});

// ---------------------------------------------------------------------------
// verifySignature (pure helper)
// ---------------------------------------------------------------------------

describe('verifySignature', () => {
  it('returns true for a valid HMAC-SHA256 signature', () => {
    const body = Buffer.from('{"test":1}');
    const sig  = signBody(body);
    expect(verifySignature(body, sig, TEST_SECRET)).toBe(true);
  });

  it('returns false when signature is wrong', () => {
    const body = Buffer.from('{"test":1}');
    expect(verifySignature(body, 'sha256=deadbeef00000000000000000000000000000000000000000000000000000000', TEST_SECRET)).toBe(false);
  });

  it('returns false when header prefix is missing', () => {
    const body = Buffer.from('hello');
    const raw  = crypto.createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    expect(verifySignature(body, raw, TEST_SECRET)).toBe(false); // no "sha256=" prefix
  });

  it('returns false when signatureHeader is undefined', () => {
    expect(verifySignature(Buffer.from('x'), undefined, TEST_SECRET)).toBe(false);
  });

  it('returns false when provided hex length is not 64', () => {
    expect(verifySignature(Buffer.from('x'), 'sha256=tooshort', TEST_SECRET)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readRawBody (pure helper)
// ---------------------------------------------------------------------------

describe('readRawBody', () => {
  it('collects chunks into a single Buffer', async () => {
    const req = makePostReq('hello world');
    const result = await readRawBody(req);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString('utf8')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// GET — verification challenge
// ---------------------------------------------------------------------------

describe('GET /api/webhooks/meta', () => {
  it('returns 200 + challenge when mode=subscribe and token matches', async () => {
    const req = makeGetReq({
      'hub.mode': 'subscribe',
      'hub.verify_token': TEST_VERIFY_TOKEN,
      'hub.challenge': 'challenge-abc',
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('challenge-abc');
  });

  it('returns 403 when token does not match', async () => {
    const req = makeGetReq({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'challenge-abc',
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(403);
  });

  it('returns 403 when mode is not "subscribe"', async () => {
    const req = makeGetReq({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': TEST_VERIFY_TOKEN,
      'hub.challenge': 'challenge-abc',
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(403);
  });

  it('returns 503 when META_WEBHOOK_VERIFY_TOKEN is not set', async () => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    const req = makeGetReq({ 'hub.mode': 'subscribe', 'hub.verify_token': 'any', 'hub.challenge': 'x' });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// POST — delivery status events
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/meta', () => {
  function makeDeliveryPayload(statusEvent = {}) {
    return JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id:           'wamid.test001',
              status:       'delivered',
              timestamp:    '1712345678',
              recipient_id: '18312477375',
              errors:       [],
              ...statusEvent,
            }],
          },
        }],
      }],
    });
  }

  it('returns 503 when META_APP_SECRET is not set', async () => {
    delete process.env.META_APP_SECRET;
    const body = makeDeliveryPayload();
    const req  = makePostReq(body);
    const res  = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(503);
    expect(upsertDeliveryStatus).not.toHaveBeenCalled();
  });

  it('returns 401 when signature is invalid', async () => {
    const body = makeDeliveryPayload();
    const req  = makePostReq(body, { 'x-hub-signature-256': 'sha256=badhex00000000000000000000000000000000000000000000000000000000000' });
    const res  = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
    expect(upsertDeliveryStatus).not.toHaveBeenCalled();
  });

  it('returns 401 when signature header is absent', async () => {
    const body = makeDeliveryPayload();
    const req  = makePostReq(body, {});
    const res  = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('processes a valid delivery event and calls upsertDeliveryStatus', async () => {
    const body = makeDeliveryPayload();
    const sig  = signBody(body);
    const req  = makePostReq(body, { 'x-hub-signature-256': sig });
    const res  = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(upsertDeliveryStatus).toHaveBeenCalledOnce();

    const [, args] = upsertDeliveryStatus.mock.calls[0];
    expect(args.wamid).toBe('wamid.test001');
    expect(args.status).toBe('delivered');
    expect(args.statusAt).toBe(new Date(1712345678 * 1000).toISOString());
    expect(args.recipient).toBe('***-***-7375');
    expect(args.errorCode).toBeNull();
    expect(args.errorTitle).toBeNull();
  });

  it('stores error_code and error_title for a failed event', async () => {
    const body = makeDeliveryPayload({
      status: 'failed',
      errors: [{ code: 131026, title: 'Message undeliverable' }],
    });
    const sig = signBody(body);
    const req = makePostReq(body, { 'x-hub-signature-256': sig });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const [, args] = upsertDeliveryStatus.mock.calls[0];
    expect(args.status).toBe('failed');
    expect(args.errorCode).toBe(131026);
    expect(args.errorTitle).toBe('Message undeliverable');
  });

  it('returns 200 and skips DB call for non-WhatsApp object type', async () => {
    const body = JSON.stringify({ object: 'instagram', entry: [] });
    const sig  = signBody(body);
    const req  = makePostReq(body, { 'x-hub-signature-256': sig });
    const res  = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(upsertDeliveryStatus).not.toHaveBeenCalled();
  });

  it('returns 200 and skips DB call when statuses array is absent (messages event)', async () => {
    const body = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { messages: [{ id: 'msg-001' }] } }] }],
    });
    const sig = signBody(body);
    const req = makePostReq(body, { 'x-hub-signature-256': sig });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(upsertDeliveryStatus).not.toHaveBeenCalled();
  });

  it('processes multiple status events in one payload', async () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{
        changes: [{
          value: {
            statuses: [
              { id: 'wamid.aaa', status: 'delivered', timestamp: '1712345678', recipient_id: '18312477375', errors: [] },
              { id: 'wamid.bbb', status: 'read',      timestamp: '1712345700', recipient_id: '18312477375', errors: [] },
            ],
          },
        }],
      }],
    };
    const body = JSON.stringify(payload);
    const sig  = signBody(body);
    const req  = makePostReq(body, { 'x-hub-signature-256': sig });
    const res  = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(upsertDeliveryStatus).toHaveBeenCalledTimes(2);
    expect(res.body).toMatchObject({ processed: 2, errors: 0 });
  });

  it('returns 200 and counts errors when upsertDeliveryStatus throws', async () => {
    upsertDeliveryStatus.mockRejectedValueOnce(new Error('DB error'));
    const body = makeDeliveryPayload();
    const sig  = signBody(body);
    const req  = makePostReq(body, { 'x-hub-signature-256': sig });
    const res  = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ processed: 0, errors: 1 });
  });

  it('returns 400 for invalid JSON body', async () => {
    const body = 'not valid json}}}';
    const sig  = signBody(body);
    const req  = makePostReq(body, { 'x-hub-signature-256': sig });
    const res  = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Method not allowed
// ---------------------------------------------------------------------------

describe('unsupported methods', () => {
  it('returns 405 for PUT', async () => {
    const res = makeRes();
    await handler({ method: 'PUT', query: {}, headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });
});
