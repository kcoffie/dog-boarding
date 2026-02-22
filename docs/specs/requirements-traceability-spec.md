# Requirements Traceability System

## Overview

A system to ensure code changes don't break existing requirements by:
1. Documenting all requirements with unique IDs
2. Linking tests to requirements
3. Automated checks in CI

---

## Part 1: Requirements Document

Create `docs/REQUIREMENTS.md`:

```markdown
# Dog Boarding App - Requirements

## How to Use This Document

- Every requirement has a unique ID: `REQ-XXX`
- Requirements are grouped by feature area
- Each requirement should have at least one test
- When adding features, add requirements here FIRST
- When fixing bugs, check if a requirement needs updating

---

## Authentication & Users

### REQ-001: Invite-Only Signup
Users can only create accounts with a valid invite code.

**Acceptance Criteria:**
- Signup page requires invite code before showing registration form
- Invalid codes show error message
- Expired codes are rejected
- Used codes cannot be reused

**Tests:** `auth.test.js: "Invite Code System"`

---

### REQ-002: User Login
Users can log in with email and password.

**Acceptance Criteria:**
- Login page accepts email and password
- Valid credentials redirect to app
- Invalid credentials show error
- Session persists across page refresh

**Tests:** `auth.test.js: "Login"`

---

### REQ-003: User Visible in Header
Logged-in users can see their identity in the app.

**Acceptance Criteria:**
- Header displays user's email or avatar
- Dropdown shows full email
- Dropdown has link to profile
- Dropdown has sign out option

**Tests:** `header.test.jsx: "shows logged in user"`

---

### REQ-004: Password Self-Service
Users can change their own password.

**Acceptance Criteria:**
- Profile page has password change form
- New password must be 8+ characters
- Confirmation must match
- Success message shown after change

**Tests:** `profile.test.jsx: "password change"`

---

### REQ-005: Shared Data Access
All authenticated users see all data (single organization).

**Acceptance Criteria:**
- User A can see dogs created by User B
- User A can see boardings created by User B
- User A can edit any dog or boarding
- Unauthenticated users see nothing

**Tests:** `dataAccess.test.js: "Shared Data Access"`

---

## Dogs

### REQ-010: Add Dog
Users can add new dogs to the system.

**Acceptance Criteria:**
- Form requires name
- Form requires day rate (number >= 0)
- Form requires night rate (number >= 0)
- Dog appears in list after save

**Tests:** `dogs.test.jsx: "add dog"`

---

### REQ-011: Edit Dog
Users can edit existing dogs.

**Acceptance Criteria:**
- Edit form pre-fills current values
- Changes persist after save
- Cancel discards changes

**Tests:** `dogs.test.jsx: "edit dog"`

---

### REQ-012: Delete Dog
Users can delete dogs.

**Acceptance Criteria:**
- Confirmation required before delete
- Dog removed from list after delete
- Associated boardings handled appropriately

**Tests:** `dogs.test.jsx: "delete dog"`

---

## Boardings

### REQ-020: Add Boarding
Users can add boarding reservations.

**Acceptance Criteria:**
- Must select a dog
- Must specify arrival date/time
- Must specify departure date/time
- Departure must be after arrival
- Boarding appears on calendar and matrix

**Tests:** `boardings.test.jsx: "add boarding"`

---

### REQ-021: Edit Boarding
Users can edit existing boardings.

**Acceptance Criteria:**
- Edit form pre-fills current values
- Date validation still applies
- Changes reflected in calendar and matrix

**Tests:** `boardings.test.jsx: "edit boarding"`

---

### REQ-022: Delete Boarding
Users can delete boardings.

**Acceptance Criteria:**
- Confirmation required before delete
- Boarding removed from calendar and matrix

**Tests:** `boardings.test.jsx: "delete boarding"`

---

### REQ-023: CSV Import
Users can import boardings from CSV.

**Acceptance Criteria:**
- Accepts CSV with dog_name, arrival, departure
- Shows preview before import
- Shows errors for invalid rows
- Successful rows create boardings

**Tests:** `csvImport.test.jsx`

---

## Boarding Matrix

### REQ-030: Display Matrix
Matrix shows dogs and dates in grid format.

**Acceptance Criteria:**
- Dogs listed in rows
- Dates shown in columns (14 days default)
- Day/night indicators for each dog/date

**Tests:** `matrix.test.jsx: "displays matrix"`

---

### REQ-031: Date Navigation
Users can navigate to different date ranges.

**Acceptance Criteria:**
- Previous/next day buttons work
- Previous/next week buttons work
- Today button returns to current date

**Tests:** `matrix.test.jsx: "date navigation"`

---

### REQ-032: Overnight Calculation
Matrix calculates overnight revenue correctly.

**Acceptance Criteria:**
- Night = dog staying past 5 PM into next day
- Night total = sum of night rates for overnight dogs
- Net = night total × net percentage

**Tests:** `calculations.test.js: "overnight calculation"`

---

### REQ-033: Employee Assignment
Users can assign employees to nights.

**Acceptance Criteria:**
- Each night column has employee dropdown
- Selection persists after page refresh
- Employee totals calculated correctly

**Tests:** `matrix.test.jsx: "employee assignment"`

---

## Calendar

### REQ-040: Calendar Display
Calendar shows month view with booking bars.

**Acceptance Criteria:**
- Monthly grid with correct days
- Booking bars span arrival to departure
- Same dog = same color
- Today highlighted

**Tests:** `calendar.test.jsx: "displays calendar"`

---

### REQ-041: Calendar Navigation
Users can navigate between months.

**Acceptance Criteria:**
- Previous/next month buttons work
- Today button returns to current month
- Swipe navigation on mobile

**Tests:** `calendar.test.jsx: "navigation"`

---

### REQ-042: Day Detail Panel
Clicking a day shows details.

**Acceptance Criteria:**
- Shows arriving dogs
- Shows staying dogs
- Shows departing dogs
- Shows overnight totals

**Tests:** `calendar.test.jsx: "day detail"`

---

## Settings

### REQ-050: Net Percentage
Users can configure the net percentage.

**Acceptance Criteria:**
- Input accepts 0-100
- Value persists after save
- Used in matrix calculations

**Tests:** `settings.test.jsx: "net percentage"`

---

### REQ-051: Employee Management
Users can manage employee list.

**Acceptance Criteria:**
- Can add new employees
- Can delete employees
- No duplicate names allowed
- Employees available in matrix dropdown

**Tests:** `settings.test.jsx: "employees"`

---

### REQ-052: Invite Management
Users can generate invite codes.

**Acceptance Criteria:**
- Generate button creates new code
- Can optionally lock to email
- Shows code status (active, used, expired)
- Can copy code to clipboard

**Tests:** `invites.test.jsx`

---

## PWA & Mobile

### REQ-060: Installable PWA
App can be installed on mobile devices.

**Acceptance Criteria:**
- Add to Home Screen works on iOS
- Install prompt works on Android
- App opens without browser UI
- App icon displays correctly

**Tests:** Manual testing checklist

---

### REQ-061: Mobile Layout
App works well on mobile screens.

**Acceptance Criteria:**
- No horizontal scrolling
- Touch targets >= 44px
- Safe area handling for notches
- Bottom navigation accessible

**Tests:** `mobile.test.jsx`, visual regression

---

### REQ-062: Offline Capability
App handles offline gracefully.

**Acceptance Criteria:**
- Cached pages load offline
- Clear message when offline
- Syncs when back online

**Tests:** Manual testing checklist

---

## How to Add a New Requirement

1. Add entry to this document with next available ID
2. Write acceptance criteria
3. Write tests that verify criteria
4. Add test file reference to requirement
5. Implement feature
6. Verify tests pass
```

