/**
 * /api/notify handler: the weekday roster windows and the Friday weekend preview.
 * @requirements REQ-611, REQ-612, REQ-630, REQ-641, REQ-401, REQ-655, REQ-658
 *
 * Expected values come from REQUIREMENTS, not from running the handler.
 * Boundaries faked: Supabase (cron_health via fakeCronHealth, which applies the PostgREST filters the
 * 4am claim uses, + image storage), the channel send (sendRoster),
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
const { fakeCronHealth } = await import('./fakeCronHealth.js');
const { CLAIM_ROW, ALERT_JOB } = await import('../lib/rosterTrigger.js');

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const TOKEN = 'test-token';
const CRON = 'cron-secret';
const TODAY = '2026-10-19'; // Monday, Pacific
const PNG = Uint8Array.from([137, 80, 78, 71, 1, 2, 3, 4]); // the rendered roster's bytes
const SENT = [{ to: 'telegram', status: 'sent' }];

let cronRows; // cron_health rows by cron_name; { error } or { throws } fails a read of that row
let cronFaults; // { upsert } / { update }: fail those cron_health writes
let upload;
let bucket;
function fakeSupabase() {
  const cronHealth = fakeCronHealth(cronRows, { faults: cronFaults });
  return {
    from: (table) => {
      if (table === 'cron_health') return cronHealth();
      throw new Error(`notify read an unexpected table: ${table}`);
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

/** The on-time trigger: Vercel's cron, with CRON_SECRET in the Authorization header and no token. */
function onTime(query = {}, { headers = { host: 'qb.example.com' } } = {}) {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: 'GET', query, headers: { ...headers, authorization: `Bearer ${CRON}` } }, res).then(() => res);
}

const healthWrites = (name) => writeCronHealth.mock.calls.filter(c => c[1] === name);
// fetch also carries the test logger's /api/log posts; only the roster render counts here.
const imageFetches = () => globalThis.fetch.mock.calls.map(c => String(c[0])).filter(u => u.includes('/api/roster-image'));
const sentImageUrl = () => imageFetches()[0];

