# Dog Boarding Management App - Specification

## Project Overview

Build a 3-page React web app for managing a dog boarding business. The app tracks dogs, their boarding stays, calculates revenue, and tracks employee earnings.

## Tech Stack

- React 18+ with Vite
- React Router for navigation
- Tailwind CSS for styling
- localStorage for data persistence
- Papa Parse for CSV import
- Vitest + React Testing Library for tests

## Data Models

```typescript
interface Settings {
  netPercentage: number; // Default 65, represents % of gross paid to employee
  employees: string[];   // List of employee names
}

interface Dog {
  id: string;           // UUID
  name: string;
  dayRate: number;      // Display only, not used in calculations
  nightRate: number;    // Gross rate per overnight stay
}

interface Boarding {
  id: string;           // UUID
  dogId: string;
  arrivalDateTime: string;  // ISO 8601 format
  departureDateTime: string; // ISO 8601 format
}

interface NightAssignment {
  date: string;         // YYYY-MM-DD format
  employeeName: string;
}
```

## Business Logic Rules

### Day vs Night Definition
- **Day**: Before 5:00 PM (17:00)
- **Night**: 5:00 PM and after

### Billing Calculation
- Day rate is **display only** - shows dog is present but not used for billing
- Night rate is what the client pays per overnight stay (gross)
- A dog is "overnight" on date X if they are staying from date X into date X+1
- **Gross** = sum of night rates for all dogs staying overnight
- **Net** = gross × (netPercentage / 100) - this is what the employee earns

### Example Calculation
Dog Luna (night rate $45) arrives Monday 2 PM, departs Wednesday 10 AM:
- Monday night: $45 (staying Mon→Tue) ✓
- Tuesday night: $45 (staying Tue→Wed) ✓
- Wednesday night: $0 (departing, not staying overnight)
- Gross: $90 / Net at 65%: $58.50

## Page Specifications

### Page 1: Boarding Matrix (Home Page - route: `/`)

**Header:**
- App title
- Navigation to other pages

**Date Navigation:**
- Buttons: ← Week, ← Day, Today, Day →, Week →
- Display current date range (e.g., "Jan 15 - Jan 28, 2025")
- Default view: 14 days starting from today

**Matrix Table:**

| Column | Description |
|--------|-------------|
| Dog Name | Left column, list all dogs |
| Day Rate | Display rate (informational) |
| Night Rate | Display rate (used for billing) |
| Date columns | One column per day in range |

**Matrix Cells:**
- Show indicator if dog is present during day hours (before 5 PM)
- Show different indicator if dog is staying overnight
- Empty/dash if dog not present

**Bottom Summary Rows:**

| Row | Calculation |
|-----|-------------|
| Night Total (Gross) | Sum of night rates for all dogs overnight that date |
| Net ({netPercentage}%) | Gross × (netPercentage / 100) |
| Employee | Dropdown to select employee for that night |

**Employee Totals Section:**
- Display below or beside matrix
- For each employee: total net earnings for displayed date range
- Show number of nights worked
- Only show employees who have at least one night assigned in range

### Page 2: Dogs (route: `/dogs`)

**Dog List:**
- Table showing all dogs: name, day rate, night rate
- Edit button per row (inline edit or modal)
- Delete button with confirmation

**Add Dog Form:**
- Name (required)
- Day rate (required, number)
- Night rate (required, number)
- Save button

**Boarding List (per dog or separate section):**
- Show all boardings for selected dog
- Display: arrival date/time, departure date/time, calculated nights, gross total
- Edit/delete buttons

**Add Boarding:**
- Select dog (dropdown)
- Arrival date and time picker
- Departure date and time picker
- Validation: departure must be after arrival
- Save button

**CSV Import:**
- Upload button for CSV file
- Expected CSV format: `dogName,arrivalDateTime,departureDateTime`
- Date format: ISO 8601 or "YYYY-MM-DD HH:mm"
- Show preview of parsed data before import
- Show errors for: unknown dog names, invalid dates, departure before arrival
- Confirm button to complete import

