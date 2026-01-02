# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-01-02

### Added
- **External Data Sync** - Automatically sync appointments from external booking systems
  - Authentication with external booking site (REQ-100)
  - Schedule page scraping for appointment discovery (REQ-101)
  - Appointment detail extraction (REQ-102)
  - Data mapping to dogs and boardings (REQ-103)
  - Full sync orchestration with progress tracking (REQ-104)
  - Sync logging and history (REQ-106)
  - Admin UI for sync configuration (REQ-107)
- Sync Settings panel in Settings page
  - Enable/disable automatic sync
  - Configurable sync interval (15 min - 24 hours)
  - Manual "Sync Now" button with real-time progress
  - Sync history with detailed statistics
- Sync status indicator in header (shows when syncing or on error)
- "External" badge on dogs and boardings imported from sync
- Database tables for sync feature (sync_appointments, sync_settings, sync_logs)
- Security: Error sanitization to prevent credential/URL leaks
- Security: Input validation for sync settings
- 486 tests (128 new for sync feature)

### Changed
- Refactored sort icon components to render functions (lint compliance)

### Security
- Added `sanitizeError()` function to redact URLs, passwords, and usernames from error messages
- Sync interval validation (15-1440 minutes)
- Credentials stored in environment variables (not in database)

## [1.2.0] - 2026-01-01

### Added
- Visual calendar page with booking bars spanning arrival to departure
- PWA support - install on iPhone/Android home screen
- Employee totals summary on matrix page
- Payroll page for tracking employee payments
- Inline delete confirmations for better mobile UX
- Comprehensive test coverage for core business logic
- ErrorBoundary component for graceful error handling
- Shared utility functions for employee helpers
- Constants file for magic numbers

### Changed
- Improved mobile layout with responsive bottom sheet dialogs
- Unified date column sorting behavior on boarding matrix
- Extracted duplicate employee logic to shared utilities
- Consistent React import patterns across components

### Fixed
- Dog name sorting direction bug in boarding matrix
- Removed unused code (useLocalStorage hook)

## [1.1.0] - 2025-12-15

### Added
- Multi-user support with Supabase authentication
- Row-level security for data isolation
- Password reset flow
- Settings page for net percentage and employees
- Employee activation/deactivation

### Changed
- Migrated from localStorage to Supabase
- Updated to React 18

## [1.0.0] - 2025-11-01

### Added
- Initial release
- Boarding matrix with daily breakdown
- Dog management (CRUD)
- Boarding management (CRUD)
- Night rate calculations
- Employee assignment per night
- CSV import for boardings
