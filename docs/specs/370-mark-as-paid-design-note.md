# #370 design note: Mark as Paid records each night's own amount, and a night can't be paid twice

**Status:** guard chosen by Kate (per-night table, 2026-10-31). Architect: proceed with changes (folded in below, 2026-10-31). Fix due Fri 11-06. Issue #370 (`priority: high`).

## Problem
Mark as Paid can record the wrong payment (confirmed in UAT dry-run 2, `docs/UAT_SCRIPT.md` Part D):
1. **Partial payment is an average.** `PaymentDialog.jsx:20-23` pays nights x (total / nights): $159.25 where the right amount is $139.75.
2. **A double-click pays twice.** Nothing stops a second click during the save: two rows for one night, 283 ms apart. Nothing in the database refuses it either, so disabling the button wouldn't cover two tabs or a retry.
3. **A failed save looks saved.** `PayrollPage.jsx:164-166` logs the error and closes the box.

## Evidence (read-only, 2026-10-31)
| Claim | Source |
|---|---|
| `payments` has 0 rows, so no backfill or conflict is possible today | Count on production |
| 72 night assignments on 72 distinct dates: one person per night in the data | `night_assignments`; the table has no unique rule, the app's model is one person a night |
| Every signed-in user can write `payments` directly (known limit, #365) | `schema.sql:142` |
| `addPayment` is the app's only writer, `PayrollPage` its only caller. `scripts/smoke-test.js:167-187` also inserts a payment and must change | `git grep`, architect |
| `amount` is `NUMERIC(10,2)`; the page sums unrounded nets | `schema.sql:70`, `PayrollPage.jsx:130-134` |

## Options for keeping the table and the payment together
The table is chosen. A payment and its nights must save together or not at all, and two inserts from the browser can't promise that.

**A. Trigger on `payments` (recommended).** The browser still inserts one `payments` row, now with `night_amounts` (`{"2026-10-16": 139.75}`). An `AFTER INSERT` trigger expands it into `payment_nights`, in the same transaction. A night already paid fails the insert, so no payment row survives. It holds for every write path, including a direct client write (#365).

**B. A `record_payment` function the app calls.** Also atomic, but the guard is only as good as the rule that everyone calls it, so it also needs insert revoked on `payments`. It's the path Kate didn't choose as the guard.

**C. No per-night amounts, unique nights only.** Less to build, but the payment keeps only a total, and #343 (adjusting what's paid) would start from nothing.

## Choice: A

## What changes
1. **Migration `031_payment_nights.sql` (Kate runs it before the deploy):**
   - Check first that production's `payments.dates` is `date[]` (`schema.sql` is stale elsewhere). `BEGIN`/`COMMIT` around it all. `payments.night_amounts jsonb NOT NULL`: this also fails loudly if any payment row exists.
   - `payment_nights`: `night date PRIMARY KEY`, `payment_id uuid NOT NULL REFERENCES payments ON DELETE CASCADE`, `amount numeric(10,2) NOT NULL`.
   - RLS on, not forced; signed-in users read; no write policies. Explicit `REVOKE ALL ... FROM anon, authenticated; GRANT SELECT ... TO authenticated`. The trigger function is `SECURITY DEFINER` with a fixed `search_path`, and `EXECUTE` revoked from `PUBLIC`. Ends with `NOTIFY pgrst, 'reload schema'`.
   - `AFTER INSERT` trigger. PL/pgSQL skips an `IF` on NULL, so checks use `IS DISTINCT FROM`. It raises unless `night_amounts` is an object, `dates` is non-empty with no repeats, the keys equal `dates`, each value is non-negative whole cents, and the sum equals `amount`. It then inserts one row per night, `ORDER BY night` (so overlapping payments can't deadlock). A taken night raises unique violation `23505`.
   - A column-limited `BEFORE UPDATE OF dates, amount, night_amounts` raises (deleting an employee still works): nothing in the app edits a payment; a mistake is fixed by Delete and pay again (UAT step 7). #343 changes this on purpose later.
   - Delete cascades, so a deleted payment's nights return to Outstanding (existing behaviour).
   - #323's planned migration moves to 032.
2. **`PayrollPage`:** `calculateOutstanding` holds whole cents per date, night and daytime each rounded by one tested `toCents` helper (exact half-up, so it agrees with the displayed amount; `Math.round(x*100)/100` doesn't), then added. Totals sum those cents, so a full payment equals the total shown and the card's lines add up. It already uses the shared rule (`calculateGross`, REQ-036). Paid nights are read from all `payments`, not by employee name (`getPaidDatesForEmployee` goes). A night assigned to B but paid to A shows a visible line (Q1). `confirmPayment` stops swallowing errors. `confirmDelete` gets the same treatment: a failed delete shows an error, since Delete is the recovery path.
3. **`PaymentDialog`:** each row shows that night's amount; the payment is the sum of the ticked nights, in whole cents. Confirm awaits the save; Confirm and Cancel are disabled while saving, guarded by a ref (reset on open) so a second click in the same tick does nothing. Ticks are set only when the box opens, keyed on `isOpen` and `employee`; a data change can remove a tick, never add one, because the page rebuilds `outstandingData` every render and today's effect would re-tick excluded nights. On failure the box stays open with the error. If a refresh leaves no nights, the box closes and the page shows the error.
4. **`usePayments`:** sends `night_amounts`; no signed-in user throws instead of returning null. On `23505`, it refreshes payments and throws a clear error ("One of these nights has already been paid. The list has been refreshed."). The refresh also removes the stale nights from the box.
5. **`scripts/smoke-test.js`** sends matching `night_amounts` and asserts a second insert gets `23505`. **`docs/specs/323-job-logs-design-note.md`** moves to migration 032.
6. **REQ-041** gains the criteria; **ADR-011** in the same PR. The README's open-bugs row and the test count are updated.

## Questions for Kate
- **Q1. A night paid to A, then reassigned to B.** A unique night refuses paying B. Recommended: B's Outstanding leaves the night out and shows a line, "10-16 is assigned to B but was paid to A. Delete A's payment to change it." Moving one night from a 5-night payment means deleting all 5 and paying again at current rates.
- **Q2. Half-cent amounts.** Recommended: round night pay and daytime credit separately, then add ($42.50 night + $12.50 day at 65% = $35.76; rounded together, $35.75). Whole-dollar rates at 65% never hit this.

## What breaks
- **Deploy before migration:** the insert names a missing column and fails, and the box shows the error. Nothing wrong is saved. Order: migration, then merge.
- **Migration before deploy, or a tab left open:** the old bundle's insert is refused (`NOT NULL`), but its swallowed error closes the box as if saved. Nothing wrong is saved; it only looks paid. Don't pay until `check:deploy` is OK and the page has been reloaded.
- **Rollback:** drop the two triggers and `ALTER COLUMN night_amounts DROP NOT NULL`, then revert the code.
- **Assigned rates change after a payment:** paid nights keep their stored amount; that's the point of the row.
- **Employee deleted:** `employee_id` goes null as today; the night stays paid.
- **No booking-site requests, no new job, no message, no secret.** The Ops gate adds nothing to watch: a refused payment is shown to the person paying.

## Threat
No new secret. `SECURITY DEFINER` runs only the fixed insert, with values checked against the row being inserted. A signed-in user could still delete payments directly (#365, known), which returns nights to Outstanding, or insert a payment for any nights, which removes them from Outstanding under Q1. Neither can create a second payment for a paid night. The table holds dates and amounts only.

## How we'll know
- **Working:** a failing-first test per bug, with hand-worked values ($139.75 for 10-16; one call for a double-click; box open after a failure). SQL-text tests pin the migration's rules. No local Postgres exists here, and the SQL editor runs as `postgres`, skipping RLS, so Kate also runs a script: each case in `BEGIN ... ROLLBACK` on 2099 dates under `SET LOCAL ROLE authenticated`. It covers a valid insert, a second payment (`23505`), NULL `night_amounts`, a sum mismatch, a repeated date, a direct `payment_nights` insert, an update of `dates`, delete removing the nights, and deleting an employee on a payment. Then UAT step 7 on production (partial payment, double-click, delete).
- **Not working:** the same step 7 run shows it. A check query for Kate: `payments` whose `dates` length or `amount` differs from their `payment_nights` count or sum, or with no nights (must be 0).
