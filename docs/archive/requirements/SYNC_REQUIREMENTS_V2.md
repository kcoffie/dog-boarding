# External Sync Requirements v2

## Overview

These requirements define a robust, incremental sync system that accurately reflects the state of the external booking system while minimizing unnecessary data transfers and database operations.

---

## REQ-200: Initial vs Incremental Sync

### REQ-200.1: First-Time Sync (Initial)
- **When**: No successful sync has ever completed (`sync_settings.last_successful_sync_at` is null)
- **Behavior**: Fetch appointments from **90 days ago** to **60 days in the future**
- **Purpose**: Establish baseline of historical and upcoming bookings

### REQ-200.2: Subsequent Sync (Incremental)
- **When**: At least one successful sync has completed
- **Behavior**: Fetch appointments from **30 days ago** to **60 days in the future**
- **Purpose**: Capture recent changes and new bookings without refetching old data

### REQ-200.3: Force Full Sync
- **When**: User explicitly requests "Full Sync" from UI
- **Behavior**: Same as initial sync (90 days back)
- **Purpose**: Recovery from data corruption or missed syncs

---

## REQ-201: Change Detection

### REQ-201.1: Content Hash Comparison
- Generate a hash of relevant appointment fields (check-in, check-out, status, pet info, client info)
- Store hash in `sync_appointments.content_hash`
- On sync, compare new hash to stored hash
- **Only update** records where hash differs

### REQ-201.2: Fields to Include in Hash
```
- check_in_datetime
- check_out_datetime
- status
- assigned_staff
- pet_name
- client_name
- client_phone
- special_notes
```

### REQ-201.3: Change Tracking
- Record what changed: `sync_appointments.last_change_type` ('created', 'updated', 'unchanged')
- Record when changed: `sync_appointments.last_changed_at`
- Record previous values: `sync_appointments.previous_data` (JSONB, nullable)

---

## REQ-202: Deletion Detection

### REQ-202.1: Soft Delete Detection
- After fetching appointments for a date range, compare to existing records in that range
- Appointments in database but NOT in external site = potentially deleted
- Mark as `sync_status = 'missing_from_source'`

### REQ-202.2: Deletion Confirmation
- Don't immediately delete from `boardings` table
- After 3 consecutive syncs where appointment is missing, mark as `sync_status = 'confirmed_deleted'`
- Set `boardings.cancelled = true` (or equivalent flag)

### REQ-202.3: Deletion Audit
- Log all detected deletions in `sync_logs.deletions_detected`
- Include: external_id, pet_name, dates, when first detected missing

---

## REQ-203: Data Integrity

### REQ-203.1: Atomic Sync Operations
- Each appointment save should be atomic (dog + boarding + sync_appointment)
- If any part fails, rollback the entire appointment (not partial saves)

### REQ-203.2: Duplicate Prevention
- `external_id` must be unique across all records
- Before creating new dog, check for existing by: external_id, then name + owner
- Prevent duplicate boardings for same dog on same dates

### REQ-203.3: Data Consistency
- `boardings.arrival_datetime` must always match `sync_appointments.check_in_datetime`
- `boardings.departure_datetime` must always match `sync_appointments.check_out_datetime`
- Run consistency check after each sync

### REQ-203.4: Orphan Prevention
- Every `boarding` must have a valid `dog_id`
- Every `sync_appointment` must have a valid `mapped_boarding_id` (if dates exist)

---

## REQ-204: Sync Status & Reporting

### REQ-204.1: Detailed Sync Statistics
Track and display:
```
- appointments_in_range: Total in date range on external site
- appointments_new: Created this sync
- appointments_updated: Changed this sync
- appointments_unchanged: No changes detected
- appointments_missing: In DB but not in source
- appointments_failed: Errors during processing
```

### REQ-204.2: Sync Health Indicators
- **Healthy**: Last sync < 24 hours, success or partial
- **Warning**: Last sync 24-72 hours ago, or last sync had >10% failures
- **Critical**: Last sync > 72 hours, or last 3 syncs failed

### REQ-204.3: Sync History
- Keep last 30 sync logs
- Auto-purge older logs (keep summary stats)

---

## REQ-205: Error Handling & Recovery

### REQ-205.1: Partial Sync Success
- If sync fails partway, save progress
- Next sync should resume from where it left off (track `last_processed_external_id`)

### REQ-205.2: Retry Logic
- Individual appointment failures: retry 3x with backoff
- Full sync failure: allow manual retry
- Auth failure: clear session, prompt for re-auth

### REQ-205.3: Error Categorization
```
- auth_error: Login failed
- network_error: Connection/timeout issues
- parse_error: HTML structure changed
- save_error: Database operation failed
- rate_limit: Too many requests
```

---

## REQ-206: Audit Trail

### REQ-206.1: Change History
- For each boarding, track history of changes from sync
- Store in `boarding_history` table or `sync_appointments.change_history` (JSONB array)

