# Dog Boarding App - Development Lifecycle & Standards

## Overview

This document establishes the standards and processes for ongoing development of the Dog Boarding app. It ensures quality, traceability, and professionalism as the app evolves through multiple versions.

---

## Part 1: Environments

### Environment Strategy

| Environment | Purpose | Data | URL |
|-------------|---------|------|-----|
| **Local** | Developer machine | Seed data / mocks | localhost:5173 |
| **Test** | Automated tests | Generated test data | (CI only) |
| **Staging** | UAT / Pre-prod | Copy of prod structure, fake data | staging.yourapp.com |
| **Production** | Live users | Real data | app.yourapp.com |

### Supabase Projects

Create separate Supabase projects for each environment:

```
Supabase Projects:
├── dog-boarding-dev      → Local development
├── dog-boarding-staging  → UAT / Staging  
└── dog-boarding-prod     → Production
```

### Environment Variables

```bash
# .env.local (local development - points to dev Supabase)
VITE_SUPABASE_URL=https://xxx-dev.supabase.co
VITE_SUPABASE_ANON_KEY=dev-anon-key
VITE_ENVIRONMENT=development

# .env.staging (staging - separate Supabase project)
VITE_SUPABASE_URL=https://xxx-staging.supabase.co
VITE_SUPABASE_ANON_KEY=staging-anon-key
VITE_ENVIRONMENT=staging

# .env.production (production - never commit this)
VITE_SUPABASE_URL=https://xxx-prod.supabase.co
VITE_SUPABASE_ANON_KEY=prod-anon-key
VITE_ENVIRONMENT=production
```

### Test Data Seeding

Create scripts to populate dev/staging with realistic test data:

```javascript
// scripts/seed-test-data.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for seeding
);

const TEST_USERS = [
  { email: 'admin@test.com', password: 'TestPass123!' },
  { email: 'user1@test.com', password: 'TestPass123!' },
  { email: 'user2@test.com', password: 'TestPass123!' },
];

const TEST_DOGS = [
  { name: 'Luna', day_rate: 35, night_rate: 45 },
  { name: 'Cooper', day_rate: 35, night_rate: 45 },
  { name: 'Bella', day_rate: 40, night_rate: 50 },
  { name: 'Max', day_rate: 35, night_rate: 45 },
  { name: 'Daisy', day_rate: 30, night_rate: 40 },
  { name: 'Charlie', day_rate: 35, night_rate: 45 },
  { name: 'Buddy', day_rate: 40, night_rate: 50 },
  { name: 'Sadie', day_rate: 35, night_rate: 45 },
];

const TEST_EMPLOYEES = ['Kate', 'Nick', 'Alex', 'Sam'];

async function seedDatabase() {
  console.log('🌱 Seeding test data...\n');

  // Clear existing data (careful - only for dev/staging!)
  if (process.env.VITE_ENVIRONMENT === 'production') {
    console.error('❌ Cannot seed production database!');
    process.exit(1);
  }

  // Create test users
  console.log('Creating test users...');
  for (const user of TEST_USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error && !error.message.includes('already exists')) {
      console.error(`  Error creating ${user.email}:`, error.message);
    } else {
      console.log(`  ✓ ${user.email}`);
    }
  }

  // Create invite codes (so we can test invite flow)
  console.log('\nCreating invite codes...');
  const inviteCodes = ['TESTCODE1', 'TESTCODE2', 'TESTCODE3'];
  for (const code of inviteCodes) {
    await supabase.from('invite_codes').upsert({ 
      code, 
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() 
    });
    console.log(`  ✓ ${code}`);
  }

  // Create dogs
  console.log('\nCreating dogs...');
  for (const dog of TEST_DOGS) {
    const { error } = await supabase.from('dogs').upsert(dog, { 
      onConflict: 'name' 
    });
    if (!error) console.log(`  ✓ ${dog.name}`);
  }

  // Create employees
  console.log('\nCreating employees...');
  for (const name of TEST_EMPLOYEES) {
    await supabase.from('employees').upsert({ name }, { onConflict: 'name' });
    console.log(`  ✓ ${name}`);
  }

  // Create settings
  console.log('\nCreating settings...');
  await supabase.from('settings').upsert({ 
    id: 'default',
    net_percentage: 65 
  });
  console.log('  ✓ Default settings');

  // Create sample boardings (past month + next month)
  console.log('\nCreating sample boardings...');
  const { data: dogs } = await supabase.from('dogs').select('id, name');
  
  const today = new Date();
  let boardingCount = 0;

  for (let dayOffset = -30; dayOffset < 30; dayOffset++) {
    // Random chance of boarding each day
    if (Math.random() < 0.3) continue;

    const numDogs = Math.floor(Math.random() * 4) + 1;
    const selectedDogs = [...dogs].sort(() => Math.random() - 0.5).slice(0, numDogs);

    for (const dog of selectedDogs) {
      const arrival = new Date(today);
      arrival.setDate(arrival.getDate() + dayOffset);
      arrival.setHours(14, 0, 0, 0);

      const stayLength = Math.floor(Math.random() * 5) + 1;
      const departure = new Date(arrival);
      departure.setDate(departure.getDate() + stayLength);
      departure.setHours(10, 0, 0, 0);

      await supabase.from('boardings').insert({
        dog_id: dog.id,
        dog_name: dog.name,
        arrival_datetime: arrival.toISOString(),
        departure_datetime: departure.toISOString(),
      });
      boardingCount++;
    }
  }
  console.log(`  ✓ ${boardingCount} boardings created`);

  // Create night assignments
  console.log('\nCreating night assignments...');
  const { data: employees } = await supabase.from('employees').select('id, name');
  let assignmentCount = 0;

  for (let dayOffset = -7; dayOffset < 14; dayOffset++) {
    const date = new Date(today);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    
    const randomEmployee = employees[Math.floor(Math.random() * employees.length)];
    
    await supabase.from('night_assignments').upsert({
      date: dateStr,
      employee_id: randomEmployee.id,
    }, { onConflict: 'date' });
    assignmentCount++;
  }
  console.log(`  ✓ ${assignmentCount} night assignments created`);

  console.log('\n✅ Seeding complete!\n');
  console.log('Test accounts:');
  TEST_USERS.forEach(u => console.log(`  ${u.email} / ${u.password}`));
  console.log('\nTest invite codes:');
  inviteCodes.forEach(c => console.log(`  ${c}`));
}

seedDatabase().catch(console.error);
```

