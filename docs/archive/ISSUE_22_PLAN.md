# Issue #22 Implementation Plan: Incremental Sync, Change Detection, Deletion Detection

**Created**: 2026-01-23
**Issue**: https://github.com/kcoffie/dog-boarding/issues/22
**Status**: Planning

---

## Executive Summary

This plan implements 10 requirements (REQ-200 through REQ-210) for improving the external sync feature. The good news: **significant infrastructure already exists**. The work involves integrating existing modules into the sync pipeline, adding missing pieces, and creating comprehensive tests.

---

## Current State Analysis

### What Already Exists

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Change Detection | `changeDetection.js` | Code complete | Hash-based detection, `detectChanges()` function |
| Deletion Detection | `deletionDetection.js` | Code complete | 3-strike system, `runDeletionDetection()` function |
| Error Categorization | `errorCategorization.js` | Code complete | Pattern-based categorization |
| File Logging | `logger.js` | Code complete | Logs to `/api/log` endpoint |
| Batch Processing | `batchSync.js` | Code complete | Daily batches with checkpoints |
| DB Schema | Migrations 007-010 | Applied | `content_hash`, `sync_status`, `previous_data`, `sync_checkpoints` |
| Basic Sync | `sync.js` | Working | Auth, fetch, parse, save pipeline |

### What's Missing

| Requirement | Gap |
|-------------|-----|
| REQ-200 | 90/30 day lookback logic not integrated |
| REQ-201 | Change detection not called in sync flow |
| REQ-202 | Deletion detection not called in sync flow |
| REQ-203 | No atomic transaction wrapping |
| REQ-204 | Stats collected but not exposed/displayed |
| REQ-205 | Error recovery logic not integrated |
| REQ-206 | `previous_data` column not populated |
| REQ-207 | UI needs progress indicators, results display |
| REQ-209 | No settings UI for lookback days |
| REQ-210 | Tests incomplete - need 90%+ coverage |

---

## Implementation Chunks

### Chunk 1: Wire Up Change Detection (REQ-201, REQ-206)

**Goal**: Integrate existing `changeDetection.js` into the sync flow

**Files to modify**:
- `src/lib/scraper/mapping.js` - Call `detectChanges()` before saving

**Verification**:
1. Run sync with existing data
2. Verify `content_hash` is populated in `sync_appointments`
3. Verify `last_change_type` shows 'unchanged' for re-synced records
4. Verify `previous_data` is populated when updates occur
5. Logs show change detection results

**Tests to add**:
- `src/__tests__/scraper/changeDetection.test.js`

---

### Chunk 2: Wire Up Deletion Detection (REQ-202)

**Goal**: Integrate existing `deletionDetection.js` into the sync flow

**Files to modify**:
- `src/lib/scraper/sync.js` - Call `runDeletionDetection()` after processing
- `src/lib/scraper/batchSync.js` - Track fetched external_ids for deletion check

**Verification**:
1. Create test appointment, sync, then remove from source
2. Verify first miss: `sync_status` = 'missing_from_source', `missing_sync_count` = 1
3. Run 2 more syncs
4. Verify third miss: `sync_status` = 'confirmed_deleted'
5. Verify reappearing appointments reset correctly

**Tests to add**:
- `src/__tests__/scraper/deletionDetection.test.js`

---

### Chunk 3: Initial vs Incremental Sync Logic (REQ-200)

**Goal**: First sync goes 90 days back, subsequent syncs 30 days back

**Files to modify**:
- `src/lib/scraper/sync.js` - Add `getSyncDateRange()` function
- `src/lib/scraper/batchSync.js` - Use sync range logic

**Logic**:
```javascript
function getSyncDateRange(settings) {
  const now = new Date();
  const hasCompletedSync = settings?.last_sync_status === 'success';
  const lookbackDays = hasCompletedSync ? 30 : 90;
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - lookbackDays);
  return { startDate, endDate: now };
}
```

**Verification**:
1. Clear sync history, run sync - should go 90 days back
2. Run again - should go only 30 days back
3. Logs show correct date range

**Tests to add**:
- Update `src/__tests__/scraper/sync.test.js`

---

### Chunk 4: Data Integrity - Atomic Operations (REQ-203)

**Goal**: Wrap sync operations in transactions, prevent duplicates

**Files to modify**:
- `src/lib/scraper/mapping.js` - Add duplicate check before insert

**Approach**:
- Use Supabase upsert with `external_id` as conflict key
- Check for existing record before insert

**Verification**:
1. Run same sync twice
2. Verify no duplicate records created
3. Verify update counts are accurate

**Tests to add**:
- `src/__tests__/scraper/dataIntegrity.test.js`

---

### Chunk 5: Reporting & Statistics (REQ-204)

**Goal**: Collect and display detailed sync statistics

**Stats to collect** (already in sync result):
- `appointmentsFound`
- `appointmentsCreated`
- `appointmentsUpdated`
- `appointmentsUnchanged`
- `appointmentsFailed`

