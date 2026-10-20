/**
 * The roster channel. Expected values come from REQ-655's acceptance criteria.
 * @requirements REQ-655
 *
 * Telegram's Bot API and our own image endpoint are the boundaries: fetch is a fake that records
 * what was sent and answers with Telegram's documented response shape ({ ok, error_code, description }).
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ROSTER_CHANNELS, readRosterChannel, intradayEnabled, fetchRosterPng, sendRoster,
  ROSTER_FETCH_TIMEOUT_MS, ROSTER_SEND_TIMEOUT_MS,
} from '../lib/rosterChannel.js';

const BOT_TOKEN = '123456:bot-secret';
const PROXY_TOKEN = 'proxy-secret';
const ENV = { TELEGRAM_BOT_TOKEN: BOT_TOKEN, TELEGRAM_ALERT_CHAT_ID: '4242', NOTIFY_RECIPIENTS: '+15555550100,+15555550101' };
const PNG = Buffer.from([137, 80, 78, 71, 1, 2]);
const IMAGE_URL = `https://qb.example.com/api/roster-image?date=2026-10-21&token=${PROXY_TOKEN}`;

const telegramAnswers = (body, status = 200) => vi.fn(async () => ({ status, json: async () => body }));

describe('readRosterChannel', () => {
  it('telegram is the only channel today', () => {
    expect(ROSTER_CHANNELS).toEqual(['telegram']);
    expect(readRosterChannel('telegram')).toEqual({ channel: 'telegram' });
  });

  it('unset is an error, not a default', () => {
    expect(readRosterChannel(undefined)).toEqual({ error: 'ROSTER_CHANNEL is not set; expected one of: telegram' });
    expect(readRosterChannel('')).toEqual({ error: 'ROSTER_CHANNEL is not set; expected one of: telegram' });
  });

  it('an unknown value is an error that names it', () => {
    expect(readRosterChannel('whatsapp')).toEqual({ error: 'ROSTER_CHANNEL is "whatsapp"; expected one of: telegram' });
  });

  it('the value is matched exactly (no case folding or trimming)', () => {
    expect(readRosterChannel('Telegram').error).toBe('ROSTER_CHANNEL is "Telegram"; expected one of: telegram');
    expect(readRosterChannel('telegram ').error).toBe('ROSTER_CHANNEL is "telegram "; expected one of: telegram');
  });
});

describe('intradayEnabled', () => {
  it('intraday images are off while the roster goes to Kate on Telegram', () => {
    expect(intradayEnabled('telegram')).toBe(false);
  });

  it('they are on for a staff channel', () => {
    expect(intradayEnabled('twilio')).toBe(true);
  });
});

describe('fetchRosterPng', () => {
  it('returns the rendered bytes, asking with a 30 s timeout', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => Uint8Array.from(PNG).buffer }));
    const png = await fetchRosterPng(IMAGE_URL, fetchFn);
    expect([...png]).toEqual([...PNG]);
    expect(fetchFn.mock.calls[0][0]).toBe(IMAGE_URL);
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(ROSTER_FETCH_TIMEOUT_MS).toBe(30000);
  });

  it('a non-200 render fails naming the status only', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500 }));
    await expect(fetchRosterPng(IMAGE_URL, fetchFn)).rejects.toThrow(/^Roster image fetch failed: HTTP 500$/);
  });

  it('a network error fails without the URL or token in the message', async () => {
    const fetchFn = vi.fn(async (url) => { throw new TypeError(`fetch failed for ${url}`); });
    await expect(fetchRosterPng(IMAGE_URL, fetchFn)).rejects.toThrow(/^Roster image fetch: network error$/);
  });

  it('a body that breaks mid-read fails as a network error, without the URL', async () => {
    const fetchFn = vi.fn(async (url) => ({ ok: true, status: 200, arrayBuffer: async () => { throw new TypeError(`terminated reading ${url}`); } }));
    await expect(fetchRosterPng(IMAGE_URL, fetchFn)).rejects.toThrow(/^Roster image fetch: network error$/);
  });

  it('a body that times out mid-read says so', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => { throw new DOMException('aborted', 'TimeoutError'); } }));
    await expect(fetchRosterPng(IMAGE_URL, fetchFn)).rejects.toThrow(/^Roster image fetch: timed out$/);
  });

  it('a timeout says so', async () => {
    const fetchFn = vi.fn(async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); });
    await expect(fetchRosterPng(IMAGE_URL, fetchFn)).rejects.toThrow(/^Roster image fetch: timed out$/);
  });
});

describe('sendRoster on telegram', () => {
  it("sends one photo to Kate's chat, with the caption, and reports it sent", async () => {
    const fetchFn = telegramAnswers({ ok: true, result: { message_id: 7 } });
    const results = await sendRoster({ channel: 'telegram', png: PNG, caption: 'Roster 4am', fetchFn, env: ENV });
    expect(results).toEqual([{ to: 'telegram', status: 'sent' }]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`);
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(ROSTER_SEND_TIMEOUT_MS).toBe(15000);
    expect(init.body.get('chat_id')).toBe('4242');
    expect(init.body.get('caption')).toBe('Roster 4am');
    const photo = init.body.get('photo');
    expect(photo.type).toBe('image/png');
    expect(photo.name).toBe('roster.png');
    expect([...new Uint8Array(await photo.arrayBuffer())]).toEqual([...PNG]);
  });

  it('never sends to staff numbers: the only recipient is the alert chat', async () => {
    const fetchFn = telegramAnswers({ ok: true });
    await sendRoster({ channel: 'telegram', png: PNG, caption: 'x', fetchFn, env: ENV });
    const sentTo = fetchFn.mock.calls.map(([, init]) => init.body.get('chat_id'));
    expect(sentTo).toEqual(['4242']);
  });

  it("Telegram's refusal is a failed result naming its error code and description", async () => {
    const fetchFn = telegramAnswers({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, 400);
    const results = await sendRoster({ channel: 'telegram', png: PNG, caption: 'x', fetchFn, env: ENV });
    expect(results).toEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendPhoto 400: Bad Request: chat not found' }]);
  });

  it('an unreadable answer falls back to the HTTP status', async () => {
    const fetchFn = vi.fn(async () => ({ status: 502, json: async () => { throw new SyntaxError('not json'); } }));
    const results = await sendRoster({ channel: 'telegram', png: PNG, caption: 'x', fetchFn, env: ENV });
    expect(results).toEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendPhoto 502: no description' }]);
  });

  it('a network error is a failed result that never contains the bot token', async () => {
    const fetchFn = vi.fn(async (url) => { throw new TypeError(`fetch failed: ${url}`); });
    const results = await sendRoster({ channel: 'telegram', png: PNG, caption: 'x', fetchFn, env: ENV });
    expect(results).toEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendPhoto: network error' }]);
    expect(JSON.stringify(results)).not.toContain(BOT_TOKEN);
  });

  it('something thrown that is not an Error still counts as a network error', async () => {
    const fetchFn = vi.fn(async () => { throw undefined; });
    const results = await sendRoster({ channel: 'telegram', png: PNG, caption: 'x', fetchFn, env: ENV });
    expect(results).toEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendPhoto: network error' }]);
  });

  it('a timeout is a failed result that says so', async () => {
    const fetchFn = vi.fn(async () => { throw new DOMException('aborted', 'TimeoutError'); });
    const results = await sendRoster({ channel: 'telegram', png: PNG, caption: 'x', fetchFn, env: ENV });
    expect(results).toEqual([{ to: 'telegram', status: 'failed', error: 'Telegram sendPhoto: timed out' }]);
  });

  it('a missing bot token fails without calling Telegram', async () => {
    const fetchFn = vi.fn();
    const results = await sendRoster({ channel: 'telegram', png: PNG, caption: 'x', fetchFn, env: { ...ENV, TELEGRAM_BOT_TOKEN: '' } });
    expect(results).toEqual([{ to: 'telegram', status: 'failed', error: 'Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_ALERT_CHAT_ID)' }]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a missing chat ID fails without calling Telegram', async () => {
    const fetchFn = vi.fn();
    const results = await sendRoster({ channel: 'telegram', png: PNG, caption: 'x', fetchFn, env: { ...ENV, TELEGRAM_ALERT_CHAT_ID: '' } });
    expect(results[0].status).toBe('failed');
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('sendRoster on anything else', () => {
  it('an unknown channel is a failed result naming it, and nothing is sent', async () => {
    const fetchFn = vi.fn();
    const results = await sendRoster({ channel: 'sms', png: PNG, caption: 'x', fetchFn, env: ENV });
    expect(results).toEqual([{ to: 'sms', status: 'failed', error: 'ROSTER_CHANNEL is "sms"; expected one of: telegram' }]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
