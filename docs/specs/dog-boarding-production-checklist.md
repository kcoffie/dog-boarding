# Dog Boarding App - Production Readiness Checklist (v1.2)

## Overview

This document outlines everything needed to finalize version 1.2 as a professional, production-ready release. Use this with Claude Code to systematically review, test, document, and polish the codebase.

---

## Part 1: Code Review

### Prompt for Claude Code

> "Do a comprehensive code review of this entire codebase. I want it production-ready. Review for:
>
> 1. **Code quality** - naming, structure, DRY violations, dead code
> 2. **Security** - auth holes, data exposure, injection risks
> 3. **Performance** - unnecessary re-renders, missing memoization, N+1 queries
> 4. **Error handling** - uncaught errors, missing loading/error states
> 5. **Accessibility** - keyboard navigation, screen readers, ARIA labels
> 6. **TypeScript/type safety** - any types, missing types, type errors
>
> Go file by file. For each issue found, categorize as CRITICAL, HIGH, MEDIUM, or LOW priority. After the review, give me a summary and let's fix issues starting with CRITICAL."

### Code Quality Checklist

**Naming & Structure:**
- [ ] Components named clearly (PascalCase)
- [ ] Functions named with verbs (handleClick, fetchDogs, calculateTotal)
- [ ] Variables named descriptively (not `data`, `temp`, `x`)
- [ ] Files organized logically (components/, hooks/, utils/, pages/)
- [ ] No deeply nested folders (max 3 levels)
- [ ] Index files for clean imports where appropriate

**DRY & Reusability:**
- [ ] No duplicated logic across components
- [ ] Shared utilities extracted to utils/
- [ ] Common UI patterns as reusable components
- [ ] Hooks extracted for reusable stateful logic
- [ ] Constants in a central location

**Clean Code:**
- [ ] No commented-out code
- [ ] No console.log statements (except in error handlers)
- [ ] No TODO/FIXME comments (or tracked in issues)
- [ ] No unused imports
- [ ] No unused variables
- [ ] No unused dependencies in package.json
- [ ] Consistent formatting (Prettier)
- [ ] Consistent linting (ESLint with no warnings)

### Security Review Checklist

**Authentication:**
- [ ] All protected routes actually check auth
- [ ] Auth tokens not exposed in URLs
- [ ] Auth tokens not stored in localStorage (Supabase handles this correctly)
- [ ] Logout clears all sensitive data
- [ ] Session timeout handled gracefully

**Data Access:**
- [ ] Row-Level Security enabled on ALL Supabase tables
- [ ] RLS policies tested (user A can't see user B's data)
- [ ] No sensitive data in client-side logs
- [ ] No API keys in client code (except Supabase anon key)
- [ ] Environment variables used for all secrets

**Input Handling:**
- [ ] All user inputs validated client-side
- [ ] All user inputs validated server-side (Supabase constraints)
- [ ] No raw HTML rendering (XSS prevention)
- [ ] File uploads validated (if applicable)
- [ ] SQL injection not possible (Supabase client handles this)

**Dependencies:**
- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] Dependencies up to date (or known reason for pinning)
- [ ] No unnecessary dependencies

### Performance Review Checklist

**React Performance:**
- [ ] Large lists use virtualization or pagination
- [ ] Expensive calculations wrapped in useMemo
- [ ] Callback functions wrapped in useCallback where needed
- [ ] No unnecessary re-renders (check with React DevTools)
- [ ] Images optimized and lazy-loaded
- [ ] Code splitting for large pages (React.lazy)

**Data Fetching:**
- [ ] No duplicate API calls
- [ ] Data cached appropriately
- [ ] Loading states show immediately
- [ ] Stale-while-revalidate pattern where appropriate
- [ ] No N+1 query problems (batch fetches)

**Bundle Size:**
- [ ] Bundle analyzed (npm run build && npx vite-bundle-visualizer)
- [ ] No unexpectedly large dependencies
- [ ] Tree shaking working (no full library imports)
- [ ] Images not bundled unnecessarily

