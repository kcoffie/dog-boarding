/**
 * Paid nights are locked and deleted payments are history (#389, ADR-012). The database enforces
 * the rules (migration 032); this module names its refusals in plain words and answers "is this
 * night paid?" for the screens.
 * @requirements REQ-041, REQ-042, REQ-051
 */
import { BUSINESS_TIME_ZONE } from './siteClock';

// SQLSTATEs raised by migration 032's triggers (not `PT…`, which PostgREST reads as HTTP statuses).
export const NIGHT_PAID_CODE = 'QB001';
export const NIGHT_CHANGED_CODE = 'QB002';
export const PAYMENT_FIXED_CODE = 'QB003';
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

export const NIGHT_PAID_MESSAGE = 'This night is paid. Delete the payment to change it.';
export const NIGHT_TAKEN_MESSAGE = 'Someone else just set this night. The page has been refreshed.';
export const NIGHT_CHANGED_MESSAGE =
  'A night changed since this page loaded (reassigned, or "worked following day" changed). The page has been refreshed: check the amounts and pay again.';
export const EMPLOYEE_HAS_PAYMENTS_MESSAGE = 'This employee has payments, so they can only be deactivated.';

/**
 * Nights covered by a live payment, with who was paid and when.
 * @param {Array<{ dates?: string[], employeeName?: string, paidDate?: string, deletedAt?: string|null }>} payments
 * @returns {Record<string, { employeeName: string, paidDate: string }>}
 */
export function paidNightsByDate(payments) {
  const paid = {};
  for (const p of payments || []) {
    if (p.deletedAt) continue;
    for (const night of p.dates || []) {
      paid[night] = { employeeName: p.employeeName || '', paidDate: p.paidDate };
    }
  }
  return paid;
}

/**
 * Any payment, live or deleted, means the employee can only be deactivated (Kate, Q1): a deleted
 * payment is history and keeps its person's name.
 */
export function employeeHasPayments(employeeId, payments, deletedPayments) {
  if (!employeeId) return false;
  return [...(payments || []), ...(deletedPayments || [])].some((p) => p.employeeId === employeeId);
}

/** A refused night edit, in words. */
export function nightWriteMessage(err) {
  if (err?.code === NIGHT_PAID_CODE) return NIGHT_PAID_MESSAGE;
  if (err?.code === UNIQUE_VIOLATION) return NIGHT_TAKEN_MESSAGE;
  return err?.message || 'The change was not saved.';
}

/** A refused payment, in words. */
export function paymentSaveMessage(err) {
  if (err?.code === NIGHT_CHANGED_CODE) return NIGHT_CHANGED_MESSAGE;
  return err?.message || 'The payment was not saved.';
}

/**
 * A real moment (a timestamp such as deleted_at) in San Francisco time, e.g. "Nov 6, 5:00 PM":
 * every date and time in the app is San Francisco time, whatever the device.
 */
export function formatSfMoment(iso) {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return when
    .toLocaleString('en-US', {
      timeZone: BUSINESS_TIME_ZONE, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    .replace(/\u202f/g, ' ');
}

/** "Deleted Nov 6, 5:00 PM by someone@…: note" (no ": note" when there's none). */
export function deletedLine(payment) {
  const who = payment.deletedByEmail || 'unknown';
  const base = `Deleted ${formatSfMoment(payment.deletedAt)} by ${who}`;
  return payment.deleteNote ? `${base}: ${payment.deleteNote}` : base;
}

/** A refused employee delete, in words: RESTRICT on payments, or a paid night reached by the cascade. */
export function employeeDeleteMessage(err) {
  if (err?.code === FOREIGN_KEY_VIOLATION || err?.code === NIGHT_PAID_CODE) return EMPLOYEE_HAS_PAYMENTS_MESSAGE;
  return err?.message || 'The employee was not deleted.';
}