### REQ-206.2: Source Attribution
- Every record should indicate source: 'manual' or 'external'
- Records from sync should never overwrite manual edits without confirmation

### REQ-206.3: Sync Provenance
- Each boarding should link to the sync that created/last updated it
- `boardings.last_sync_id` → `sync_logs.id`

---

## REQ-207: User Experience

### REQ-207.1: Sync Progress UI
Display real-time progress:
```
- Current stage (authenticating, fetching, processing, saving)
- X of Y appointments processed
- Estimated time remaining
- Current appointment being processed
```

### REQ-207.2: Sync Results Summary
After sync, show:
```
✓ 45 appointments synced
  - 3 new bookings added
  - 5 bookings updated
  - 37 unchanged
  - 2 cancellations detected
⚠ 1 error (click to view)
```

### REQ-207.3: Conflict Resolution
- If external data conflicts with manual edit, show diff
- Let user choose: keep manual, accept external, or merge

---

## REQ-208: Performance

### REQ-208.1: Rate Limiting
- Max 30 requests/minute to external site
- 1.5 second minimum between requests
- Exponential backoff on rate limit responses

### REQ-208.2: Batch Operations
- Batch database writes (upsert 10 records at a time)
- Use transactions for related records

### REQ-208.3: Timeout Handling
- Individual request timeout: 15 seconds
- Full sync timeout: 10 minutes
- Stuck sync detection: auto-abort after 30 minutes

---

## REQ-209: Configuration

### REQ-209.1: Configurable Parameters
Store in `sync_settings`:
```
- initial_lookback_days: 90 (default)
- incremental_lookback_days: 30 (default)
- lookahead_days: 60 (default)
- sync_interval_minutes: 60 (default)
- auto_sync_enabled: false (default)
- deletion_confirmation_syncs: 3 (default)
```

### REQ-209.2: Admin Override
- Admin can trigger sync for specific date range
- Admin can force-update specific appointment (bypass hash check)

---

## Database Schema Changes

### New/Modified Columns

```sql
-- sync_appointments additions
ALTER TABLE sync_appointments ADD COLUMN content_hash VARCHAR(64);
ALTER TABLE sync_appointments ADD COLUMN sync_status VARCHAR(20) DEFAULT 'active';
  -- 'active', 'missing_from_source', 'confirmed_deleted'
ALTER TABLE sync_appointments ADD COLUMN missing_since TIMESTAMP WITH TIME ZONE;
ALTER TABLE sync_appointments ADD COLUMN missing_sync_count INTEGER DEFAULT 0;
ALTER TABLE sync_appointments ADD COLUMN last_change_type VARCHAR(20);
  -- 'created', 'updated', 'unchanged'
ALTER TABLE sync_appointments ADD COLUMN last_changed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE sync_appointments ADD COLUMN previous_data JSONB;

-- sync_settings additions
ALTER TABLE sync_settings ADD COLUMN last_successful_sync_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE sync_settings ADD COLUMN initial_lookback_days INTEGER DEFAULT 90;
ALTER TABLE sync_settings ADD COLUMN incremental_lookback_days INTEGER DEFAULT 30;
ALTER TABLE sync_settings ADD COLUMN lookahead_days INTEGER DEFAULT 60;

-- sync_logs additions
ALTER TABLE sync_logs ADD COLUMN appointments_unchanged INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN appointments_missing INTEGER DEFAULT 0;
ALTER TABLE sync_logs ADD COLUMN deletions_detected JSONB DEFAULT '[]';
ALTER TABLE sync_logs ADD COLUMN sync_type VARCHAR(20);
  -- 'initial', 'incremental', 'forced_full'

-- boardings additions
ALTER TABLE boardings ADD COLUMN cancelled BOOLEAN DEFAULT false;
ALTER TABLE boardings ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE boardings ADD COLUMN last_sync_id UUID REFERENCES sync_logs(id);
```

---

## Implementation Priority

### Phase 1: Core Incremental Sync
- REQ-200 (Initial vs Incremental)
- REQ-201 (Change Detection)
- REQ-204 (Reporting)

### Phase 2: Deletion Detection
- REQ-202 (Deletion Detection)
- REQ-206 (Audit Trail)

### Phase 3: Polish
- REQ-203 (Data Integrity)
- REQ-205 (Error Recovery)
- REQ-207 (UX Improvements)
- REQ-208 (Performance)
- REQ-209 (Configuration)

---

## REQ-210: Testing Requirements

Every requirement MUST have corresponding automated tests. No requirement is considered complete until tests pass.

### REQ-210.1: Unit Test Coverage