### Error Handling Checklist

- [ ] All async operations wrapped in try/catch
- [ ] Errors display user-friendly messages
- [ ] Errors logged for debugging (but not sensitive data)
- [ ] Network failures handled gracefully
- [ ] Loading states for all async operations
- [ ] Empty states for lists with no data
- [ ] 404 page for unknown routes
- [ ] Global error boundary catches crashes

### Accessibility Checklist

- [ ] All images have alt text
- [ ] All form inputs have labels
- [ ] All buttons have accessible names
- [ ] Color contrast meets WCAG AA (4.5:1 for text)
- [ ] Focus visible on all interactive elements
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] ARIA labels on icon-only buttons
- [ ] Screen reader tested (or at least VoiceOver quick check)
- [ ] No motion issues (respect prefers-reduced-motion)

---

## Part 2: Test Coverage

### Prompt for Claude Code

> "Add comprehensive test coverage to this app. I want:
>
> 1. **Unit tests** for all utility functions (dateUtils, calculations, etc.)
> 2. **Component tests** for all major components
> 3. **Integration tests** for critical user flows
> 4. **E2E tests** for the happy path of main features
>
> Use Vitest for unit/component tests. Set up Playwright for E2E tests. Target 80%+ code coverage. Show me the coverage report when done."

### Test Structure

```
src/
├── __tests__/
│   └── integration/
│       ├── auth.test.jsx
│       ├── dogCrud.test.jsx
│       └── boardingFlow.test.jsx
├── components/
│   ├── DogForm.jsx
│   └── DogForm.test.jsx  (co-located)
├── hooks/
│   ├── useDogs.js
│   └── useDogs.test.js
├── utils/
│   ├── dateUtils.js
│   └── dateUtils.test.js
e2e/
├── auth.spec.ts
├── boarding.spec.ts
└── calendar.spec.ts
```

### Unit Tests Required

**Utility Functions:**
```javascript
// utils/dateUtils.test.js
describe('dateUtils', () => {
  describe('isOvernight', () => {
    it('returns true when departure is next day');
    it('returns false when departure is same day');
    it('handles timezone edge cases');
    it('handles exactly 5pm boundary');
  });
  
  describe('isDayPresent', () => {
    it('returns true when dog arrives before 5pm');
    it('returns false when dog arrives after 5pm');
  });
  
  describe('formatDate', () => {
    it('formats date correctly');
    it('handles invalid date');
  });
});

// utils/calculations.test.js
describe('calculations', () => {
  describe('calculateGross', () => {
    it('sums night rates for overnight dogs');
    it('returns 0 when no dogs overnight');
    it('handles multiple dogs');
  });
  
  describe('calculateNet', () => {
    it('calculates correct percentage');
    it('rounds to 2 decimal places');
  });
  
  describe('calculateEmployeeTotals', () => {
    it('sums correctly across multiple nights');
    it('handles employee with no assignments');
  });
});
```

**Hooks:**
```javascript
// hooks/useDogs.test.js
describe('useDogs', () => {
  it('fetches dogs on mount');
  it('returns loading state initially');
  it('returns dogs after fetch');
  it('handles fetch error');
  it('addDog adds to list');
  it('updateDog updates in list');
  it('deleteDog removes from list');
});
```

### Component Tests Required

```javascript
// components/DogForm.test.jsx
describe('DogForm', () => {
  it('renders empty form for new dog');
  it('renders populated form for edit');
  it('validates required fields');
  it('validates rate is positive number');
  it('calls onSubmit with form data');
  it('shows loading state while submitting');
  it('displays error message on failure');
});

// components/BoardingMatrix.test.jsx
describe('BoardingMatrix', () => {
  it('renders correct date range');
  it('shows dog names in rows');
  it('displays day/night indicators correctly');
  it('calculates gross total correctly');
  it('calculates net total correctly');
  it('allows employee selection');
  it('navigates months correctly');
});

// components/Calendar.test.jsx
describe('Calendar', () => {
  it('renders correct days for month');
  it('highlights today');
  it('shows booking indicators');
  it('opens detail panel on day click');
  it('navigates to previous month');
  it('navigates to next month');
});
```

