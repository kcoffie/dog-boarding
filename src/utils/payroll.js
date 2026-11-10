/**
 * Payroll money rules (#370): whole cents per night, a night paid once.
 * @requirements REQ-041
 */

// The same rounding the page uses to show money (PayrollPage formatCurrency), without separators.
const CENTS_FORMAT = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/**
 * Dollars → whole cents, rounded exactly as the amount is shown, so a payment equals what the
 * page displays. `Math.round(x * 100)` can disagree: 0.145 shows as $0.15 but 0.145 * 100 rounds to 14.
 * @param {number} dollars
 * @returns {number}
 */
export function toCents(dollars) {
  if (!Number.isFinite(dollars)) return 0;
  return Math.round(Number(CENTS_FORMAT.format(dollars)) * 100);
}

/**
 * Who each night was paid to, from every payment (not only the assignee's).
 * @param {Array<{ dates?: string[], employeeName?: string }>} payments
 * @returns {Record<string, string>} night → employee name ('' when the employee is gone)
 */
export function paidNightOwners(payments) {
  const owners = {};
  for (const p of payments || []) {
    for (const night of p.dates || []) owners[night] = p.employeeName || '';
  }
  return owners;
}

/**
 * What each employee is owed in a date range, in whole cents per night. Night pay and the daytime
 * credit are each rounded to the cent, then added (Kate, Q2). A night paid to someone else is left
 * out and reported as a notice (Q1, until #389 locks paid nights). So is a night whose amount isn't
 * a number (a dog with no rate): it must never be payable as $0.
 * @param {{
 *   dates: string[],
 *   assigneeFor: (night: string) => string,
 *   nightNet: (night: string) => number,
 *   daytimeNet: (night: string) => number,
 *   followingDayFor?: (night: string) => boolean,
 *   payments: Array<{ dates?: string[], employeeName?: string }>,
 * }} input
 * @returns {{
 *   outstanding: Record<string, { nights: number, amount: number, daytimeAmount: number,
 *     dates: string[], nightCents: Record<string, number>, amountCents: number, daytimeCents: number,
 *     followingDayNights: string[] }>,
 *   notices: Array<{ kind: 'paid-elsewhere', night: string, assignedTo: string, paidTo: string }
 *     | { kind: 'no-amount', night: string, assignedTo: string }>,
 * }}
 */
export function buildOutstanding({ dates, assigneeFor, nightNet, daytimeNet, followingDayFor = () => false, payments }) {
  const owners = paidNightOwners(payments);
  const outstanding = {};
  const notices = [];

  for (const night of dates) {
    const employee = assigneeFor(night);
    if (!employee || employee === 'N/A') continue;
    if (Object.hasOwn(owners, night)) {
      if (owners[night] !== employee) {
        notices.push({ kind: 'paid-elsewhere', night, assignedTo: employee, paidTo: owners[night] });
      }
      continue;
    }

    const nightDollars = nightNet(night);
    const daytimeDollars = daytimeNet(night);
    if (!Number.isFinite(nightDollars) || !Number.isFinite(daytimeDollars)) {
      notices.push({ kind: 'no-amount', night, assignedTo: employee });
      continue;
    }

    const daytime = toCents(daytimeDollars);
    const cents = toCents(nightDollars) + daytime;
    const row = outstanding[employee] ??= {
      nights: 0, dates: [], nightCents: {}, amountCents: 0, daytimeCents: 0, followingDayNights: [],
    };
    row.nights += 1;
    row.dates.push(night);
    row.nightCents[night] = cents;
    row.amountCents += cents;
    row.daytimeCents += daytime;
    // The nights priced with "worked following day": the payment sends them, and the database
    // refuses it if a tick changed since the page loaded (#389, Q3).
    if (followingDayFor(night)) row.followingDayNights.push(night);
  }

  for (const row of Object.values(outstanding)) {
    row.amount = row.amountCents / 100;
    row.daytimeAmount = row.daytimeCents / 100;
  }
  return { outstanding, notices };
}
