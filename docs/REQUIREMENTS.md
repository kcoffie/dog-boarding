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
| v2.0    | External data sync             | In Progress (REQ-100–109) |

---

## Authentication & Access Control

### REQ-001: Invite-Only Signup
**Added:** v1.3 | **Status:** Complete

Users can only create accounts with a valid invite code.

**Acceptance Criteria:**
- Signup page requires invite code before showing registration form
- Invalid codes show error message
- Expired codes are rejected
- Used codes cannot be reused
- Code input converts to uppercase automatically
- Code length limited to 12 characters

**Tests:** `src/__tests__/auth/invite.test.jsx`

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
**Added:** v2.0 | **Status:** In Progress

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
| `cron-auth` | Every 6h | Re-authenticate and cache session in DB |
| `cron-schedule` | Every 1h | Scan 2 schedule pages, queue boarding candidates |
| `cron-detail` | Every 5min | Process 1 queued appointment detail |

**Acceptance Criteria:**
- `cron-auth` skips re-authentication when a valid session is still cached in `sync_settings`
- `cron-auth` stores new session cookies and expiry in `sync_settings` after successful auth
- `cron-schedule` fetches the current week + a rotating cursor week per call
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

**Tests:** `src/__tests__/scraper/sessionCache.test.js`, `src/__tests__/scraper/syncQueue.test.js`

---

### REQ-107: Sync Admin UI
**Added:** v2.0 | **Status:** In Progress

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
**Added:** v2.0 | **Status:** Planned

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