beforeEach(() => {
  vi.clearAllMocks();
  cronRows = {};
  cronFaults = {};
  upload = vi.fn(async () => ({ error: null }));
  bucket = null;
  writeCronHealth.mockImplementation(async () => {});
  recordMessageLog.mockImplementation(async () => {});
  process.env.INTERNAL_API_TOKEN = TOKEN;
  process.env.CRON_SECRET = CRON;
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
    delete process.env.INTERNAL_API_TOKEN;
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

  it('a missing window is rejected (only the on-time trigger defaults to 4am)', async () => {
    const res = await call({});
    expect(res.code).toBe(400);
    expect(res.body).toStrictEqual({ error: 'Invalid window: "". Must be one of: 4am, 7am, 8:30am, friday-pm' });
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
  it('a forced 4am sends even when the roster is unchanged since an earlier send today', async () => {
    sentEarlier(picture());
    const res = await call({ window: '4am', force: '1' });
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
    await onTime();
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
    await onTime();
    expect(imageFetches()).toHaveLength(1);
    expect([...sendRoster.mock.calls[0][0].png]).toEqual([...PNG]);
    expect([...upload.mock.calls[0][1]]).toEqual([...PNG]);
  });

  it('the image is stored before it is sent', async () => {
    const order = [];
    upload.mockImplementation(async () => { order.push('store'); return { error: null }; });
    sendRoster.mockImplementation(async () => { order.push('send'); return SENT; });
    await onTime();
    expect(order).toEqual(['store', 'send']);
  });

  it('staff numbers in NOTIFY_RECIPIENTS play no part: the send happens with or without them', async () => {
    process.env.NOTIFY_RECIPIENTS = '';
    const res = await onTime();
    expect(res.body.action).toBe('sent');
    expect(Object.keys(sendRoster.mock.calls[0][0]).sort()).toEqual(['caption', 'channel', 'png']);
  });

  it('the daytime schedule is refreshed live before the roster is built', async () => {
    const order = [];
    refreshDaytimeSchedule.mockImplementation(async () => { order.push('refresh'); return { refreshed: true, rowCount: 3 }; });
    getPictureOfDay.mockImplementation(async () => { order.push('picture'); return picture(); });
    await onTime();
    expect(order).toEqual(['refresh', 'picture']);
  });

  it('the roster is for the Pacific calendar day, not the UTC one', async () => {
    vi.setSystemTime(new Date('2026-10-20T03:00:00Z')); // Monday 20:00 PDT, already Tuesday in UTC
    await call({ window: '7am' });
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
    await onTime({}, { headers: { host: 'internal', 'x-forwarded-host': 'qb.example.com' } });
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
    await call({ window: '4am', force: '1' });
    expect(new URL(sentImageUrl()).searchParams.has('lastSnapshot')).toBe(false);
  });

  it("a 7am send carries no earlier roster from a previous day", async () => {
    sentEarlier(picture({ dogs: ['S9'] }), '2026-10-16');
    await call({ window: '7am' });
    expect(new URL(sentImageUrl()).searchParams.has('lastSnapshot')).toBe(false);
  });

  it('with no workers on the roster, nothing is sent (a blank image helps nobody)', async () => {
    getPictureOfDay.mockResolvedValue(picture({ workers: 0 }));
    const res = await onTime();
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
    await onTime();
    expect(bucket).toBe('roster-images');
    expect(upload.mock.calls[0][0]).toBe('notify-4am/2026-10-19T11-00-00.000Z.png');
    expect(upload.mock.calls[0][2]).toStrictEqual({ contentType: 'image/png', upsert: true });
    expect(recordMessageLog.mock.calls[0][5]).toBe('roster-images/notify-4am/2026-10-19T11-00-00.000Z.png');
  });

  it('when the image cannot be rendered, nothing is sent: 500 naming the HTTP status, failure recorded, hash not stored', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) }));
    const res = await onTime();
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Roster image fetch failed: HTTP 500' });
    expect(sendRoster).not.toHaveBeenCalled();
    expect(healthWrites('notify').map(w => w[2])).toEqual(['failure']);
  });

  it('when the image fetch throws, the error names no URL (the URL carries the token)', async () => {
    globalThis.fetch = vi.fn(async (url) => { throw new Error(`request to ${url} failed`); });
    const res = await onTime();
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Roster image fetch: network error' });
    expect(JSON.stringify(healthWrites('notify'))).not.toContain(TOKEN);
  });

  it('when the image upload fails, the roster is still sent and the log has no image path', async () => {
    upload.mockResolvedValue({ error: { message: 'bucket missing' } });
    const res = await onTime();
    expect(res.body.action).toBe('sent');
    expect(recordMessageLog.mock.calls[0][5]).toBeNull();
  });

  it('when the image upload throws, the log has no image path', async () => {
    upload.mockRejectedValue(new Error('network'));
    await onTime();
    expect(recordMessageLog.mock.calls[0][5]).toBeNull();
  });

  it('a failure to write the message log does not fail the send', async () => {
    recordMessageLog.mockRejectedValueOnce(new Error('y'));
    const res = await onTime();
    expect(res.code).toBe(200);
    expect(res.body.action).toBe('sent');
  });

  it('the response counts sent and failed recipients separately', async () => {
    sendRoster.mockResolvedValue([
      { to: 'a', status: 'sent' },
      { to: 'b', status: 'sent' },
      { to: 'c', status: 'failed', error: 'bad number' },
    ]);
    const res = await onTime();
    expect(res.body.ok).toBe(true);
    expect(res.body.sentCount).toBe(2);
    expect(res.body.failedCount).toBe(1);
  });

  it('a send that reached no recipient is a failure: 500, failure recorded, hash not stored (#255)', async () => {
    sendRoster.mockResolvedValue([
      { to: '***-0', status: 'failed', error: 'x' },
      { to: '***-1', status: 'failed', error: 'y' },
    ]);
    const res = await onTime();
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'No recipient received the roster (2 of 2 sends failed): x; y' });
    const writes = healthWrites('notify');
    expect(writes).toHaveLength(1);
    expect(writes[0].slice(2)).toStrictEqual(['failure', null, 'No recipient received the roster (2 of 2 sends failed): x; y', { keepResult: true }]);
  });

  it('when no one was reached, results without a reason are left out of the error', async () => {
    sendRoster.mockResolvedValue([{ to: 'a', status: 'failed' }, { to: 'b', status: 'failed', error: 'y' }]);
    const res = await onTime();
    expect(res.body).toStrictEqual({ error: 'No recipient received the roster (2 of 2 sends failed): y' });
  });

  it('when no one was reached and no reason was given, the error ends at the count', async () => {
    sendRoster.mockResolvedValue([{ to: 'telegram', status: 'failed' }]);
    const res = await onTime();
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
    await onTime();
    expect(recordMessageLog.mock.calls[0][1]).toEqual([{ to: 'telegram', status: 'failed', error: 'x' }]);
    expect(recordMessageLog.mock.calls[0][2]).toBe('notify-4am');
  });

  it('falls back to the anon key when the service role key is unset', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.VITE_SUPABASE_ANON_KEY = 'anon-key';
    const res = await onTime();
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
    await onTime();
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
    await onTime();
    const [[, job, text]] = alertAndLog.mock.calls;
    expect(job).toBe('notify-refresh-alert');
    expect(text).toBe('⚠️ Notify refresh issue (2026-10-19, 4am)\nsession expired');
  });

  it('the alert is recorded so later windows the same day stay quiet', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    await onTime();
    const [[, , status, result]] = healthWrites('notify-refresh-alert');
    expect(status).toBe('success');
    expect(result.alertDate).toBe(TODAY);
    expect(result.window).toBe('4am');
  });

  it('an alert that was not delivered is not recorded, so the next window tries again', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    alertAndLog.mockResolvedValue(false);
    await onTime();
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
    await onTime();
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('an undelivered refresh alert leaves the run green and the roster sent (ops-watch reports the failed alert row)', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    alertAndLog.mockResolvedValue(false);
    const res = await onTime();
    expect(res.code).toBe(200);
    expect(res.body.action).toBe('sent');
    expect(sendRoster).toHaveBeenCalledTimes(1);
  });

  it('a failing alert send does not stop the roster send', async () => {
    refreshDaytimeSchedule.mockResolvedValue({ refreshed: false, rowCount: 0, warning: 'session expired' });
    alertAndLog.mockRejectedValue(new Error('telegram down'));
    const res = await onTime();
    expect(res.body.action).toBe('sent');
  });

});

