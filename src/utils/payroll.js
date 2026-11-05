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
 * out and reported as a notice (Q1, until #389 locks paid nights).
 * @param {{
 *   dates: string[],
 *   assigneeFor: (night: string) => string,
 *   nightNet: (night: string) => number,
 *   daytimeNet: (night: string) => number,
 *   payments: Array<{ dates?: string[], employeeName?: string }>,
 * }} input
 * @returns {{
 *   outstanding: Record<string, { nights: number, amount: number, daytimeAmount: number,
 *     dates: string[], nightCents: Record<string, number>, amountCents: number, daytimeCents: number }>,
 *   notices: Array<{ night: string, assignedTo: string, paidTo: string }>,
 * }}
 */
export function buildOutstanding({ dates, assigneeFor, nightNet, daytimeNet, payments }) {
  const owners = paidNightOwners(payments);
  const outstanding = {};
  const notices = [];

  for (const night of dates) {
    const employee = assigneeFor(night);
    if (!employee || employee === 'N/A') continue;
    if (Object.hasOwn(owners, night)) {
      if (owners[night] !== employee) notices.push({ night, assignedTo: employee, paidTo: owners[night] });
      continue;
    }

    const daytime = toCents(daytimeNet(night));
    const cents = toCents(nightNet(night)) + daytime;
    const row = outstanding[employee] ??= {
      nights: 0, dates: [], nightCents: {}, amountCents: 0, daytimeCents: 0,
    };
    row.nights += 1;
    row.dates.push(night);
    row.nightCents[night] = cents;
    row.amountCents += cents;
    row.daytimeCents += daytime;
  }

  for (const row of Object.values(outstanding)) {
    row.amount = row.amountCents / 100;
    row.daytimeAmount = row.daytimeCents / 100;
  }
  return { outstanding, notices };
}