```javascript
// scripts/reset-test-data.js
// Wipes and re-seeds the database (dev/staging only)

async function resetDatabase() {
  if (process.env.VITE_ENVIRONMENT === 'production') {
    console.error('❌ Cannot reset production database!');
    process.exit(1);
  }

  console.log('🗑️  Clearing existing data...');
  
  await supabase.from('night_assignments').delete().neq('id', '');
  await supabase.from('boardings').delete().neq('id', '');
  await supabase.from('employees').delete().neq('id', '');
  await supabase.from('dogs').delete().neq('id', '');
  await supabase.from('invite_codes').delete().neq('id', '');
  await supabase.from('settings').delete().neq('id', '');
  
  console.log('✓ Data cleared\n');
  
  // Re-run seed
  await seedDatabase();
}
```

Add to package.json:
```json
{
  "scripts": {
    "seed": "node scripts/seed-test-data.js",
    "reset-db": "node scripts/reset-test-data.js",
    "seed:staging": "VITE_ENVIRONMENT=staging node scripts/seed-test-data.js"
  }
}
```

---

## Part 2: Requirements-First Development

### Workflow for New Features

```
1. REQUIREMENTS.md    →    2. Tests    →    3. Code    →    4. PR
   (Add new REQ-XXX)       (Write first)    (Implement)    (Review)
```

### Before Starting Any Work

```bash
# Pull latest and check current state
git pull origin main
npm run check:requirements  # All requirements have tests?
npm test                    # All tests passing?
```

### New Requirement Template

When adding to `docs/REQUIREMENTS.md`:

```markdown
### REQ-XXX: [Short Title]
**Added:** v1.3
**Status:** Planned | In Progress | Complete

[Description of the requirement]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Tests:** `[test-file.test.js]` (add after tests written)

**Related:** REQ-YYY, REQ-ZZZ (if applicable)
```

### v1.3 Requirements (Updated)

Add these to REQUIREMENTS.md:

```markdown
---

## v1.3: Authentication & User Management

### REQ-070: Invite-Only Signup
**Added:** v1.3
**Status:** Planned

Users can only create accounts with a valid invite code.

**Acceptance Criteria:**
- [ ] Signup page requires invite code first
- [ ] Invalid codes show clear error message
- [ ] Expired codes (>7 days) are rejected
- [ ] Used codes cannot be reused
- [ ] Invite can be locked to specific email (optional)

**Tests:** `auth/invite.test.js`

---

### REQ-071: Invite Code Management
**Added:** v1.3
**Status:** Planned

Administrators can generate and manage invite codes.

**Acceptance Criteria:**
- [ ] Generate button creates new random code
- [ ] Can optionally specify email to lock invite
- [ ] Table shows all invites with status (active/used/expired)
- [ ] Can copy code to clipboard
- [ ] Used invites show who used them and when

**Tests:** `settings/invites.test.js`

---

### REQ-072: User Display in Header
**Added:** v1.3
**Status:** Planned

Logged-in user's identity is visible in the app.

**Acceptance Criteria:**
- [ ] Header shows user avatar (first letter of email)
- [ ] Header shows email or username
- [ ] Dropdown menu on click/hover
- [ ] Dropdown contains: email, Profile link, Sign Out

**Tests:** `components/Header.test.jsx`

---

### REQ-073: User Profile Page
**Added:** v1.3
**Status:** Planned

Users can view and manage their own account.

**Acceptance Criteria:**
- [ ] Page shows current email
- [ ] Page shows account creation date
- [ ] Has password change form
- [ ] Accessible from header dropdown

**Tests:** `pages/Profile.test.jsx`

---

### REQ-074: Password Self-Service
**Added:** v1.3
**Status:** Planned

Users can change their own password.

**Acceptance Criteria:**
- [ ] Form requires new password (min 8 chars)
- [ ] Form requires password confirmation
- [ ] Confirmation must match
- [ ] Success message after change
- [ ] Error message if change fails

**Tests:** `pages/Profile.test.jsx`

---

### REQ-075: Shared Organization Data
**Added:** v1.3
**Status:** Planned

All authenticated users share the same data (single org model).

**Acceptance Criteria:**
- [ ] User A can see dogs created by User B
- [ ] User A can see boardings created by User B
- [ ] User A can edit/delete any data
- [ ] Unauthenticated users cannot access any data
- [ ] RLS policies enforce authenticated access only

**Tests:** `auth/dataAccess.test.js`

---
```

---

## Part 3: Testing Strategy

### Test Pyramid

```
        ╱╲
       ╱  ╲        E2E Tests (few)
      ╱────╲       - Critical user journeys
     ╱      ╲      - Run on staging before deploy
    ╱────────╲     
   ╱          ╲    Integration Tests (some)
  ╱────────────╲   - Component interactions
 ╱              ╲  - API calls (mocked)
╱────────────────╲ 
                   Unit Tests (many)
                   - Utils, hooks, pure functions
                   - Fast, run on every commit
```

### Test Commands

```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:ci": "vitest run --coverage && playwright test",
    "check:requirements": "node scripts/check-requirements.js",
    "check:all": "npm run lint && npm run check:requirements && npm run test:ci"
  }
}
```

### CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

env:
  VITE_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
  VITE_SUPABASE_ANON_KEY: ${{ secrets.TEST_SUPABASE_ANON_KEY }}
  VITE_ENVIRONMENT: test

jobs:
  # Job 1: Lint and type check
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck  # If using TypeScript

  # Job 2: Requirements coverage
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

  # Job 3: Unit and integration tests
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

  # Job 4: E2E tests
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  # Job 5: Build check
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build
          path: dist/