// ---------------------------------------------------------------------------
// REQ-401: failures are recorded
// ---------------------------------------------------------------------------

describe('REQ-401: failure recording', () => {
  it('an unexpected error returns 500 and records a notify failure with the message', async () => {
    getPictureOfDay.mockRejectedValue(new Error('roster query failed'));
    const res = await onTime();
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'roster query failed' });
    const [[, , status, result, msg]] = healthWrites('notify');
    expect(status).toBe('failure');
    expect(result).toBeNull();
    expect(msg).toBe('roster query failed');
  });

  it('the recorded failure message is cut to 500 characters', async () => {
    getPictureOfDay.mockRejectedValue(new Error('x'.repeat(600)));
    await onTime();
    expect(healthWrites('notify')[0][4]).toHaveLength(500);
  });

  it('missing Supabase settings fail the run with 500', async () => {
    delete process.env.VITE_SUPABASE_URL;
    const res = await onTime();
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

  it('an image fetch error names no URL in the 500 body or the notify-friday-pm failure (the URL carries the token)', async () => {
    globalThis.fetch = vi.fn(async (url) => { throw new Error(`request to ${url} failed`); });
    const res = await call({ window: 'friday-pm' });
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Roster image fetch: network error' });
    expect(JSON.stringify(healthWrites('notify-friday-pm'))).not.toContain(TOKEN);
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
    const res = await onTime();
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'ROSTER_CHANNEL is not set; expected one of: telegram' });
    expect(healthWrites('notify')[0].slice(2)).toStrictEqual(['failure', null, 'ROSTER_CHANNEL is not set; expected one of: telegram', { keepResult: true }]);
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
    const res = await call({ window: '7am' });
    expect(res.code).toBe(500);
    expect(res.body.error).toBe('ROSTER_CHANNEL is not set; expected one of: telegram');
  });
});

