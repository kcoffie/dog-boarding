# Dog Boarding App - Requirements

## How to Use This Document

- Every requirement has a unique ID: `REQ-XXX`
- Requirements are grouped by feature area
- Each requirement should have at least one test
- When adding features, add requirements here FIRST
- When fixing bugs, check if a requirement needs updating
- **Version tracking:** `Added:` shows when requirement was introduced
- **Status values:** `Planned` → `In Progress` → `Complete`

---

## Version History

| Version | Focus Area                     | Status      |
| ------- | ------------------------------ | ----------- |
| v1.0    | Core boarding management       | Complete    |
| v1.1    | Payroll & employee management  | Complete    |
| v1.2    | CSV import & past boardings    | Complete    |
| v1.3    | Authentication & invite system | Complete    |
| v2.0    | External data sync             | Complete (REQ-100–109)    |
| v2.1    | Bug fixes & parse degradation  | Complete (REQ-110)        |
| v2.2    | Revenue intelligence           | Complete (REQ-200–203)    |
| v2.3    | Data quality & UX polish       | Complete (REQ-300–306)    |
| v2.4    | Reporting & observability      | Complete (REQ-400–402)    |
| v3.0    | Boarding form scraping + modal | Complete (REQ-500–508)    |
| v4.0    | Daytime activity intelligence  | Complete (REQ-600–601)    |
| v4.1    | WhatsApp roster notifications  | Complete (REQ-610–612)    |
| v4.3    | Integration check              | Complete (REQ-620)        |
| v4.4    | Friday PM weekend notify       | Complete (REQ-630)        |
| v4.4.1  | Session self-healing + cron log| Complete (REQ-640–642)    |

---

## Authentication & Access Control

