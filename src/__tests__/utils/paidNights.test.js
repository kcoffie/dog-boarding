import { describe, it, expect } from 'vitest';
import {
  paidNightsByDate,
  employeeHasPayments,
  nightWriteMessage,
  paymentSaveMessage,
  employeeDeleteMessage,
  NIGHT_PAID_MESSAGE,
  NIGHT_TAKEN_MESSAGE,
  NIGHT_CHANGED_MESSAGE,
  EMPLOYEE_HAS_PAYMENTS_MESSAGE,
  formatSfMoment,
  deletedLine,
} from '../../utils/paidNights';
import { buildOutstanding } from '../../utils/payroll';

/**
 * #389: paid nights are locked, deleted payments are history. Expected values from the issue's rules.
 * @requirements REQ-041, REQ-042, REQ-051
 */
describe('REQ-041, REQ-042, REQ-051: paid nights (#389)', () => {
  const live = [
    { id: 'p1', employeeId: 'e1', employeeName: 'Avery', dates: ['2026-11-02', '2026-11-03'], paidDate: '2026-11-06' },
  ];
  const deleted = [
    { id: 'p2', employeeId: 'e2', employeeName: 'Blake', dates: ['2026-11-04'], paidDate: '2026-11-06', deletedAt: '2026-11-07T01:00:00Z' },
  ];

  describe('which nights are paid', () => {
    it('each night of a live payment is paid, to that person, on that date', () => {
      expect(paidNightsByDate(live)).toEqual({
        '2026-11-02': { employeeName: 'Avery', paidDate: '2026-11-06' },
        '2026-11-03': { employeeName: 'Avery', paidDate: '2026-11-06' },
      });
    });

    it('a deleted payment\'s nights are not paid, even if it is passed in by mistake', () => {
      expect(paidNightsByDate([...live, ...deleted])['2026-11-04']).toBeUndefined();
    });

    it('no payments, no paid nights', () => {
      expect(paidNightsByDate([])).toEqual({});
      expect(paidNightsByDate(undefined)).toEqual({});
    });

    it('a payment with no dates pays no night', () => {
      expect(paidNightsByDate([{ id: 'p9', employeeName: 'Avery', paidDate: '2026-11-06' }])).toEqual({});
    });

    it('a night paid to a removed employee is still paid, with no name', () => {
      expect(paidNightsByDate([{ dates: ['2026-11-05'], employeeName: undefined, paidDate: '2026-11-06' }]))
        .toEqual({ '2026-11-05': { employeeName: '', paidDate: '2026-11-06' } });
    });
  });

  describe('an employee with any payment, live or deleted, can only be deactivated (Q1)', () => {
    it('a live payment counts', () => {
      expect(employeeHasPayments('e1', live, deleted)).toBe(true);
    });

    it('a deleted payment alone counts', () => {
      expect(employeeHasPayments('e2', live, deleted)).toBe(true);
    });

    it('no payments: can be deleted', () => {
      expect(employeeHasPayments('e3', live, deleted)).toBe(false);
    });

    it('an unknown employee has no payments', () => {
      expect(employeeHasPayments(undefined, live, deleted)).toBe(false);
    });

    it('an unknown employee is not matched to a payment whose employee is gone', () => {
      expect(employeeHasPayments(undefined, [{ id: 'p0', employeeId: undefined, dates: [] }], [])).toBe(false);
    });

    it('missing lists count as no payments', () => {
      expect(employeeHasPayments('e1', undefined, undefined)).toBe(false);
      expect(employeeHasPayments('e2', undefined, deleted)).toBe(true);
      expect(employeeHasPayments('e1', live, undefined)).toBe(true);
    });
  });

  describe('a refused write is named in plain words', () => {
    it('a paid night (QB001)', () => {
      expect(nightWriteMessage({ code: 'QB001', message: 'The night 2026-11-02 is paid.' })).toBe(NIGHT_PAID_MESSAGE);
      expect(NIGHT_PAID_MESSAGE).toBe('This night is paid. Delete the payment to change it.');
    });

    it('a night someone else just set (23505 on the one-per-night rule)', () => {
      expect(nightWriteMessage({ code: '23505', message: 'duplicate key' })).toBe(NIGHT_TAKEN_MESSAGE);
      expect(NIGHT_TAKEN_MESSAGE).toBe('Someone else just set this night. The page has been refreshed.');
    });

    it('any other night error keeps its own message', () => {
      expect(nightWriteMessage({ code: '42501', message: 'permission denied' })).toBe('permission denied');
      expect(nightWriteMessage(new Error('Employee "X" not found'))).toBe('Employee "X" not found');
    });

    it('a payment whose nights changed since the page loaded (QB002)', () => {
      expect(paymentSaveMessage({ code: 'QB002', message: 'no longer assigned' })).toBe(NIGHT_CHANGED_MESSAGE);
      expect(NIGHT_CHANGED_MESSAGE).toBe(
        'A night changed since this page loaded (reassigned, or "worked following day" changed). The page has been refreshed: check the amounts and pay again.',
      );
    });

    it('any other payment error keeps its own message', () => {
      expect(paymentSaveMessage(new Error('One of these nights has already been paid.'))).toBe('One of these nights has already been paid.');
    });

    it('an employee with payments, refused by RESTRICT (23503) or by a paid night (QB001)', () => {
      expect(employeeDeleteMessage({ code: '23503', message: 'violates foreign key' })).toBe(EMPLOYEE_HAS_PAYMENTS_MESSAGE);
      expect(employeeDeleteMessage({ code: 'QB001', message: 'The night is paid' })).toBe(EMPLOYEE_HAS_PAYMENTS_MESSAGE);
      expect(EMPLOYEE_HAS_PAYMENTS_MESSAGE).toBe('This employee has payments, so they can only be deactivated.');
    });

    it('any other employee error keeps its own message', () => {
      expect(employeeDeleteMessage({ code: '42501', message: 'permission denied' })).toBe('permission denied');
    });

    it('an error with no message still says something', () => {
      expect(nightWriteMessage({})).toBe('The change was not saved.');
      expect(nightWriteMessage(undefined)).toBe('The change was not saved.');
      expect(paymentSaveMessage({})).toBe('The payment was not saved.');
      expect(paymentSaveMessage(undefined)).toBe('The payment was not saved.');
      expect(employeeDeleteMessage(null)).toBe('The employee was not deleted.');
    });
  });

  describe('when a payment was deleted, in San Francisco time', () => {
    it('01:00 UTC on Nov 7 is 5:00 PM on Nov 6 in San Francisco (PST)', () => {
      expect(formatSfMoment('2026-11-07T01:00:00Z')).toBe('Nov 6, 5:00 PM');
    });

    it('in summer it is PDT: 01:00 UTC on Jul 7 is 6:00 PM on Jul 6', () => {
      expect(formatSfMoment('2026-07-07T01:00:00Z')).toBe('Jul 6, 6:00 PM');
    });

    it('no time, or a bad one, shows nothing', () => {
      expect(formatSfMoment(null)).toBe('');
      expect(formatSfMoment('not a date')).toBe('');
    });

    it('the history line says when, who and why', () => {
      expect(deletedLine({ deletedAt: '2026-11-07T01:00:00Z', deletedByEmail: 'a@example.invalid', deleteNote: 'wrong night' }))
        .toBe('Deleted Nov 6, 5:00 PM by a@example.invalid: wrong night');
    });

    it('no note: when and who only', () => {
      expect(deletedLine({ deletedAt: '2026-11-07T01:00:00Z', deletedByEmail: 'a@example.invalid', deleteNote: null }))
        .toBe('Deleted Nov 6, 5:00 PM by a@example.invalid');
    });

    it('no email (should not happen; the database requires one): says unknown', () => {
      expect(deletedLine({ deletedAt: '2026-11-07T01:00:00Z', deletedByEmail: null, deleteNote: null }))
        .toBe('Deleted Nov 6, 5:00 PM by unknown');
    });
  });

  describe('a payment records the nights priced with "worked following day" (Q3)', () => {
    const base = {
      dates: ['2026-11-02', '2026-11-03', '2026-11-04'],
      assigneeFor: () => 'Avery',
      nightNet: () => 10,
      daytimeNet: (night) => (night === '2026-11-03' ? 5 : 0),
      payments: [],
    };

    it('lists only the ticked nights', () => {
      const { outstanding } = buildOutstanding({ ...base, followingDayFor: (night) => night === '2026-11-03' });
      expect(outstanding.Avery.followingDayNights).toEqual(['2026-11-03']);
    });

    it('no "worked following day" reader given: no night is listed', () => {
      const { outstanding } = buildOutstanding(base);
      expect(outstanding.Avery.followingDayNights).toEqual([]);
    });

    it('no ticks: an empty list', () => {
      const { outstanding } = buildOutstanding({ ...base, followingDayFor: () => false });
      expect(outstanding.Avery.followingDayNights).toEqual([]);
    });

    it('a ticked night that is already paid is not listed', () => {
      const { outstanding } = buildOutstanding({
        ...base,
        followingDayFor: () => true,
        payments: [{ dates: ['2026-11-03'], employeeName: 'Avery' }],
      });
      expect(outstanding.Avery.followingDayNights).toEqual(['2026-11-02', '2026-11-04']);
    });
  });
});
