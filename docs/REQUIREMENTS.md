# Dog Boarding App - Requirements

## How to Use This Document

- Every requirement has a unique ID: `REQ-XXX`
- Requirements are grouped by feature area
- Each requirement should have at least one test
- When adding features, add requirements here FIRST
- When fixing bugs, check if a requirement needs updating

---

## Authentication & Access Control

### REQ-001: Invite-Only Signup
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
Users can log in with email and password.

**Acceptance Criteria:**
- Login page accepts email and password
- Valid credentials redirect to app
- Invalid credentials show error
- Session persists across page refresh

**Tests:** `src/__tests__/auth/login.test.jsx`

---

### REQ-003: User Profile Display
Logged-in users can see their identity in the app.

**Acceptance Criteria:**
- Profile page displays user's email
- Avatar shows first letter of email
- Account Details section is visible

**Tests:** `src/__tests__/auth/profile.test.jsx`

---

### REQ-004: Password Self-Service
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
All authenticated users see all data (single organization model).

**Acceptance Criteria:**
- All authenticated users can view all dogs
- All authenticated users can view all boardings
- All authenticated users can edit any dog or boarding
- Unauthenticated users cannot access data

**Tests:** RLS policies verified via integration tests

---

### REQ-006: Invite Code Management
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
Users can edit existing dogs.

**Acceptance Criteria:**
- Edit form pre-fills current values
- Can update name, day rate, night rate
- Changes persist after save
- Cancel discards changes

**Tests:** `src/components/DogForm.test.jsx`

---

### REQ-012: Delete Dog
Users can delete dogs.

**Acceptance Criteria:**
- Confirmation required before delete
- Dog removed from list after delete
- Associated boardings are also deleted

**Tests:** `src/pages/DogsPage.test.jsx`

---

### REQ-013: Toggle Dog Active Status
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
Users can edit existing boardings.

**Acceptance Criteria:**
- Edit form pre-fills current values
- Date validation still applies
- Changes reflected in calendar and matrix

**Tests:** `src/components/BoardingForm.test.jsx`

---

### REQ-022: Delete Boarding
Users can delete boardings.

**Acceptance Criteria:**
- Confirmation required before delete
- Boarding removed from calendar and matrix

**Tests:** `src/pages/DogsPage.test.jsx`

---

### REQ-023: CSV Import
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
Matrix shows dogs and dates in grid format.

**Acceptance Criteria:**
- Dogs listed in rows
- Dates shown in columns (configurable range)
- Day indicator (sun icon) when dog present during day
- Night indicator (moon icon) when dog stays overnight

**Tests:** `src/components/BoardingMatrix.test.jsx`

---

### REQ-031: Date Navigation
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
Matrix calculates overnight revenue correctly.

**Acceptance Criteria:**
- Night = dog staying past 5 PM into next day
- Night total = sum of night rates for all overnight dogs
- Net = night total × net percentage
- Gross displayed for each dog's boarding period

**Tests:** `src/utils/calculations.test.js`

---

### REQ-033: Employee Night Assignment
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
Users can sort the matrix by various columns.

**Acceptance Criteria:**
- Can sort by dog name (A-Z, Z-A)
- Can sort by date columns (presence on that date)
- Sort handles ties appropriately
- Sort indicator shows current sort column and direction

**Tests:** `src/components/BoardingMatrix.test.jsx`

---

### REQ-035: Summary Cards
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
System calculates earnings per employee.

**Acceptance Criteria:**
- Totals calculated from night assignments
- Employee's total = sum of net amounts for their assigned nights
- "N/A" nights excluded from employee totals
- Date range can be selected

**Tests:** `src/components/EmployeeTotals.test.jsx`

---

### REQ-041: Mark as Paid
Users can record payments to employees.

**Acceptance Criteria:**
- Can select specific dates to mark as paid
- Select All / Deselect All buttons available
- Payment records date, employee, and amount
- Paid dates no longer show in outstanding

**Tests:** `src/components/PaymentDialog.test.jsx`, `src/pages/PayrollPage.test.jsx`

---

### REQ-042: Payment History
Users can view and manage payment history.

**Acceptance Criteria:**
- Shows list of past payments
- Each payment shows date, employee, amount
- Can delete payment records
- Deletion confirmation required

**Tests:** `src/pages/PayrollPage.test.jsx`

---

### REQ-043: Outstanding Payments Display
System shows unpaid amounts per employee.

**Acceptance Criteria:**
- Outstanding calculated from unpaid assigned nights
- Total outstanding shown at bottom
- Updates when payments are recorded

**Tests:** `src/pages/PayrollPage.test.jsx`

---

## Settings

### REQ-050: Net Percentage Configuration
Users can configure the net percentage for calculations.

**Acceptance Criteria:**
- Input accepts values 0-100
- Value persists after save
- Used in matrix net calculations
- Can have historical values (effective dates)

**Tests:** `src/pages/SettingsPage.test.jsx`

---

### REQ-051: Employee Management
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
System calculates nights for boarding periods.

**Acceptance Criteria:**
- calculateNights returns correct night count
- Handles same-day arrivals and departures
- Accounts for time of day (5 PM cutoff)

**Tests:** `src/utils/dateUtils.test.js`

---

### REQ-062: Employee Helper Functions
System provides employee lookup utilities.

**Acceptance Criteria:**
- getEmployeeNameById returns name from ID
- getEmployeeIdByName returns ID from name
- getEmployeeName handles legacy formats
- isEmployeeActive checks active status

**Tests:** `src/utils/employeeHelpers.test.js`

---

### REQ-063: Revenue Calculations
System calculates revenue correctly.

**Acceptance Criteria:**
- calculateGross computes total before net percentage
- calculateNet applies net percentage correctly
- countOvernightDogs returns correct count for date
- calculateBoardingGross computes single boarding revenue

**Tests:** `src/utils/calculations.test.js`

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