### Page 3: Settings (route: `/settings`)

**Net Percentage:**
- Input field with current value
- Label explaining: "Percentage of gross paid to employee"
- Validation: must be 0-100

**Employees:**
- List of current employees
- Delete button per employee (with confirmation if they have assignments)
- Add employee input + button
- Validation: no duplicate names, no empty names

## Component Structure (Suggested)

```
src/
├── components/
│   ├── Layout.jsx           # Nav + page wrapper
│   ├── BoardingMatrix.jsx   # The main matrix table
│   ├── DateNavigator.jsx    # Date range controls
│   ├── EmployeeDropdown.jsx # Dropdown for night assignment
│   ├── EmployeeTotals.jsx   # Summary of employee earnings
│   ├── DogForm.jsx          # Add/edit dog form
│   ├── BoardingForm.jsx     # Add/edit boarding form
│   ├── CsvImport.jsx        # CSV upload and preview
│   └── ConfirmDialog.jsx    # Reusable confirmation modal
├── hooks/
│   ├── useLocalStorage.js   # Persist state to localStorage
│   └── useBoardingCalculations.js # Business logic for rates
├── utils/
│   ├── dateUtils.js         # Date formatting, day/night checks
│   ├── calculations.js      # Gross/net calculations
│   └── csvParser.js         # CSV parsing logic
├── pages/
│   ├── MatrixPage.jsx
│   ├── DogsPage.jsx
│   └── SettingsPage.jsx
├── App.jsx                  # Router setup
└── main.jsx                 # Entry point
```

## Testing Requirements

### Unit Tests (utils/)

**dateUtils.js:**
- `isOvernight(boarding, date)` - returns true if dog stays overnight on given date
- `isDayPresent(boarding, date)` - returns true if dog present before 5 PM
- `formatDate()`, `parseDate()` functions
- Edge cases: arrival at exactly 5 PM, departure at exactly 5 PM

**calculations.js:**
- `calculateGross(dogs, boardings, date)` - sum of night rates
- `calculateNet(gross, percentage)` - gross × percentage
- `calculateEmployeeTotals(assignments, dogs, boardings, dateRange)` - totals per employee

**csvParser.js:**
- Valid CSV parsing
- Error handling: missing columns, invalid dates, unknown dog names
- Different date formats

### Integration Tests (components/)

**BoardingMatrix:**
- Renders correct number of date columns
- Shows correct indicators for boarding dogs
- Updates when date range changes
- Calculates correct totals

**DogForm / BoardingForm:**
- Validation errors display correctly
- Successful submission updates state
- Edit mode populates existing values

**CsvImport:**
- File upload triggers parse
- Preview shows correct data
- Errors display for invalid rows
- Successful import adds boardings

### End-to-End Tests (optional but recommended)

- Add a dog → Add a boarding → See it on matrix
- Import CSV → Verify boardings appear
- Change employee assignment → Verify totals update
- Change net percentage → Verify calculations update

## Development Phases

### Phase 1: Setup & Data Layer
1. Initialize Vite + React + Tailwind
2. Set up React Router with 3 routes
3. Create useLocalStorage hook
4. Create data models and initial state
5. **Checkpoint: Verify routing works, localStorage persists**

### Phase 2: Settings Page
1. Build Settings page UI
2. Net percentage input with validation
3. Employee list management (add/delete)
4. **Checkpoint: Test settings save and persist**

### Phase 3: Dogs Page (Part 1)
1. Dog list display
2. Add dog form with validation
3. Edit/delete dog functionality
4. **Checkpoint: Test CRUD operations for dogs**

### Phase 4: Dogs Page (Part 2)
1. Boarding list display
2. Add/edit boarding form
3. Date/time pickers
4. **Checkpoint: Test boarding CRUD**