---

## Part 2: Link Tests to Requirements

Update test files to reference requirement IDs:

```javascript
// __tests__/auth/invite.test.js

/**
 * @requirements REQ-001
 */
describe('REQ-001: Invite Code System', () => {
  it('allows signup with valid invite code', () => {
    // ...
  });

  it('rejects signup with invalid invite code', () => {
    // ...
  });

  it('rejects signup with expired invite code', () => {
    // ...
  });

  it('rejects signup with already-used invite code', () => {
    // ...
  });
});

/**
 * @requirements REQ-002
 */
describe('REQ-002: User Login', () => {
  it('allows login with valid credentials', () => {
    // ...
  });

  it('rejects login with invalid password', () => {
    // ...
  });

  it('redirects to app after successful login', () => {
    // ...
  });
});
```

```javascript
// __tests__/calculations.test.js

/**
 * @requirements REQ-032
 */
describe('REQ-032: Overnight Calculation', () => {
  describe('isOvernight', () => {
    it('returns true when dog stays past 5pm into next day', () => {
      // ...
    });

    it('returns false for same-day departure', () => {
      // ...
    });
  });

  describe('calculateNightTotal', () => {
    it('sums night rates for all overnight dogs', () => {
      // ...
    });
  });

  describe('calculateNet', () => {
    it('applies net percentage correctly', () => {
      // ...
    });
  });
});
```

---

## Part 3: Requirements Coverage Script

Create a script that checks which requirements have tests:

```javascript
// scripts/check-requirements.js
const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Parse requirements from REQUIREMENTS.md
function parseRequirements(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const reqRegex = /### (REQ-\d+):/g;
  const requirements = [];
  let match;
  
  while ((match = reqRegex.exec(content)) !== null) {
    requirements.push(match[1]);
  }
  
  return requirements;
}

// Find requirements referenced in test files
function findTestedRequirements(testDir) {
  const testFiles = glob.sync(`${testDir}/**/*.test.{js,jsx,ts,tsx}`);
  const tested = new Set();
  
  testFiles.forEach(file => {
    const content = fs.readFileSync(file, 'utf-8');
    
    // Match @requirements comments
    const commentRegex = /@requirements\s+(REQ-\d+)/g;
    let match;
    while ((match = commentRegex.exec(content)) !== null) {
      tested.add(match[1]);
    }
    
    // Match describe('REQ-XXX: ...')
    const describeRegex = /describe\(['"`](REQ-\d+)/g;
    while ((match = describeRegex.exec(content)) !== null) {
      tested.add(match[1]);
    }
  });
  
  return tested;
}