### Integration Tests Required

```javascript
// __tests__/integration/auth.test.jsx
describe('Authentication Flow', () => {
  it('redirects to login when not authenticated');
  it('allows signup with valid credentials');
  it('shows error for invalid signup');
  it('allows login with valid credentials');
  it('shows error for invalid login');
  it('redirects to app after login');
  it('logs out and redirects to login');
  it('persists session on refresh');
});

// __tests__/integration/dogCrud.test.jsx
describe('Dog Management', () => {
  it('displays list of dogs');
  it('adds new dog');
  it('edits existing dog');
  it('deletes dog with confirmation');
  it('shows empty state when no dogs');
});

// __tests__/integration/boardingFlow.test.jsx
describe('Boarding Flow', () => {
  it('creates new boarding');
  it('shows boarding on matrix');
  it('shows boarding on calendar');
  it('edits boarding dates');
  it('deletes boarding');
  it('imports boardings from CSV');
});
```

### E2E Tests Required

```typescript
// e2e/auth.spec.ts
test.describe('Authentication', () => {
  test('user can sign up', async ({ page }) => {
    await page.goto('/signup');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/');
  });
  
  test('user can log in', async ({ page }) => {
    // ...
  });
  
  test('user can reset password', async ({ page }) => {
    // ...
  });
});

// e2e/booking.spec.ts
test.describe('Booking Management', () => {
  test('complete booking flow', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'TestPass123!');
    await page.click('button[type="submit"]');
    
    // Add a dog
    await page.click('text=Dogs');
    await page.click('text=Add Dog');
    await page.fill('[name="name"]', 'Buddy');
    await page.fill('[name="dayRate"]', '35');
    await page.fill('[name="nightRate"]', '45');
    await page.click('text=Save');
    
    // Add a boarding
    await page.click('text=Add Boarding');
    await page.selectOption('[name="dog"]', 'Buddy');
    // ... fill dates
    await page.click('text=Save');
    
    // Verify on matrix
    await page.click('text=Matrix');
    await expect(page.locator('text=Buddy')).toBeVisible();
    
    // Verify on calendar
    await page.click('text=Calendar');
    // ... verify booking appears
  });
});
```

### Test Configuration

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/index.js',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

```javascript
// src/test/setup.js
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Supabase
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
      insert: vi.fn().mockResolvedValue({ data: [], error: null }),
      update: vi.fn().mockResolvedValue({ data: [], error: null }),
      delete: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));
```

---

## Part 3: GitHub Repository

### Prompt for Claude Code

> "Set up this GitHub repository for a professional open-source project. Create:
>
> 1. Comprehensive README.md
> 2. CONTRIBUTING.md with development setup
> 3. CODE_OF_CONDUCT.md
> 4. LICENSE (MIT)
> 5. CHANGELOG.md
> 6. GitHub issue templates
> 7. GitHub PR template
> 8. GitHub Actions for CI/CD
>
> Make it look like a well-maintained professional project."

### README.md Template

```markdown
# 🐕 Dog Boarding Manager

A modern web application for managing dog boarding businesses. Track bookings, calculate revenue, manage employees, and more.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build](https://img.shields.io/github/actions/workflow/status/username/dog-boarding/ci.yml?branch=main)
![Coverage](https://img.shields.io/codecov/c/github/username/dog-boarding)
![Version](https://img.shields.io/github/package-json/v/username/dog-boarding)

<p align="center">
  <img src="docs/screenshots/calendar-preview.png" alt="Calendar View" width="600">
</p>

## ✨ Features

- **📅 Visual Calendar** - See all bookings at a glance with color-coded dogs
- **📊 Boarding Matrix** - Daily breakdown of dogs, rates, and revenue
- **🐕 Dog Management** - Track dogs with custom day/night rates
- **👥 Employee Tracking** - Assign employees to nights, calculate earnings
- **📱 Mobile-First PWA** - Install on your phone, works offline
- **🔐 Secure Multi-User** - Each user sees only their own data
- **📤 CSV Import** - Bulk import bookings from spreadsheets

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)

### Installation

```bash
# Clone the repository
git clone https://github.com/username/dog-boarding.git
cd dog-boarding

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Run the SQL from `supabase/schema.sql` in the SQL editor
3. Copy your project URL and anon key to `.env.local`

