/**
 * The 4am roster on time: Pacific-hour gates, the once-a-day claim, and the alert wording.
 * @requirements REQ-658
 *
 * Expected values come from REQ-658's criteria, worked out by hand: PDT is UTC-7 until
 * Sun 2026-11-01, PST is UTC-8 after. Boundary faked: Supabase (fakeCronHealth, which applies the
 * PostgREST filters the claim uses, as checked against production).
 */
import { describe, it, expect, vi } from 'vitest';
import { fakeCronHealth } from './fakeCronHealth.js';
import {
  CLAIM_ROW, NEVER, pacificClock, onTimeWindowOpen, fallbackHourReached, readClaim, claimDay,
  finishClaim, missReason, noDataAlreadyReported, lateSendAlert, missedAlert, noDataAlert, isWeekday,
  rosterSentToday,
} from '../lib/rosterTrigger.js';

const at = (iso) => pacificClock(new Date(iso));

function db(rows = {}, opts = {}) {
  const from = fakeCronHealth(rows, opts);
  return { from: vi.fn(() => from()) };
}

describe('pacificClock', () => {
  it('reads the Pacific date, hour, weekday and time in daylight time (UTC-7)', () => {
    expect(at('2026-10-23T11:30:00Z')).toStrictEqual({ date: '2026-10-23', hour: 4, weekday: 'Fri', time: '4:30 AM' });
  });

  it('reads standard time (UTC-8) after the change', () => {
    expect(at('2026-11-02T12:05:00Z')).toStrictEqual({ date: '2026-11-02', hour: 4, weekday: 'Mon', time: '4:05 AM' });
  });

  it('before 07:00 UTC it is still the previous Pacific day', () => {
    expect(at('2026-10-23T06:59:00Z')).toStrictEqual({ date: '2026-10-22', hour: 23, weekday: 'Thu', time: '11:59 PM' });
  });

  it('Pacific midnight is hour 0, not 24', () => {
    expect(at('2026-10-23T07:00:00Z').hour).toBe(0);
  });

  it('single-digit months and days are zero-padded', () => {
    expect(at('2026-03-05T20:00:00Z').date).toBe('2026-03-05');
  });
});

describe('the on-time window: 04:00–05:59 Pacific, Monday to Friday', () => {
  it.each([
    ['2026-10-30T10:59:00Z', false, 'Fri 3:59 PDT'],
    ['2026-10-30T11:00:00Z', true, 'Fri 4:00 PDT (the 11:00 UTC cron)'],
    ['2026-10-30T12:59:00Z', true, 'Fri 5:59 PDT (the 12:00 UTC cron, a retry)'],
    ['2026-10-30T13:00:00Z', false, 'Fri 6:00 PDT'],
    ['2026-11-02T11:59:00Z', false, 'Mon 3:59 PST (the 11:00 UTC cron after the change)'],
    ['2026-11-02T12:00:00Z', true, 'Mon 4:00 PST (the 12:00 UTC cron)'],
    ['2026-11-02T13:59:00Z', true, 'Mon 5:59 PST (a late 12:00 UTC cron)'],
    ['2026-11-02T14:00:00Z', false, 'Mon 6:00 PST'],
    ['2026-10-31T11:30:00Z', false, 'Sat 4:30 PDT'],
    ['2026-11-01T12:30:00Z', false, 'Sun 4:30 PST (the day the clocks change)'],
    ['2026-10-26T11:30:00Z', true, 'Mon 4:30 PDT'],
    ['2026-10-27T11:30:00Z', true, 'Tue 4:30 PDT'],
    ['2026-10-28T11:30:00Z', true, 'Wed 4:30 PDT'],
    ['2026-10-29T11:30:00Z', true, 'Thu 4:30 PDT'],
  ])('%s is %s (%s)', (iso, open) => {
    expect(onTimeWindowOpen(at(iso))).toBe(open);
  });
});

describe('the fallback hour: 06:00 Pacific or later', () => {
  it.each([
    ['2026-10-30T12:59:00Z', false, 'PDT 5:59'],
    ['2026-10-30T13:00:00Z', true, 'PDT 6:00'],
    ['2026-10-30T14:00:00Z', true, 'PDT 7:00 (the 14:00 UTC schedule)'],
    ['2026-11-02T13:59:00Z', false, 'PST 5:59'],
    ['2026-11-02T14:00:00Z', true, 'PST 6:00 (the 14:00 UTC schedule)'],
    ['2026-10-30T22:00:00Z', true, 'PDT 15:00 (a late GitHub run)'],
  ])('%s is %s (%s)', (iso, reached) => {
    expect(fallbackHourReached(at(iso))).toBe(reached);
  });
});

