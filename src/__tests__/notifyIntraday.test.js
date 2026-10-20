/**
 * Tests for notify-intraday.js — intraday boarding change notification.
 * @requirements REQ-J1, REQ-655
 *
 * Pure functions (computeIntradayDelta, hashDelta) are tested directly.
 * Handler tests inject a fake Supabase client and mock send/record calls
 * so no real DB or network access is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external clients before importing the module under test.
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
// The channel send is the boundary. intradayEnabled starts as the real rule; the send-path tests
// switch it on, because the only channel today (telegram) keeps intraday off until Twilio (#260).
vi.mock('../../src/lib/rosterChannel.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, sendRoster: vi.fn(), intradayEnabled: vi.fn(real.intradayEnabled) };
});
vi.mock('../../src/lib/messageDeliveryStatus.js', () => ({
  recordMessageLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/lib/pictureOfDay.js', () => ({
  queryBoarders: vi.fn(),
}));
vi.mock('../../api/_cronHealth.js', () => ({
  writeCronHealth: vi.fn().mockResolvedValue(undefined),
}));

const PNG = Uint8Array.from([137, 80, 78, 71, 9, 9]); // the rendered intraday image's bytes

import {
  computeIntradayDelta,
  hashDelta,
  default as handler,
} from '../../api/notify-intraday.js';
import { sendRoster, intradayEnabled } from '../../src/lib/rosterChannel.js';
import { writeCronHealth } from '../../api/_cronHealth.js';
import { recordMessageLog } from '../../src/lib/messageDeliveryStatus.js';
import { queryBoarders } from '../../src/lib/pictureOfDay.js';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function boarder(name, arrival = '2026-04-29T07:00:00Z', departure = '2026-05-02T10:00:00Z') {
  return { name, arrival_datetime: arrival, departure_datetime: departure };
}

// Compute today's Pacific date dynamically — matches the handler's own Intl logic.
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

// Minimal supabase mock — returns cron_health rows by cron_name.
function buildSupaMock({ snapshotResult = null, intradayResult = null } = {}) {
  const storage = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
    }),
  };

  return {
    storage,
    from: vi.fn((table) => {
      if (table !== 'cron_health') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };

      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((col, val) => {
          if (col === 'cron_name' && val === 'boarders-snapshot') {
            chain._result = snapshotResult;
          } else if (col === 'cron_name' && val === 'notify-intraday') {
            chain._result = intradayResult;
          }
          return chain;
        }),
        maybeSingle: vi.fn(async () => ({
          data: chain._result ? { result: chain._result } : null,
          error: null,
        })),
        _result: null,
      };
      return chain;
    }),
  };
}

function buildReq(token = 'test-token') {
  return {
    method: 'GET',
    query: { token },
    headers: { host: 'localhost:3000' },
  };
}

function buildRes() {
  const res = {
    _status: null,
    _body: null,
    status: vi.fn((code) => { res._status = code; return res; }),
    json: vi.fn((body) => { res._body = body; return res; }),
  };
  return res;
}

// ---------------------------------------------------------------------------
// computeIntradayDelta — pure function unit tests
// ---------------------------------------------------------------------------

describe('computeIntradayDelta', () => {
  it('dog in current but not snapshot → added', () => {
    const snapshot = [boarder('Nutmeg')];
    const current = [boarder('Nutmeg'), boarder('Cinder')];
    const { added, cancelled } = computeIntradayDelta(snapshot, current);
    expect(added.map(b => b.name)).toEqual(['Cinder']);
    expect(cancelled).toHaveLength(0);
  });

  it('dog in snapshot but not current → cancelled', () => {
    const snapshot = [boarder('Nutmeg'), boarder('Waffles')];
    const current = [boarder('Nutmeg')];
    const { added, cancelled } = computeIntradayDelta(snapshot, current);
    expect(added).toHaveLength(0);
    expect(cancelled.map(b => b.name)).toEqual(['Waffles']);
  });

  it('dog in both → neither added nor cancelled', () => {
    const snapshot = [boarder('Nutmeg')];
    const current = [boarder('Nutmeg')];
    const { added, cancelled } = computeIntradayDelta(snapshot, current);
    expect(added).toHaveLength(0);
    expect(cancelled).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// hashDelta
// ---------------------------------------------------------------------------

describe('hashDelta', () => {
  it('returns the same hash for identical deltas', () => {
    const added = [boarder('Cinder')];
    const cancelled = [boarder('Waffles')];
    expect(hashDelta(added, cancelled)).toBe(hashDelta(added, cancelled));
  });

  it('returns the same hash regardless of order (sorted by name)', () => {
    const a1 = [boarder('Zoe'), boarder('Apple')];
    const a2 = [boarder('Apple'), boarder('Zoe')];
    expect(hashDelta(a1, [])).toBe(hashDelta(a2, []));
  });

  it('returns a different hash for different deltas', () => {
    expect(hashDelta([boarder('Nutmeg')], [])).not.toBe(hashDelta([boarder('Cinder')], []));
  });
});

// ---------------------------------------------------------------------------
// Handler — skip scenarios
// ---------------------------------------------------------------------------

describe('notify-intraday handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INTERNAL_API_TOKEN = 'test-token';
    process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
    process.env.ROSTER_CHANNEL = 'telegram';
    intradayEnabled.mockReturnValue(true);
    sendRoster.mockResolvedValue([{ to: 'telegram', status: 'sent' }]);
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => PNG.buffer.slice(0) }));
  });

  const addedSinceSnapshot = () => {
    const supa = buildSupaMock({
      snapshotResult: { snapshotDate: TODAY, boarders: [boarder('Nutmeg')], capturedAt: '2026-04-30T15:30:00Z' },
      intradayResult: null,
    });
    createClient.mockReturnValue(supa);
    queryBoarders.mockResolvedValue([boarder('Nutmeg'), boarder('Cinder')]);
    return supa;
  };
  const intradayWrites = () => writeCronHealth.mock.calls.filter(c => c[1] === 'notify-intraday');

  it('is off while the channel is telegram (Kate only): skipped before reading anything, nothing sent', async () => {
    intradayEnabled.mockImplementation((ch) => ch !== 'telegram'); // the real rule
    const supa = addedSinceSnapshot();
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res._status).toBe(200);
    expect(res._body).toStrictEqual({ ok: true, action: 'skipped', reason: 'channel_telegram' });
    expect(supa.from).not.toHaveBeenCalled();
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('an unset ROSTER_CHANNEL fails the run: 500 naming it, notify-intraday failure recorded', async () => {
    delete process.env.ROSTER_CHANNEL;
    addedSinceSnapshot();
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res._status).toBe(500);
    expect(res._body).toStrictEqual({ error: 'ROSTER_CHANNEL is not set; expected one of: telegram' });
    expect(intradayWrites()[0].slice(2)).toStrictEqual(['failure', null, 'ROSTER_CHANNEL is not set; expected one of: telegram']);
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('the image is rendered once; the stored bytes are the sent bytes, captioned as an update', async () => {
    const supa = addedSinceSnapshot();
    await handler(buildReq(), buildRes());
    const [[{ channel, caption, png }]] = sendRoster.mock.calls;
    expect(channel).toBe('telegram');
    expect(caption).toBe('Roster update');
    expect([...png]).toEqual([...PNG]);
    const upload = supa.storage.from.mock.results[0].value.upload;
    expect([...upload.mock.calls[0][1]]).toEqual([...PNG]);
  });

  it('a send that reached no one fails the run and stores no hash, so the next hour sends again', async () => {
    addedSinceSnapshot();
    sendRoster.mockResolvedValue([{ to: 'telegram', status: 'failed', error: 'Telegram sendPhoto 429: Too Many Requests' }]);
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res._status).toBe(500);
    expect(res._body).toStrictEqual({ error: 'No recipient received the roster update: Telegram sendPhoto 429: Too Many Requests' });
    expect(intradayWrites().map(c => c[2])).toEqual(['failure']);
  });

  it('the image is stored in roster-images under notify-intraday and its path goes in the message log', async () => {
    const supa = addedSinceSnapshot();
    await handler(buildReq(), buildRes());
    expect(supa.storage.from).toHaveBeenCalledWith('roster-images');
    const upload = supa.storage.from.mock.results[0].value.upload;
    const [path, , options] = upload.mock.calls[0];
    expect(path).toMatch(/^notify-intraday\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z\.png$/);
    expect(options).toStrictEqual({ contentType: 'image/png', upsert: true });
    const [[, results, job, type, content, imagePath]] = recordMessageLog.mock.calls;
    expect([results, job, type, content]).toEqual([[{ to: 'telegram', status: 'sent' }], 'notify-intraday', 'image', null]);
    expect(imagePath).toBe(`roster-images/${path}`);
  });

  it('when the upload fails, the update is still sent and the log has no image path', async () => {
    const supa = addedSinceSnapshot();
    supa.storage.from.mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: { message: 'bucket missing' } }) });
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res._body.action).toBe('sent');
    expect(recordMessageLog.mock.calls[0][5]).toBeNull();
  });

  it('a send that reached one of several recipients counts as sent', async () => {
    addedSinceSnapshot();
    sendRoster.mockResolvedValue([{ to: 'a', status: 'failed', error: 'x' }, { to: 'b', status: 'sent' }]);
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ action: 'sent', sentCount: 1, failedCount: 1 });
  });

  it('when no one was reached, every reason is listed and results without one are left out', async () => {
    addedSinceSnapshot();
    sendRoster.mockResolvedValue([{ to: 'a', status: 'failed', error: 'x' }, { to: 'b', status: 'failed' }, { to: 'c', status: 'failed', error: 'y' }]);
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res._body).toStrictEqual({ error: 'No recipient received the roster update: x; y' });
  });

  it('when no one was reached and no reason was given, the error says just that', async () => {
    addedSinceSnapshot();
    sendRoster.mockResolvedValue([{ to: 'a', status: 'failed' }]);
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res._body).toStrictEqual({ error: 'No recipient received the roster update' });
  });

  it('a successful send stores the delta hash for the next hour', async () => {
    addedSinceSnapshot();
    await handler(buildReq(), buildRes());
    const [[, , status, result]] = intradayWrites();
    expect(status).toBe('success');
    expect(result.lastDeltaHash).toBe(hashDelta([boarder('Cinder')], []));
  });

  it('an image that cannot be rendered fails the run without sending', async () => {
    addedSinceSnapshot();
    global.fetch = vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }));
    const res = buildRes();
    await handler(buildReq(), res);
    expect(res._status).toBe(500);
    expect(res._body).toStrictEqual({ error: 'Roster image fetch failed: HTTP 404' });
    expect(sendRoster).not.toHaveBeenCalled();
  });

  it('skips with no_snapshot when no 8:30am snapshot for today', async () => {
    createClient.mockReturnValue(buildSupaMock({ snapshotResult: null }));
    queryBoarders.mockResolvedValue([boarder('Nutmeg')]);

    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'skipped', reason: 'no_snapshot' });
  });

  it('skips with no_change_since_830am when delta is empty', async () => {
    const snapshotResult = {
      snapshotDate: TODAY,
      boarders: [boarder('Nutmeg')],
      capturedAt: '2026-04-30T15:30:00Z',
    };
    createClient.mockReturnValue(buildSupaMock({ snapshotResult, intradayResult: null }));
    // Current boarders identical to snapshot → empty delta
    queryBoarders.mockResolvedValue([boarder('Nutmeg')]);

    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'skipped', reason: 'no_change_since_830am' });
  });

  it('skips with delta_unchanged when hash matches last intraday send', async () => {
    const snapshotResult = {
      snapshotDate: TODAY,
      boarders: [boarder('Nutmeg')],
      capturedAt: '2026-04-30T15:30:00Z',
    };
    // Cinder was added vs snapshot
    const currentBoarders = [boarder('Nutmeg'), boarder('Cinder')];
    // Compute the hash that would result from this delta
    const expectedHash = hashDelta([boarder('Cinder')], []);

    const intradayResult = {
      lastDeltaHash: expectedHash,
      lastDate: TODAY,
    };
    createClient.mockReturnValue(buildSupaMock({ snapshotResult, intradayResult }));
    queryBoarders.mockResolvedValue(currentBoarders);

    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'skipped', reason: 'delta_unchanged' });
  });

  it('sends when addition detected', async () => {
    const snapshotResult = {
      snapshotDate: TODAY,
      boarders: [boarder('Nutmeg')],
      capturedAt: '2026-04-30T15:30:00Z',
    };
    createClient.mockReturnValue(buildSupaMock({ snapshotResult, intradayResult: null }));
    // Cinder added since 8:30am
    queryBoarders.mockResolvedValue([boarder('Nutmeg'), boarder('Cinder')]);


    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'sent', addedCount: 1, cancelledCount: 0 });
    expect(sendRoster).toHaveBeenCalledOnce();
  });

  it('sends when cancellation detected', async () => {
    const snapshotResult = {
      snapshotDate: TODAY,
      boarders: [boarder('Nutmeg'), boarder('Waffles')],
      capturedAt: '2026-04-30T15:30:00Z',
    };
    createClient.mockReturnValue(buildSupaMock({ snapshotResult, intradayResult: null }));
    // Waffles cancelled since 8:30am
    queryBoarders.mockResolvedValue([boarder('Nutmeg')]);


    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'sent', addedCount: 0, cancelledCount: 1 });
    expect(sendRoster).toHaveBeenCalledOnce();
  });
});