```

### Pre-Commit Hooks

```bash
# Install husky
npm install -D husky lint-staged
npx husky init
```

```javascript
// package.json
{
  "lint-staged": {
    "*.{js,jsx,ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,css}": [
      "prettier --write"
    ]
  }
}
```

```bash
# .husky/pre-commit
npm run lint-staged
npm run check:requirements
npm test -- --run --passWithNoTests
```

---

## Part 4: GitHub Repository Standards

### Repository Structure

```
dog-boarding/
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   ├── feature_request.yml
│   │   └── config.yml
│   ├── PULL_REQUEST_TEMPLATE.md
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── deploy-staging.yml
│   │   ├── deploy-production.yml
│   │   └── release.yml
│   ├── CODEOWNERS
│   └── dependabot.yml
├── docs/
│   ├── REQUIREMENTS.md          # All requirements
│   ├── ARCHITECTURE.md          # System design
│   ├── API.md                   # API documentation
│   ├── DEPLOYMENT.md            # How to deploy
│   ├── TESTING.md               # Testing strategy
│   └── SUPABASE_SETUP.md        # Database setup
├── scripts/
│   ├── seed-test-data.js
│   ├── reset-test-data.js
│   ├── check-requirements.js
│   └── generate-icons.js
├── src/
├── e2e/
├── public/
├── supabase/
│   ├── schema.sql               # Database schema
│   └── migrations/              # Schema migrations
├── .env.example
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── CHANGELOG.md
├── LICENSE
└── package.json
```

### Keep README Updated

Add a "Sync README" check to your release process:

```markdown
<!-- README.md - Version badge auto-updates -->
![Version](https://img.shields.io/github/package-json/v/username/dog-boarding)
```

### Automated Dependency Updates

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    labels:
      - "dependencies"
    commit-message:
      prefix: "chore(deps):"
```

### CODEOWNERS

```
# .github/CODEOWNERS
# Default owners for everything
* @your-username

# Specific owners for sensitive areas
/supabase/ @your-username
/.github/workflows/ @your-username
/docs/REQUIREMENTS.md @your-username
```

### Release Automation

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Generate changelog
        id: changelog
        uses: requarks/changelog-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          tag: ${{ github.ref_name }}
      
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          body: ${{ steps.changelog.outputs.changes }}
          draft: false
          prerelease: false
```

---

## Part 5: Version Management

### Versioning Strategy

Use [Semantic Versioning](https://semver.org/):
- **MAJOR** (2.0.0): Breaking changes, major rewrites
- **MINOR** (1.3.0): New features, backward compatible
- **PATCH** (1.3.1): Bug fixes, backward compatible

### Version Branches

```
main                    ← Production releases
├── v1.3.0              ← Tagged release
├── v1.3.1              ← Hotfix
└── v1.4.0              ← Next release

develop                 ← Active development for next minor
├── feature/calendar-export
└── feature/email-notifications

hotfix/critical-bug     ← Urgent prod fix (branches from main)
```

### Release Checklist

```markdown
## Release Checklist: v1.X.0

### Pre-Release
- [ ] All requirements in REQUIREMENTS.md have status "Complete"
- [ ] All tests passing (`npm run test:ci`)
- [ ] Requirements coverage 100% (`npm run check:requirements`)
- [ ] No ESLint warnings (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual QA on staging
- [ ] CHANGELOG.md updated

### Release
- [ ] Merge develop → main (or feature → main for hotfix)
- [ ] Update version in package.json
- [ ] Commit: `chore: release v1.X.0`
- [ ] Tag: `git tag -a v1.X.0 -m "Release v1.X.0"`
- [ ] Push: `git push origin main --tags`
- [ ] GitHub Release created automatically
- [ ] Deploy to production

### Post-Release
- [ ] Verify production deployment
- [ ] Monitor for errors (Sentry)
- [ ] Announce to users (if applicable)
- [ ] Update roadmap/project board
```

---

## Part 6: What Else You Need

### Error Monitoring

```javascript
// src/lib/sentry.js
import * as Sentry from '@sentry/react';

if (import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_ENVIRONMENT,
    release: `dog-boarding@${import.meta.env.VITE_APP_VERSION}`,
    tracesSampleRate: 0.1,
  });
}
```

### Analytics (Privacy-Respecting)

```javascript
// Use Plausible or Umami instead of Google Analytics
// src/lib/analytics.js
export function trackEvent(name, props = {}) {
  if (window.plausible) {
    window.plausible(name, { props });
  }
}

// Usage
trackEvent('Boarding Created', { dogCount: 1 });
```

### Feature Flags (for gradual rollouts)

```javascript
// src/lib/features.js
const FEATURES = {
  newCalendarView: {
    enabled: import.meta.env.VITE_ENVIRONMENT !== 'production',
    // Or use a service like LaunchDarkly, Flagsmith
  },
  emailNotifications: {
    enabled: false,
  },
};

export function isFeatureEnabled(name) {
  return FEATURES[name]?.enabled ?? false;
}