See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) for detailed instructions.

## 📖 Documentation

- [User Guide](docs/USER_GUIDE.md)
- [API Reference](docs/API.md)
- [Supabase Setup](docs/SUPABASE_SETUP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite, Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth)
- **Testing:** Vitest, React Testing Library, Playwright
- **CI/CD:** GitHub Actions, Vercel

## 📱 Screenshots

<details>
<summary>View all screenshots</summary>

### Calendar View
![Calendar](docs/screenshots/calendar.png)

### Boarding Matrix
![Matrix](docs/screenshots/matrix.png)

### Dogs Management
![Dogs](docs/screenshots/dogs.png)

### Mobile View
![Mobile](docs/screenshots/mobile.png)

</details>

## 🧪 Testing

```bash
# Run unit and integration tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui
```

## 🚢 Deployment

### Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/username/dog-boarding)

### Manual Deployment

```bash
npm run build
# Deploy contents of `dist/` folder
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed instructions.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) for the amazing backend platform
- [Tailwind CSS](https://tailwindcss.com) for the styling utilities
- [Lucide Icons](https://lucide.dev) for the beautiful icons

---

<p align="center">
  Made with ❤️ for dog lovers everywhere
</p>
```

### CONTRIBUTING.md Template

```markdown
# Contributing to Dog Boarding Manager

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Getting Started

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/dog-boarding.git
   cd dog-boarding
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env.local
   ```
   
   For development, you can use our shared test Supabase instance or create your own.

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Run tests to make sure everything works**
   ```bash
   npm test
   ```

### Project Structure

```
src/
├── components/     # Reusable UI components
├── pages/          # Page components (routed)
├── hooks/          # Custom React hooks
├── utils/          # Utility functions
├── contexts/       # React contexts
├── lib/            # External library setup
└── test/           # Test utilities and setup

e2e/                # Playwright E2E tests
docs/               # Documentation
supabase/           # Database schema and migrations
```

## Making Changes

### Branch Naming

- `feature/` - New features (e.g., `feature/add-reports`)
- `fix/` - Bug fixes (e.g., `fix/calendar-date-display`)
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): description

[optional body]

[optional footer]
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting (no code change)
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

**Examples:**
```
feat(calendar): add swipe navigation for mobile
fix(matrix): correct overnight calculation at month boundary
docs(readme): update installation instructions
```

### Code Style

- We use Prettier for formatting - run `npm run format`
- We use ESLint for linting - run `npm run lint`
- TypeScript strict mode is enabled
- All new code should have tests

### Testing Requirements

- All new features must include tests
- All bug fixes should include a test that would have caught the bug
- Maintain 80%+ code coverage
- Run the full test suite before submitting PR

```bash
npm run test:coverage
npm run test:e2e
```

## Pull Request Process

1. **Update documentation** if you're changing functionality
2. **Add tests** for new features or bug fixes
3. **Update CHANGELOG.md** under "Unreleased" section
4. **Ensure all tests pass** and coverage thresholds are met
5. **Request review** from maintainers

### PR Title Format

Follow the same format as commit messages:
```
feat(calendar): add swipe navigation for mobile
```

### PR Description Template

The PR template will guide you, but please include:
- What changes you made and why
- How to test the changes
- Screenshots for UI changes
- Any breaking changes