describe('claimDay: once per Pacific day', () => {
  const NOW = new Date('2026-10-23T11:30:00Z');
  const claim = (supabase, over = {}) => claimDay(supabase, { date: '2026-10-23', trigger: 'vercel', now: NOW, ...over });

  it('the first claim ever creates the row and wins, recording the day and the trigger', async () => {
    const rows = {};
    expect(await claim(db(rows))).toBe(true);
    expect(rows[CLAIM_ROW].status).toBe('started');
    expect(rows[CLAIM_ROW].result).toStrictEqual({ date: '2026-10-23', trigger: 'vercel', claimedAt: NOW.toISOString() });
  });

  it('the claim lives on the cron_health row notify-4am-claim', () => {
    expect(CLAIM_ROW).toBe('notify-4am-claim');
  });

  it('the seed row is a finished claim dated 1970-01-01, so a date comparison never meets a NULL', async () => {
    const writes = [];
    await claim(db({}, { writes }));
    expect(NEVER).toBe('1970-01-01');
    expect(writes[0].payload).toStrictEqual({
      cron_name: 'notify-4am-claim', status: 'success', result: { date: '1970-01-01' },
      last_ran_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    });
    expect(writes[0].opts).toStrictEqual({ onConflict: 'cron_name', ignoreDuplicates: true });
  });

  it('an update that returns no rows at all (data null) is a lost claim', async () => {
    const chain = {
      upsert: () => Promise.resolve({ error: null }),
      update: () => chain, eq: () => chain, or: () => chain,
      select: () => Promise.resolve({ data: null, error: null }),
    };
    expect(await claim({ from: () => chain })).toBe(false);
  });

  it('a second claim for the same day loses', async () => {
    const supabase = db();
    expect(await claim(supabase)).toBe(true);
    expect(await claim(supabase, { trigger: 'github' })).toBe(false);
  });

  it('two claims at the same moment: exactly one wins', async () => {
    const supabase = db();
    const won = await Promise.all([claim(supabase), claim(supabase), claim(supabase, { trigger: 'github' })]);
    expect(won.filter(Boolean)).toHaveLength(1);
  });

  it("yesterday's finished claim doesn't block today", async () => {
    const rows = { [CLAIM_ROW]: { status: 'success', result: { date: '2026-10-22', outcome: 'sent' }, updated_at: '2026-10-22T11:05:00Z' } };
    expect(await claim(db(rows))).toBe(true);
  });

  it("today's sent claim blocks every later call, and the seed doesn't overwrite it", async () => {
    const rows = { [CLAIM_ROW]: { status: 'success', result: { date: '2026-10-23', outcome: 'sent' }, updated_at: '2026-10-23T11:05:00Z' } };
    expect(await claim(db(rows))).toBe(false);
    expect(rows[CLAIM_ROW].result.outcome).toBe('sent');
  });

  it("today's failed claim can be taken again (a later call retries)", async () => {
    const rows = { [CLAIM_ROW]: { status: 'failure', result: { date: '2026-10-23', outcome: 'failed' }, updated_at: '2026-10-23T11:29:00Z' } };
    expect(await claim(db(rows))).toBe(true);
  });

  it("a claim started under 10 minutes ago is someone else's send in progress", async () => {
    const rows = { [CLAIM_ROW]: { status: 'started', result: { date: '2026-10-23' }, updated_at: '2026-10-23T11:20:01Z' } };
    expect(await claim(db(rows))).toBe(false);
  });

  it('a claim exactly 10 minutes old is not yet taken over', async () => {
    const rows = { [CLAIM_ROW]: { status: 'started', result: { date: '2026-10-23' }, updated_at: '2026-10-23T11:20:00Z' } };
    expect(await claim(db(rows))).toBe(false);
  });

  it('a claim left started over 10 minutes ago (a crash) is taken over', async () => {
    const rows = { [CLAIM_ROW]: { status: 'started', result: { date: '2026-10-23' }, updated_at: '2026-10-23T11:19:59Z' } };
    expect(await claim(db(rows))).toBe(true);
  });

  it('a claim row with no date can be claimed', async () => {
    const rows = { [CLAIM_ROW]: { status: 'success', result: null, updated_at: '2026-10-23T11:29:00Z' } };
    expect(await claim(db(rows))).toBe(true);
  });

  it('only the claim row is claimed, never another cron_health row', async () => {
    const rows = { notify: { status: 'success', result: { lastDate: '2026-10-22' } } };
    await claim(db(rows));
    expect(rows.notify).toStrictEqual({ status: 'success', result: { lastDate: '2026-10-22' } });
  });

  it('a claim clears an old error message', async () => {
    const rows = { [CLAIM_ROW]: { status: 'failure', result: { date: '2026-10-22' }, error_msg: 'boom' } };
    await claim(db(rows));
    expect(rows[CLAIM_ROW].error_msg).toBeNull();
  });

  it('when the row cannot be created, the claim throws naming the reason', async () => {
    await expect(claim(db({}, { faults: { upsert: { message: 'db down' } } })))
      .rejects.toThrow('Could not create the 4am claim row: db down');
  });

  it('when the claim update fails, it throws naming the reason', async () => {
    await expect(claim(db({}, { faults: { update: { message: 'timeout' } } })))
      .rejects.toThrow('Could not claim the 4am send: timeout');
  });
});

