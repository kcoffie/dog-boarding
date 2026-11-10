# ADR-012: Paid nights are locked, and deleted payments are kept as history

**Status:** Accepted (Kate, 2026-11-05 rules on #389; Q1–Q4 answered 2026-11-09)
**Date:** 2026-11-09 (#389)
**Extends:** ADR-011 (a night is paid once). Replaces its "a payment's nights and amounts can't be updated" trigger with a wider rule.

---

## Context
- After #370, a night could be paid only once, but a paid night could still change underneath its payment:
  - its employee could be changed or cleared;
  - its "worked following day" could be ticked or unticked, which changes the pay;
  - deleting an employee deleted their night assignments, paid ones included, and left their payments with no name.
- Deleting a payment erased it: nothing recorded that it existed, who removed it or why.
- Every signed-in user can write these tables directly (#365), so a screen-only lock wouldn't hold.
- Evidence, options and the architect's review: `docs/specs/389-paid-nights-locked-design-note.md`.

## Decision
- **The database enforces every rule, with triggers** (migration 032), as in ADR-011. The app shows the same rules and names each refusal in words.
- **A paid night is locked.** While a live payment covers a night, the database refuses:
  - clearing it;
  - changing its employee, its "worked following day" or its date.
  - SQLSTATE `QB001`.
- **One assignment per night** (unique index on `night_assignments.date`), so a second row can't slip in beside a paid one.
- **A payment must match its nights.** Each night must be assigned to the person paid, with the same "worked following day" ticks the page priced it with (`payments.following_day_nights`, Kate's Q3). The rows are locked `FOR SHARE` in night order, so an edit in flight either finishes first (and the payment is refused, `QB002`) or waits and is then refused by the lock.
- **Deleting a payment is a soft delete.**
  - The row stays, with `deleted_at`, `deleted_by`, `deleted_by_email` and an optional `delete_note`. The database sets the time and who, from the signed-in user's token (Q2: the email is shown).
  - The payment's nights are released and can be paid again.
  - A deleted payment can't be changed or restored (to undo, pay again).
  - A live payment can't be edited at all: every column but the four delete columns is compared as a whole, so a column added later is locked by default.
  - A hard delete is refused for every role, and `DELETE`/`TRUNCATE` are revoked from client roles (`QB003`).
- **Anyone signed in may delete a payment** until roles exist (#6).
- **An employee with any payment, live or deleted, can't be deleted** (`ON DELETE RESTRICT`, Q1); deactivate instead. Deleting an employee with no payments removes their unpaid night assignments in the same statement (`ON DELETE CASCADE`, Q4), so it's atomic.
- **Every reader skips deleted payments.** The app keeps live and deleted payments in separate lists. Payment history shows deleted ones behind "Show deleted", struck through, with when (San Francisco time), who and the note.

## Options rejected
- **Database functions the app calls** (`delete_payment`, `set_night`) with direct writes revoked: sound, but it changes every call site and tightens grants on three tables at once, which is #365's job.
- **A composite foreign key** `payment_nights(night, employee_id) → night_assignments(date, employee_id)`: locks the employee declaratively. Rejected because:
  - it still needs a trigger for "worked following day" (nullable, so an FK can't cover it);
  - it adds a column and a second unique index;
  - its errors are harder to name for the person paying.
- **A profiles table for "who"**: nicer names, but a new table that belongs with roles (#6).
- **A live-only database view for readers:** the app is the only reader today. An old tab open across the deploy shows deleted payments as live until it's reloaded (it can't pay twice), which the deploy steps cover.

## Consequences
- Migration 032 runs before the deploy, then both check scripts (031's was updated for 032). See the RUNBOOK's "Deploying #389".
- Fixing a paid night means deleting its payment (with a note) and paying again; moving one night out of a several-night payment re-pays all of them at current rates.
- A booking-site change to a paid night isn't blocked (the sync doesn't write night assignments). The night stays paid at its stored amount, and #326 alerts on it.
- The test-database scripts can no longer wipe payments or paid employees through the API. A full reset needs the SQL editor with the triggers disabled (documented in the scripts).
- A later migration that drops or replaces one of these triggers would switch a rule off silently. The RUNBOOK says to re-run both check scripts after any migration touching these tables.
- #343 (adjusting what's paid) will change the "a live payment can't be edited" rule on purpose.
