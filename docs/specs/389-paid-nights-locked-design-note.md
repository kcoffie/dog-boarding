# #389 design note: paid nights are locked, and deleted payments are kept as history

**Status:** architect: proceed with changes (2026-11-09, all folded in below). Kate answered Q1–Q4 (2026-11-09). Built 2026-11-09 (ADR-012); migration 032 and both check scripts run green on a local Postgres. Fix due Thu 11-12. Issue #389 (`priority: high`). Extends ADR-011 (#370).

## Problem
After #370, a night is paid once, but a paid night can still change underneath its payment, and deleting a payment erases it:
1. **A paid night can be edited.** `EmployeeDropdown` lets anyone change a paid night's employee, tick or untick "worked following day" (which changes the pay), or clear it to "—". The payment keeps the old amount and person; Outstanding then shows a "paid to someone else" line (#370's Q1 stopgap).
2. **Deleting an employee deletes their paid nights.** `DataContext.deleteEmployee` deletes the employee's night assignments first (`useNightAssignments.deleteAssignmentsForEmployee`), then the employee. Their payments keep `employee_id` = NULL (`ON DELETE SET NULL`), so the history loses the name.
3. **Deleting a payment is a hard delete.** `usePayments.deletePayment` runs `DELETE`; nothing records that the payment existed, who removed it or why.
4. **The database doesn't stop any of it.** Every signed-in user can write `night_assignments`, `employees` and `payments` directly (#365).

Kate's rules are on #389 (7 rules). "Not covered": a booking-site change to a paid night is an alert (#326), not a lock.

## Evidence (read-only, 2026-11-09)
| Claim | Source |
|---|---|
| 0 payments, 0 payment_nights, 72 night assignments, 6 employees (all active) | Counts on production |
| Night edits come from one component: `EmployeeDropdown` (employee select, "Day boarding" checkbox) | `git grep setNightAssignment setWorkedFollowingDay` |
| Employee delete: `SettingsPage.handleConfirmDelete` → `DataContext.deleteEmployee` (assignments, then employee). Deactivate already exists (`toggleEmployeeActive`, `useEmployees.js:101`) | code |
| Payments are read in one place: `usePayments` (`select('*')`), then `PayrollPage` (history) and `buildOutstanding` in `src/utils/payroll.js`. No `api/` or cron reads them | `git grep` |
| Scripts that write or delete payments: `scripts/smoke-test.js` (test database only, says so in its header), `scripts/cleanup-test-data.js` | `git grep` |
| `night_assignments` on production has no unique rule on `date` (the data has one row per date) | #370 note evidence |
| `night_assignments.employee_id` FK: `ON DELETE CASCADE` in migration 003, `ON DELETE SET NULL` in `schema.sql`. Production's is unknown | migrations, schema.sql; Kate's pre-check below |
| There is no table of user names; the signed-in user's email is in the JWT | migrations |

## Options

### Where the rules live
**A. Triggers (recommended).** Same pattern as #370 (ADR-011): the browser keeps doing plain `update`/`insert` calls, and triggers refuse what breaks a rule. It holds for every write path, including a direct client write and the service key.

**B. Database functions the app calls** (`delete_payment(id, note)`, `set_night(...)`), with direct writes revoked. Also sound, but it changes every call site and needs the grants on three tables tightened at once; #365 is the place for that.

### How "who deleted it" is shown
**A. Store the signed-in user's email at delete time (recommended).** The trigger copies it from the JWT (`auth.jwt() ->> 'email'`) next to `deleted_by` (the user id). No new table; the history reads "Deleted Nov 9 by someone@…".
**B. A profiles table of names.** Nicer, but it's a new table and belongs with roles (#6).