### REQ-001: No Self Sign-Up
**Added:** v1.3 | **Changed:** v6.5.0 (#301) | **Status:** Complete

Accounts can't be created from the app. Kate adds staff in Supabase (Authentication → Users → Invite); Supabase sign-up is disabled. The invite-code sign-up page was removed because its code was checked only in the browser.

**Acceptance Criteria:**
- The login page has no "Create account" link and no link to `/signup`
- `/signup` redirects to `/login`

**Tests:** `src/__tests__/auth/login.test.jsx`, `src/__tests__/auth/signupRoute.test.jsx`

---

### REQ-002: User Login
**Added:** v1.3 | **Status:** Complete

Users can log in with email and password.

**Acceptance Criteria:**
- Login page accepts email and password
- Valid credentials redirect to app
- Invalid credentials show error
- Session persists across page refresh

**Tests:** `src/__tests__/auth/login.test.jsx`

---

### REQ-003: User Profile Display
**Added:** v1.3 | **Status:** Complete

Logged-in users can see their identity in the app.

**Acceptance Criteria:**
- Profile page displays user's email
- Avatar shows first letter of email
- Account Details section is visible

**Tests:** `src/__tests__/auth/profile.test.jsx`

---

### REQ-004: Password Self-Service
**Added:** v1.3 | **Status:** Complete

Users can change their own password.

**Acceptance Criteria:**
- Profile page has password change form
- New password must be 6+ characters
- Confirmation must match new password
- Success message shown after change
- Error message shown on failure

**Tests:** `src/__tests__/auth/profile.test.jsx`

---

### REQ-005: Shared Data Access
**Added:** v1.3 | **Status:** Complete

All authenticated users see all data (single organization model).

**Acceptance Criteria:**
- All authenticated users can view all dogs
- All authenticated users can view all boardings
- All authenticated users can edit any dog or boarding
- Unauthenticated users cannot access data

**Tests:** RLS policies verified via integration tests

---

### REQ-006: Invite Code Management
**Added:** v1.3 | **Status:** Complete

Authenticated users can create and manage invite codes.

**Acceptance Criteria:**
- Can generate new invite codes
- Can optionally lock code to specific email
- Can view code status (active, used, expired)
- Can delete unused invite codes
- Deleted codes stay deleted (persist after refresh)

**Tests:** `src/__tests__/auth/useInvites.test.js`

---

## Dogs

### REQ-010: Add Dog
**Added:** v1.0 | **Status:** Complete

Users can add new dogs to the system.

**Acceptance Criteria:**
- Form requires name (non-empty)
- Form requires day rate (number >= 0)
- Form requires night rate (number >= 0)
- Dog appears in list after save
- New dogs default to active status

**Tests:** `src/components/DogForm.test.jsx`

---

### REQ-011: Edit Dog
**Added:** v1.0 | **Status:** Complete

Users can edit existing dogs.

**Acceptance Criteria:**
- Edit form pre-fills current values
- Can update name, day rate, night rate
- Changes persist after save
- Cancel discards changes

**Tests:** `src/components/DogForm.test.jsx`

---

### REQ-012: Delete Dog
**Added:** v1.0 | **Status:** Complete

Users can delete dogs.

**Acceptance Criteria:**
- Confirmation required before delete
- Dog removed from list after delete
- Associated boardings are also deleted

**Tests:** `src/pages/DogsPage.test.jsx`

---

### REQ-013: Toggle Dog Active Status
**Added:** v1.0 | **Status:** Complete

Users can mark dogs as active or inactive.

**Acceptance Criteria:**
- Active dogs appear in boarding dropdowns
- Inactive dogs hidden from booking forms
- Inactive dogs still visible in historical data
- Toggle persists after page refresh

**Tests:** `src/pages/DogsPage.test.jsx`

---

## Boardings

### REQ-020: Add Boarding
**Added:** v1.0 | **Status:** Complete

Users can add boarding reservations.

**Acceptance Criteria:**
- Must select a dog from dropdown
- Must specify arrival date and time
- Must specify departure date and time
- Departure must be after arrival
- Boarding appears on calendar and matrix after save

**Tests:** `src/components/BoardingForm.test.jsx`

---

### REQ-021: Edit Boarding
**Added:** v1.0 | **Status:** Complete

Users can edit existing boardings.

**Acceptance Criteria:**
- Edit form pre-fills current values
- Date validation still applies
- Changes reflected in calendar and matrix

**Tests:** `src/components/BoardingForm.test.jsx`

---

### REQ-022: Delete Boarding
**Added:** v1.0 | **Status:** Complete

Users can delete boardings.

**Acceptance Criteria:**
- Confirmation required before delete
- Boarding removed from calendar and matrix

**Tests:** `src/pages/DogsPage.test.jsx`

---

### REQ-023: CSV Import
**Added:** v1.2 | **Status:** Complete

Users can import boardings from CSV files.

**Acceptance Criteria:**
- Accepts CSV with dog name, arrival, departure columns
- Shows preview before import
- Shows errors for invalid rows
- Successful rows create boardings
- Handles duplicate dog names gracefully

**Tests:** `src/components/CsvImport.test.jsx`

---

### REQ-024: Past Boardings Display
**Added:** v1.2 | **Status:** Complete

Past boardings are displayed separately from current/upcoming.

**Acceptance Criteria:**
- Past boardings shown in separate "Past Boardings" section
- Main boardings table shows only current and upcoming
- Past boardings section shows count of historical records
- Past boardings table has sortable columns

**Tests:** `src/__tests__/pages/DogsPage.pastBoardings.test.jsx`

---

## Boarding Matrix

### REQ-030: Display Matrix
**Added:** v1.0 | **Status:** Complete

Matrix shows dogs and dates in grid format.

**Acceptance Criteria:**
- Dogs listed in rows
- Dates shown in columns (configurable range)
- Day indicator (sun icon) when dog present during day
- Night indicator (moon icon) when dog stays overnight

**Tests:** `src/components/BoardingMatrix.test.jsx`

---

### REQ-031: Date Navigation
**Added:** v1.0 | **Status:** Complete

Users can navigate to different date ranges.

**Acceptance Criteria:**
- Previous day button moves back one day
- Next day button moves forward one day
- Previous week button moves back 7 days
- Next week button moves forward 7 days
- Today button returns to current date

**Tests:** `src/components/DateNavigator.test.jsx`

---

### REQ-032: Overnight Calculation
**Added:** v1.0 | **Status:** Complete

Matrix calculates overnight revenue correctly.

**Acceptance Criteria:**
- Night = dog staying past 5 PM into next day
- Night total = sum of night rates for all overnight dogs
- Net = night total × net percentage
- Gross displayed for each dog's boarding period

**Tests:** `src/utils/calculations.test.js`

---

### REQ-033: Employee Night Assignment
**Added:** v1.1 | **Status:** Complete

Users can assign employees to overnight shifts.

**Acceptance Criteria:**
- Each night column has employee dropdown
- Dropdown shows only active employees
- "N/A" option for nights with no employee needed
- Selection persists after page refresh
- Error feedback shown if save fails

**Tests:** `src/components/EmployeeDropdown.test.jsx`, `src/__tests__/hooks/useNightAssignments.test.js`

---

### REQ-034: Matrix Sorting
**Added:** v1.0 | **Status:** Complete

Users can sort the matrix by various columns.

**Acceptance Criteria:**
- Can sort by dog name (A-Z, Z-A)
- Can sort by date columns (presence on that date)
- Sort handles ties appropriately
- Sort indicator shows current sort column and direction

**Tests:** `src/components/BoardingMatrix.test.jsx`

---

### REQ-035: Summary Cards
**Added:** v1.0 | **Status:** Complete

Matrix displays summary statistics.

**Acceptance Criteria:**
- "Nights Assigned" shows count of assigned nights in period
- "Dogs Tonight" shows count of dogs staying tonight
- "Active Dogs" shows total active dogs
- "Period Revenue" shows gross revenue for visible period

**Tests:** `src/components/SummaryCards.test.jsx`

---

## Payroll

### REQ-040: Employee Totals
**Added:** v1.1 | **Status:** Complete

System calculates earnings per employee.

**Acceptance Criteria:**
- Totals calculated from night assignments
- Employee's total = sum of net amounts for their assigned nights
- "N/A" nights excluded from employee totals
- Date range can be selected

**Tests:** `src/components/EmployeeTotals.test.jsx`

---

### REQ-041: Mark as Paid
**Added:** v1.1 | **Status:** Complete

Users can record payments to employees.

**Acceptance Criteria:**
- Can select specific dates to mark as paid
- Select All / Deselect All buttons available
- Payment records date, employee, and amount
- Paid dates no longer show in outstanding

**Tests:** `src/components/PaymentDialog.test.jsx`, `src/pages/PayrollPage.test.jsx`

---

### REQ-042: Payment History
**Added:** v1.1 | **Status:** Complete

Users can view and manage payment history.

**Acceptance Criteria:**
- Shows list of past payments
- Each payment shows date, employee, amount
- Can delete payment records
- Deletion confirmation required

**Tests:** `src/pages/PayrollPage.test.jsx`

---

### REQ-043: Outstanding Payments Display
**Added:** v1.1 | **Status:** Complete

System shows unpaid amounts per employee.

**Acceptance Criteria:**
- Outstanding calculated from unpaid assigned nights
- Total outstanding shown at bottom
- Updates when payments are recorded

**Tests:** `src/pages/PayrollPage.test.jsx`

---

### REQ-044: Payment Flow Integration
**Added:** v1.3 | **Status:** Complete

Marking dates as paid updates both payment history and outstanding balance.

**Acceptance Criteria:**
- After marking as paid, payment appears in payment history
- After marking as paid, dates no longer show in outstanding
- Payment history reflects correct employee, amount, and dates
- Deleting a payment restores dates to outstanding

**Tests:** `src/__tests__/hooks/usePayments.test.js`

---

## Settings

### REQ-050: Net Percentage Configuration
**Added:** v1.1 | **Status:** Complete

Users can configure the net percentage for calculations.

**Acceptance Criteria:**
- Input accepts values 0-100
- Value persists after save
- Used in matrix net calculations
- Can have historical values (effective dates)

**Tests:** `src/pages/SettingsPage.test.jsx`

---

### REQ-051: Employee Management
**Added:** v1.1 | **Status:** Complete

Users can manage the employee list.

**Acceptance Criteria:**
- Can add new employees by name
- Can delete employees
- Can toggle employee active status
- No duplicate names allowed
- Active employees appear in matrix dropdown
- Inactive employees hidden from dropdown but shown if currently selected

**Tests:** `src/pages/SettingsPage.test.jsx`

---

## Utility Functions

### REQ-060: Date Formatting
**Added:** v1.0 | **Status:** Complete

System provides consistent date formatting.

**Acceptance Criteria:**
- formatDate returns readable date string
- formatTime returns readable time string
- formatDateTime combines date and time
- toDateInputValue returns HTML date input format
- toTimeInputValue returns HTML time input format

**Tests:** `src/utils/dateUtils.test.js`

---

### REQ-061: Nights Calculation
**Added:** v1.0 | **Status:** Complete

System calculates nights for boarding periods.

**Acceptance Criteria:**
- calculateNights returns correct night count
- Handles same-day arrivals and departures
- Accounts for time of day (5 PM cutoff)

**Tests:** `src/utils/dateUtils.test.js`

---

### REQ-062: Employee Helper Functions
**Added:** v1.1 | **Status:** Complete

System provides employee lookup utilities.

**Acceptance Criteria:**
- getEmployeeNameById returns name from ID
- getEmployeeIdByName returns ID from name
- getEmployeeName handles legacy formats
- isEmployeeActive checks active status

**Tests:** `src/utils/employeeHelpers.test.js`

---

### REQ-063: Revenue Calculations
**Added:** v1.0 | **Status:** Complete

System calculates revenue correctly.

**Acceptance Criteria:**
- calculateGross computes total before net percentage
- calculateNet applies net percentage correctly
- countOvernightDogs returns correct count for date
- calculateBoardingGross computes single boarding revenue

**Tests:** `src/utils/calculations.test.js`

---

## v2.0: External Data Sync

### REQ-100: External Source Authentication
**Added:** v2.0 | **Status:** Complete

Scraper can authenticate with the external booking system.

**Acceptance Criteria:**
- Can store authentication credentials securely (not in code)
- Can authenticate using stored session/cookies
- Can re-authenticate when session expires
- Authentication failures logged with clear error messages
- Credentials stored in environment variables, not database

**Tests:** `scraper/auth.test.js`

---

### REQ-101: Appointment List Scraping
**Added:** v2.0 | **Status:** Complete

Scraper can retrieve list of appointments from schedule page.

**Acceptance Criteria:**
- Can navigate to schedule page
- Can extract all appointment links from page
- Can filter for boarding appointments only
- Can handle pagination if present
- Can specify date range to scrape

**Tests:** `scraper/schedule.test.js`

---

### REQ-102: Appointment Detail Extraction
**Added:** v2.0 | **Status:** Complete

Scraper can extract full details from individual appointment pages.

**Acceptance Criteria:**
- Extracts appointment info (service type, status, dates, duration, staff)
- Extracts client info (name, emails, phone, address)
- Extracts access instructions and notes
- Extracts pet info (name, breed, medical, behavioral)
- Handles missing fields gracefully (null, not error)
- Stores source URL for reference

**Tests:** `scraper/extraction.test.js`

---

### REQ-103: Data Mapping to App Schema
**Added:** v2.0 | **Status:** Complete

Scraped data maps correctly to existing app data models.

**Acceptance Criteria:**
- External appointments create/update Dog records
- External appointments create/update Boarding records
- Client info stored appropriately (new table or notes)
- Duplicate detection by external_id
- Existing manual entries not overwritten without flag

**Tests:** `scraper/mapping.test.js`

---

### REQ-104: Sync Scheduling
**Added:** v2.0 | **Status:** Complete

Sync can run automatically on a schedule.

**Acceptance Criteria:**
- Can configure sync interval (hourly, daily, manual)
- Sync runs in background without blocking UI
- Last sync timestamp displayed in app
- Can trigger manual sync from UI
- Sync status visible (running, success, failed)

**Tests:** `scraper/scheduler.test.js`, `components/SyncStatus.test.jsx`

---

### REQ-105: Sync Conflict Resolution
**Added:** v2.0 | **Status:** Deferred

System handles conflicts between external and local data.

**Acceptance Criteria:**
- External data marked with `source: 'external'`
- Local edits to external data flagged as overridden
- Option to prefer external or local on conflict
- Sync log shows what changed
- Can revert local changes to external data

**Tests:** `scraper/conflicts.test.js`

---

### REQ-106: Sync Error Handling
**Added:** v2.0 | **Status:** Complete

Sync failures are handled gracefully and reported.

**Acceptance Criteria:**
- Individual appointment failures don't stop full sync
- Failed extractions logged for manual review
- Rate limiting handled (automatic delays)
- Network failures trigger retry with backoff
- Error notifications to admin (optional)

**Tests:** `scraper/errors.test.js`

---

### REQ-108: Archive Reconciliation
**Added:** v2.0 | **Status:** Complete

When an appointment is amended on the external site, a new appointment is created
and the old one disappears from the schedule page. The old record must be detected
and archived so it doesn't appear as an active boarding.

**Acceptance Criteria:**
- After each sync, active DB records not seen on the schedule are identified as candidates
- Candidates whose `source_url` returns a valid appointment page are NOT archived (warn + log)
- Candidates whose `source_url` returns an access-denied page are marked `sync_status: 'archived'`
- Fetch errors for individual candidates are logged but do not stop reconciliation or the sync
- A DB query failure in reconciliation is logged and reconciliation is skipped (sync still succeeds)
- `sync_logs` records the count of archived appointments (`appointments_archived`)
- For date-range syncs, only records overlapping the sync window are checked
- For full syncs (no date range), all active records not seen are checked
- Rate limiting between confirmation fetches (same delay as detail page fetches)

**Tests:** `src/__tests__/scraper/reconcile.test.js`

---

### REQ-109: Automated Scheduled Sync (micro mode)
**Added:** v2.0 | **Status:** Complete

The system automatically syncs appointment data on a schedule using three Vercel
cron functions that each complete within the Hobby plan's 10-second limit.

**Architecture:**

| Cron | Schedule | Function |
|------|----------|----------|
| `cron-auth` | Daily 0:00 UTC | Re-authenticate and cache session in DB (unconditional) |
| `cron-schedule` | Daily 0:05 UTC | Scan schedule pages, queue boarding candidates |
| `cron-detail` | Daily 0:10 UTC | Fetch detail page for one queued appointment or boarding form |
| `cron-detail-2` | Daily 0:15 UTC | Second detail processor — doubles throughput on Hobby plan |

**Acceptance Criteria:**
- `cron-auth` always re-authenticates on every run — no skip-if-valid logic (unconditional refresh prevents the race condition where a late-stored session appears valid but expires before morning notify windows)
- `cron-auth` stores new session cookies and expiry in `sync_settings` after successful auth
- `cron-schedule` fetches this week, next week and a rotating cursor week per call (see Shared runners below)
- `cron-schedule` cursor advances 7 days each call, wraps back to today after 8 weeks (~today+56d)
- `cron-schedule` filters known non-boarding titles before enqueueing (same patterns as `sync.js`)
- `cron-detail` picks the oldest pending item from `sync_queue`, fetches the detail page, upserts to DB
- `cron-detail` resets items stuck in `processing` for more than 10 minutes at the start of each run
- Failed detail fetches retry up to 3 times with backoff: +5m, +10m, then permanently `failed`
- All cron handlers verify `CRON_SECRET` header when the env var is set (skipped in local dev)
- Session error (server rejects cached cookies) → clear DB session + return 200 (cron-auth will re-auth)
- Reconciliation (REQ-108) does NOT run in micro mode — only via manual sync or standard mode
- `SYNC_MODE=standard` env var enables upgrade path to full `runSync()` without code changes
- All env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EXTERNAL_SITE_*`) accessible
  via `process.env` fallback in cron context (where `import.meta.env` is unavailable)

**Shared runners (`src/lib/scraper/syncRunner.js`, used by `cron-schedule`, `cron-detail` and integration-check step 0):**
- *Schedule scan (`runScheduleSync`):*
  - Fetches this week's page, next week's (+7 days), and the cursor week's. The cursor page is left out when the cursor is less than 7 days from either of the other two, so a run fetches 2 or 3 pages
  - A page URL is `/schedule/days-7/YYYY/M/D`, with no leading zeros
  - No session → `session_failed`; nothing is fetched
  - A page that is a login form (contains both `login` and `password`) → the cached session is cleared and the run returns `session_cleared`; nothing is enqueued and the cursor doesn't move
  - A non-OK HTTP status throws, so the cron handler records a failure
  - An appointment on two pages is counted and queued once
  - A title matching `nonBoardingPatterns` is skipped (counted in `skipped`). Any other is enqueued with its ID, its absolute URL, its title (else the pet name), and its first pet ID as `meta.external_pet_id` (else no meta)
  - One failed enqueue doesn't stop the others; `queued` counts only the ones that succeeded
  - All the pages' daytime events are upserted in one call; `daytimeUpserted` / `daytimeErrors` report its result
  - The cursor is saved as cursor + 7 days (`YYYY-MM-DD`, a local date): the existing `sync_settings` row is updated, or a row is inserted when none exists. With no cursor stored, the cursor is today. A next cursor past today + 56 days wraps back to today; exactly today + 56 is kept
  - Returns `action: 'ok'` with `pagesScanned`, `found`, `skipped`, `queued`, the pending `queueDepth`, and `cursorAdvancedTo` equal to the saved cursor date
- *Re-queueing an edited appointment (B-3, #205; #278).* AGYD gives a boarding stay one link timestamp (its start), but a recurring daycare or playgroup series one per occurrence, so the timestamp a scan sees for a series changes with the date and the cursor week. `enqueue()` returns what it did (`queued`, `requeued_edited`, `requeued`, `url_change_ignored`, `unchanged`). For an item that is already `done` (and not `resetIfDone`):
  - **Title changed** (stored and incoming both non-empty after trimming, and different) → re-queued as `pending`, with the new title and URL stored. The incoming title is the one the scan stores (`title`, else the pet name)
  - **URL changed, title the same**, and the detail step did **not** skip the item → re-queued, with the new URL and title stored (a stay whose start moved)
  - **URL changed, title the same**, and the detail step skipped the item (`meta.detail_skip` is set) → not re-queued and not written; returns `url_change_ignored`
  - A stored URL that's null, or an incoming URL with no timestamp, skips the URL rule. An empty stored or incoming title skips the title rule
  - Items that are `pending` or `processing` are never changed by a scan. `failed` items are re-queued, with the scan's URL and title stored
  - Every re-queue merges the scan's meta over the stored meta (so a stored `external_pet_id` survives a scan copy without one) and drops `detail_skip`. A blank incoming title never replaces a stored one
  - When the detail step skips an appointment (REQ-104 filters), it marks the item done with `meta.detail_skip` set to the skip reason, keeping the rest of its meta. A re-queue drops the flag until the next detail result
  - The scan result, and the `schedule` cron health row, report `requeuedEdited` and `urlChangesIgnored`
- *Schedule page parsing (`parseScheduleHtml`):* every `/schedule/a/<id>/<timestamp>` link is one appointment (first one wins for a repeated ID), with trimmed pet, client, time and title text, every `data-pet` ID, and a relative link made absolute. A link without both an ID and a numeric timestamp is ignored
- *Detail step (`runDetailSync`), one queue item per call:*
  - No session → `session_failed`, before anything is dequeued
  - Stuck items are reset first unless `runResetStuck: false`; an empty queue → `idle`
  - **Form item:** with no `external_pet_id` it is marked done (`skipped`, `no_pet_id`). Otherwise the form is fetched and stored for its boarding and pet → done, `form_stored`
  - **Appointment item:** the appointment ID and timestamp come from the item's URL (if the URL doesn't match, the item's `external_id` and no timestamp). A missing pet name falls back to the queued title. An appointment the detail filters reject (REQ-104) is marked done, `skipped` with the filter's reason, and is not saved. Otherwise it is saved with the item's pet ID → done, and the action is `created`, `updated` (sync, dog or boarding record changed) or `unchanged`
  - **Session expired** during a form or detail fetch → the session is cleared and the item goes back to `pending` (not a retry); returns `session_cleared`
  - **Any other fetch or save error**, including a thrown value that isn't an `Error` → the item is marked failed with the error's first 200 characters (retry/backoff per above); returns `form_failed`, `failed` or `save_failed`
  - Every processed item reports the pending `queueDepth`
- *`sync_settings` access (#275).* Every reader and writer (cursor, session cache, browser sync settings, integration-check) reads the row through `readSettingsRow`: `order('id')`, `limit(1)`, `maybeSingle()`. So if a duplicate row ever appears, they all use the lowest id, rather than splitting the cursor and session across rows (`.limit(1).single()` returns an arbitrary row, it doesn't error)
  - A read error throws `sync_settings read failed: …`. An empty table is "no row" (cursor = today, no cached session). A writer never inserts after a failed read
  - A failed cursor write throws `sync_settings cursor write failed: …`. Either throw fails the scan, so `cron-schedule` records `failure`
  - `ensureSession`: when a fresh login succeeds but the session can't be cached, it logs the error and still returns the cookies. `cron-auth` calls `storeSession` itself, so a cache failure stays red there
- *Failed enqueues (#275).* A scan where any enqueue threw returns `action: 'enqueue_failed'`, with `failedEnqueues` (the count) and `failedEnqueueIds` (the first 5), plus the usual counts. `cron-schedule` records it as `failure` with error `N enqueue(s) failed` and the counts in `result`. The cursor still advances: at about 4 scans a day it cycles in about 2 days, and one item that always fails mustn't freeze it. An insert that hits the unique key (`23505`, a concurrent scan queued it first) returns `unchanged`, not a failure. Integration Check step 0 drains after `enqueue_failed` as after `ok`
- *Still true:* `session_cleared` is recorded as health success (a single expired session is routine; `cron-auth` re-logs in daily). A persisting one is reported by ops-watch's schedule-scan rule (REQ-651) and its 16 h oldest-pending rule

**DB schema additions (run migration before first deploy):**
```sql
ALTER TABLE sync_settings
  ADD COLUMN sync_mode VARCHAR DEFAULT 'micro',
  ADD COLUMN session_cookies TEXT,
  ADD COLUMN session_expires_at TIMESTAMPTZ,
  ADD COLUMN schedule_cursor_date DATE;

CREATE TABLE sync_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  title TEXT,
  status VARCHAR DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);