describe('finishClaim', () => {
  const NOW = new Date('2026-10-23T11:31:00Z');
  const started = () => ({ [CLAIM_ROW]: { status: 'started', result: { date: '2026-10-23', trigger: 'vercel' } } });

  it('a sent roster closes the day: success, with the trigger and the time', async () => {
    const rows = started();
    await finishClaim(db(rows), { date: '2026-10-23', trigger: 'vercel', status: 'success', outcome: 'sent', now: NOW });
    expect(rows[CLAIM_ROW].status).toBe('success');
    expect(rows[CLAIM_ROW].result).toStrictEqual({ date: '2026-10-23', trigger: 'vercel', outcome: 'sent', at: NOW.toISOString() });
    expect(rows[CLAIM_ROW].error_msg).toBeNull();
  });

  it('a failure leaves the day open and records the error', async () => {
    const rows = started();
    await finishClaim(db(rows), { date: '2026-10-23', trigger: 'vercel', status: 'failure', outcome: 'failed', error: 'HTTP 500', now: NOW });
    expect(rows[CLAIM_ROW].status).toBe('failure');
    expect(rows[CLAIM_ROW].result.error).toBe('HTTP 500');
    expect(rows[CLAIM_ROW].error_msg).toBe('HTTP 500');
  });

  it("only today's claim is touched", async () => {
    const rows = { [CLAIM_ROW]: { status: 'started', result: { date: '2026-10-24' } } };
    await finishClaim(db(rows), { date: '2026-10-23', trigger: 'vercel', status: 'success', outcome: 'sent', now: NOW });
    expect(rows[CLAIM_ROW].status).toBe('started');
  });

  it('a failed write does not throw (the send already happened)', async () => {
    await expect(finishClaim(db(started(), { faults: { update: { message: 'db down' } } }),
      { date: '2026-10-23', trigger: 'vercel', status: 'success', outcome: 'sent', now: NOW })).resolves.toBeUndefined();
  });

  it('a write that throws does not throw either', async () => {
    const supabase = { from: () => { throw new Error('network'); } };
    await expect(finishClaim(supabase, { date: '2026-10-23', trigger: 'vercel', status: 'success', outcome: 'sent', now: NOW }))
      .resolves.toBeUndefined();
  });
});

describe('readClaim', () => {
  it('returns the claim row', async () => {
    const rows = { [CLAIM_ROW]: { status: 'failure', result: { date: '2026-10-23' }, updated_at: '2026-10-23T11:00:00Z' } };
    expect(await readClaim(db(rows))).toStrictEqual({ status: 'failure', result: { date: '2026-10-23' }, updated_at: '2026-10-23T11:00:00Z' });
  });

  it('no row yet reads as null', async () => {
    expect(await readClaim(db())).toBeNull();
  });

  it('a read error reads as unreadable, not as "no claim"', async () => {
    expect(await readClaim(db({ [CLAIM_ROW]: { error: { message: 'boom' } } }))).toStrictEqual({ unreadable: true });
  });

  it('a read that throws reads as unreadable', async () => {
    expect(await readClaim(db({ [CLAIM_ROW]: { throws: 'network' } }))).toStrictEqual({ unreadable: true });
  });
});

describe('why the on-time send did not go out', () => {
  const D = '2026-10-23';
  it.each([
    ['no claim row at all', null, 'never ran today'],
    ["only yesterday's claim", { status: 'success', result: { date: '2026-10-22' } }, 'never ran today'],
    ['a claim with no result', { status: 'success', result: null }, 'never ran today'],
    ["today's no-data claim", { status: 'failure', result: { date: D, outcome: 'no_data' } }, 'found no roster data'],
    ["today's failed claim", { status: 'failure', result: { date: D, outcome: 'failed', error: 'HTTP 500' } }, 'failed: HTTP 500'],
    ["today's failed claim without an error", { status: 'failure', result: { date: D, outcome: 'failed' } }, 'failed: no error recorded'],
    ["today's claim left started", { status: 'started', result: { date: D } }, "started but didn't finish"],
  ])('%s → %s', (_, prior, reason) => {
    expect(missReason(prior, D)).toBe(reason);
  });

  it('an unreadable claim says so instead of guessing', () => {
    expect(missReason({ unreadable: true }, D)).toBe("couldn't be checked (the claim row couldn't be read)");
  });

  it("today's sent claim has no miss", () => {
    expect(missReason({ status: 'success', result: { date: D, outcome: 'sent' } }, D)).toBeNull();
  });
});

