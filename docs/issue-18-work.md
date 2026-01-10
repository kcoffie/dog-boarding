# Issue #18: UAT Data Sync from Google Sheets

## Issue Details
**Title:** [UAT Feedback]: need to manually sync data before UAT starts
**State:** OPEN
**Author:** kcoffie

## Problem Statement
The Google Sheet at https://docs.google.com/spreadsheets/d/13bcw4_HwkxuNJ2XR3s-zJ80oVUioe2HCOlByqFljE1Y is the current source of truth for boarding data. The app needs to reflect data from November 1st onward.

Currently, there's no automated way to sync:
1. Boarding data from the spreadsheet
2. Employee data (no import mechanism exists)

## Investigation Log

### 2026-01-10 - Initial Investigation
- [x] Understand current database schema and data
- [x] Analyze Google Sheet structure
- [x] Determine what data needs to be synced
- [x] Identify gaps between sheet and database

### 2026-01-10 - Google Sheet Analysis
The spreadsheet contains 4 sheets covering the period from Nov 18 - Jan 10:
1. gid=0: Nov 18 - Nov 29
2. gid=7893528: Nov 30 - Dec 13
3. gid=196567038: Dec 14 - Dec 27
4. gid=1731530850: Dec 28 - Jan 10

Each sheet uses a matrix format:
- Rows: Dog names with day/night rates
- Columns: Dates with d (day) and n (night) sub-columns
- Values: Rate amounts indicate presence

### 2026-01-10 - Solution Implemented
Created `scripts/sync-from-sheets.js` to:
1. Fetch CSV data from all 4 Google Sheets
2. Parse the matrix format to extract dog info and presence records
3. Convert presence records into boarding records with arrival/departure times
4. Create missing dogs in database
5. Create new boardings, skipping duplicates/overlapping stays

## Todo List
- [x] Investigate current database structure
- [x] Analyze Google Sheet data format
- [x] Compare data between sheet and database
- [x] Create sync strategy
- [x] Implement sync solution
- [x] Test and validate data
- [x] Document changes

## Notes
- Future: app will directly pull data from another site
- For UAT: need manual sync to match boarding data from Nov 1 onward
- Solution: Created sync script that converts matrix format to boarding records

## Files Changed
1. `scripts/sync-from-sheets.js` - New sync script
2. `package.json` - Added `sync:sheets` npm script

## Test Results

### Sync Run Results (2026-01-10)
```
📥 Fetching sheet: Nov 18 - Nov 29 (gid=0)...
   Found 16 dogs, 68 presence records
📥 Fetching sheet: Nov 30 - Dec 13 (gid=7893528)...
   Found 21 dogs, 47 presence records
📥 Fetching sheet: Dec 14 - Dec 27 (gid=196567038)...
   Found 26 dogs, 88 presence records
📥 Fetching sheet: Dec 28 - Jan 10 (gid=1731530850)...
   Found 31 dogs, 60 presence records

📊 Total: 31 unique dogs, 263 presence records
📅 Converted to 50 boarding records

🐕 Dogs: 30 created, 1 existing
📅 Boardings: 49 created, 1 skipped
```

### Verification
- 38 total dogs in database (30 from sheets + 8 test dogs)
- 162 boardings from Nov 2025+ in database
- Dates correctly set to Nov 2025 - Jan 2026
- Verified: marley (Nov 20-22), lilly (Nov 21-28), captain (Jan 1-4)

---

## Short Summary
Created a sync script (`scripts/sync-from-sheets.js`) that imports boarding data from the Google Sheets matrix format. The script downloads 4 sheets (Nov 18, 2025 - Jan 10, 2026), parses the day/night matrix, and creates dog and boarding records in the database. Successfully synced 30 dogs and 49 boarding records from the sheets.

## Detailed Engineering Summary

### Investigation Timeline
1. Analyzed Google Sheet structure - found 4 sheets with matrix format
2. Discovered date columns have d/n sub-headers for day/night stays
3. Identified rate values in cells indicate presence

### Root Cause Analysis
The app lacked any way to import data from the external Google Sheet source of truth. The sheet uses a matrix format that doesn't match the app's boarding record structure (arrival/departure datetimes).

### Resolution Steps
1. Created `scripts/sync-from-sheets.js` with:
   - CSV fetch from Google Sheets export API
   - Matrix parsing logic for both column orders (day-first, night-first)
   - Presence-to-boarding conversion algorithm
   - Duplicate detection to prevent overlapping bookings
2. Added `sync:sheets` npm script to package.json

### Files Changed
| File | Description |
|------|-------------|
| `scripts/sync-from-sheets.js` | New sync script (350 lines) - fetches sheets, parses matrix, creates records |
| `package.json` | Added `sync:sheets` npm script |
| `docs/issue-18-work.md` | This work document |

### How to Verify Changes Are Safe
1. The script only creates records, never deletes
2. Duplicate detection prevents overlapping boardings
3. Existing dogs are not modified, only matched by name
4. Run `npm run sync:sheets` with proper env vars
5. Verify in app that November boardings appear correctly

### Usage
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run sync:sheets
```

Or source the .env.seed file first:
```bash
source .env.seed
npm run sync:sheets
```

### Related Issues
- None identified