| Requirement | Test File | Test Cases |
|-------------|-----------|------------|
| REQ-200.1 | `sync.test.js` | Initial sync uses 90-day lookback when no prior sync |
| REQ-200.2 | `sync.test.js` | Incremental sync uses 30-day lookback after successful sync |
| REQ-200.3 | `sync.test.js` | Force full sync uses 90-day lookback regardless of history |
| REQ-201.1 | `changeDetection.test.js` | Hash generated correctly from appointment fields |
| REQ-201.1 | `changeDetection.test.js` | Record skipped when hash matches |
| REQ-201.1 | `changeDetection.test.js` | Record updated when hash differs |
| REQ-201.3 | `changeDetection.test.js` | Change type correctly recorded (created/updated/unchanged) |
| REQ-201.3 | `changeDetection.test.js` | Previous data stored on update |
| REQ-202.1 | `deletionDetection.test.js` | Missing appointments detected after sync |
| REQ-202.2 | `deletionDetection.test.js` | Deletion confirmed after 3 consecutive missing syncs |
| REQ-202.2 | `deletionDetection.test.js` | Boarding marked cancelled on confirmed deletion |
| REQ-202.3 | `deletionDetection.test.js` | Deletions logged in sync_logs |
| REQ-203.1 | `dataIntegrity.test.js` | Partial save rolled back on error |
| REQ-203.2 | `dataIntegrity.test.js` | Duplicate external_id prevented |
| REQ-203.2 | `dataIntegrity.test.js` | Duplicate boarding for same dog/dates prevented |
| REQ-203.3 | `dataIntegrity.test.js` | Boarding dates match sync_appointment dates |
| REQ-204.1 | `syncStats.test.js` | All statistics correctly calculated |
| REQ-205.1 | `errorRecovery.test.js` | Partial progress saved on failure |
| REQ-205.2 | `errorRecovery.test.js` | Retry logic executes correct number of times |
| REQ-205.3 | `errorRecovery.test.js` | Errors correctly categorized |

### REQ-210.2: Integration Test Coverage

| Scenario | Test File | Description |
|----------|-----------|-------------|
| Initial Sync | `sync.integration.test.js` | Full initial sync with mock external site |
| Incremental Sync | `sync.integration.test.js` | Incremental sync detects only changes |
| Deletion Flow | `sync.integration.test.js` | Appointment removed → detected → confirmed |
| Error Recovery | `sync.integration.test.js` | Sync fails midway, resumes correctly |
| Conflict | `sync.integration.test.js` | External change vs manual edit |

### REQ-210.3: Test Data Requirements

```javascript
// Test fixtures must include:
const TEST_SCENARIOS = {
  // New appointment (not in DB)
  newAppointment: { external_id: 'new-001', ... },

  // Existing appointment, no changes
  unchangedAppointment: { external_id: 'existing-001', ... },

  // Existing appointment, date changed
  dateChangedAppointment: { external_id: 'existing-002', newCheckIn: '...', ... },

  // Existing appointment, status changed
  statusChangedAppointment: { external_id: 'existing-003', newStatus: 'cancelled', ... },

  // Appointment that will be "deleted" (not returned by mock)
  deletedAppointment: { external_id: 'deleted-001', ... },

  // Appointment with conflicting manual edit
  conflictAppointment: { external_id: 'conflict-001', manualNote: '...', externalNote: '...', ... },
};
```

### REQ-210.4: Test Assertions

Each test MUST verify:

1. **Database State**: Records created/updated/unchanged as expected
2. **Return Values**: Function returns correct statistics
3. **Logs**: Appropriate log entries created
4. **Side Effects**: No unintended changes to other records
5. **Error Cases**: Errors thrown with correct type and message

### REQ-210.5: Minimum Coverage Requirements

| Category | Minimum Coverage |
|----------|------------------|
| Sync orchestration (`sync.js`) | 90% line coverage |
| Change detection | 95% line coverage |
| Deletion detection | 95% line coverage |
| Data mapping (`mapping.js`) | 85% line coverage |
| Error handling paths | 100% branch coverage |

### REQ-210.6: Test Naming Convention

```javascript
describe('REQ-201: Change Detection', () => {
  describe('REQ-201.1: Content Hash Comparison', () => {
    it('generates consistent hash from appointment fields', () => {});
    it('skips database update when hash matches existing record', () => {});
    it('updates record when hash differs from existing', () => {});
    it('handles null fields in hash generation', () => {});
  });
});
```

### REQ-210.7: Regression Tests

For each bug found in sync:
1. Write failing test that reproduces the bug
2. Fix the bug
3. Test must pass
4. Test remains in suite permanently

---

## Success Criteria

1. **Efficiency**: Incremental sync completes in <2 minutes for typical day's changes
2. **Accuracy**: 100% match between app data and external site for synced date range
3. **Reliability**: <1% sync failure rate
4. **Visibility**: User always knows sync status and what changed
5. **Recoverability**: Can recover from any error state without data loss
6. **Test Coverage**: All REQ-210 test requirements met before release