**C. A composite foreign key** `payment_nights(night, employee_id) → night_assignments(date, employee_id)` would lock employee changes and deletes with no trigger code. Rejected: it still needs a trigger for `worked_following_day` (nullable, an FK can't cover it), adds a column and a second unique index, and its errors are harder to turn into a clear message. Recorded in ADR-012.

## Choice: A and A

## What changes
1. **Migration `032_paid_nights_locked.sql` (Kate runs it before the merge; #323's becomes 033):**
   - **Pre-checks (stop if wrong):** (a) no date has two night assignments (`SELECT date, count(*) FROM night_assignments GROUP BY date HAVING count(*) > 1`, expect 0 rows); (b) every live payment's nights have an assignment for the same employee (expect 0 rows; any row is decided case by case with Kate); (c) the FK actions and names on `night_assignments.employee_id` and `payments.employee_id`.
   - **One assignment per night:** `CREATE UNIQUE INDEX ON night_assignments(date)`. Closes the "second row on a paid night" race and two tabs creating duplicates today.
   - **`payments` gains** `deleted_at timestamptz`, `deleted_by uuid` (no FK: a fake check-script user and a later user delete must both work), `deleted_by_email text`, `delete_note text`.
   - **Soft delete (rule 3):** the app sends `update payments set deleted_at = now(), delete_note = …`. A plain `BEFORE UPDATE` trigger replaces `payments_amounts_fixed` (031's trigger and function dropped explicitly):
     - if `OLD.deleted_at` is set: refuse every update (rule 4: no restore, no edits after delete);
     - every column except the four delete columns must be unchanged (`to_jsonb(NEW) - '{deleted_at,deleted_by,deleted_by_email,delete_note}'` equals the same on OLD), so a column added later is locked by default; `delete_note` may only be set together with `deleted_at`;
     - it forces `deleted_at = now()`. If `auth.uid()` is set (the app), it sets `deleted_by = auth.uid()` and `deleted_by_email = auth.jwt() ->> 'email'`, so the client can't forge them. If not (SQL editor, service key), it keeps the caller's `deleted_by_email` and raises a clear error if that's empty.
     - `AFTER UPDATE OF deleted_at … WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)` (`SECURITY DEFINER`, `search_path = public, pg_temp`) deletes that payment's `payment_nights` rows: the nights are released and can be paid again. The payment keeps `dates` and `night_amounts` for the history.
   - **Hard delete refused:** `BEFORE DELETE` trigger on `payments` raises for every role. `DELETE` and `TRUNCATE` on `payments`, and `TRUNCATE` on `night_assignments`, revoked from `anon` and `authenticated` (row triggers don't fire on TRUNCATE). Emergency undo for Kate: `ALTER TABLE payments DISABLE TRIGGER …` inside a transaction (in the file's comments).
   - **Paid nights locked (rule 1):** `BEFORE INSERT OR UPDATE OR DELETE` trigger on `night_assignments`, `SECURITY DEFINER` with a fixed `search_path` (so a later narrowing of who can read `payment_nights` can't make it fail open) and VOLATILE (so it reads a fresh snapshot after waiting on a lock). If `payment_nights` has a row for `OLD.date` (update/delete) or `NEW.date` (insert), it refuses a delete (clear to "—"), and any change to `employee_id`, `worked_following_day` or `date`. Raised with its own SQLSTATE (not `PT…`, which PostgREST reads as an HTTP status) so the app can name it.
   - **Payment must match the night (closes a race):** `payment_fill_nights` (from 031) requires `NEW.employee_id IS NOT NULL`, then `SELECT … FROM night_assignments WHERE date = ANY(NEW.dates) ORDER BY date FOR SHARE` and compares each night's employee in PL/pgSQL, raising its own SQLSTATE on a mismatch or a missing night. Without it, a reassignment committed between the page loading and the payment saving gives a night assigned to B but paid to A. With it, either the reassignment waits and is then refused (night paid), or the payment waits and is then refused (night reassigned; the page refreshes).
   - **Employee delete (rule 2):** `payments.employee_id` becomes `ON DELETE RESTRICT`: an employee with any payment row (live or deleted, Q1) can't be deleted. `night_assignments.employee_id` is set explicitly to `ON DELETE CASCADE` (production's setting is unknown; not SET NULL, which would turn nights into "N/A"), so deleting an employee is one atomic statement; a paid night still refuses the cascaded delete.
   - `REVOKE EXECUTE … FROM PUBLIC` on every new function. RLS unchanged (`Authenticated users full access` on payments: rule 5, anyone signed in may delete). Ends with `NOTIFY pgrst, 'reload schema'`.
   - **Check script `supabase/checks/032_paid_nights_locked_check.sql`**, same shape as 031's: runs every rule as `authenticated` with a fake JWT (synthetic email, `check@example.com`) inside a transaction, prints PASS/FAIL per rule, ends in a deliberate error so nothing is kept ("check 032: ALL PASS (rolled back)"). **`031_payment_nights_check.sql` is updated in the same PR** (its cases delete an employee with a payment, hard-delete a payment, and pay nights with no assignment, all now refused). Kate runs both.
2. **`usePayments`:** fetches all payments and returns two lists: `payments` (live only) and `deletedPayments`. Every existing reader keeps using `payments`, so Outstanding, totals and history skip deleted ones by default (rule 7). The employee-rename effect remaps both lists. `deletePayment(id, note)` sends the soft-delete update and checks one row came back; a refused write throws the database's message. `DataContext.deletePayment` passes the note through.
3. **`EmployeeDropdown`:** a paid night (in `payment_nights`, the database's truth) shows the employee as text with "Paid" and the paid date; no select, no checkbox. A refused write (the lock's SQLSTATE), from the select or the "Day boarding" checkbox (today the checkbox only logs errors), shows "This night is paid. Delete the payment to change it." and the page refreshes nights and payments.
4. **`SettingsPage` / `DataContext`:** `deleteEmployee` no longer deletes assignments first (the cascade does it, atomically). An employee with any payment shows no Delete, with "Has payments: deactivate instead" next to Deactivate. A refused delete shows the error (today it's only logged).
5. **`PayrollPage`:** the delete box gains an optional note. History gets a "Show deleted" toggle (off by default); deleted payments are struck through with "Deleted Nov 9 by someone@… : note", dates shown in San Francisco time. They have no Delete button.
6. **`payroll.js`:** the Q1 "paid to someone else" line stays as a guard but can no longer happen for new payments.
7. **Scripts (test database only):** `smoke-test.js` finds or creates a fixed synthetic employee, creates the 2099 night assignments its payments need, soft-deletes leftovers (`.is('deleted_at', null)`), asserts a hard delete and a paid-night edit are refused, then soft-deletes its payment (releasing the nights) and deletes the 2099 assignments. The soft-deleted rows and the employee stay (one row per run). `cleanup-test-data.js` soft-deletes. A full reset of a test database (`reset-test-data.js`) needs the SQL editor with triggers disabled: documented in the script.
8. **Docs:** REQ-041 (paid night locked; payment must match the night), REQ-042 (soft delete, note, Show deleted, no restore), employee delete criterion (REQ under Settings); **ADR-012**; RUNBOOK entry "a paid night needs changing".

## Questions for Kate
- **Q1. Employee delete: any payment, or only live ones?** Recommended: any payment, live or deleted. A deleted payment is history and should keep its person's name; deactivate covers everything delete was for.
- **Q2. "Who" shows as the signed-in email** (there's no names table until roles, #6). Recommended: yes.
- **Q3. "Worked following day" ticked after the Payroll page loaded** (another tab, before Pay is clicked): the payment saves the old, lower amount and every check passes. Close it (the payment also stores which nights were priced with the tick, and the trigger compares them with the assignments; a mismatch is refused and the page refreshes), or accept it as a known gap in ADR-012? Recommended: close it; it's small and it's pay.
- **Q4. Deleting an employee with no payments** still removes their unpaid night assignments (today's behaviour, now in one step). Keep? Recommended: yes.

## Kate's answers (2026-11-09)
- **Q1:** yes, any payment (live or deleted) blocks deleting the employee.
- **Q2:** yes, the signed-in email.
- **Q3:** close it. `payments` gains `following_day_nights date[] NOT NULL DEFAULT '{}'`: the nights the page priced with "worked following day" ticked. `payment_fill_nights` refuses the payment unless it is a subset of `dates` and equals exactly the nights whose locked assignment has `worked_following_day = true` (own SQLSTATE; the page refreshes and says the night changed). Covered by the same `FOR SHARE` lock, and by the soft-delete trigger's "nothing else changes" rule.
- **Q4:** keep (deleting an employee with no payments removes their unpaid nights, now in one step).

## Deploy order
032 with its pre-checks → `031` and `032` check scripts both "ALL PASS (rolled back)" → merge → `check:deploy` → reload open Payroll and calendar tabs → Phase 1 Payroll step.

## What breaks
- **Merge before migration:** soft delete names missing columns and fails; the page shows the error. Nothing is lost.
- **Migration before merge, or an old tab:** the old bundle's hard delete is refused and shown (#370's error path). Editing a paid night is refused; the dropdown shows red for 3 s and reverts. An old tab open across the merge reads soft-deleted payments as live (shown in history, their freed nights hidden from Outstanding) until it's reloaded; it can't pay twice. Rule 7 is enforced in the app only; a live-only database view isn't worth it now.
- **A booking-site change to a paid night** (cancelled, moved, repriced): the night stays paid at its stored amount; the sync doesn't write `night_assignments`, so it isn't blocked. #326 alerts on it.
- **Fixing a paid night:** delete the payment (with a note), edit the night, pay again. Moving one night from a 5-night payment means re-paying all 5 (as in #370).
- **Rollback:** the file lists the drops (triggers, functions, columns, FK back to `SET NULL`), only safe while no payment depends on the new columns.

## Threat
No new secret or service. Rules hold against a signed-in user writing directly (#365): `deleted_by` and `deleted_at` are set by the trigger, not the client; `payment_nights` stays read-only for clients; hard delete is refused for every role, the service key included. The email shown in history is visible to every signed-in user, as the payments themselves are today.

## How we'll know it's working
- The check script prints "ALL PASS" before the merge (Kate runs it).
- Phase 1 Payroll step re-run after deploy (Kate clicks, Claude reads the tables): pay a night → its dropdown is locked; delete with a note → payment has `deleted_at`, `deleted_by_email`, note, and 0 `payment_nights`; night editable and payable again; Show deleted shows it struck through.
- Drift check in the migration's comments (expect 0 rows): a live payment whose nights don't match `payment_nights`, or a deleted one that still has rows.

## How we'll know when it isn't
A refused write in the app is shown, not logged. A rule that silently stops holding (a trigger dropped by a later migration) is caught by re-running the check script after any migration that touches these tables (RUNBOOK).