describe('noDataAlreadyReported', () => {
  it("is true only for today's no-data outcome", () => {
    expect(noDataAlreadyReported({ status: 'failure', result: { date: '2026-10-23', outcome: 'no_data' } }, '2026-10-23')).toBe(true);
    expect(noDataAlreadyReported({ status: 'failure', result: { date: '2026-10-22', outcome: 'no_data' } }, '2026-10-23')).toBe(false);
    expect(noDataAlreadyReported({ status: 'failure', result: { date: '2026-10-23', outcome: 'failed' } }, '2026-10-23')).toBe(false);
    expect(noDataAlreadyReported(null, '2026-10-23')).toBe(false);
    expect(noDataAlreadyReported({ status: 'success', result: null }, '2026-10-23')).toBe(false);
  });
});

describe('alert wording', () => {
  const clock = at('2026-10-23T14:02:00Z'); // Fri 7:02 PDT

  it('a late send names the time and why the on-time send did not happen', () => {
    expect(lateSendAlert(clock, 'never ran today'))
      .toBe('⚠️ The 4am roster went out late, at 7:02 AM (GitHub fallback). The on-time send never ran today.');
  });

  it('a missed send that a later window covered says nothing was re-sent', () => {
    expect(missedAlert(clock, 'found no roster data'))
      .toBe("⚠️ The 4am roster didn't go out on time on 2026-10-23: the on-time send found no roster data. A later roster already went out, so nothing was re-sent.");
  });

  it('no data at 4am says later calls will try, up to the fallback (no 5am retry is promised: PST has none)', () => {
    expect(noDataAlert(at('2026-10-23T11:05:00Z'), 'vercel'))
      .toBe("⚠️ No roster data for 2026-10-23 at 4:05 AM, so the 4am roster wasn't sent. Later calls will try again, up to the GitHub fallback after 6am.");
  });

  it('no data on the fallback points to the 7am and 8:30am windows', () => {
    expect(noDataAlert(clock, 'github'))
      .toBe("⚠️ No roster data for 2026-10-23 at 7:02 AM, so the 4am roster wasn't sent. The 7am and 8:30am windows send it once the data is there.");
  });
});

describe('isWeekday', () => {
  it.each([
    ['2026-10-26T14:00:00Z', true, 'Mon'], ['2026-10-27T14:00:00Z', true, 'Tue'], ['2026-10-28T14:00:00Z', true, 'Wed'],
    ['2026-10-29T14:00:00Z', true, 'Thu'], ['2026-10-30T14:00:00Z', true, 'Fri'],
    ['2026-10-31T14:00:00Z', false, 'Sat'], ['2026-11-01T14:00:00Z', false, 'Sun'],
  ])('%s is %s (%s, Pacific)', (iso, weekday) => {
    expect(isWeekday(at(iso))).toBe(weekday);
  });

  it('uses the Pacific day: Friday 18:00 PDT is Saturday in UTC but still a weekday', () => {
    expect(isWeekday(at('2026-10-31T01:00:00Z'))).toBe(true);
  });
});

describe('rosterSentToday', () => {
  const clock = at('2026-10-23T14:00:00Z'); // Fri 7:00 PDT

  it("a send for today, made today, counts", () => {
    expect(rosterSentToday({ lastDate: '2026-10-23', sentAt: '2026-10-23T11:02:00Z' }, clock)).toBe(true);
  });

  it("a send for today made the evening before (a date= preview) doesn't count", () => {
    expect(rosterSentToday({ lastDate: '2026-10-23', sentAt: '2026-10-23T03:00:00Z' }, clock)).toBe(false); // Thu 20:00 PDT
  });

  it("a send made just after Pacific midnight counts", () => {
    expect(rosterSentToday({ lastDate: '2026-10-23', sentAt: '2026-10-23T07:00:00Z' }, clock)).toBe(true);
  });

  it("yesterday's send doesn't count", () => {
    expect(rosterSentToday({ lastDate: '2026-10-22', sentAt: '2026-10-22T11:02:00Z' }, clock)).toBe(false);
  });

  it("a send with no time recorded doesn't count", () => {
    expect(rosterSentToday({ lastDate: '2026-10-23', sentAt: null }, clock)).toBe(false);
  });

  it('no stored send at all is not sent today', () => {
    expect(rosterSentToday(null, clock)).toBe(false);
  });
});
