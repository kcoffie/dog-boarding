# Sync Plan V2 - Prioritized & Practical

**Date**: 2026-01-19
**Status**: In Progress

---

## Priority Order

| # | Task | Why First | Status |
|---|------|-----------|--------|
| 1 | File-based logging | So Claude can watch and debug | TODO |
| 2 | Batch processing with checkpoints | Avoid timeouts, track progress | TODO |
| 3 | One-week test sync | Verify everything works | TODO |
| 4 | Sync completion tracking | Know when we're done | TODO |
| 5 | Full historical import | After above works | TODO |

---

## 1. File-Based Logging (Priority 1)

### Problem
- Logs go to browser console
- Claude can't see browser console
- No way to debug issues or watch progress

### Solution
Write sync logs to a file on disk that Claude can read.

**Implementation:**
```javascript
// src/lib/scraper/fileLogger.js
// Writes to: /Users/kcoffie/qap/dog-boarding/logs/sync.log

export function logToFile(level, message, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = JSON.stringify({ timestamp, level, message, ...context });

  // Use Vite's server to write to file (via API endpoint)
  // Or use a simple Express endpoint
  fetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: logEntry
  }).catch(() => {}); // Don't block on logging failures
}
```

**Alternative - Simpler approach:**
Use a Vite plugin or dev server middleware to expose a logging endpoint that writes to disk.

**Files to create:**
- `server/logEndpoint.js` - Simple Express server for logging
- `logs/sync.log` - Output file (gitignored)
- Update `vite.config.js` to proxy `/api/log` to the logging server

**Exit Criteria:**
- [ ] Logs written to `logs/sync.log`
- [ ] Claude can read logs with `Read` tool
- [ ] Logs include timestamp, level, message, context

---

## 2. Batch Processing with Checkpoints (Priority 2)

### Problem
- Session expires after ~6 minutes
- Long syncs fail and lose progress
- No way to resume from where we left off

### Solution
Process in small batches with saved checkpoints.

**Batch Strategy:**
- Process 1 day at a time (or 10 appointments at a time)
- Save checkpoint after each batch
- Re-authenticate before each batch if needed
- Resume from last checkpoint on failure

**Implementation:**
```javascript
// src/lib/scraper/batchSync.js

export async function runBatchSync(options = {}) {
  const {
    startDate,
    endDate,
    batchSize = 1, // days per batch
    onProgress,
    supabase,
  } = options;

  // Load checkpoint (where we left off)
  const checkpoint = await loadCheckpoint(supabase);
  const effectiveStart = checkpoint?.lastCompletedDate
    ? new Date(checkpoint.lastCompletedDate)
    : startDate;

  // Split into daily batches
  const batches = splitIntoDays(effectiveStart, endDate);

  for (const batch of batches) {
    // Check/refresh authentication before each batch
    await ensureAuthenticated();

    // Process this day's appointments
    const result = await runSync({
      startDate: batch.start,
      endDate: batch.end,
      onProgress,
      supabase,
    });

    // Save checkpoint
    await saveCheckpoint(supabase, {
      lastCompletedDate: batch.end.toISOString(),
      totalProcessed: checkpoint.totalProcessed + result.appointmentsFound,
      lastRunAt: new Date().toISOString(),
    });

    onProgress?.({
      type: 'batch_complete',
      batch: batch.index,
      totalBatches: batches.length,
      result
    });

    // Small delay between batches
    await delay(2000);
  }
}
```

**Database - checkpoint table:**
```sql
CREATE TABLE IF NOT EXISTS sync_checkpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sync_type VARCHAR(50) NOT NULL, -- 'historical', 'incremental'
  last_completed_date TIMESTAMPTZ,
  total_processed INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  metadata JSONB DEFAULT '{}'
);
```

**Exit Criteria:**
- [ ] Sync processes one day at a time
- [ ] Checkpoint saved after each day
- [ ] Can resume from checkpoint after failure
- [ ] Re-authenticates between batches