```

**Tests:** `src/__tests__/scraper/sessionCache.test.js`, `src/__tests__/scraper/syncQueue.test.js`, `src/__tests__/scraper/syncRunner.test.js`, `src/__tests__/syncCronHandlers.test.js`

---

### REQ-107: Sync Admin UI
**Added:** v2.0 | **Status:** Deferred

Administrators can manage sync settings and view status.

**Acceptance Criteria:**
- Settings page has "External Sync" section ✅
- Can enable/disable automatic sync (deferred)
- Can configure sync interval (deferred)
- Can view sync history (last 10 syncs) (not yet built)
- Can view sync errors (not yet built)
- Can trigger manual sync with date range ✅ (`SyncSettings.jsx`, date pickers added v2.0)

**Tests:** `pages/SyncSettings.test.jsx`

---

### REQ-110: HTML Parse Degradation Detection
**Added:** v2.0 | **Status:** Complete

The scraper parses third-party HTML using CSS selectors. If agirlandyourdog.com updates
their appointment page template, extraction silently returns nulls — the business owner
would notice bad data before we do.

**Acceptance Criteria:**
- After each sync run, count detail fetches where `pet_name` is null OR `check_in_datetime` is null
- If null rate exceeds threshold (e.g., >20% of fetches), write `status: 'parse_degraded'` to `sync_logs`
- Include `parse_null_count` and `parse_total_count` in the degraded log entry
- UI surfaces a visible warning when latest sync log has `status: 'parse_degraded'`
- Threshold is configurable (constant in `config.js`, not hardcoded)
- Does not fire on syncs with 0 detail fetches (e.g., all appointments unchanged)

**Tests:** `src/__tests__/scraper/sync.test.js`

---

---

## v2.2: Revenue Intelligence

### REQ-200: Extract Pricing From Appointment Pages
**Added:** v2.2 | **Status:** Complete

During each appointment detail fetch, parse the `#confirm-price` section to extract
the billed amount and per-service line items. The external site stores pricing in
machine-readable `data-*` attributes — rate in cents (÷ 100), qty × 100 (÷ 100).