// ---------------------------------------------------------------------------
// REQ-658: the 4am roster on time (Vercel trigger, once a day, GitHub fallback)
// ---------------------------------------------------------------------------

const claimRow = () => cronRows[CLAIM_ROW];
const at = (iso) => vi.setSystemTime(new Date(iso));
const alerts = () => alertAndLog.mock.calls.filter((c) => c[1] === 'notify-4am-alert').map((c) => c[2]);

describe('REQ-658: who is the on-time trigger', () => {
  it('Bearer CRON_SECRET with no token and no window sends the 4am roster', async () => {
    const res = await onTime();
    expect(res.code).toBe(200);
    expect(res.body.action).toBe('sent');
    expect(sendRoster.mock.calls[0][0].caption).toBe('Roster 4am');
  });

  it('with CRON_SECRET unset, no Authorization header authorizes anything (fails closed)', async () => {
    delete process.env.CRON_SECRET;
    const res = await onTime();
    expect(res.code).toBe(401);
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('with CRON_SECRET unset, an empty bearer is not the trigger either', async () => {
    delete process.env.CRON_SECRET;
    const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ method: 'GET', query: {}, headers: { host: 'qb.example.com', authorization: 'Bearer ' } }, res);
    expect(res.code).toBe(401);
  });

  it('a wrong CRON_SECRET without the token is 401', async () => {
    process.env.CRON_SECRET = 'other-secret';
    const res = await onTime();
    expect(res.code).toBe(401);
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('a trigger=vercel param makes no call the trigger: a token call at 4am is still the fallback, too early', async () => {
    const res = await call({ window: '4am', trigger: 'vercel' });
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'before_fallback_hour', window: '4am' });
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it.each([
    [{ window: '7am' }],
    [{ window: 'friday-pm' }],
    [{ date: '2026-10-19' }],
    [{ force: '1' }],
  ])('the trigger sends only today\'s 4am roster: %o is 400 and nothing is read or sent', async (query) => {
    const res = await onTime(query);
    expect(res.code).toBe(400);
    expect(res.body).toStrictEqual({ error: 'The on-time trigger sends the 4am roster only, with no date or force' });
    expect(createClient).not.toHaveBeenCalled();
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('the trigger may name the 4am window explicitly', async () => {
    const res = await onTime({ window: '4am' });
    expect(res.body.action).toBe('sent');
  });
});

describe('REQ-658: the Pacific hour', () => {
  it('at 6:00 PDT the trigger skips without touching the database', async () => {
    at('2026-10-19T13:00:00Z');
    const res = await onTime();
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'outside_window', window: '4am' });
    expect(createClient).not.toHaveBeenCalled();
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('on a Saturday the trigger skips', async () => {
    at('2026-10-24T11:30:00Z');
    const res = await onTime();
    expect(res.body.reason).toBe('outside_window');
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('in standard time the 11:00 UTC call (3:30 PST) skips and the 12:00 UTC call (4:30 PST) sends', async () => {
    at('2026-11-02T11:30:00Z');
    expect((await onTime()).body.reason).toBe('outside_window');
    at('2026-11-02T12:30:00Z');
    const res = await onTime();
    expect(res.body.action).toBe('sent');
    expect(res.body.date).toBe('2026-11-02');
    expect(claimRow().result.date).toBe('2026-11-02');
  });

  it('in daylight time the 12:00 UTC call is a retry: after the 4am send it skips as already sent', async () => {
    await onTime();
    at('2026-10-19T12:10:00Z');
    const res = await onTime();
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'already_sent', window: '4am', date: TODAY });
    expect(sendRoster).toHaveBeenCalledTimes(1);
  });

  it('the fallback skips before 06:00 Pacific without touching the database', async () => {
    at('2026-10-19T12:59:00Z'); // 5:59 PDT
    const res = await call({ window: '4am' });
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'before_fallback_hour', window: '4am' });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('a manual date ignores the fallback hour and makes no claim', async () => {
    const res = await call({ window: '4am', date: '2026-10-19' });
    expect(res.body.action).toBe('sent');
    expect(claimRow()).toBeUndefined();
  });

  it('the 7am window makes no claim', async () => {
    await call({ window: '7am' });
    expect(claimRow()).toBeUndefined();
  });
});

describe('REQ-658: once per Pacific day', () => {
  it('two trigger calls at the same moment send once', async () => {
    const [a, b] = await Promise.all([onTime(), onTime()]);
    expect(sendRoster).toHaveBeenCalledTimes(1);
    expect([a.body.action, b.body.reason].sort()).toStrictEqual(['already_claimed', 'sent']);
  });

  it("a sent roster closes the day, recording the trigger; the trigger's own send alerts nobody", async () => {
    await onTime();
    expect(claimRow().status).toBe('success');
    expect(claimRow().result).toStrictEqual({ date: TODAY, trigger: 'vercel', outcome: 'sent', at: '2026-10-19T11:00:00.000Z' });
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('when any roster already went out today, the trigger skips quietly and makes no claim', async () => {
    sentEarlier(picture());
    const res = await onTime();
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'already_sent', window: '4am', date: TODAY });
    expect(sendRoster).not.toHaveBeenCalled();
    expect(alertAndLog).not.toHaveBeenCalled();
    expect(claimRow()).toBeUndefined();
  });

  it("yesterday's roster doesn't count as today's", async () => {
    sentEarlier(picture(), '2026-10-16');
    const res = await onTime();
    expect(res.body.action).toBe('sent');
  });

  it("yesterday's sent claim doesn't stop today's send", async () => {
    cronRows[CLAIM_ROW] = { status: 'success', result: { date: '2026-10-16', trigger: 'vercel', outcome: 'sent' }, updated_at: '2026-10-16T11:00:00Z' };
    const res = await onTime();
    expect(res.body.action).toBe('sent');
    expect(claimRow().result.date).toBe(TODAY);
  });

  it('a claim row with no result is claimed and sent, not a crash', async () => {
    cronRows[CLAIM_ROW] = { status: 'success', result: null, updated_at: '2026-10-16T11:00:00Z' };
    const res = await onTime();
    expect(res.body.action).toBe('sent');
  });

  it('the roster is for the claimed day, even if Pacific midnight passes during the claim', async () => {
    at('2026-10-19T06:59:59Z'); // Sun 2026-10-18 23:59:59 PDT: a very late GitHub fallback
    createClient.mockImplementation(() => {
      const real = fakeSupabase();
      return {
        ...real,
        from: (table) => {
          const q = real.from(table);
          const update = q.update;
          q.update = (patch) => { vi.setSystemTime(new Date('2026-10-19T07:00:01Z')); return update(patch); };
          return q;
        },
      };
    });
    await call({ window: '4am' });
    const date = getPictureOfDay.mock.calls[0][1];
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 10, 18]);
    expect(claimRow().result.date).toBe('2026-10-18');
  });

  it('the already-sent check comes before the channel check, the refresh and the build', async () => {
    cronRows[CLAIM_ROW] = { status: 'success', result: { date: TODAY, trigger: 'vercel', outcome: 'sent' }, updated_at: '2026-10-19T11:00:00Z' };
    delete process.env.ROSTER_CHANNEL;
    const res = await onTime();
    expect(res.code).toBe(200);
    expect(res.body.reason).toBe('already_sent');
    expect(refreshDaytimeSchedule).not.toHaveBeenCalled();
    expect(getPictureOfDay).not.toHaveBeenCalled();
  });

  it("a send in progress (claimed under 10 minutes ago) isn't repeated", async () => {
    cronRows[CLAIM_ROW] = { status: 'started', result: { date: TODAY, trigger: 'vercel' }, updated_at: '2026-10-19T10:58:00Z' };
    const res = await onTime();
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'already_claimed', window: '4am', date: TODAY });
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('a failed send leaves the day open with the error, and the next call sends', async () => {
    const working = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) }));
    const first = await onTime();
    expect(first.code).toBe(500);
    expect(claimRow().status).toBe('failure');
    expect(claimRow().result.outcome).toBe('failed');
    expect(claimRow().result.error).toBe('Roster image fetch failed: HTTP 502');
    globalThis.fetch = working;
    at('2026-10-19T12:05:00Z');
    const retry = await onTime();
    expect(retry.body.action).toBe('sent');
    expect(claimRow().status).toBe('success');
  });

  it('a send that reached nobody leaves the day open', async () => {
    sendRoster.mockResolvedValue([{ to: 'telegram', status: 'failed', error: 'chat not found' }]);
    await onTime();
    expect(claimRow().status).toBe('failure');
    expect(claimRow().result.error).toBe('No recipient received the roster (1 of 1 sends failed): chat not found');
  });

  it('a bad ROSTER_CHANNEL after the claim leaves the day open with that error', async () => {
    delete process.env.ROSTER_CHANNEL;
    const res = await onTime();
    expect(res.code).toBe(500);
    expect(claimRow().status).toBe('failure');
    expect(claimRow().result.outcome).toBe('failed');
    expect(claimRow().result.error).toBe('ROSTER_CHANNEL is not set; expected one of: telegram');
  });

  it('a claim error is recorded cut to 500 characters', async () => {
    cronFaults.update = { message: 'x'.repeat(600) };
    await onTime();
    expect(healthWrites('notify')[0][4]).toHaveLength(500);
  });

  it("a failed run's error on the claim is cut to 500 characters", async () => {
    getPictureOfDay.mockRejectedValue(new Error('y'.repeat(600)));
    await onTime();
    expect(claimRow().result.error).toBe('y'.repeat(500));
  });

  it("a claim that can't be made is a 500: nothing sent, notify failure recorded, baseline kept", async () => {
    cronFaults.update = { message: 'db timeout' };
    const res = await onTime();
    expect(res.code).toBe(500);
    expect(res.body).toStrictEqual({ error: 'Could not claim the 4am send: db timeout' });
    expect(healthWrites('notify')[0].slice(2)).toStrictEqual(['failure', null, 'Could not claim the 4am send: db timeout', { keepResult: true }]);
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('a failed run keeps the 7am baseline (the failure write keeps the stored result)', async () => {
    getPictureOfDay.mockRejectedValue(new Error('roster query failed'));
    await onTime();
    expect(healthWrites('notify')[0][5]).toStrictEqual({ keepResult: true });
  });
});