**Missing stats to add**:
- `appointmentsMissing` (from deletion detection)
- `appointmentsDeleted` (confirmed deletions)

**Files to modify**:
- `src/lib/scraper/sync.js` - Add missing/deleted to result
- `src/lib/scraper/batchSync.js` - Aggregate stats across batches

**Verification**:
1. Run sync
2. Verify all stats in result object
3. Verify stats match actual database state

---

### Chunk 6: Error Recovery Integration (REQ-205)

**Goal**: Resume from failures, categorize errors

**Files to modify**:
- `src/lib/scraper/sync.js` - Use `categorizeError()` from errorCategorization.js
- `src/lib/scraper/batchSync.js` - Already has checkpoint resume

**Verification**:
1. Start batch sync
2. Kill process mid-sync
3. Resume sync - should continue from checkpoint
4. Verify error logs show categorized errors

**Tests to add**:
- `src/__tests__/scraper/errorRecovery.test.js`

---

### Chunk 7: User Experience - UI Updates (REQ-207)

**Goal**: Progress indicators, results display, better feedback

**Files to modify**:
- `src/components/SyncSettings.jsx` - Add progress bar, detailed results
- Add new `src/components/SyncProgressModal.jsx` - Real-time progress display

**UI Requirements**:
- Progress bar showing batch progress
- Current operation indicator (authenticating, fetching, processing)
- Results summary (created/updated/unchanged/failed)
- Error display with categorization
- "Resume" button for paused syncs

**Verification**:
1. Run sync from UI
2. Verify progress updates in real-time
3. Verify results summary is accurate
4. Verify errors are displayed clearly

---

### Chunk 8: Configuration Settings (REQ-209)

**Goal**: Configurable lookback days, sync intervals

**Database changes**:
- `sync_settings.initial_lookback_days` (default: 90)
- `sync_settings.incremental_lookback_days` (default: 30)
- `sync_settings.sync_interval_minutes` (default: 0 = manual only)

**Files to modify**:
- Migration `011_add_sync_config.sql`
- `src/lib/scraper/sync.js` - Read config from settings
- `src/components/SyncSettings.jsx` - Config UI

**Verification**:
1. Change lookback days in settings
2. Run sync
3. Verify date range matches config

---

### Chunk 9: Comprehensive Testing (REQ-210)

**Goal**: 90%+ coverage for sync.js, 95%+ for detection logic

**Test files to create/expand**:
1. `src/__tests__/scraper/changeDetection.test.js` - hash generation, change detection
2. `src/__tests__/scraper/deletionDetection.test.js` - 3-strike logic, reset logic
3. `src/__tests__/scraper/dataIntegrity.test.js` - duplicate prevention, atomic ops
4. `src/__tests__/scraper/syncStats.test.js` - statistics aggregation
5. `src/__tests__/scraper/errorRecovery.test.js` - resume logic, error categorization
6. `src/__tests__/scraper/integration.test.js` - end-to-end scenarios

**Coverage targets**:
- `changeDetection.js`: 95%
- `deletionDetection.js`: 95%
- `errorCategorization.js`: 95%
- `sync.js`: 90%
- `batchSync.js`: 90%
- `mapping.js`: 90%

---

## Execution Order

```
Chunk 1: Change Detection Integration
    ↓
Chunk 2: Deletion Detection Integration
    ↓
Chunk 3: Initial vs Incremental Logic
    ↓
Chunk 4: Data Integrity
    ↓
Chunk 5: Reporting & Statistics
    ↓
Chunk 6: Error Recovery Integration
    ↓
Chunk 7: UI Updates
    ↓
Chunk 8: Configuration Settings
    ↓
Chunk 9: Comprehensive Testing
```

---

## Verification Strategy

After each chunk:

1. **Run unit tests**: `npm test -- --grep="<feature>"`
2. **Run full test suite**: `npm test`
3. **Manual verification**:
   - Start dev server: `npm run dev`
   - Open browser console
   - Run sync: `import('/src/lib/scraper/batchSync.js').then(m => m.runBatchSync({...}))`
   - Watch logs: `tail -f logs/sync.log`
4. **Update documentation**: Note results in this plan

---

## Success Metrics

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Incremental sync time | < 2 minutes | Time a 30-day sync |
| Data accuracy | 100% match | Compare app vs source counts |
| Sync failure rate | < 1% | Track failures over 10 syncs |
| Test coverage | 90%+ | `npm run coverage` |

---

## Lessons Learned

*(To be filled in as we complete chunks)*

| Chunk | Date | Lesson |
|-------|------|--------|
| - | - | - |

---

## Open Questions

1. Should deletion detection run on every sync or only on incremental?
2. How to handle rate limiting from external source?
3. Should we add email notifications for sync failures?

---

## Next Action

**Start with Chunk 1: Wire Up Change Detection**

This chunk has:
- Low risk (code already exists)
- High value (enables REQ-201, REQ-206)
- Clear verification criteria
