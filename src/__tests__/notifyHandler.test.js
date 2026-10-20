/**
 * /api/notify handler: the weekday roster windows and the Friday weekend preview.
 * @requirements REQ-611, REQ-612, REQ-630, REQ-641, REQ-401, REQ-655
 *
 * Expected values come from REQUIREMENTS, not from running the handler.
 * Boundaries faked: Supabase (cron_health reads + image storage), the channel send (sendRoster),
 * Kate's alert (alertAndLog), the AGYD daytime refresh, the DB roster read (getPictureOfDay), and
 * fetch (the roster image render). The send gate, the channel setting and date parsing stay real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../lib/rosterChannel.js', async (importOriginal) => ({
  ...(await importOriginal()),
  sendRoster: vi.fn(),
}));
vi.mock('../lib/alertKate.js', () => ({ alertAndLog: vi.fn() }));
vi.mock('../lib/messageDeliveryStatus.js', () => ({
  recordMessageLog: vi.fn(async () => {}),
}));
vi.mock('../lib/notifyHelpers.js', () => ({ refreshDaytimeSchedule: vi.fn() }));
vi.mock('../lib/pictureOfDay.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getPictureOfDay: vi.fn(),
}));
vi.mock('../../api/_cronHealth.js', () => ({ writeCronHealth: vi.fn(async () => {}) }));

const { createClient } = await import('@supabase/supabase-js');
const { sendRoster } = await import('../lib/rosterChannel.js');
const { alertAndLog } = await import('../lib/alertKate.js');
const { recordMessageLog } = await import('../lib/messageDeliveryStatus.js');
const { refreshDaytimeSchedule } = await import('../lib/notifyHelpers.js');
const { getPictureOfDay, hashPicture } = await import('../lib/pictureOfDay.js');
const { writeCronHealth } = await import('../../api/_cronHealth.js');
const { default: handler } = await import('../../api/notify.js');

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const TOKEN = 'test-token';
const TODAY = '2026-10-19'; // Monday, Pacific
const PNG = Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4]); // the rendered roster's bytes
const SENT = [{ to: 'telegram', status: 'sent' }];

let cronRows; // cron_health rows by cron_name, returned by .maybeSingle(); { error } or { throws } to fail
let upload;
let bucket;
function fakeSupabase() {
  return {
    from: (table) => {
      let name = null;
      let columns = null;
      const chain = {
        select: (cols) => { columns = cols; return chain; },
        eq: (col, val) => { if (col === 'cron_name') name = val; return chain; },
        maybeSingle: async () => {
          // Only the real table/columns find a row; a typo reads as "nothing stored", as Supabase would error.
          const row = table === 'cron_health' && columns === 'result' ? cronRows[name] : undefined;
          if (row?.throws) throw new Error(row.throws);
          if (row?.error) return { data: null, error: row.error };
          return { data: row ?? null, error: null };
        },
      };
      return chain;
    },
    storage: { from: (b) => { bucket = b; return { upload }; } },
  };
}

function picture({ dogs = ['S1'], boarders = ['Biscuit'], workers = 1 } = {}) {
  return {
    date: new Date(2026, 9, 19),
    workers: Array.from({ length: workers }, (_, i) => ({
      workerId: i + 1,
      name: `Worker ${i + 1}`,
      dogs: dogs.map(id => ({ series_id: id, pet_names: [id] })),
    })),
    boarders: boarders.map(name => ({
      name,
      arrival_datetime: '2026-10-17T17:00:00Z',
      departure_datetime: '2026-10-21T17:00:00Z',
    })),
    hasUpdates: false,
    lastSyncedAt: null,
  };
}

/** The cron_health 'notify' row left by an earlier send of `data` on `date`. */
function sentEarlier(data, date = TODAY, snapshot = [{ workerId: 1, dogs: [] }]) {
  cronRows.notify = { result: { lastHash: hashPicture(data), lastDate: date, snapshot } };
}

function call(query, { method = 'GET', headers = { host: 'qb.example.com' } } = {}) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method, query: { token: TOKEN, ...query }, headers }, res).then(() => res);
}