**Acceptance Criteria:**
- New `extractPricing(doc)` function in `extraction.js`
- Returns `{ total, lineItems }` or `null` if `#confirm-price` section missing (null = not error)
- `total`: parsed from `.toggle-field.text.quote` text via `/\$(\d+(?:\.\d+)?)/` → float
- Each line item: `{ serviceName, rate, qty, amount }` where `rate = parseFloat(data-rate)/100`, `qty = parseFloat(data-qty)/100`
- Night rate identified from first service line whose name does NOT match day-only patterns (config list)
- Day-only patterns in `SCRAPER_CONFIG.dayServicePatterns`: `/day/i`, `/daycare/i`, `/DC /i`, `/pack/i`
- If only ONE service line exists → night rate stays null (cannot safely classify)
- If total text unparseable → return null, log warn
- Individual line item parse errors → skip that item, log warn, continue with others
- `pricing_line_items` (JSONB) and `appointment_total` (decimal) stored in `sync_appointments`
- NOT added to parse degradation check — missing pricing is expected on some appointments

**Tests:** `src/__tests__/scraper/extraction.test.js` (new `extractPricing` suite, min 8 tests)

---

### REQ-201: Sync Rates and Billed Amount to App Records
**Added:** v2.2 | **Status:** Complete

Use extracted pricing to populate financial fields on `dogs` and `boardings`, making the
external site the authoritative source for rates.

**Acceptance Criteria:**
- `mapToBoarding()` populates `billed_amount` from `appointment_total` when available
- `mapToBoarding()` populates `night_rate` from identified night line item rate; `day_rate` from day line item rate
- `mapToDog()` sets `night_rate` and `day_rate` from extracted rates **every sync** (external site = source of truth)
- `mapToDog()` does NOT update rates when pricing extraction returned null (no pricing data → preserve existing)
- When pricing absent: `billed_amount`, `night_rate`, `day_rate` all null on new boarding — no error
- **Migration `013_add_pricing_columns.sql`:**
  - `boardings`: `billed_amount NUMERIC(10,2)`, `night_rate NUMERIC(10,2)`, `day_rate NUMERIC(10,2)` (all nullable)
  - `sync_appointments`: `appointment_total NUMERIC(10,2)`, `pricing_line_items JSONB`
- Existing boardings with null values fall back to dog-level rates in calculations (no breakage)

**Tests:** `src/__tests__/scraper/mapping.test.js` (new pricing suite, min 10 tests)

---

### REQ-202: Revenue Reporting View
**Added:** v2.2 | **Status:** Complete

Users can see actual revenue generated by boarding appointments over a selected period.

**Acceptance Criteria:**
- New "Revenue" section (location TBD: matrix page or separate tab)
- Lists boardings in date range with: dog name, check-in, check-out, revenue amount
- Revenue shown as `billed_amount` for external boardings when available
- Revenue fallback for manual boardings or pre-v2.2 records: `night_rate × nights` computed
- Boardings using computed fallback shown with indicator (e.g., "est." label)
- Period total shown at bottom of list
- "Period Revenue" summary card on matrix uses `billed_amount` (not computed) for external boardings
- Respects existing date range navigation

**Tests:** `src/__tests__/pages/RevenueView.test.jsx` or extend `BoardingMatrix.test.jsx`

---

### REQ-203: Payroll Calculations Use Extracted Rates
**Added:** v2.2 | **Status:** Complete

Payroll uses per-boarding night rates extracted from sync when available, replacing the
dog-level default that starts at $0 for all synced dogs.

