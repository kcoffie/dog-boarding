# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