### Phase 5: Boarding Matrix
1. Date navigation component
2. Matrix table structure
3. Day/night presence indicators
4. Bottom summary rows (gross, net)
5. **Checkpoint: Verify matrix displays correct data**

### Phase 6: Employee Features
1. Employee dropdown in matrix
2. Night assignment persistence
3. Employee totals summary
4. **Checkpoint: Verify employee calculations**

### Phase 7: CSV Import
1. File upload component
2. CSV parsing with Papa Parse
3. Preview and error display
4. Import confirmation
5. **Checkpoint: Test various CSV formats and errors**

### Phase 8: Polish & Testing
1. Write unit tests for utils
2. Write integration tests for components
3. Error handling and edge cases
4. UI polish and responsive design
5. **Final review**

## Review Checklist

### Functionality
- [ ] Can add/edit/delete dogs
- [ ] Can add/edit/delete boardings
- [ ] Can import boardings via CSV
- [ ] Matrix shows correct day/night indicators
- [ ] Gross calculation is correct (sum of night rates for overnight dogs)
- [ ] Net calculation is correct (gross × percentage)
- [ ] Can assign employee to each night
- [ ] Employee totals are correct for displayed range
- [ ] Date navigation works (day, week, today)
- [ ] Settings persist and affect calculations
- [ ] All data persists across page refresh

### Edge Cases
- [ ] Dog with no boardings shows correctly
- [ ] Boarding that spans many weeks
- [ ] Arrival at exactly 5:00 PM (should count as night)
- [ ] Departure at exactly 5:00 PM (should NOT count as overnight for that day)
- [ ] Same-day boarding (arrive and leave same day)
- [ ] Multiple dogs same dates
- [ ] Empty state (no dogs, no boardings)
- [ ] Delete dog with existing boardings (cascade or prevent?)

### Validation
- [ ] Cannot save dog without name
- [ ] Cannot save dog with negative rates
- [ ] Cannot save boarding with departure before arrival
- [ ] Cannot add duplicate employee names
- [ ] Net percentage must be 0-100
- [ ] CSV import shows clear errors for invalid data

### UI/UX
- [ ] Loading states where appropriate
- [ ] Confirmation dialogs for destructive actions
- [ ] Clear error messages
- [ ] Responsive on tablet/desktop (mobile optional)
- [ ] Keyboard accessible forms

## Sample Test Data

```javascript
const sampleDogs = [
  { id: '1', name: 'Luna', dayRate: 35, nightRate: 45 },
  { id: '2', name: 'Cooper', dayRate: 35, nightRate: 45 },
  { id: '3', name: 'Bella', dayRate: 40, nightRate: 50 },
];

const sampleBoardings = [
  { id: '1', dogId: '1', arrivalDateTime: '2025-01-15T14:00', departureDateTime: '2025-01-18T10:00' },
  { id: '2', dogId: '2', arrivalDateTime: '2025-01-16T09:00', departureDateTime: '2025-01-17T17:00' },
  { id: '3', dogId: '3', arrivalDateTime: '2025-01-15T18:00', departureDateTime: '2025-01-20T11:00' },
];

const sampleSettings = {
  netPercentage: 65,
  employees: ['Kate', 'Nick', 'Alex'],
};
```

## CSV Import Format

```csv
dogName,arrivalDateTime,departureDateTime
Luna,2025-01-15 14:00,2025-01-18 10:00
Cooper,2025-01-16 09:00,2025-01-17 17:00
Bella,2025-01-15 18:00,2025-01-20 11:00
```

---

## How to Use This Spec with Claude Code

Start Claude Code and say:

"I have a detailed spec for a dog boarding management app. Let's build it phase by phase. Here's the spec: [paste this document or point to file]. Start with Phase 1: Setup & Data Layer."

After each phase, ask Claude Code to:
1. Show you what was built
2. Run the app so you can test
3. Run any tests written so far
4. Confirm the checkpoint items work

If something doesn't work right, describe the issue and ask for a fix before moving on.
