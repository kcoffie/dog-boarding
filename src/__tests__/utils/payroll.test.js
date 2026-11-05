import { describe, it, expect } from 'vitest';
import { toCents, paidNightOwners, buildOutstanding } from '../../utils/payroll';

/**
 * #370: money in whole cents per night, a night paid once. Expected values worked out by hand.
 * @requirements REQ-041
 */
describe('REQ-041: payroll money rules (#370)', () => {
  describe('toCents rounds as the amount is shown', () => {
    it('rounds a half cent up', () => {
      expect(toCents(27.625)).toBe(2763);
      expect(toCents(8.125)).toBe(813);
    });

    it('agrees with the displayed amount where Math.round(x * 100) does not', () => {
      // 0.145 * 100 is 14.499999999999998 in binary; the page shows $0.15.
      expect(Math.round(0.145 * 100)).toBe(14);
      expect(toCents(0.145)).toBe(15);
      expect(toCents(1.005)).toBe(101);
    });

    it('absorbs float noise from a net calculation', () => {
      expect(toCents(139.74999999999997)).toBe(13975);
      expect(toCents(178.75)).toBe(17875);
    });

    it('keeps the sign and treats a non-number as zero', () => {
      expect(toCents(-0.145)).toBe(-15);
      expect(toCents(0)).toBe(0);
      expect(toCents(NaN)).toBe(0);
      expect(toCents(Infinity)).toBe(0);
    });

    it('returns a whole number of cents', () => {
      for (const x of [0.1 + 0.2, 33.333, 1234.565, 99.995]) {
        expect(Number.isInteger(toCents(x))).toBe(true);
      }
    });
  });

  describe('paidNightOwners', () => {
    it('maps each night to whoever was paid, across every payment', () => {
      expect(paidNightOwners([
        { employeeName: 'Kate', dates: ['2026-10-16', '2026-10-17'] },
        { employeeName: 'Nick', dates: ['2026-10-18'] },
      ])).toEqual({ '2026-10-16': 'Kate', '2026-10-17': 'Kate', '2026-10-18': 'Nick' });
    });

    it('keeps a night paid to a removed employee as paid', () => {
      expect(paidNightOwners([{ employeeName: undefined, dates: ['2026-10-16'] }]))
        .toEqual({ '2026-10-16': '' });
    });

    it('copes with no payments or a payment with no dates', () => {
      expect(paidNightOwners(undefined)).toEqual({});
      expect(paidNightOwners([{ employeeName: 'Kate' }])).toEqual({});
    });
  });

  describe('buildOutstanding', () => {
    const FRI = '2026-10-16';
    const SAT = '2026-10-17';
    const SUN = '2026-10-18';
    const base = {
      dates: [FRI, SAT, SUN],
      assigneeFor: () => 'Kate',
      nightNet: (d) => ({ [FRI]: 139.75, [SAT]: 178.75, [SUN]: 42.5 * 0.65 })[d],
      daytimeNet: (d) => (d === SUN ? 12.5 * 0.65 : 0),
      payments: [],
    };

    it('rounds night pay and daytime credit separately, then adds (Q2)', () => {
      const { outstanding } = buildOutstanding({ ...base, dates: [SUN] });
      // $27.625 → $27.63, $8.125 → $8.13: $35.76 (rounded together it would be $35.75)
      expect(outstanding.Kate.nightCents).toEqual({ [SUN]: 3576 });
      expect(outstanding.Kate.daytimeCents).toBe(813);
      expect(outstanding.Kate.amount).toBe(35.76);
      expect(outstanding.Kate.daytimeAmount).toBe(8.13);
    });

    it('the total is the sum of the nights in cents', () => {
      const { outstanding } = buildOutstanding(base);
      expect(outstanding.Kate.amountCents).toBe(13975 + 17875 + 3576);
      expect(outstanding.Kate.amount).toBe(354.26);
      expect(outstanding.Kate.nights).toBe(3);
      expect(outstanding.Kate.dates).toEqual([FRI, SAT, SUN]);
    });

    it('leaves out a night paid to the same person, with no notice', () => {
      const { outstanding, notices } = buildOutstanding({
        ...base,
        payments: [{ employeeName: 'Kate', dates: [FRI] }],
      });
      expect(outstanding.Kate.dates).toEqual([SAT, SUN]);
      expect(notices).toEqual([]);
    });

    it('leaves out a night paid to someone else and reports it (Q1)', () => {
      const { outstanding, notices } = buildOutstanding({
        ...base,
        assigneeFor: (d) => (d === FRI ? 'Nick' : 'Kate'),
        payments: [{ employeeName: 'Kate', dates: [FRI] }],
      });
      expect(outstanding.Nick).toBeUndefined();
      expect(outstanding.Kate.dates).toEqual([SAT, SUN]);
      expect(notices).toEqual([{ night: FRI, assignedTo: 'Nick', paidTo: 'Kate' }]);
    });

    it('a night paid to a removed employee stays paid', () => {
      const { outstanding, notices } = buildOutstanding({
        ...base,
        dates: [FRI],
        payments: [{ employeeName: '', dates: [FRI] }],
      });
      expect(outstanding).toEqual({});
      expect(notices).toEqual([{ night: FRI, assignedTo: 'Kate', paidTo: '' }]);
    });

    it('skips nights with no one assigned or N/A', () => {
      const { outstanding } = buildOutstanding({
        ...base,
        assigneeFor: (d) => ({ [FRI]: '', [SAT]: 'N/A', [SUN]: 'Kate' })[d],
      });
      expect(Object.keys(outstanding)).toEqual(['Kate']);
      expect(outstanding.Kate.dates).toEqual([SUN]);
    });

    it('keeps each employee separate', () => {
      const { outstanding } = buildOutstanding({
        ...base,
        assigneeFor: (d) => (d === SAT ? 'Nick' : 'Kate'),
      });
      expect(outstanding.Kate.amountCents).toBe(13975 + 3576);
      expect(outstanding.Nick.amountCents).toBe(17875);
    });
  });
});