describe('REQ-658: no roster data at 4am', () => {
  beforeEach(() => getPictureOfDay.mockResolvedValue(picture({ workers: 0 })));

  it('nothing is sent, the day stays open, and Kate is alerted', async () => {
    const res = await onTime();
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'no_data' });
    expect(sendRoster).not.toHaveBeenCalled();
    expect(claimRow().status).toBe('failure');
    expect(claimRow().result.outcome).toBe('no_data');
    expect(claimRow().result.error).toBe('No roster data');
    expect(alerts()).toStrictEqual([
      "⚠️ No roster data for 2026-10-19 at 4:00 AM, so the 4am roster wasn't sent. Later calls will try again (the 5am retry, then the GitHub fallback after 6am).",
    ]);
  });

  it('the 5am retry that also finds no data does not alert again', async () => {
    await onTime();
    at('2026-10-19T12:00:00Z');
    await onTime();
    expect(alerts()).toHaveLength(1);
  });

  it('the fallback that finds the data sends late and says the on-time send found no data', async () => {
    await onTime();
    getPictureOfDay.mockResolvedValue(picture());
    at('2026-10-19T14:00:00Z'); // 7:00 PDT
    const res = await call({ window: '4am' });
    expect(res.body.action).toBe('sent');
    expect(alerts()[1]).toBe('⚠️ The 4am roster went out late, at 7:00 AM (GitHub fallback). The on-time send found no roster data.');
  });

  it('no data on an unclaimed window (7am) skips as before and alerts nobody', async () => {
    const res = await call({ window: '7am' });
    expect(res.code).toBe(200);
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'no_data' });
    expect(alertAndLog).not.toHaveBeenCalled();
  });
});

