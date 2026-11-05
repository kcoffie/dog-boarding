# ADR-011: A night is paid once, with its own amount, enforced by the database

**Status:** Accepted (Kate, 2026-10-31; Q1 and Q2 answered 2026-11-05)
**Date:** 2026-11-05 (#370)
**Supersedes:** nothing. #389 extends it: paid nights locked, and deleted payments kept as history.

---

## Context
- A test run of the Payroll page confirmed three Mark as Paid bugs:
  - A partial payment paid an average per night ($159.25 where $139.75 was owed).
  - A double-click saved two payments for one night, 283 ms apart.
  - A failed save closed the box as if it had worked.
- Nothing in the database stopped a night being paid twice: `payments.dates` is an array, so disabling the button wouldn't cover two tabs, a retry, or a direct write (#365).
- Evidence and options: `docs/specs/370-mark-as-paid-design-note.md`.

## Decision
- **Each payment carries each night's amount** (`payments.night_amounts`, whole cents), and the payment amount is their sum.
- **`payment_nights` holds one row per paid night, with the night as primary key.** An `AFTER INSERT` trigger on `payments` checks the row and writes those rows in the same transaction. A night that's already paid fails the whole insert with `23505`, so no payment row survives. Signed-in users can only read the table.
- **A payment's nights and amounts can't be updated.** A mistake is fixed by deleting the payment (its nights return to Outstanding) and paying again.
- **Money is whole cents per night.** Night pay and the daytime credit are each rounded to the cent, then added (Kate, Q2), using the same rounding the page displays.
- **Outstanding leaves out a night paid to anyone.** A night assigned to one person but paid to another shows a line saying so (Kate, Q1, until #389 locks paid nights).
- **A failed save or delete is shown,** and the box stays open on a failed save.

## Options rejected
- **A `record_payment` database function the app calls:** also atomic, but the rule only holds if every writer calls it, so it also needs inserts on `payments` revoked.
- **Unique nights with no per-night amounts:** less to build, but the payment would keep only a total, and #343 (adjusting what's paid) would start from nothing.
- **Disabling the button only:** doesn't cover a second tab, a retry or a direct write.

## Consequences
- The migration (031) runs before the deploy. An old tab's insert is refused because it has no `night_amounts`, and it looks saved, so nobody pays until the page has been reloaded on the new code.
- Moving one night out of a several-night payment means deleting the whole payment and paying again at current rates.
- Locking paid nights against edits, and keeping deleted payments as history, is #389 (due 11-12).
