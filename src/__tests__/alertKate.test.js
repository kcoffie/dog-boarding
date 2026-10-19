/**
 * sendAlert: Kate's alerts over Telegram (REQ-652). Boundary faked: fetch (the Telegram Bot API),
 * with Telegram's documented response shapes ({ ok, result } / { ok: false, error_code, description }).
 * @requirements REQ-652
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../lib/messageDeliveryStatus.js', () => ({ recordMessageLog: vi.fn(async () => {}) }));
const { recordMessageLog } = await import('../lib/messageDeliveryStatus.js');
const { sendAlert, alertDelivered, alertAndLog, exitCodeAfterAlert, truncateAlert, ALERT_TIMEOUT_MS } = await import('../lib/alertKate.js');

const TOKEN = '123456:test-bot-token';
const CHAT = '987654321';

function telegramReplies(body, status = 200) {
  globalThis.fetch = vi.fn(async () => ({ status, json: async () => body }));
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = TOKEN;
  process.env.TELEGRAM_ALERT_CHAT_ID = CHAT;
  telegramReplies({ ok: true, result: { message_id: 7 } });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('REQ-652: sendAlert', () => {
  it('sends one plain-text message to the alert chat through the bot', async () => {
    const results = await sendAlert('cron-detail: 2 consecutive failures');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(init.method).toBe('POST');
    expect(init.headers).toStrictEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(init.body)).toStrictEqual({ chat_id: CHAT, text: 'cron-detail: 2 consecutive failures' });
    expect(results).toStrictEqual([{ to: 'telegram', status: 'sent' }]);
  });

  it('gives up after 15 seconds instead of hanging', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await sendAlert('x');
    expect(timeout).toHaveBeenCalledWith(15000);
    expect(fetch.mock.calls[0][1].signal).toBe(timeout.mock.results[0].value);
    expect(ALERT_TIMEOUT_MS).toBe(15000);
  });

  it('an alert with no text sends an empty message, not "undefined"', async () => {
    await sendAlert(undefined);
    expect(JSON.parse(fetch.mock.calls[0][1].body).text).toBe('');
  });

  it('without a bot token, fails as not configured and makes no request', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(await sendAlert('x')).toStrictEqual([{ to: 'telegram', status: 'failed', error: 'Telegram alert channel not configured' }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('without a chat id, fails as not configured and makes no request', async () => {
    delete process.env.TELEGRAM_ALERT_CHAT_ID;
    expect(await sendAlert('x')).toStrictEqual([{ to: 'telegram', status: 'failed', error: 'Telegram alert channel not configured' }]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("a Telegram error fails with Telegram's code and description", async () => {
    telegramReplies({ ok: false, error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" }, 403);
    expect(await sendAlert('x')).toStrictEqual([{
      to: 'telegram', status: 'failed', error: "Telegram sendMessage 403: Forbidden: bot can't initiate conversation with a user",
    }]);
  });

  it('a non-JSON error page fails with the HTTP status', async () => {
    globalThis.fetch = vi.fn(async () => ({ status: 502, json: async () => { throw new SyntaxError('bad json'); } }));
    expect(await sendAlert('x')).toStrictEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendMessage 502: no description' }]);
  });

  it('a network error fails instead of throwing', async () => {
    globalThis.fetch = vi.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await sendAlert('x')).toStrictEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendMessage: network error' }]);
  });

  it('a timeout fails as timed out', async () => {
    globalThis.fetch = vi.fn(async () => { throw new DOMException('The operation timed out', 'TimeoutError'); });
    expect(await sendAlert('x')).toStrictEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendMessage: timed out' }]);
  });

  it('no error text or log line contains the bot token', async () => {
    telegramReplies({ ok: false, error_code: 401, description: 'Unauthorized' }, 401);
    const results = await sendAlert('x');
    const logged = [...console.error.mock.calls, ...console.log.mock.calls].flat().join(' ');
    expect(JSON.stringify(results)).not.toContain(TOKEN);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('api.telegram.org');
  });

  it('an alert over 4000 characters is cut to 4000, ending in …', async () => {
    await sendAlert('a'.repeat(5000));
    const sent = JSON.parse(fetch.mock.calls[0][1].body).text;
    expect(Array.from(sent)).toHaveLength(4000);
    expect(sent.endsWith('…')).toBe(true);
  });
});

describe('REQ-652: truncateAlert', () => {
  it('leaves text of exactly the limit untouched', () => {
    expect(truncateAlert('abcd', 4)).toBe('abcd');
  });

  it('cuts text one over the limit to the limit, ending in …', () => {
    expect(truncateAlert('abcde', 4)).toBe('abc…');
  });

  it('counts an emoji as one character and never splits it', () => {
    // Each 🐶 is two UTF-16 units; a unit-based cut would leave half a surrogate pair.
    expect(truncateAlert('🐶🐶🐶🐶🐶', 3)).toBe('🐶🐶…');
  });
});

describe('REQ-652: alertDelivered', () => {
  it('is true when one result was sent', () => {
    expect(alertDelivered([{ status: 'failed' }, { status: 'sent' }])).toBe(true);
  });

  it('is false when every result failed', () => {
    expect(alertDelivered([{ status: 'failed' }])).toBe(false);
  });

  it('is false for no results', () => {
    expect(alertDelivered([])).toBe(false);
    expect(alertDelivered(undefined)).toBe(false);
  });
});

describe('REQ-652: alertAndLog', () => {
  const DB = { fake: 'supabase' };

  it('a delivered alert returns true and is logged as sent under the job name', async () => {
    expect(await alertAndLog(DB, 'cron-health-check', 'cron-auth missed')).toBe(true);
    expect(recordMessageLog).toHaveBeenCalledWith(DB, [{ to: 'telegram', status: 'sent' }], 'cron-health-check', 'text', 'cron-auth missed', null);
  });

  it('an undelivered alert returns false and is logged as failed', async () => {
    telegramReplies({ ok: false, error_code: 403, description: 'Forbidden' }, 403);
    expect(await alertAndLog(DB, 'gmail-monitor', 'x')).toBe(false);
    expect(recordMessageLog.mock.calls.at(-1)[1]).toStrictEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendMessage 403: Forbidden' }]);
  });

  it('a message_log failure does not change the answer', async () => {
    recordMessageLog.mockRejectedValueOnce(new Error('db down'));
    expect(await alertAndLog(DB, 'integration-check', 'x')).toBe(true);
  });
});

describe('REQ-652: exitCodeAfterAlert', () => {
  it('an undelivered alert makes the run fail', () => {
    expect(exitCodeAfterAlert(false)).toBe(1);
  });

  it('a delivered alert leaves the run green', () => {
    expect(exitCodeAfterAlert(true)).toBe(0);
  });

  it('a run that needed no alert stays green', () => {
    expect(exitCodeAfterAlert(null)).toBe(0);
  });
});