describe('REQ-658: the GitHub fallback', () => {
  beforeEach(() => at('2026-10-19T14:00:00Z')); // 7:00 PDT, the 14:00 UTC schedule

  it('sends when the on-time trigger never ran, records itself, and tells Kate why', async () => {
    const res = await call({ window: '4am' });
    expect(res.body.action).toBe('sent');
    expect(claimRow().result.trigger).toBe('github');
    expect(claimRow().status).toBe('success');
    expect(alerts()).toStrictEqual(['⚠️ The 4am roster went out late, at 7:00 AM (GitHub fallback). The on-time send never ran today.']);
  });

  it('names the error when the on-time send failed', async () => {
    cronRows[CLAIM_ROW] = { status: 'failure', result: { date: TODAY, trigger: 'vercel', outcome: 'failed', error: 'HTTP 502' }, updated_at: '2026-10-19T12:01:00Z' };
    await call({ window: '4am' });
    expect(alerts()).toStrictEqual(['⚠️ The 4am roster went out late, at 7:00 AM (GitHub fallback). The on-time send failed: HTTP 502.']);
  });

  it("takes over a send left started over 10 minutes ago and says it didn't finish", async () => {
    cronRows[CLAIM_ROW] = { status: 'started', result: { date: TODAY, trigger: 'vercel' }, updated_at: '2026-10-19T12:01:00Z' };
    const res = await call({ window: '4am' });
    expect(res.body.action).toBe('sent');
    expect(alerts()).toStrictEqual(["⚠️ The 4am roster went out late, at 7:00 AM (GitHub fallback). The on-time send started but didn't finish."]);
  });

  it('after an on-time send it does nothing and says nothing', async () => {
    cronRows[CLAIM_ROW] = { status: 'success', result: { date: TODAY, trigger: 'vercel', outcome: 'sent' }, updated_at: '2026-10-19T11:02:00Z' };
    const res = await call({ window: '4am' });
    expect(res.body).toStrictEqual({ ok: true, action: 'skipped', reason: 'already_sent', window: '4am', date: TODAY });
    expect(sendRoster).not.toHaveBeenCalled();
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('when a later window already sent and the on-time send never did, it re-sends nothing but tells Kate', async () => {
    sentEarlier(picture());
    const res = await call({ window: '4am' });
    expect(res.body.reason).toBe('already_sent');
    expect(sendRoster).not.toHaveBeenCalled();
    expect(alerts()).toStrictEqual([
      "⚠️ The 4am roster didn't go out on time on 2026-10-19: the on-time send never ran today. A later roster already went out, so nothing was re-sent.",
    ]);
  });

  it('an undelivered late alert does not fail the send', async () => {
    alertAndLog.mockResolvedValue(false);
    const res = await call({ window: '4am' });
    expect(res.code).toBe(200);
    expect(res.body.action).toBe('sent');
  });

  it('the alerts are logged as notify-4am-alert, never as notify-4am (which ops-watch counts as the roster)', async () => {
    await call({ window: '4am' });
    expect(alertAndLog.mock.calls.map((c) => c[1])).toStrictEqual(['notify-4am-alert']);
    expect(ALERT_JOB).toBe('notify-4am-alert');
  });
});

describe('REQ-658: force=1', () => {
  it('re-sends now, past the fallback hour and a sent claim, without touching the claim or alerting', async () => {
    const sent = { status: 'success', result: { date: TODAY, trigger: 'vercel', outcome: 'sent' }, updated_at: '2026-10-19T11:00:00Z' };
    cronRows[CLAIM_ROW] = { ...sent };
    const res = await call({ window: '4am', force: '1' });
    expect(res.body.action).toBe('sent');
    expect(claimRow()).toStrictEqual(sent);
    expect(alertAndLog).not.toHaveBeenCalled();
  });

  it('only "1" forces: force=true is an ordinary fallback call', async () => {
    const res = await call({ window: '4am', force: 'true' });
    expect(res.body.reason).toBe('before_fallback_hour');
  });
});