---

## 3. One-Week Test Sync (Priority 3)

### Goal
Verify the full pipeline works with a small dataset before scaling up.

### Steps
1. Clear any stuck syncs
2. Run batch sync for last 7 days
3. Watch logs in real-time
4. Verify data in Sync History page
5. Check boardings table matches external source

### Success Criteria
- [ ] All 7 days complete without timeout
- [ ] Logs show progress clearly
- [ ] Sync History shows correct counts
- [ ] Created/updated boardings are accurate
- [ ] Can click into detail and see what changed

---

## 4. Sync Completion Tracking (Priority 4)

### Problem
How do we know when we're "done" syncing?

### Solution
Track sync coverage and compare to source.

**What "done" means:**
1. **Date range covered**: All dates from 9/1/2024 to today have been synced
2. **Counts match**: Our appointment count matches external source for each day
3. **No gaps**: No missing date ranges in our checkpoint history

**Implementation:**
```javascript
// Check sync completion status
export async function getSyncCompletionStatus(supabase) {
  const checkpoint = await loadCheckpoint(supabase);
  const targetStartDate = new Date('2024-09-01');
  const today = new Date();

  // Calculate coverage
  const totalDays = daysBetween(targetStartDate, today);
  const syncedDays = checkpoint?.metadata?.syncedDays || [];
  const coverage = (syncedDays.length / totalDays) * 100;

  return {
    targetStartDate,
    targetEndDate: today,
    totalDaysToSync: totalDays,
    daysSynced: syncedDays.length,
    coveragePercent: coverage.toFixed(1),
    isComplete: coverage >= 100,
    gaps: findGaps(syncedDays, targetStartDate, today),
  };
}
```

**UI indicator:**
- Show progress bar: "Historical sync: 45% complete (120/267 days)"
- Show any gaps that need to be filled
- Mark as complete when 100% coverage

---

## 5. Full Historical Import (Priority 5)

Only after 1-4 are working.

### Steps
1. Start batch sync from 9/1/2024
2. Monitor progress via logs
3. Handle any failures (resume from checkpoint)
4. Verify completion status shows 100%
5. Spot-check data accuracy

---

## Revised Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User Triggers Sync                    │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    batchSync.js                          │
│  - Loads checkpoint (where we left off)                  │
│  - Splits date range into daily batches                  │
│  - For each batch:                                       │
│    1. Ensure authenticated                               │
│    2. Run sync for that day                              │
│    3. Save checkpoint                                    │
│    4. Log progress to file                               │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    fileLogger.js                         │
│  - Writes to logs/sync.log                               │
│  - Claude can read with Read tool                        │
│  - Includes timestamps, levels, context                  │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    sync_checkpoints table                │
│  - Tracks last completed date                            │
│  - Total processed count                                 │
│  - Synced days list (for gap detection)                  │
└─────────────────────────────────────────────────────────┘
```

---

## Questions Answered

**Q: Does it make sense to do syncs in small batches?**
A: Yes! Processing 1 day at a time means:
- Each batch takes ~1-2 minutes (well under session timeout)
- We can checkpoint after each day
- Failures only lose 1 day of work, not the whole sync
- Can re-authenticate between batches

**Q: How will we know when we're done?**
A: Track sync coverage:
- Record which days have been synced
- Calculate percentage: synced_days / total_days
- Show progress in UI: "Historical sync: 45% complete"
- Mark complete when all days from 9/1/2024 to today are covered

**Q: How can Claude watch the logging?**
A: Write logs to a file:
- `logs/sync.log` on disk
- Claude reads with `Read` tool
- Can tail the file to watch in real-time
- Includes all the detail from console.log but persistent

---

## Next Action

**Implement file-based logging first** - this unblocks everything else because:
1. Claude can debug issues
2. Claude can watch sync progress
3. We have a record of what happened
4. No more "paste me the console output"

Should I start implementing the file logger?