**Acceptance Criteria:**
- For a given night, employee earnings = (sum of each boarding dog's rate for that night) × net_percentage
- Rate per dog per night: use `boarding.night_rate` if set; fall back to `dog.night_rate`
- If both null/zero: dog contributes $0 to night total (same behavior as today, no regression)
- No changes to payroll UI layout — calculation change only
- Existing payroll tests still pass with no changes
- New tests cover: rate from boarding (preferred), fallback to dog rate, fallback to zero

**Tests:** `src/__tests__/utils/calculations.test.js` (extend payroll suite, min 6 new tests)

---

---

## v2.4 — Reporting & Observability

### REQ-400: Calendar Print / Export
**Added:** v2.4 | **Status:** Complete

Users can print or export to PDF a day-by-day schedule for any date range, formatted to
match the calendar day detail panel.

**Acceptance Criteria:**
- "Print" button on the Calendar page header opens a date range modal
- Default range = first day to last day of the currently displayed month
- "Generate & Print" triggers `window.print()` — compatible with browser print-to-PDF
- Print view renders one section per calendar day in the selected range
- Days with no bookings are skipped entirely (not shown in output)
- Each day section shows: date header, Arriving / Staying / Departing groups, overnight count + Gross + Net summary
- Layout and labels match the existing day detail panel
- All navigation, sidebar, and app chrome is hidden via `@media print`

**Tests:** N/A (print UI — manual verification)

---

### REQ-401: Cron Health Monitoring
**Added:** v2.4 | **Status:** Complete

Each cron job records its last run time and outcome in the database, visible on the Settings
page. Replaces reliance on ephemeral Vercel logs (which expire in ~1 hour on Hobby plan).

**Acceptance Criteria:**
- New `cron_health` table: `cron_name` (unique text), `last_ran_at`, `status` (`success`/`failure`), `result` (JSONB), `error_msg`, `updated_at` — one row per cron, always the latest run
- New `cron_health_log` table: append-only history (`cron_name`, `status`, `result`, `error_msg`, `ran_at`) — every run appended, never overwritten. Created by **Migration 021**.
- **Migration 014** creates `cron_health` with RLS enabled; authenticated users can SELECT
- `writeCronHealth()` helper (`api/_cronHealth.js`) upserts to `cron_health` AND appends to `cron_health_log` — both writes are non-fatal (failure logs a warning but never breaks the calling cron)
- All cron handlers (`cron-auth`, `cron-schedule`, `cron-detail`, `cron-detail-2`, `notify`) call `writeCronHealth` on completion
  - Success path: writes run stats as `result` JSON (e.g. queued count, pages scanned)
  - Catch block: writes `status = 'failure'` and `error_msg`
- `cron-health-check` alerts on 2 consecutive failed **runs**: it skips the `started` rows each run logs first, so a failure, started, failure, started log counts as 2 in a row (#275). The alert includes the latest `error_msg`
- Settings page shows a "Cron Health" card with 3 rows (Auth / Schedule / Detail):
  - Last ran timestamp displayed as relative time ("3 hours ago") and absolute datetime on hover
  - Green badge for `success`, red badge for `failure`
  - Result summary (e.g. "12 queued, 2 pages scanned")
  - "Never" shown if cron has not run yet

**Tests:** `src/__tests__/scraper/cronHealth.test.js` (helper), `src/__tests__/cronHealthCheck.test.js` (consecutive failures), `src/__tests__/syncCronHandlers.test.js` and `src/__tests__/notifyHandler.test.js` (each handler records success/failure); the Settings card is manual

---

### REQ-402: Code Review & Hardening
**Added:** v2.4 | **Status:** Complete

Audit and harden the application before wider use.

**Acceptance Criteria:**
**Security audit complete (March 2, 2026). See `docs/archive/REQ-402-security-audit.md` for full findings.**

MUST-FIX:
- [x] MUST-1: Remove VITE_ prefix from `EXTERNAL_SITE_USERNAME` / `EXTERNAL_SITE_PASSWORD`; move credential reading to server-side proxy only (affects sync-proxy.js, auth.js, sync.js, cron-auth.js) — commit 80ff992. ⚠️ **Rename env vars in Vercel dashboard before next deploy.**
- [x] MUST-2: Add hostname validation to sync-proxy `fetch` action to prevent SSRF — commit 80ff992

RECOMMENDED:
- [x] REC-1: Add authentication to `/api/sync-proxy` endpoint — `VITE_SYNC_PROXY_TOKEN` Bearer token (intentionally public, browser-readable). Set in Vercel dashboard. Skipped in local dev when unset. commit cc3a9e5
- [x] REC-2: cron-detail `session_cleared` path — add `writeCronHealth` call before return — commit 80ff992
- [ ] REC-3: CRON_SECRET guard — add warning log if absent in production
- [x] REC-4 (partial): batchSync.js removed (commit 154c408) + deletionDetection.js + stagedVerification.js (commit 80ff992). historicalSync.js kept (useful for rebuild from scratch). SyncHistoryPage cluster kept (REQ-107 backlog).
- [x] REC-5: Remove dead `SCRAPER_CONFIG.retryDelays` (not used by cron path) — commit 80ff992

DELIVERABLE:
- [x] Save `docs/REQ-402-security-report-FINAL.md` at completion — written March 2, 2026

**Tests:** All existing 651 tests must pass after changes. No new tests required (server-side env vars are not testable in unit tests without real secrets).

---

---

## Boarding Form Scraping & Modal (v3.0)

### REQ-500: Extract External Pet ID from Schedule HTML
**Added:** v3.0 | **Status:** Complete

The schedule page HTML contains `data-pet` attributes identifying each pet in an appointment.
`parseSchedulePage` must extract these IDs and include them in the returned appointment objects.
The IDs are then stored on the `dogs` table (`external_pet_id`) and passed to form-fetch jobs.

**Acceptance Criteria:**
- `parseSchedulePage` returns `petIds: string[]` for each appointment
- Single-pet appointment returns `petIds: ['10008']` (example)
- Multi-pet appointment returns all pet IDs in document order
- Appointment with no `event-pet-wrapper[data-pet]` elements returns `petIds: []`
- `dogs.external_pet_id` is populated/updated on the next sync for that dog
- Migration 016 adds `external_pet_id TEXT` column + index to `dogs` table

**Tests:** `src/__tests__/scraper/schedule.petids.test.js`

---

### REQ-501: Scrape and Store Boarding Information Forms
**Added:** v3.0 | **Status:** Complete

After a boarding is upserted, if the boarding is current or upcoming and the dog has an
`external_pet_id`, a form-fetch job is enqueued in `sync_queue` (type='form'). The
`cron-detail` job processes it: fetches `/pets/{external_pet_id}/forms`, filters to
form 7913, fetches the best-matching submission detail, and upserts to `boarding_forms`.

**Acceptance Criteria:**
- Migration 016 creates `boarding_forms` table with `boarding_id` FK (UNIQUE), `submission_id`, `submission_url`, `form_submitted_at`, `form_arrival_date`, `form_departure_date`, `date_mismatch`, `form_data JSONB`, `fetched_at`
- Migration 016 adds `type VARCHAR DEFAULT 'appointment'` and `meta JSONB DEFAULT '{}'` to `sync_queue`
- `parseFormsListPage` extracts submissions from form 7913 only; deduplicates by submission ID
- `parseFormDetailPage` extracts all field label/value pairs; identifies arrival/departure date fields
- `findFormForBoarding` returns most recent submission on or before boarding arrival; falls back to most recent overall; null if empty
- `fetchAndStoreBoardingForm` upserts the form data for the given boarding
- Dogs already in DB pick up `external_pet_id` on their next sync cycle

**Tests:** `src/__tests__/scraper/forms.test.js`

---

### REQ-502: Date Discrepancy Detection
**Added:** v3.0 | **Status:** Complete

When storing a boarding form, the app compares the form's confirmed arrival/departure dates
against the booking dates. A mismatch is recorded in the `date_mismatch` boolean column
and surfaced prominently in the UI.

**Acceptance Criteria:**
- `date_mismatch = true` when `form_arrival_date ≠ boarding.arrival_datetime` (date part) OR `form_departure_date ≠ boarding.departure_datetime` (date part)
- `date_mismatch = false` when dates match exactly
- `date_mismatch = false` when form dates are null (no date fields in form)
- Form dates are stored as-is (form wins, not booking dates)
- UI surfaces the mismatch prominently (amber alert in modal)

**Tests:** `src/__tests__/scraper/forms.test.js` (date_mismatch detection logic suite)

---

### REQ-503: Boarding Form Modal UI
**Added:** v3.0 | **Status:** Complete

A modal displays the full boarding information form for a dog. Priority fields are shown
first, followed by remaining fields. If dates are mismatched, an amber alert is shown.
A print button prints the form cleanly.

**Acceptance Criteria:**
- Modal opens from dog name button in BoardingMatrix (dashboard) and DogsPage boardings table
- Header shows dog avatar initials + "{Dog Name} — Boarding Form"
- Submitted date shown in header subtitle
- If `date_mismatch`: amber alert box showing booking dates vs form dates
- Priority fields section (CONFIRM ARRIVAL DATE, CONFIRM DEPARTURE DATE, ARRIVAL TIME, DEPARTURE TIME, FEEDING INSTRUCTIONS, MEDICATIONS/MEDICAL CONDITION, TRAVEL DETAILS AND BEST CONTACT)
- "Additional Information" divider + remaining fields
- Print button calls `window.print()`; print CSS hides app chrome, shows form content
- Escape key and click-outside close the modal
- Body overflow locked while modal is open

**Tests:** Manual/visual (no automated UI tests for this component)

---

### REQ-504: Missing Form Indicator
**Added:** v3.0 | **Status:** Complete

Dog names in the BoardingMatrix and DogsPage boardings table are shown as clickable buttons.
If no form has been found for the relevant boarding, the button is styled amber with a tooltip.
If a form is found, the button is styled indigo.

**Acceptance Criteria:**
- Dog names in BoardingMatrix (desktop + mobile) are `<button>` elements for upcoming boardings
- Dog names in DogsPage boardings table are `<button>` elements
- No form found → amber color + "No Boarding Form Found!" tooltip
- Form found → indigo color + "View boarding form" tooltip
- "Relevant boarding" = most imminent current/upcoming boarding for the dog
- `isBoardingUpcoming(boarding)` = `departure_datetime >= today midnight`
- `useBoardingForms()` hook queries `boarding_forms` joined to `boardings`; filters to departures >= today midnight; returns `formsByBoardingId` map

**Tests:** Manual/visual

---

### REQ-505: Forms Scraper Logging
**Added:** v3.0 | **Status:** Complete

`forms.js` uses the `syncLogger` pattern with structured log prefixes so debugging a failed
form fetch is straightforward from Vercel logs.

**Acceptance Criteria:**
- `[Forms] 🔍 Fetching forms list for pet {id} ({name})`
- `[Forms] 📋 Found N submissions for form 7913 (pet {id})`
- `[Forms] 🎯 Boarding match: submission {id} (submitted {date})`
- `[Forms] ⚠️ Date mismatch: booking=..., form=...` (warn level)
- `[Forms] ✅ Stored boarding form for boarding {id} (sub {id}, mismatch={bool})`
- `[Forms] ❌ No form 7913 submissions found for pet {id}`
- `[Forms] ⚠️ All submissions after boarding arrival — using most recent (sub {id})` (warn level)
- `[CronDetail] 📋 Processing form job: boarding_id={...}, pet_id={...}`

**Tests:** Verified by inspection of log output during `forms.test.js` test run

---

### REQ-506: Boarding Form Modal — Reliable Centering via Portal
**Added:** v3.0 | **Status:** Complete

`BoardingFormModal` uses `position: fixed` for its backdrop and panel. If any ancestor
element has `transform`, `will-change: transform`, `filter`, or `contain: layout` applied,
`fixed` is repositioned relative to that element instead of the viewport, causing the modal
to appear at the bottom or be partially off-screen.

Fix: render the modal via `ReactDOM.createPortal` into `document.body` so it always escapes
the component tree and positions relative to the viewport.

**Acceptance Criteria:**
- Clicking a dog name on the Dashboard or Dogs page opens the boarding form modal fully
  centred in the viewport, regardless of scroll position or ancestor CSS transforms
- Backdrop covers the full viewport at 50% opacity
- Modal panel is vertically and horizontally centred
- Escape key and click-outside still close the modal

**Tests:** `src/__tests__/components/BoardingFormModal.test.jsx` (portal mock verifies rendering through createPortal)

---

### REQ-507: Boarding Form Link — Three-State Color Coding
**Added:** v3.0 | **Status:** Complete

Dog name links in `BoardingMatrix` and `DogsPage` boardings table should use three colours
to communicate form status at a glance:

| State | Color | Condition |
|-------|-------|-----------|
| No boarding form found | **Red** (`text-red-600`) | `relevantBoarding && !formData` |
| Form found, no important fields | **Amber** (`text-amber-600`) | `formData` exists but `priorityFields.length === 0` |
| Form found with fields | **Indigo** (`text-indigo-700`) | `formData` exists and `priorityFields.length > 0` |
| No upcoming boarding | Slate (default) | `!relevantBoarding` |

Currently red and amber are swapped — "no form" uses amber instead of red.

**Acceptance Criteria:**
- Dog with no form record in `boarding_forms` → red link with tooltip "No boarding form found"
- Dog with form record but zero priority fields → amber link with tooltip "Form found — no key fields"
- Dog with form record and at least one priority field → indigo link
- Same colour logic applies in both `BoardingMatrix` and `DogsPage` boarding table
- Colour logic extracted into a shared helper (optional, to avoid duplication)

**Tests:** `src/__tests__/components/BoardingMatrix.test.jsx`

---

### REQ-508: Boarding Form Modal — Show Source URL
**Added:** v3.0 | **Status:** Complete

`boarding_forms.submission_url` already holds the full URL to the form detail page on the
external booking site (e.g. `https://agirlandyourdog.com/pets/10008/forms/7913/view/12345`).
The modal should display it so the user can open the original form in a new tab.

**Acceptance Criteria:**
- Modal footer (or header sub-line) includes a "View on site →" link
- Link opens `submission_url` in a new tab (`target="_blank" rel="noopener noreferrer"`)
- Link is not rendered when `submission_url` is absent or null
- Link is hidden during print (`print:hidden`)

**Tests:** `src/__tests__/components/BoardingFormModal.test.jsx`

---

---

## v4.0 — Daytime Activity Intelligence

### REQ-600: Daytime Appointment Ingestion
**Added:** v4.0 | **Status:** Complete

The cron pipeline ingests all DC (Daycare) and PG (Pack Group) appointments from the weekly schedule page, storing them in `daytime_appointments` with per-worker attribution.

**Acceptance Criteria:**
- `daytimeSchedule.js` parses schedule HTML using regex (Node.js safe — no DOMParser)
- Extracts `data-id`, `data-ts`, `data-start`, `data-status`, `data-series`, `class="ew-{uid}"` (worker), `cat-{id}`, `ser-{id}` (service) from `.day-event` elements
- Only DC (cat-5634/ser-10692) and PG (cat-7431/ser-15824) appointments are stored
- `cron-schedule.js` calls daytime ingest after boarding queue pass
- `daytime_appointments` table stores: `external_id`, `series_id`, `worker_id`, `service_type` (`DC`/`PG`), `appointment_date`, `start_time`, `pet_names`, `status`, `raw_data`
- Upsert on `external_id` — re-running is safe

**Tests:** `src/__tests__/scraper/daytimeSchedule.test.js`

---

### REQ-601: Worker Registry
**Added:** v4.0 | **Status:** Complete

The `workers` table stores the known roster of workers with their external UIDs, enabling per-worker roster grouping.

**Acceptance Criteria:**
- `workers` table: `id`, `external_id` (unique integer, the `ew-{uid}` value), `name`, `active`
- Six known workers (UIDs 61023, 208669, 141407, 174385, 189436, 164375). Their names are stored only in the `workers` table, never in the repo (it is public, #281); `src/lib/workers.js` holds the UIDs and the roster column order
- The roster image reads worker names from the `workers` table (active rows)
- `daytime_appointments.worker_external_id` holds the event's worker UID (0 = none); it has no foreign key
- Unknown `ew-{uid}` values stored as-is; unmatched workers logged as warn. A known UID or uid 0 (no worker) logs no warning

**Tests:** `src/__tests__/scraper/daytimeSchedule.test.js`, `src/__tests__/workers.test.js`

---

## v4.1 — WhatsApp Roster Notifications

### REQ-610: Daily Roster Image Generation
**Added:** v4.1 | **Status:** Complete

`/api/roster-image` generates a branded PNG showing each worker's dogs for the day, with day-over-day diff indicators.

**Acceptance Criteria:**
- Token-gated (`?token=` matching the server-only `INTERNAL_API_TOKEN`, REQ-656)
- Uses `satori` + `resvg` to render JSX → PNG
- AGYD brand colors: forest green `#4A773C` header, sage `#78A354` headings, charcoal `#333333` body
- Green `+` for newly added dogs (series not in yesterday's set), red strikethrough for removed dogs
- `getPictureOfDay()` in `src/lib/pictureOfDay.js` computes worker diffs from `daytime_appointments`
- Boarding dogs shown in a separate section below worker rosters

**Tests:** Manual/visual; `src/__tests__/lib/pictureOfDay.test.js` covers diff logic

---

### REQ-611: Morning Notify Delivery Windows
**Added:** v4.1 | **Status:** Complete

GitHub Actions workflows call `/api/notify` at three windows each weekday morning.

**Acceptance Criteria:**
- `notify-4am.yml` fires at 11:00 UTC (4am PDT, Mon–Fri)
- `notify-7am.yml` fires at 14:00 UTC (7am PDT, Mon–Fri)
- `notify-830am.yml` fires at 15:30 UTC (8:30am PDT, Mon–Fri)
- Each calls `GET /api/notify?window=4am|7am|8:30am`
- `notify.js` refreshes daytime schedule live before building image (not stale midnight data)
- Sends to all numbers in `NOTIFY_RECIPIENTS` via the Meta WhatsApp Cloud API

**Tests:** `src/__tests__/notifyHandler.test.js` (handler); delivery itself is checked in production by ops-watch (REQ-651)

---

### REQ-612: Hash-Gated Deduplication
**Added:** v4.1 | **Status:** Complete

7am and 8:30am windows skip sending if roster hasn't changed since last send.

**Acceptance Criteria:**
- After each send, `hashPicture(data)` stored in `cron_health.result.lastHash` for cron `notify`
- On next window: if hash matches → skip send, log "no change"
- 4am always sends (first window of day)
- A send that reached **no** recipient (every result `failed`) does not count as sent (#255): the hash is not stored, `cron_health` `notify` records `failure` with `No recipient received the roster (N of N sends failed)`, and the endpoint returns 500 so the workflow run goes red. The next window has no baseline and sends again. A send that reached at least one recipient counts as sent.
- `friday-pm` always sends (separate workflow, no hash gate)
- `shouldSendNotification(window, lastHash, currentHash)` in `pictureOfDay.js`

**Tests:** `src/__tests__/lib/pictureOfDay.test.js`, `src/__tests__/notifyHandler.test.js`

---

## v4.3 — Integration Check

### REQ-620: Automated DB vs Live Schedule Check
**Added:** v4.3 | **Status:** Complete

An independent GH Actions script verifies that the DB matches the live external schedule 3× daily, alerting on discrepancies.

**Acceptance Criteria:**
- `scripts/integration-check.js` runs in GH Actions (`integration-check.yml`) at 1am, 9am, 5pm PDT and on-demand via `workflow_dispatch`
- Loads session from DB (`sync_settings`); renders schedule page via Playwright (headless Chromium)
- Extracts all boarding + DC/PG appointment IDs from live DOM
- Queries DB: boardings in past-7d → today+7d window; daytime appointments for today
- Flags: IDs on schedule missing from DB; IDs in DB with `Unknown` dog name; daytime events on schedule missing from DB
- Sends the text report to Kate through `sendAlert` (Telegram, REQ-652); exits 1 when the report was needed but not delivered
- Exits 0 when the report was delivered or not needed: discrepancies are reported, not fatal
- Canceled/request-type bookings are a known false positive (not imported); documented in `docs/job_docs/integration-check.md`
- Daycare-only schedule titles are not boarding candidates: PG day schedules, make-up days, no charge, daycare, N/C, a bare date, and `Wknd DC` / `Weekend DC` without a date range (#272). A title that merely names the "DC full-time" tier still is (#198)
- Step 3 (Claude vision name-check) silently skipped when `ANTHROPIC_API_KEY` has no credits

**Tests:** `src/__tests__/integrationCheckFilter.test.js` (daycare-only filter), `src/__tests__/integrationCheckReport.test.js` (report and exit code). The Playwright compare itself is verified manually.

---

## v4.4 — Friday PM Weekend Notify

### REQ-630: Friday PM Weekend Boarding Preview
**Added:** v4.4 | **Status:** Complete

Every Friday afternoon, a WhatsApp image previews weekend boarding activity (arrivals and departures Sat–Sun).

**Acceptance Criteria:**
- `notify-friday-pm.yml` fires at 22:00 UTC (3pm PDT, Fri only)
- `GET /api/notify?window=friday-pm` generates a weekend-themed image
- Shows two sections: dogs arriving and dogs departing Fri–Sun with check-in/out times and night counts
- Always sends regardless of hash (weekend preview is always useful)
- A send that reached no recipient records `notify-friday-pm` `failure` (`No recipient received the roster (N of N sends failed)`) and returns 500 (#255)
- `cron_health` row written for `notify-friday-pm`

**Tests:** `src/__tests__/notifyHandler.test.js`

---

## v4.4.1 — Session Self-Healing

### REQ-640: Unconditional cron-auth Re-authentication
**Added:** v4.4.1 | **Status:** Complete

`cron-auth` always re-authenticates on every run. The prior "skip if valid" logic caused a race condition: if the session was stored a few minutes after midnight (e.g. 00:27), the midnight cron saw it as still valid and skipped re-auth. The session expired at 00:27 the next day, leaving all morning notify windows without a session.

**Acceptance Criteria:**
- `cron-auth` calls `authenticate()` unconditionally — no session validity check before auth
- Response always includes `{"action": "refreshed", "expiresAt": "..."}` on success (no `"action": "skipped"`)
- `writeCronHealth` records the refreshed state after every run

**Tests:** `src/__tests__/scraper/auth.test.js`, `src/__tests__/syncCronHandlers.test.js`

---

### REQ-641: ensureSession Self-Healing
**Added:** v4.4.1 | **Status:** Complete

`ensureSession()` gives `cron-schedule`, `cron-detail`, and `notify` the ability to recover from a missing or expired session without waiting for the next `cron-auth` run.

**Acceptance Criteria:**
- `ensureSession(supabase, username, password)` exported from `sessionCache.js`
- If cached session exists and is not expired → return it (fast path, no HTTP call)
- If session missing or expired → call `authenticate()`, store result, return new session
- `cron-schedule` and `cron-detail` call `ensureSession` instead of `getSession`
- `notify.js` calls `ensureSession` in its daytime refresh path
- `sendRefreshAlert` deduplicates: only 1 WhatsApp alert per day (checks `lastAlertDate` in cron_health result)

**Tests:** `src/__tests__/scraper/sessionCache.test.js` (8 new tests), `src/__tests__/notifyHandler.test.js` (refresh alert dedup)

---

### REQ-642: Cron Health History Log
**Added:** v4.4.1 | **Status:** Complete

`cron_health` stores only the latest run per cron. `cron_health_log` is an append-only companion that records every run, enabling post-hoc debugging (e.g. seeing that cron-auth ran at 00:12 and skipped re-auth — even after the next run overwrites `cron_health`).

**Acceptance Criteria:**
- **Migration 021** creates `cron_health_log(id SERIAL, cron_name TEXT, status TEXT, result JSONB, error_msg TEXT, ran_at TIMESTAMPTZ)` — append-only, no upsert
- RLS enabled; authenticated users can SELECT
- `writeCronHealth()` inserts to `cron_health_log` on every call (in addition to upsert on `cron_health`)
- Log insert failure is non-fatal — logs a warning, does not throw
- Rows accumulate indefinitely (no TTL at this scale)

**Tests:** `src/__tests__/scraper/cronHealth.test.js` (2 new tests)

---

### REQ-700: Send a Question
**Added:** v6.2.0 | **Status:** Complete

Users can send a question or comment to Kate directly from the nav user dropdown. The message goes to Kate's alert channel (`sendAlert`, Telegram — REQ-652), the same one cron-health-check and gmail-monitor use.

**Acceptance Criteria:**
- "Send a Question" button in the nav user dropdown (desktop) and mobile menu
- Clicking opens a modal with a "Question / Comment" label, textarea (max 1000 chars), character counter, Send and Cancel buttons
- On Send, the message is delivered to Kate through her alert channel (`sendAlert`, Telegram — REQ-652) as `Question from <the signed-in user's email>:`. The sender comes from the verified user, never from the request body
- Loading state ("Sending…") shown while in-flight; "Sent!" confirmation on success; inline error message on failure
- Modal auto-closes 1.5 seconds after a successful send
- `POST /api/send-question`: accepts only a signed-in user (REQ-656), rejects empty or >1000-char messages, calls `sendAlert`; returns 502 when the message wasn't delivered (REQ-652)

**Tests:** `src/__tests__/sendQuestion.test.js`

---

### REQ-701: Overnight Staff Calendar Grid
**Added:** v6.2.0 | **Status:** Complete

The Calendar page shows a second calendar grid below the dog boarding calendar, labeled "Overnight Staff", showing which employee worked each overnight boarding shift.

**Acceptance Criteria:**
- A full-width "Overnight Staff" grid appears below the dog boarding calendar, sharing the same month/navigation state
- Each cell that has a night assignment shows a colored name chip (using `stringToColor`) with the employee's name
- Cells with `employeeId === null` show a neutral "N/A" pill
- Cells with no assignment at all are blank
- The grid is read-only (no click/select behavior)
- Today's date is highlighted in the staff grid matching the dog grid style

**Tests:** `src/__tests__/pages/CalendarStaffGrid.test.js` (7 tests)

---

## v6.3 — Ops: Silence Is Never Success

### REQ-650: Scheduled Workflow Keep-Alive
**Added:** v6.3.0 | **Status:** Complete

GitHub disables a repo's scheduled workflows after 60 days without a commit. That happened on 2026-08-24 and stopped every notification silently. A weekly keep-alive workflow refreshes each active workflow so the timer never runs out, and fails loudly when one has already been disabled.

**Acceptance Criteria:**
- Runs weekly (Monday 12:00 UTC) and on demand (`workflow_dispatch`)
- Only workflows defined in `.github/workflows/` are considered (GitHub's built-in ones, like Dependabot, are skipped)
- A workflow in state `active` is refreshed by calling GitHub's enable endpoint for it (this includes the keep-alive itself)
- A workflow in state `disabled_inactivity` is **not** re-enabled automatically: the run fails and names it, so Kate decides
- A workflow in state `disabled_manually` is left alone and is not a failure (someone turned it off on purpose)
- A workflow in any other state (e.g. `deleted`) is ignored: not refreshed, not a failure
- An enable call that fails makes the run fail and names the workflow; the remaining workflows are still refreshed
- If the listing holds no workflows from `.github/workflows/` at all, the run fails (the keep-alive itself should always be there; an empty answer is never "all fine")
  - Workflows that are all disabled on purpose still count as listed: that run passes
- **Known exception to the Ops gate (until #237):** a failed keep-alive shows only as a red run plus GitHub's email to whoever last edited its cron. It sends no WhatsApp, because an alert sent from GitHub would share the scheduler it is reporting on. ops-watch on Vercel (#237) is the real alert

**Tests:** `src/__tests__/workflowHealth.test.js`

---

### REQ-651: Ops Watch (outcome check outside GitHub)
**Added:** v6.3.0 | **Status:** Complete

A daily Vercel cron (`/api/ops-watch`, 17:00 UTC) checks the outcomes the client depends on, from a scheduler GitHub can't switch off. It runs once a day and reports every finding in one message. Design: `docs/specs/ops-watch-design-note.md`.

**Acceptance Criteria:**
- **Queue backlog:** a finding when the oldest `pending` `sync_queue` item was queued more than 16 h ago (#278; was 48 h)
- **Queue depth:** a finding when more than 30 `sync_queue` items are `pending` (#278)
- **Sync stalled:** a finding when there are `pending` items and no item reached `done` in the last 36 h; an empty queue is never a finding
- **Morning roster (Mon–Fri, Pacific date):** a finding when no `notify-4am` message was `sent` today, and a different finding when one was sent but none of its wamids has a `delivered` or `read` webhook row. Weekends are never checked
- **Scheduled workflows:** a finding for each workflow whose last successful run is older than its limit (gmail-monitor 3 h, integration-check 12 h, cron-health-check 26 h, notify-4am 4 days, keepalive 8 days), or that has never succeeded
- **Roster image:** a finding when the production weekend roster image doesn't return HTTP 200 with an `image/png` body
- **Couldn't check:** a query error, a missing token, or a GitHub API error is a finding naming what couldn't be checked; it is never treated as healthy
- With any finding: one alert to Kate (`sendAlert`, Telegram — REQ-652) listing all of them, **and** a dispatch of `ops-alert.yml` (which fails, so GitHub emails Kate). With none: nothing is sent
- The endpoint requires `Authorization: Bearer $CRON_SECRET` and rejects every request when `CRON_SECRET` is unset (fails closed)
- Each run is recorded in `cron_health` as `ops-watch`: `success` when every check ran and the alert (if any) went out, otherwise `failure`
- `cron-health-check` reports `ops-watch` when its last run is more than 26 h old
- **Schedule scan (#275):** one finding, from the `schedule` row of `cron_health`, in this order: no row; last run more than 26 h ago; still `started` (hung or killed); `failure` (with its error); `result.action` is `session_cleared`; `result.found` is 0. A successful scan with no recorded `result` isn't treated as found = 0

**Tests:** `src/__tests__/opsWatch.test.js`

---

### REQ-652: Kate's alerts on Telegram
**Added:** v6.4.0 | **Status:** In Progress

Every alert to Kate goes through one function, `sendAlert(text)` (`src/lib/alertKate.js`), which sends it to her through a dedicated Telegram bot. WhatsApp alerts stopped when Meta disabled the account (2026-10-18). A failed alert is never silent. Design: `docs/specs/telegram-alerts-design-note.md` (#259).

**Acceptance Criteria:**
- `sendAlert(text)` sends a plain-text Telegram `sendMessage` (no `parse_mode`) to `TELEGRAM_ALERT_CHAT_ID` through the bot `TELEGRAM_BOT_TOKEN`, once, with no retry and a 15 s timeout
- It never throws; it returns `[{ to: 'telegram', status: 'sent' | 'failed', error? }]`
- Missing `TELEGRAM_BOT_TOKEN` or `TELEGRAM_ALERT_CHAT_ID` → `failed` with `Telegram alert channel not configured`, and no request is made
- A Telegram error → `failed` with `Telegram sendMessage <error_code>: <description>`. A network error or timeout → `failed` (`network error` / `timed out`). No error text or log line contains the bot token
- Text longer than 4000 characters is cut to 4000 code points, ending in `…` (an emoji is never split)
- `alertDelivered(results)` is true only when at least one result is `sent`
- **Callers:**
  - `cron-health-check`, `integration-check` and `gmail-monitor` alert through `sendAlert`. When an alert they sent wasn't delivered, the run exits 1, so it goes red and GitHub emails Kate. Integration discrepancies alone still exit 0
  - `gmail-monitor` marks an email processed only after its alert was delivered, so the next run retries it
  - `send-question` returns `502 { ok: false }` when the question wasn't delivered (including a missing channel configuration), and `200 { ok: true }` only when it was
  - `ops-watch` sends its findings through `sendAlert` (and the GitHub email as before)
- **ops-watch rule:** any `message_log` row with `status = 'failed'` in the last 24 h for job `cron-health-check`, `integration-check`, `gmail-monitor` or `send-question` is one finding naming the count and the jobs

**Tests:** `src/__tests__/alertKate.test.js`, plus each caller's tests

---

### REQ-653: No real contact details in tests
**Added:** v6.4.0 | **Status:** Complete

The repo is public, so tests carry fictional contact details only (#264). CI rejects a realistic phone number or personal email in any test file: `src/__tests__` and every colocated `*.test.*` (`npm run check:test-pii`, `scripts/no-test-pii.sh`, in the Lint job).

**Acceptance Criteria:**
- A North American number written as `+1` and 10 digits, or as 3-3-4 digit groups split by `(`, `)`, `.`, `-` or a space, fails the check unless its area code or exchange is 555
- A bare 10-digit run with no `+1` and no separators, and a phone-shaped group inside a longer digit run, pass (timestamps and IDs)
- An email address fails unless its domain (any case, or a subdomain of it) is `example.com/.org/.net`, `test.com`, `domain.com`, or a service sender the tests match on (`github.com`, `vercel.com`, `supabase.com`, `anthropic.com`, `someothertool.io`). A lookalike such as `example.com.evil.io` fails
- A failing check prints each offending line, with its file and line number, and exits 1
- `check:test-pii` fails when git finds no test files, so it can never pass on empty input

**Tests:** `src/__tests__/noTestPii.test.js`

---

### REQ-654: Post-merge deploy check
**Added:** v6.4.0 | **Status:** Complete

A green PR doesn't mean production changed. On 2026-10-19 a merge hit Vercel's daily deploy limit and production silently stayed on the previous commit (#298). After every merge, `npm run check:deploy [sha]` waits for the commit's Vercel status, then checks that production answers.

**Acceptance Criteria:**
- With no SHA given, the commit checked is main's current head **as GitHub reports it** (a local `origin/main` is stale until fetched and would re-check the previous, already-deployed commit). The output names that commit's short SHA and subject. If GitHub can't be asked, the check fails with one line saying so
- Only qboard's commit status counts: context `Vercel` (since the duplicate project was disconnected, Vercel posts it unnamed) or `Vercel – qboard` (as it was with two projects). Other contexts (`Vercel – dog-boarding`, `codecov`) are ignored. When it was posted more than once, the newest one (by `updated_at`) wins
- No qboard status yet, or one in state `pending`, means keep waiting (every 20 s by default)
- State `success` means deployed. Any other state (`failure`, `error`) fails at once, and the message gives the state and Vercel's description (for example "Deployment rate limited — retry in 24 hours.")
- Still waiting when the timeout runs out (10 min by default) fails, and the message says what it was last waiting on: the last state and description, or that no Vercel status ever arrived (`no Vercel status`)
- A GitHub error while polling the statuses fails the check with one line naming the error (no stack trace)
- Only once deployed is production checked (before that it would describe the previous deploy): the home page (`https://qboarding.vercel.app`) must return 200, and `/api/roster-image?type=weekend&token=…` (token URL-encoded) must return 200 with content type `image/png`. Each wrong answer is reported on its own line. Production not answering at all is a failure too
- The check exits 1 on any failure, and 0 only when the deploy succeeded and production answered right

**Tests:** `src/__tests__/deployCheck.test.js`

---

### REQ-655: Roster channel (Telegram to Kate until Twilio)
**Added:** v6.4.0 | **Status:** Complete

Meta locked the WhatsApp Business Account on 2026-10-17, so the roster reached no one. Until Twilio SMS (#260) is approved, the roster goes to Kate only, on Telegram, chosen by one Vercel setting so the cutover to Twilio is one change. Design: `docs/specs/roster-channel-design-note.md`.

**Acceptance Criteria:**
- `ROSTER_CHANNEL` is required. The only value today is `telegram`. Unset or any other value fails `/api/notify` and `/api/notify-intraday` before any work: 500 with `ROSTER_CHANNEL is not set; expected one of: telegram` (or `is "<value>"`), and a failure in cron_health (`notify`, `notify-friday-pm` or `notify-intraday`). An unchanged 7am/8:30am window doesn't hide a bad value
- On `telegram`, the roster goes to `TELEGRAM_ALERT_CHAT_ID` only. Staff numbers (`NOTIFY_RECIPIENTS`) play no part, and an empty `NOTIFY_RECIPIENTS` doesn't skip the send
- The image is rendered once. Those bytes are stored (before the send) and sent as a Telegram photo. Captions: `Roster 4am` / `Roster 7am` / `Roster 8:30am`, `Weekend roster`, `Roster update`
- An image that can't be rendered fails the run (500, cron_health failure, hash not stored) with `Roster image fetch failed: HTTP <status>`, `Roster image fetch: timed out` or `Roster image fetch: network error`. No error, result, log line or response ever contains the image URL, the proxy token or the bot token
- A Telegram send that fails is a result `{ to: 'telegram', status: 'failed', error }`, where the error is `Telegram sendPhoto <error_code>: <description>`, `Telegram sendPhoto: timed out`/`network error`, or `Telegram not configured (…)`. A send that reached no one fails the run, with the reasons in the error, and stores no hash
- Hourly intraday images are for staff, so they're off on `telegram`: the run skips with reason `channel_telegram` before reading anything. On a channel where they're on, a send that reached no one fails the run and stores no delta hash (the next hour retries)
- The refresh alert goes to Kate through `alertAndLog` (job `notify-refresh-alert`). Only a delivered alert is recorded for the day's dedup, and an undelivered one is an ops-watch "alerts not delivered" finding
- ops-watch's morning roster check counts a `notify-4am` `message_log` row with recipient `telegram` and status `sent` as delivered (the Bot API accepted it for Kate's chat)

**Tests:** `src/__tests__/rosterChannel.test.js`, `src/__tests__/notifyHandler.test.js`, `src/__tests__/notifyIntraday.test.js`, `src/__tests__/opsWatch.test.js`

---

### REQ-656: No secret in the browser
**Added:** v6.5.0 | **Status:** Complete

The proxy token was built into the public JavaScript bundle (`VITE_` prefix), so anyone could call the internal endpoints with it (#301). Browser calls now prove a signed-in user; the jobs use a server-only token. Design: `docs/specs/browser-auth-design-note.md`.

**Acceptance Criteria:**
- `/api/send-question` and `/api/sync-proxy` accept only a Supabase user access token (`Authorization: Bearer <jwt>`), checked against Supabase's `GET /auth/v1/user` with a 5 s timeout. The server token is not accepted there
- The check fails closed: missing `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` → 500 `Server misconfigured`; no or malformed header, a rejected token, or a 200 without a user id → 401 `Unauthorized`; a Supabase 5xx, network error, timeout or unreadable body → 503 `Sign-in check unavailable`. None of these is a pass, and nothing else runs
- `sync-proxy` fetches only with GET; any other method → 400 `Only GET is allowed`, and the booking site is never called
- The browser sends the session's access token, read with `getSession()` on every proxy call (so a long sync uses a refreshed token). The server jobs that import the scraper still load under plain Node
- The jobs' endpoints (`notify`, `notify-intraday`, `roster-image`, `intraday-image`), ops-watch's image check, the notify workflows and `check:deploy` use `INTERNAL_API_TOKEN`. Unset, those endpoints answer 401
- No browser code reads a token through `import.meta.env`; no secret has a `VITE_` prefix
- `api/run-sync.js` (an unused token-guarded full sync) is gone

**Tests:** `src/__tests__/verifyUser.test.js`, `src/__tests__/sendQuestion.test.js`, `src/__tests__/syncProxyAuth.test.js`, `src/__tests__/scraper/browserProxyAuth.test.js`, `src/__tests__/cronAuthNodeImport.test.js`

---

## How to Add a New Requirement

1. Add entry to this document with next available ID in the appropriate section
2. Write acceptance criteria (specific, testable conditions)
3. Write tests that verify the criteria
4. Add test file reference to requirement
5. Implement feature
6. Verify tests pass
7. Run `npm run check:requirements` to confirm coverage

## Requirement ID Ranges

- **REQ-001 to REQ-009**: Authentication & Access Control
- **REQ-010 to REQ-019**: Dogs
- **REQ-020 to REQ-029**: Boardings
- **REQ-030 to REQ-039**: Boarding Matrix
- **REQ-040 to REQ-049**: Payroll
- **REQ-050 to REQ-059**: Settings
- **REQ-060 to REQ-069**: Utility Functions
- **REQ-070 to REQ-079**: PWA & Mobile (future)
- **REQ-080 to REQ-089**: Calendar (future)
- **REQ-200 to REQ-209**: Revenue Intelligence (v2.2)
- **REQ-300 to REQ-309**: Data Quality & UX Polish (v2.3)
- **REQ-400 to REQ-409**: Reporting & Observability (v2.4)
- **REQ-500 to REQ-509**: Boarding Form Scraping & Modal (v3.0)
- **REQ-600 to REQ-609**: Daytime Activity Intelligence (v4.0)
- **REQ-610 to REQ-619**: WhatsApp Roster Notifications (v4.1)
- **REQ-620 to REQ-629**: Integration Check (v4.3)
- **REQ-630 to REQ-639**: Friday PM Weekend Notify (v4.4)
- **REQ-640 to REQ-649**: Session Self-Healing & Observability (v4.4.1)
- **REQ-650 to REQ-659**: Ops — keep-alive & stale-data alerts (v6.3)