const healthWrites = (name) => writeCronHealth.mock.calls.filter(c => c[1] === name);
// fetch also carries the test logger's /api/log posts; only the roster render counts here.
const imageFetches = () => globalThis.fetch.mock.calls.map(c => String(c[0])).filter(u => u.includes('/api/roster-image'));
const sentImageUrl = () => imageFetches()[0];

beforeEach(() => {
  vi.clearAllMocks();
  cronRows = {};
  upload = vi.fn(async () => ({ error: null }));
  bucket = null;
  writeCronHealth.mockImplementation(async () => {});
  recordMessageLog.mockImplementation(async () => {});
  process.env.VITE_SYNC_PROXY_TOKEN = TOKEN;
  process.env.VITE_SUPABASE_URL = 'https://db.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  process.env.ROSTER_CHANNEL = 'telegram';
  createClient.mockImplementation(fakeSupabase);
  sendRoster.mockResolvedValue(SENT);
  alertAndLog.mockResolvedValue(true);
  refreshDaytimeSchedule.mockResolvedValue({ refreshed: true, rowCount: 5 });
  getPictureOfDay.mockResolvedValue(picture());
  globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => PNG.buffer.slice(0) }));
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-19T11:00:00Z')); // Monday 4:00 PDT
});
afterEach(() => vi.useRealTimers());

// ---------------------------------------------------------------------------
// Access and input
// ---------------------------------------------------------------------------

