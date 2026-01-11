# Issue #14: External Sync in Settings

## Issue Details
**Title:** [UAT Bug]: external sync is settings?
**State:** OPEN
**Author:** kcoffie
**Labels:** bug
**Severity:** Blocker

## Problem Statement
External sync feature is showing in the Settings page on production when it shouldn't be. This is a v2 feature that should only exist in the development environment.

### User Requirements
1. External sync should NOT show in prod - it's a v2 feature
2. Need separate development processes:
   - UAT work: doesn't touch prod code/data until ready
   - v2 development: doesn't touch prod code/data until ready
3. Need safeguards to protect prod code and data

## Investigation Log

### 2026-01-10 - Initial Investigation
- [x] Find where external sync feature is implemented
- [x] Understand how it's appearing in prod
- [x] Check current branch/deployment setup
- [x] Identify what controls exist (or don't exist)

### Root Cause Found
The `develop` branch was merged into `main` (commit 941d43c), which brought v2 features into production:

**Problematic commits on `main`:**
```
941d43c Merge branch 'develop'
├── efce5ef chore: bump version to 2.0.0 and update CHANGELOG
├── f31ddce feat: add Phase 7 security improvements for sync
└── da6306d feat: add external data sync feature (v2.0 Phases 1-6)
```

**Files added to production that shouldn't be there:**
- `src/components/SyncSettings.jsx` - External sync UI component
- `src/components/SyncStatusIndicator.jsx` - Sync status badge
- `src/hooks/useSyncSettings.js` - Sync settings hook
- `src/lib/scraper/*` - All scraper code
- `src/__tests__/scraper/*` - Scraper tests
- `src/__tests__/components/SyncSettings.test.jsx`
- `supabase/migrations/005_add_sync_tables.sql`
- Modified: `src/pages/SettingsPage.jsx` (imports SyncSettings)
- Modified: `src/components/Layout.jsx`

### Current Branch Structure
- `main` - Production (has v2 code that shouldn't be there)
- `uat` - UAT testing branch
- `develop` - v2 development branch
- `development` - New branch for this work

### Problem Summary
1. No branch protection on `main`
2. `develop` was merged directly to `main`
3. No environment-based feature flags
4. No separate deployment pipelines for UAT vs prod vs v2

## Todo List
- [x] Investigate external sync feature location
- [x] Understand current deployment process
- [x] Design solution for environment separation
- [x] Revert v2 code from main branch
- [x] Document branch/deployment strategy
- [x] Push changes to production

## Solution Implemented

### 1. Reverted v2 Code from Production
Commit `8c0790a` reverts all v2 external sync code from `main`:
- Removed `SyncSettings` component from Settings page
- Removed all scraper library code (`src/lib/scraper/*`)
- Removed sync API endpoints (`api/sync.js`, `api/health.js`)
- Removed sync-related tests and migrations

### 2. Created Branch Workflow Documentation
Created `docs/BRANCHING.md` with:
- Clear branch structure (main, uat, develop)
- Rules for each branch
- Workflow for different scenarios
- Instructions for setting up GitHub branch protection

### 3. Branch Protection Recommendations
Owner should enable branch protection on `main`:
- Require pull request before merging
- Require approval
- Require status checks to pass

---

## Short Summary
The v2 external sync feature was incorrectly merged from the `develop` branch to `main`, causing it to appear in production. Fixed by reverting the merge commit and all related follow-up commits (4 total). Created branch workflow documentation (`docs/BRANCHING.md`) establishing clear rules: `main` for production, `uat` for testing, `develop` for v2 work. Recommended enabling GitHub branch protection on `main` to prevent future incidents.

## Detailed Engineering Summary

### Investigation Timeline
1. Searched for "external sync" in codebase - not found in current branch
2. Checked git history on `main` - found merge commit `941d43c Merge branch 'develop'`
3. Identified 4 commits to revert:
   - `6917e29` - Edge Runtime API fix (sync-related)
   - `4b40c1f` - CommonJS conversion (sync-related)
   - `0cdffd4` - CORS proxy (sync-related)
   - `941d43c` - The merge that brought v2 to main

### Root Cause Analysis
No branch protection existed on `main`. The `develop` branch (containing v2 features) was merged directly to `main` without review, deploying unreleased v2 code to production.

### Resolution Steps
1. Reverted all 4 commits in a single revert commit
2. Kept DogsPage.jsx unchanged (had lint fixes in current version)
3. Pushed revert to `main`
4. Created `docs/BRANCHING.md` with workflow documentation

### Files Changed
| File | Description |
|------|-------------|
| 30 files deleted/modified | Reverted v2 sync code |
| `docs/BRANCHING.md` | NEW - Branch workflow documentation |
| `docs/issue-14-external-sync-in-settings.md` | This work document |

### How to Verify Changes Are Safe
1. Visit production app - Settings page should NOT show "External Sync"
2. Run `npm run check:requirements` - All 32 requirements pass (100%)
3. v2 code remains intact in `develop` branch

### Preventing Future Issues
1. **Enable branch protection on `main`** (see BRANCHING.md)
2. Follow the documented workflow for all changes
3. Never merge `develop` to `main` directly

### Related Issues
- None identified
