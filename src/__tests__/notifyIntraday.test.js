/**
 * Tests for notify-intraday.js — intraday boarding change notification.
 * @requirements REQ-J1
 *
 * Pure functions (computeIntradayDelta, hashDelta) are tested directly.
 * Handler tests inject a fake Supabase client and mock send/record calls
 * so no real DB or network access is needed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external clients before importing the module under test.
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));
vi.mock('../../src/lib/notifyWhatsApp.js', () => ({
  sendRosterImage: vi.fn(),
  getRecipients: vi.fn(),
}));
vi.mock('../../src/lib/messageDeliveryStatus.js', () => ({
  recordSentMessages: vi.fn().mockResolvedValue(undefined),
  recordMessageLog: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../src/lib/pictureOfDay.js', () => ({
  queryBoarders: vi.fn(),
}));
vi.mock('../../api/_cronHealth.js', () => ({
  writeCronHealth: vi.fn().mockResolvedValue(undefined),
}));

// Mock the global fetch used by the image store path
global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });

import {
  computeIntradayDelta,
  hashDelta,
  default as handler,
} from '../../api/notify-intraday.js';
import { sendRosterImage, getRecipients } from '../../src/lib/notifyWhatsApp.js';
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
    const snapshot = [boarder('Mochi')];
    const current = [boarder('Mochi'), boarder('Bronwyn')];
    const { added, cancelled } = computeIntradayDelta(snapshot, current);
    expect(added.map(b => b.name)).toEqual(['Bronwyn']);
    expect(cancelled).toHaveLength(0);
  });

  it('dog in snapshot but not current → cancelled', () => {
    const snapshot = [boarder('Mochi'), boarder('Tula')];
    const current = [boarder('Mochi')];
    const { added, cancelled } = computeIntradayDelta(snapshot, current);
    expect(added).toHaveLength(0);
    expect(cancelled.map(b => b.name)).toEqual(['Tula']);
  });

  it('dog in both → neither added nor cancelled', () => {
    const snapshot = [boarder('Mochi')];
    const current = [boarder('Mochi')];
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
    const added = [boarder('Bronwyn')];
    const cancelled = [boarder('Tula')];
    expect(hashDelta(added, cancelled)).toBe(hashDelta(added, cancelled));
  });

  it('returns the same hash regardless of order (sorted by name)', () => {
    const a1 = [boarder('Zoe'), boarder('Apple')];
    const a2 = [boarder('Apple'), boarder('Zoe')];
    expect(hashDelta(a1, [])).toBe(hashDelta(a2, []));
  });

  it('returns a different hash for different deltas', () => {
    expect(hashDelta([boarder('Mochi')], [])).not.toBe(hashDelta([boarder('Bronwyn')], []));
  });
});

// ---------------------------------------------------------------------------
// Handler — skip scenarios
// ---------------------------------------------------------------------------

describe('notify-intraday handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_SYNC_PROXY_TOKEN = 'test-token';
    process.env.VITE_SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
  });

  it('skips with no_snapshot when no 8:30am snapshot for today', async () => {
    createClient.mockReturnValue(buildSupaMock({ snapshotResult: null }));
    queryBoarders.mockResolvedValue([boarder('Mochi')]);
    getRecipients.mockReturnValue(['+18312477375']);

    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'skipped', reason: 'no_snapshot' });
  });

  it('skips with no_change_since_830am when delta is empty', async () => {
    const snapshotResult = {
      snapshotDate: TODAY,
      boarders: [boarder('Mochi')],
      capturedAt: '2026-04-30T15:30:00Z',
    };
    createClient.mockReturnValue(buildSupaMock({ snapshotResult, intradayResult: null }));
    // Current boarders identical to snapshot → empty delta
    queryBoarders.mockResolvedValue([boarder('Mochi')]);
    getRecipients.mockReturnValue(['+18312477375']);

    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'skipped', reason: 'no_change_since_830am' });
  });

  it('skips with delta_unchanged when hash matches last intraday send', async () => {
    const snapshotResult = {
      snapshotDate: TODAY,
      boarders: [boarder('Mochi')],
      capturedAt: '2026-04-30T15:30:00Z',
    };
    // Bronwyn was added vs snapshot
    const currentBoarders = [boarder('Mochi'), boarder('Bronwyn')];
    // Compute the hash that would result from this delta
    const expectedHash = hashDelta([boarder('Bronwyn')], []);

    const intradayResult = {
      lastDeltaHash: expectedHash,
      lastDate: TODAY,
    };
    createClient.mockReturnValue(buildSupaMock({ snapshotResult, intradayResult }));
    queryBoarders.mockResolvedValue(currentBoarders);
    getRecipients.mockReturnValue(['+18312477375']);

    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'skipped', reason: 'delta_unchanged' });
  });

  it('sends when addition detected', async () => {
    const snapshotResult = {
      snapshotDate: TODAY,
      boarders: [boarder('Mochi')],
      capturedAt: '2026-04-30T15:30:00Z',
    };
    createClient.mockReturnValue(buildSupaMock({ snapshotResult, intradayResult: null }));
    // Bronwyn added since 8:30am
    queryBoarders.mockResolvedValue([boarder('Mochi'), boarder('Bronwyn')]);
    getRecipients.mockReturnValue(['+18312477375']);
    sendRosterImage.mockResolvedValue([{ to: '+18312477375', status: 'sent', messageId: 'wamid.abc' }]);

    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'sent', addedCount: 1, cancelledCount: 0 });
    expect(sendRosterImage).toHaveBeenCalledOnce();
  });

  it('sends when cancellation detected', async () => {
    const snapshotResult = {
      snapshotDate: TODAY,
      boarders: [boarder('Mochi'), boarder('Tula')],
      capturedAt: '2026-04-30T15:30:00Z',
    };
    createClient.mockReturnValue(buildSupaMock({ snapshotResult, intradayResult: null }));
    // Tula cancelled since 8:30am
    queryBoarders.mockResolvedValue([boarder('Mochi')]);
    getRecipients.mockReturnValue(['+18312477375']);
    sendRosterImage.mockResolvedValue([{ to: '+18312477375', status: 'sent', messageId: 'wamid.def' }]);

    const req = buildReq();
    const res = buildRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({ ok: true, action: 'sent', addedCount: 0, cancelledCount: 1 });
    expect(sendRosterImage).toHaveBeenCalledOnce();
  });
});