// Main
const requirements = parseRequirements('docs/REQUIREMENTS.md');
const tested = findTestedRequirements('src');
const testedE2E = findTestedRequirements('e2e');
const allTested = new Set([...tested, ...testedE2E]);

console.log('\n📋 Requirements Coverage Report\n');
console.log('='.repeat(50));

let covered = 0;
let uncovered = 0;

requirements.forEach(req => {
  if (allTested.has(req)) {
    console.log(`✅ ${req} - covered`);
    covered++;
  } else {
    console.log(`❌ ${req} - NO TESTS`);
    uncovered++;
  }
});

console.log('='.repeat(50));
console.log(`\nTotal: ${requirements.length} requirements`);
console.log(`Covered: ${covered} (${Math.round(covered/requirements.length*100)}%)`);
console.log(`Missing: ${uncovered}`);

if (uncovered > 0) {
  console.log('\n⚠️  Some requirements are not covered by tests!\n');
  process.exit(1);
}

console.log('\n✅ All requirements have test coverage!\n');
```

Add to package.json:
```json
{
  "scripts": {
    "check:requirements": "node scripts/check-requirements.js"
  }
}
```

---

## Part 4: CI Integration

Add requirements check to GitHub Actions:

```yaml
# .github/workflows/ci.yml
jobs:
  requirements:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run check:requirements
      
  # ... other jobs
```

---

## Part 5: PR Template Update

Update `.github/PULL_REQUEST_TEMPLATE.md`:

```markdown
## Requirements Impact

<!-- Check all that apply -->

- [ ] This PR does NOT affect any existing requirements
- [ ] This PR modifies behavior for: <!-- list REQ-XXX -->
- [ ] This PR adds new requirements: <!-- list REQ-XXX, add to REQUIREMENTS.md -->
- [ ] This PR removes requirements: <!-- list REQ-XXX, update REQUIREMENTS.md -->

## Test Coverage

- [ ] All affected requirements have passing tests
- [ ] `npm run check:requirements` passes
- [ ] New requirements have new tests
```

---

## Part 6: Workflow

### When Fixing a Bug

1. **Check REQUIREMENTS.md** - Does this bug relate to a requirement?
2. **If yes:** The test for that requirement should have caught it. Fix the test first, then the code.
3. **If no:** Consider if this should be a new requirement. Add it if so.
4. **Run `npm run check:requirements`** before committing.

### When Adding a Feature

1. **Add requirements to REQUIREMENTS.md first** with new IDs
2. Write tests referencing those requirement IDs
3. Implement the feature
4. Verify tests pass and requirements coverage is maintained

### When Refactoring

1. **Don't change REQUIREMENTS.md** - behavior should stay the same
2. Run all tests before and after
3. If tests break, you've changed behavior (which might break a requirement)

---

## Example: How This Prevents Breaks

**Scenario:** Developer changes overnight calculation to use 6 PM instead of 5 PM.

**Without traceability:**
- Change gets merged
- UAT user notices revenue is wrong
- Takes time to figure out what broke

**With traceability:**
1. Developer changes code
2. Test for REQ-032 fails: `"returns true when dog stays past 5pm"` 
3. Developer sees this is tied to REQ-032
4. Developer checks REQUIREMENTS.md - sees 5 PM is specified
5. Developer realizes this was intentional, reverts change
6. (Or if 6 PM is actually correct, updates requirement AND test)

---

## Prompt for Claude Code

> "Set up a requirements traceability system:
>
> 1. Create `docs/REQUIREMENTS.md` documenting all current app requirements with unique IDs (REQ-001, REQ-002, etc.). Extract requirements from our existing specs.
>
> 2. Update all test files to reference requirement IDs using `@requirements REQ-XXX` comments or `describe('REQ-XXX: ...')` naming.
>
> 3. Create `scripts/check-requirements.js` that parses REQUIREMENTS.md and test files, then reports coverage.
>
> 4. Add `npm run check:requirements` script.
>
> 5. Add requirements check to GitHub Actions CI.
>
> 6. Update PR template to ask about requirements impact.
>
> Start by creating REQUIREMENTS.md with all requirements from our current specs."

---

## Quick Commands

```bash
# Check requirements coverage
npm run check:requirements

# Run tests for a specific requirement
npm test -- --grep "REQ-032"

# Find all tests for a requirement
grep -r "REQ-032" src/__tests__ e2e/
```