// Usage in component
if (isFeatureEnabled('newCalendarView')) {
  return <NewCalendar />;
} else {
  return <OldCalendar />;
}
```

### Database Migrations

```
supabase/
├── schema.sql           # Current full schema
└── migrations/
    ├── 001_initial.sql
    ├── 002_add_invite_codes.sql
    ├── 003_shared_org_rls.sql
    └── 004_add_user_profiles.sql
```

```sql
-- migrations/003_shared_org_rls.sql
-- Migration: Shared Organization RLS
-- Version: 1.3.0
-- Date: 2026-01-15

-- Update RLS policies for single-org model
DROP POLICY IF EXISTS "Users can manage own dogs" ON dogs;
CREATE POLICY "Authenticated users full access" ON dogs
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Repeat for other tables...
```

### Backup Strategy

```yaml
# Document in docs/OPERATIONS.md

## Backups

### Supabase Automatic Backups
- Pro plan: Daily backups, 7-day retention
- Free plan: No automatic backups

### Manual Backup Script
```bash
# Export data (run periodically)
npx supabase db dump -f backup-$(date +%Y%m%d).sql
```

### Before Major Releases
- Always take a manual backup
- Document rollback procedure
```

### Documentation Site (Future)

Consider setting up a docs site with something like:
- Docusaurus
- VitePress  
- Nextra

This can host:
- User guide
- API docs
- Developer guide
- Changelog

---

## Part 7: Roadmap & Project Management

### GitHub Projects Board

Set up a project board with columns:
- **Backlog** - Ideas and future work
- **Next Release** - Committed for upcoming version
- **In Progress** - Currently being worked on
- **Review** - PRs awaiting review
- **Done** - Completed this release

### Roadmap in README

```markdown
## 🗺️ Roadmap

### v1.3 (In Progress)
- [x] Invite-only signup
- [x] User profile page
- [ ] Shared organization data
- [ ] Test data seeding

### v1.4 (Planned)
- [ ] Email notifications
- [ ] Export to CSV/PDF
- [ ] Dark mode

### v2.0 (Future)
- [ ] Multi-organization support
- [ ] Client portal
- [ ] Mobile app (React Native)

See our [project board](link) for detailed status.
```

### Version Planning Template

When planning a new version, create an issue:

```markdown
## Version 1.4 Planning

### Goals
- [Goal 1]
- [Goal 2]

### Requirements to Add
- REQ-XXX: [Description]
- REQ-XXX: [Description]

### Dependencies
- v1.3 must be complete
- Supabase upgrade needed for [feature]

### Timeline
- Start: [Date]
- Feature freeze: [Date]
- Release target: [Date]

### Risks
- [Risk 1]
- [Risk 2]
```

---

## Summary: Complete Development Workflow

### Daily Development

```bash
# 1. Start the day
git pull origin main
npm run check:all  # Lint + requirements + tests

# 2. Pick a task from project board

# 3. If new feature:
#    - Add requirement to REQUIREMENTS.md
#    - Write tests first
#    - Implement feature
#    - Run tests

# 4. Commit with conventional message
git add .
git commit -m "feat(auth): add invite code validation [REQ-070]"

# 5. Push and create PR
git push origin feature/my-feature
```

### PR Review

1. CI passes (lint, requirements, tests, build)
2. Code review approved
3. Requirements impact documented
4. CHANGELOG updated if needed

### Release

1. All tests green
2. Requirements 100% covered
3. Manual QA on staging
4. Version bump
5. Tag and push
6. Deploy

---

## Prompt for Claude Code

> "I want to set up a professional development lifecycle for this project. Read `docs/development-lifecycle-spec.md` and implement:
>
> 1. **Environments:** Create seed scripts for test data. Set up .env.example with all needed variables.
>
> 2. **Requirements:** Add the v1.3 requirements to REQUIREMENTS.md with the new format (Added, Status, Tests).
>
> 3. **CI/CD:** Update GitHub Actions to run lint, requirements check, unit tests, e2e tests, and build.
>
> 4. **Pre-commit:** Set up husky to run lint and tests before commits.
>
> 5. **Repository:** Ensure all docs are up to date, add CODEOWNERS, add dependabot.yml.
>
> Start with the test data seeding scripts so I can develop against fake data."