## Reporting Issues

### Bug Reports

Please include:
- Clear description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Browser/device information
- Screenshots if applicable

### Feature Requests

Please include:
- Clear description of the feature
- Use case / problem it solves
- Any implementation ideas (optional)

## Questions?

- Open a [Discussion](https://github.com/username/dog-boarding/discussions)
- Check existing [Issues](https://github.com/username/dog-boarding/issues)

Thank you for contributing! 🐕
```

### CHANGELOG.md Template

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
### Changed
### Fixed
### Removed

## [1.2.0] - 2026-01-15

### Added
- Visual calendar page with booking bars spanning arrival to departure
- PWA support - install on iPhone/Android home screen
- Swipe navigation on calendar for mobile
- Employee totals summary on matrix page
- CSV import preview with error display
- Comprehensive test coverage (80%+)

### Changed
- Improved mobile layout for matrix page
- Better touch targets on all interactive elements
- Optimized bundle size

### Fixed
- Overnight calculation at month boundaries
- Date picker timezone issues
- Employee dropdown not saving on first click

## [1.1.0] - 2025-12-15

### Added
- Multi-user support with Supabase authentication
- Row-level security for data isolation
- Password reset flow
- Settings page for net percentage and employees

### Changed
- Migrated from localStorage to Supabase
- Updated to React 18

### Fixed
- Various bug fixes

## [1.0.0] - 2025-11-01

### Added
- Initial release
- Boarding matrix with daily breakdown
- Dog management (CRUD)
- Boarding management (CRUD)
- Night rate calculations
- Employee assignment per night
- CSV import for boardings
```

### GitHub Issue Templates

```yaml
# .github/ISSUE_TEMPLATE/bug_report.yml
name: Bug Report
description: Report a bug or unexpected behavior
labels: ["bug", "triage"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to report a bug!
        
  - type: textarea
    id: description
    attributes:
      label: Bug Description
      description: A clear description of what the bug is
      placeholder: What happened?
    validations:
      required: true
      
  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: How can we reproduce this issue?
      placeholder: |
        1. Go to '...'
        2. Click on '...'
        3. See error
    validations:
      required: true
      
  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What did you expect to happen?
    validations:
      required: true
      
  - type: textarea
    id: screenshots
    attributes:
      label: Screenshots
      description: Add screenshots if applicable
      
  - type: dropdown
    id: browser
    attributes:
      label: Browser
      options:
        - Chrome
        - Safari
        - Firefox
        - Edge
        - Other
        
  - type: dropdown
    id: device
    attributes:
      label: Device
      options:
        - Desktop
        - iPhone
        - Android
        - iPad
        - Other
```

```yaml
# .github/ISSUE_TEMPLATE/feature_request.yml
name: Feature Request
description: Suggest a new feature
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What problem does this solve?
      placeholder: I'm always frustrated when...
    validations:
      required: true
      
  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
      description: How would you like this to work?
    validations:
      required: true
      
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
      description: Any other solutions you've thought about?
      
  - type: textarea
    id: context
    attributes:
      label: Additional Context
      description: Any other context, screenshots, or examples
```

### GitHub PR Template

```markdown
<!-- .github/PULL_REQUEST_TEMPLATE.md -->

## Description

<!-- What does this PR do? Why is it needed? -->

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Refactoring (no functional changes)

## How Has This Been Tested?

<!-- Describe the tests you ran -->

- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] Manual testing

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## Checklist

- [ ] My code follows the project's style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Related Issues

<!-- Link any related issues: Fixes #123, Relates to #456 -->
```

### GitHub Actions CI/CD

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
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
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true

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
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          generate_release_notes: true
          files: |
            dist/**
```

---

## Part 4: Final Polish

### Prompt for Claude Code

> "Final polish for v1.2 release:
>
> 1. Run `npm audit fix` and update any vulnerable dependencies
> 2. Run `npm run build` and verify no warnings
> 3. Check bundle size - flag anything over 500KB
> 4. Add loading skeletons to all pages
> 5. Add error boundaries around main sections
> 6. Verify all forms have proper validation messages
> 7. Test complete user flow on mobile
> 8. Generate final production build
>
> Give me a summary of the app's final state."

### Pre-Release Checklist

**Code Quality:**
- [ ] ESLint passes with no warnings
- [ ] Prettier formatting applied
- [ ] TypeScript compiles with no errors
- [ ] No console.log statements
- [ ] Bundle size acceptable (< 500KB gzipped)

**Testing:**
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] All E2E tests pass
- [ ] Coverage > 80%
- [ ] Manual QA completed

**Security:**
- [ ] npm audit shows no high/critical issues
- [ ] Environment variables documented
- [ ] RLS policies verified
- [ ] Auth flows tested

**Documentation:**
- [ ] README up to date
- [ ] CHANGELOG updated for release
- [ ] API documentation current
- [ ] Setup instructions verified

**Deployment:**
- [ ] Production build succeeds
- [ ] Environment variables set in hosting
- [ ] Supabase redirect URLs configured
- [ ] PWA manifest correct
- [ ] SSL/HTTPS enabled

### Version Bump & Release

```bash
# Update version in package.json
npm version 1.2.0

# Create git tag
git tag -a v1.2.0 -m "Release v1.2.0"

# Push with tags
git push origin main --tags
```

---

## Part 5: What Else to Ask Claude Code

### Before v1.2 Release

> "Before we release v1.2, do a final review:
> 
> 1. Are there any TypeScript `any` types that should be properly typed?
> 2. Are there any TODO comments we missed?
> 3. Is error handling consistent across all components?
> 4. Are all user-facing strings ready for future localization?
> 5. Is the mobile experience polished on all pages?
> 6. Are there any accessibility issues we missed?
>
> Fix any issues found."

### Performance Audit

> "Run a performance audit:
>
> 1. Analyze the production bundle - what are the largest dependencies?
> 2. Check for unnecessary re-renders using React DevTools
> 3. Verify images are optimized
> 4. Check Lighthouse scores (aim for 90+ on all metrics)
> 5. Test loading time on slow 3G connection
>
> Suggest and implement optimizations."

### Future-Proofing

> "Prepare the codebase for future development:
>
> 1. Add JSDoc comments to all exported functions
> 2. Create a `docs/ARCHITECTURE.md` explaining the codebase structure
> 3. Add inline comments for complex business logic
> 4. Create a `docs/DATABASE.md` with schema documentation
> 5. Set up Storybook for component documentation (optional but nice)
>
> This will help future contributors (including yourself) understand the code."

### Monitoring & Analytics (Post-Launch)

> "Set up monitoring for production:
>
> 1. Add Sentry for error tracking
> 2. Add basic analytics (privacy-respecting, like Plausible or Umami)
> 3. Add performance monitoring
> 4. Set up uptime monitoring alerts
>
> Show me what data we'll be collecting and ensure it's privacy-compliant."

---

## Summary: Complete v1.2 Release Prompt Sequence

Use these prompts in order with Claude Code:

1. **Code Review:**
   > "Do a comprehensive code review. Go file by file, categorize issues as CRITICAL/HIGH/MEDIUM/LOW. Start fixing from CRITICAL."

2. **Testing:**
   > "Add comprehensive test coverage. Unit tests for utils, component tests, integration tests, E2E tests. Target 80%+ coverage."

3. **Documentation:**
   > "Set up professional GitHub repository: README, CONTRIBUTING, CHANGELOG, issue templates, PR template, GitHub Actions CI/CD."

4. **Final Polish:**
   > "Final polish: fix npm audit issues, add loading skeletons, error boundaries, verify mobile experience, generate production build."

5. **Release:**
   > "Prepare v1.2.0 release: bump version, update CHANGELOG, create git tag, verify deployment."

You'll end up with a production-ready, professionally documented, well-tested application. 🚀