describe('access and input', () => {
  it('a wrong token is rejected and nothing is sent', async () => {
    const res = await call({ window: '4am', token: 'nope' });
    expect(res.code).toBe(401);
    expect(res.body).toStrictEqual({ error: 'Unauthorized' });
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('with no token configured on the server, every request is rejected (fails closed)', async () => {
    delete process.env.VITE_SYNC_PROXY_TOKEN;
    const res = await call({ window: '4am', token: '' });
    expect(res.code).toBe(401);
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('only GET is accepted', async () => {
    const res = await call({ window: '4am' }, { method: 'POST' });
    expect(res.code).toBe(405);
    expect(res.body).toStrictEqual({ error: 'Method not allowed' });
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('an unknown window is rejected and nothing is sent', async () => {
    const res = await call({ window: '830am' });
    expect(res.code).toBe(400);
    expect(res.body.error).toBe('Invalid window: "830am". Must be one of: 4am, 7am, 8:30am, friday-pm');
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('the handler runs on the Node.js runtime (Vercel), not edge', async () => {
    const { config } = await import('../../api/notify.js');
    expect(config).toStrictEqual({ runtime: 'nodejs' });
  });

  it('a missing window is rejected', async () => {
    const res = await call({});
    expect(res.code).toBe(400);
  });

  it('a malformed date is rejected and nothing is sent', async () => {
    const res = await call({ window: '4am', date: '10/19/2026' });
    expect(res.code).toBe(400);
    expect(res.body.error).toMatch(/10\/19\/2026/);
    expect(sendRoster).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// REQ-612: which window sends
// ---------------------------------------------------------------------------

describe('REQ-612: send gate', () => {
  it('4am sends even when the roster is unchanged since an earlier send today', async () => {
    sentEarlier(picture());
    const res = await call({ window: '4am' });
    expect(res.body.action).toBe('sent');
    expect(sendRoster).toHaveBeenCalledTimes(1);
  });

  it('7am skips when the roster is unchanged since the last send today', async () => {
    sentEarlier(picture());
    const res = await call({ window: '7am' });
    expect(res.code).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'no_change', window: '7am', date: TODAY });
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('8:30am skips when the roster is unchanged since the last send today', async () => {
    sentEarlier(picture());
    const res = await call({ window: '8:30am' });
    expect(res.body.action).toBe('skipped');
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('7am sends when a dog was added to a worker since the last send', async () => {
    sentEarlier(picture({ dogs: ['S1'] }));
    getPictureOfDay.mockResolvedValue(picture({ dogs: ['S1', 'S2'] }));
    const res = await call({ window: '7am' });
    expect(res.body.action).toBe('sent');
  });

  it('8:30am sends when a boarder was added since the last send', async () => {
    sentEarlier(picture({ boarders: ['Biscuit'] }));
    getPictureOfDay.mockResolvedValue(picture({ boarders: ['Biscuit', 'Pickle'] }));
    const res = await call({ window: '8:30am' });
    expect(res.body.action).toBe('sent');
  });

  it("7am sends when today's roster matches a send from a previous day (yesterday is not a baseline)", async () => {
    sentEarlier(picture(), '2026-10-16');
    const res = await call({ window: '7am' });
    expect(res.body.action).toBe('sent');
  });

  it('a stored notify row without a hash counts as no baseline, so 7am sends', async () => {
    cronRows.notify = { result: null };
    const res = await call({ window: '7am' });
    expect(res.body.action).toBe('sent');
  });

  it("another job's stored hash is not this roster's baseline", async () => {
    cronRows['notify-friday-pm'] = { result: { lastHash: hashPicture(picture()), lastDate: TODAY } };
    const res = await call({ window: '7am' });
    expect(res.body.action).toBe('sent');
  });

  it('7am sends when nothing has been sent before', async () => {
    const res = await call({ window: '7am' });
    expect(res.body.action).toBe('sent');
  });

  it('7am sends when the last-send state cannot be read (a duplicate beats silence)', async () => {
    cronRows.notify = { error: { message: 'db down' } };
    const res = await call({ window: '7am' });
    expect(res.body.action).toBe('sent');
  });

  it('after a send, the roster hash and date are stored so the next window can compare', async () => {
    const data = picture({ dogs: ['S7'] });
    getPictureOfDay.mockResolvedValue(data);
    await call({ window: '4am' });
    const [[, , status, result]] = healthWrites('notify');
    expect(status).toBe('success');
    expect(result.lastHash).toBe(hashPicture(data));
    expect(result.lastDate).toBe(TODAY);
    expect(result.window).toBe('4am');
    expect(result.recipients).toStrictEqual(['telegram']);
  });

  it('a skipped window does not overwrite the stored hash', async () => {
    sentEarlier(picture());
    await call({ window: '7am' });
    expect(healthWrites('notify')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// REQ-611: what a weekday send does
// ---------------------------------------------------------------------------

describe('REQ-611: weekday roster send', () => {
  it('the roster goes out once, on the configured channel, captioned with its window', async () => {
    await call({ window: '7am' });
    expect(sendRoster).toHaveBeenCalledTimes(1);
    const [[{ channel, caption }]] = sendRoster.mock.calls;
    expect(channel).toBe('telegram');
    expect(caption).toBe('Roster 7am');
  });

  it('the image is rendered once, and the bytes sent are the bytes stored', async () => {
    await call({ window: '4am' });
    expect(imageFetches()).toHaveLength(1);
    expect([...sendRoster.mock.calls[0][0].png]).toEqual([...PNG]);
    expect([...upload.mock.calls[0][1]]).toEqual([...PNG]);
  });

  it('the image is stored before it is sent', async () => {
    const order = [];
    upload.mockImplementation(async () => { order.push('store'); return { error: null }; });
    sendRoster.mockImplementation(async () => { order.push('send'); return SENT; });
    await call({ window: '4am' });
    expect(order).toEqual(['store', 'send']);
  });

  it('staff numbers in NOTIFY_RECIPIENTS play no part: the send happens with or without them', async () => {
    process.env.NOTIFY_RECIPIENTS = '';
    const res = await call({ window: '4am' });
    expect(res.body.action).toBe('sent');
    expect(Object.keys(sendRoster.mock.calls[0][0]).sort()).toEqual(['caption', 'channel', 'png']);
  });

  it('the daytime schedule is refreshed live before the roster is built', async () => {
    const order = [];
    refreshDaytimeSchedule.mockImplementation(async () => { order.push('refresh'); return { refreshed: true, rowCount: 3 }; });
    getPictureOfDay.mockImplementation(async () => { order.push('picture'); return picture(); });
    await call({ window: '4am' });
    expect(order).toEqual(['refresh', 'picture']);
  });

  it('the roster is for the Pacific calendar day, not the UTC one', async () => {
    vi.setSystemTime(new Date('2026-10-20T03:00:00Z')); // Monday 20:00 PDT, already Tuesday in UTC
    await call({ window: '4am' });
    const date = refreshDaytimeSchedule.mock.calls[0][1];
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 10, 19]);
  });

  it('single-digit months and days are zero-padded in the stored date', async () => {
    await call({ window: '4am', date: '2026-03-05' });
    expect(healthWrites('notify')[0][3].lastDate).toBe('2026-03-05');
  });

  it('a date parameter picks the roster day', async () => {
    await call({ window: '4am', date: '2026-10-22' });
    const date = getPictureOfDay.mock.calls[0][1];
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 10, 22]);
    expect(healthWrites('notify')[0][3].lastDate).toBe('2026-10-22');
  });

  it("the image comes from this deployment's own roster-image endpoint for the roster day and window", async () => {
    await call({ window: '7am' }, { headers: { host: 'qb.example.com', 'x-forwarded-proto': 'http' } });
    const url = new URL(sentImageUrl());
    expect(url.origin).toBe('http://qb.example.com');
    expect(url.pathname).toBe('/api/roster-image');
    expect(url.searchParams.get('date')).toBe(TODAY);
    expect(url.searchParams.get('sendWindow')).toBe('7am');
    expect(url.searchParams.get('token')).toBe(TOKEN);
    expect(url.searchParams.get('ts')).toBe('2026-10-19T11:00:00.000Z');
  });

  it('the image URL defaults to https and prefers the forwarded host', async () => {
    await call({ window: '4am' }, { headers: { host: 'internal', 'x-forwarded-host': 'qb.example.com' } });
    expect(new URL(sentImageUrl()).origin).toBe('https://qb.example.com');
  });

  it("a 7am resend carries the earlier send's roster so the image can mark what changed", async () => {
    const snapshot = [{ workerId: 1, dogs: ['S1'] }];
    sentEarlier(picture({ dogs: ['S1'] }), TODAY, snapshot);
    getPictureOfDay.mockResolvedValue(picture({ dogs: ['S1', 'S2'] }));
    await call({ window: '7am' });
    const encoded = new URL(sentImageUrl()).searchParams.get('lastSnapshot');
    expect(JSON.parse(Buffer.from(encoded, 'base64').toString())).toEqual(snapshot);
  });

  it('the 4am image carries no earlier roster (it is the first send of the day)', async () => {
    sentEarlier(picture({ dogs: ['S9'] }));
    await call({ window: '4am' });
    expect(new URL(sentImageUrl()).searchParams.has('lastSnapshot')).toBe(false);
  });

  it("a 7am send carries no earlier roster from a previous day", async () => {
    sentEarlier(picture({ dogs: ['S9'] }), '2026-10-16');
    await call({ window: '7am' });
    expect(new URL(sentImageUrl()).searchParams.has('lastSnapshot')).toBe(false);
  });

  it('with no workers on the roster, nothing is sent (a blank image helps nobody)', async () => {
    getPictureOfDay.mockResolvedValue(picture({ workers: 0 }));
    const res = await call({ window: '4am' });
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'no_data' });
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('each send is recorded in the message log under its window job name', async () => {
    await call({ window: '8:30am' });
    expect(recordMessageLog.mock.calls[0][1]).toEqual(SENT);
    expect(recordMessageLog.mock.calls[0][2]).toBe('notify-8:30am');
    expect(recordMessageLog.mock.calls[0][3]).toBe('image');
  });

  it('the sent image is stored and its path recorded in the message log', async () => {
    await call({ window: '4am' });
    expect(bucket).toBe('roster-images');
    expect(upload.mock.calls[0][0]).toBe('notify-4am/2026-10-19T11-00-00.000Z.png');
    expect(upload.mock.calls[0][2]).toStrictEqual({ contentType: 'image/png', upsert: true });
    expect(recordMessageLog.mock.calls[0][5]).toBe('roster-images/notify-4am/2026-10-19T11-00-00.000Z.png');
  });

  it('when the image cannot be rendered, nothing is sent: 500 naming the HTTP status, failure recorded, hash not stored', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) }));
    const res = await call({ window: '4am' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Roster image fetch failed: HTTP 500' });
    expect(sendRoster).not.toHaveBeenCalled();
    expect(healthWrites('notify').map(w => w[2])).toEqual(['failure']);
  });

  it('when the image fetch throws, the error names no URL (the URL carries the token)', async () => {
    globalThis.fetch = vi.fn(async (url) => { throw new Error(`request to ${url} failed`); });
    const res = await call({ window: '4am' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Roster image fetch: network error' });
    expect(JSON.stringify(healthWrites('notify'))).not.toContain(TOKEN);
  });

  it('when the image upload fails, the roster is still sent and the log has no image path', async () => {
    upload.mockResolvedValue({ error: { message: 'bucket missing' } });
    const res = await call({ window: '4am' });
    expect(res.body.action).toBe('sent');
    expect(recordMessageLog.mock.calls[0][5]).toBeNull();
  });

  it('when the image upload throws, the log has no image path', async () => {
    upload.mockRejectedValue(new Error('network'));
    await call({ window: '4am' });
    expect(recordMessageLog.mock.calls[0][5]).toBeNull();
  });

  it('a failure to write the message log does not fail the send', async () => {
    recordMessageLog.mockRejectedValueOnce(new Error('y'));
    const res = await call({ window: '4am' });
    expect(res.code).toBe(200);
    expect(res.body.action).toBe('sent');
  });

  it('the response counts sent and failed recipients separately', async () => {
    sendRoster.mockResolvedValue([
      { to: 'a', status: 'sent' },
      { to: 'b', status: 'sent' },
      { to: 'c', status: 'failed', error: 'bad number' },
    ]);
    const res = await call({ window: '4am' });
    expect(res.body.ok).toBe(true);
    expect(res.body.sentCount).toBe(2);
    expect(res.body.failedCount).toBe(1);
  });

  it('a send that reached no recipient is a failure: 500, failure recorded, hash not stored (#255)', async () => {
    sendRoster.mockResolvedValue([
      { to: '***-0', status: 'failed', error: 'x' },
      { to: '***-1', status: 'failed', error: 'y' },
    ]);
    const res = await call({ window: '4am' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'No recipient received the roster (2 of 2 sends failed): x; y' });
    const writes = healthWrites('notify');
    expect(writes).toHaveLength(1);
    expect(writes[0].slice(2)).toStrictEqual(['failure', null, 'No recipient received the roster (2 of 2 sends failed): x; y']);
  });

  it('when no one was reached, results without a reason are left out of the error', async () => {
    sendRoster.mockResolvedValue([{ to: 'a', status: 'failed' }, { to: 'b', status: 'failed', error: 'y' }]);
    const res = await call({ window: '4am' });
    expect(res.body).toStrictEqual({ error: 'No recipient received the roster (2 of 2 sends failed): y' });
  });

  it('when no one was reached and no reason was given, the error ends at the count', async () => {
    sendRoster.mockResolvedValue([{ to: 'telegram', status: 'failed' }]);
    const res = await call({ window: '4am' });
    expect(res.body).toStrictEqual({ error: 'No recipient received the roster (1 of 1 sends failed)' });
  });

  it('a send that reached at least one recipient counts as sent and stores the hash (#255)', async () => {
    sendRoster.mockResolvedValue([
      { to: '***-0', status: 'failed', error: 'x' },
      { to: '***-1', status: 'sent', messageId: 'w1' },
    ]);
    const res = await call({ window: '7am' });
    expect(res.code).toBe(200);
    const [[, , status, result]] = healthWrites('notify');
    expect(status).toBe('success');
    expect(result.lastHash).toBe(hashPicture(picture()));
  });

  it('after a window that reached nobody, the next window sends the same roster again (#255)', async () => {
    sentEarlier(picture({ dogs: ['S1'] })); // 4am reached the team
    getPictureOfDay.mockResolvedValue(picture({ dogs: ['S1', 'S2'] })); // roster changed before 7am
    sendRoster.mockResolvedValueOnce([{ to: '***-0', status: 'failed', error: 'x' }]);
    expect((await call({ window: '7am' })).code).toBe(500);
    const [last] = healthWrites('notify').slice(-1);
    cronRows.notify = { result: last[3] }; // what the 7am run left in cron_health
    const res = await call({ window: '8:30am' });
    expect(res.body.action).toBe('sent');
  });

  it('a send that reached no recipient is still written to the message log (#255)', async () => {
    sendRoster.mockResolvedValue([{ to: 'telegram', status: 'failed', error: 'x' }]);
    await call({ window: '4am' });
    expect(recordMessageLog.mock.calls[0][1]).toEqual([{ to: 'telegram', status: 'failed', error: 'x' }]);
    expect(recordMessageLog.mock.calls[0][2]).toBe('notify-4am');
  });

  it('falls back to the anon key when the service role key is unset', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const res = await call({ window: '4am' });
    expect(res.body.action).toBe('sent');
    expect(createClient).toHaveBeenCalledWith('https://db.example.com', 'anon-key');
  });
});

// ---------------------------------------------------------------------------
// J-1: the 8:30am boarders baseline for the hourly intraday job
// ---------------------------------------------------------------------------

describe('8:30am boarders baseline (intraday job)', () => {
  it('8:30am stores the boarders baseline even when it skips sending', async () => {
    sentEarlier(picture());
    await call({ window: '8:30am' });
    const [[, , status, result]] = healthWrites('boarders-snapshot');
    expect(status).toBe('success');
    expect(result.snapshotDate).toBe(TODAY);
    expect(result.boarders).toEqual([
      { name: 'Biscuit', arrival_datetime: '2026-10-17T17:00:00Z', departure_datetime: '2026-10-21T17:00:00Z' },
    ]);
  });

  it('4am and 7am do not store a boarders baseline', async () => {
    await call({ window: '4am' });
    await call({ window: '7am' });
    expect(healthWrites('boarders-snapshot')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// REQ-641: refresh problems alert once a day
// ---------------------------------------------------------------------------

describe('REQ-641: refresh alert', () => {
  it("a refresh warning alerts Kate (not staff) as notify-refresh-alert, naming the day, window and warning", async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    await call({ window: '4am' });
    const [[, job, text]] = alertAndLog.mock.calls;
    expect(job).toBe('notify-refresh-alert');
    expect(text).toBe('⚠️ Notify refresh issue (2026-10-19, 4am)\nsession expired');
  });

  it('the alert is recorded so later windows the same day stay quiet', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    await call({ window: '4am' });
    const [[, , status, result]] = healthWrites('notify-refresh-alert');
    expect(status).toBe('success');
    expect(result.alertDate).toBe(TODAY);
    expect(result.window).toBe('4am');
  });

  it('an alert that was not delivered is not recorded, so the next window tries again', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    alertAndLog.mockResolvedValue(false);
    await call({ window: '4am' });
    expect(healthWrites('notify-refresh-alert')).toHaveLength(0);
  });

  it('when the earlier-alert state cannot be read, the alert is sent anyway', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    cronRows['notify-refresh-alert'] = { throws: 'db down' };
    await call({ window: '7am' });
    expect(alertAndLog).toHaveBeenCalledTimes(1);
  });

  it('a second refresh warning on the same day sends no second alert', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    cronRows['notify-refresh-alert'] = { result: { alertDate: TODAY, window: '4am' } };
    await call({ window: '7am' });
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it("yesterday's alert does not silence today's", async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    cronRows['notify-refresh-alert'] = { result: { alertDate: '2026-10-16', window: '4am' } };
    await call({ window: '7am' });
    expect(alertAndLog).toHaveBeenCalledTimes(1);
  });

  it('a clean refresh sends no alert', async () => {
    await call({ window: '4am' });
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('a failing alert send does not stop the roster send', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    alertAndLog.mockRejectedValue(new Error('telegram down'));
    const res = await call({ window: '4am' });
    expect(res.body.action).toBe('sent');
  });

});

// ---------------------------------------------------------------------------
// REQ-401: failures are recorded
// ---------------------------------------------------------------------------

describe('REQ-401: failure recording', () => {
  it('an unexpected error returns 500 and records a notify failure with the message', async () => {
    getPictureOfDay.mockRejectedValue(new Error('roster query failed'));
    const res = await call({ window: '4am' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'roster query failed' });
    const [[, , status, result, msg]] = healthWrites('notify');
    expect(status).toBe('failure');
    expect(result).toBeNull();
    expect(msg).toBe('roster query failed');
  });

  it('the recorded failure message is cut to 500 characters', async () => {
    getPictureOfDay.mockRejectedValue(new Error('x'.repeat(600)));
    await call({ window: '4am' });
    expect(healthWrites('notify')[0][4]).toHaveLength(500);
  });

  it('missing Supabase settings fail the run with 500', async () => {
    delete process.env.VITE_SUPABASE_URL;
    const res = await call({ window: '4am' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Supabase env vars not configured' });
    expect(sendRoster).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// REQ-630: Friday weekend preview
// ---------------------------------------------------------------------------

describe('REQ-630: friday-pm', () => {
  it('sends the weekend image even when the weekday roster is unchanged', async () => {
    sentEarlier(picture());
    const res = await call({ window: 'friday-pm' });
    expect(res.body.action).toBe('sent');
    const url = new URL(sentImageUrl());
    expect(url.pathname).toBe('/api/roster-image');
    expect(url.searchParams.get('type')).toBe('weekend');
    expect(url.searchParams.get('token')).toBe(TOKEN);
    expect(url.searchParams.get('ts')).toBe('2026-10-19T11:00:00.000Z');
  });

  it("the weekend image comes from this deployment's own host", async () => {
    await call({ window: 'friday-pm' }, { headers: { host: 'internal', 'x-forwarded-host': 'qb.example.com', 'x-forwarded-proto': 'http' } });
    expect(new URL(sentImageUrl()).origin).toBe('http://qb.example.com');
  });

  it('the weekend image URL defaults to https and the request host', async () => {
    await call({ window: 'friday-pm' }, { headers: { host: 'qb.example.com' } });
    expect(new URL(sentImageUrl()).origin).toBe('https://qb.example.com');
  });

  it('goes out on the configured channel as the weekend roster, with the stored bytes', async () => {
    await call({ window: 'friday-pm' });
    const [[{ channel, caption, png }]] = sendRoster.mock.calls;
    expect(channel).toBe('telegram');
    expect(caption).toBe('Weekend roster');
    expect([...png]).toEqual([...PNG]);
    expect([...upload.mock.calls[0][1]]).toEqual([...PNG]);
  });

  it('records a notify-friday-pm success in cron_health', async () => {
    await call({ window: 'friday-pm' });
    const [[, , status, result]] = healthWrites('notify-friday-pm');
    expect(status).toBe('success');
    expect(result.recipients).toEqual(['telegram']);
  });

  it('leaves the weekday hash state alone', async () => {
    await call({ window: 'friday-pm' });
    expect(healthWrites('notify')).toHaveLength(0);
    expect(getPictureOfDay).not.toHaveBeenCalled();
  });

  it('records the message log and the stored image under notify-friday-pm', async () => {
    await call({ window: 'friday-pm' });
    expect(recordMessageLog.mock.calls[0][2]).toBe('notify-friday-pm');
    expect(recordMessageLog.mock.calls[0][3]).toBe('image');
    expect(recordMessageLog.mock.calls[0][5]).toBe('roster-images/notify-friday-pm/2026-10-19T11-00-00.000Z.png');
  });

  it('an image that cannot be rendered returns 500 and records a notify-friday-pm failure', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) }));
    const res = await call({ window: 'friday-pm' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Roster image fetch failed: HTTP 502' });
    const [[, , status, , msg]] = healthWrites('notify-friday-pm');
    expect(status).toBe('failure');
    expect(msg).toBe('Roster image fetch failed: HTTP 502');
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('the response counts sent and failed recipients separately', async () => {
    sendRoster.mockResolvedValue([
      { to: 'a', status: 'sent' },
      { to: 'b', status: 'sent' },
      { to: 'c', status: 'failed', error: 'y' },
    ]);
    const res = await call({ window: 'friday-pm' });
    expect(res.body.ok).toBe(true);
    expect(res.body.sentCount).toBe(2);
    expect(res.body.failedCount).toBe(1);
  });

  it('a send that reached no recipient returns 500 and records a notify-friday-pm failure (#255)', async () => {
    sendRoster.mockResolvedValue([{ to: '***-0', status: 'failed', error: 'x' }]);
    const res = await call({ window: 'friday-pm' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'No recipient received the roster (1 of 1 sends failed): x' });
    const writes = healthWrites('notify-friday-pm');
    expect(writes).toHaveLength(1);
    expect(writes[0].slice(2)).toStrictEqual(['failure', null, 'No recipient received the roster (1 of 1 sends failed): x']);
  });

  it('a send that reached at least one recipient records success (#255)', async () => {
    sendRoster.mockResolvedValue([
      { to: '***-0', status: 'failed', error: 'x' },
      { to: '***-1', status: 'sent', messageId: 'w1' },
    ]);
    const res = await call({ window: 'friday-pm' });
    expect(res.code).toBe(200);
    expect(healthWrites('notify-friday-pm')[0][2]).toBe('success');
  });

  it('a send that reached no recipient is still written to the message log (#255)', async () => {
    sendRoster.mockResolvedValue([{ to: 'telegram', status: 'failed', error: 'x' }]);
    await call({ window: 'friday-pm' });
    expect(recordMessageLog.mock.calls[0][2]).toBe('notify-friday-pm');
  });

  it('the recorded failure message is cut to 500 characters', async () => {
    sendRoster.mockResolvedValue([{ to: 'telegram', status: 'failed', error: 'z'.repeat(600) }]);
    await call({ window: 'friday-pm' });
    expect(healthWrites('notify-friday-pm')[0][4]).toHaveLength(500);
  });
});

// ---------------------------------------------------------------------------
// REQ-655: the roster channel setting
// ---------------------------------------------------------------------------

describe('REQ-655: ROSTER_CHANNEL', () => {
  it('unset fails the run before any work: 500 naming the problem, notify failure recorded', async () => {
    delete process.env.ROSTER_CHANNEL;
    const res = await call({ window: '4am' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'ROSTER_CHANNEL is not set; expected one of: telegram' });
    expect(healthWrites('notify')[0].slice(2)).toStrictEqual(['failure', null, 'ROSTER_CHANNEL is not set; expected one of: telegram']);
    expect(refreshDaytimeSchedule).not.toHaveBeenCalled();
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('an unknown value fails even a 7am window that would have skipped as unchanged', async () => {
    process.env.ROSTER_CHANNEL = 'whatsapp';
    sentEarlier(picture());
    const res = await call({ window: '7am' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'ROSTER_CHANNEL is "whatsapp"; expected one of: telegram' });
  });

  it('a bad value on friday-pm records the failure under notify-friday-pm', async () => {
    process.env.ROSTER_CHANNEL = 'sms';
    const res = await call({ window: 'friday-pm' });
    expect(res.code).toBe(500);
    expect(healthWrites('notify-friday-pm')[0].slice(2)).toStrictEqual(['failure', null, 'ROSTER_CHANNEL is "sms"; expected one of: telegram']);
  });

  it('when even the failure record cannot be written, the run still returns the 500', async () => {
    delete process.env.ROSTER_CHANNEL;
    delete process.env.VITE_SUPABASE_URL;
    const res = await call({ window: '4am' });
    expect(res.code).toBe(500);
    expect(res.body.error).toBe('ROSTER_CHANNEL is not set; expected one of: telegram');
  });
});
