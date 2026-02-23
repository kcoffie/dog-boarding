# Dog Boarding App Sync - Build Plan

**Status:** Scraper modules exist but are flaky. Need to diagnose & fix first.  
**Context:** ~20 appointments/week, building for your partner's business, need professional quality with audit trails.

---

## Priority 0: Diagnose & Fix Flaky Scraping 🔥 BLOCKER

**Why first:** Everything else depends on reliable scraping. If it's inconsistent now, it'll fail in production.

**What to do:**
1. **Show me the scraper code** — paste `auth.js`, `schedule.js`, `extraction.js`
2. **Identify the flakiness** — what exactly was inconsistent?
   - Some appointments not found?
   - Dates parsed wrong sometimes?
   - Connection timeouts?
   - Specific fields missing?
3. **Root cause** — likely one of:
   - HTML selectors are brittle (site structure changed, or you need better selectors)
   - Race conditions (fetching before page fully loads)
   - Auth/session issues (cookies expiring, re-auth needed)
   - Edge cases in parsing (null checks, whitespace, data format variations)
4. **Fix it** — once we know the problem, usually quick to fix

**Rough estimate:** 1-3 hours  
**Exit criteria:**
- Run sync 5 times in a row, get identical data every time
- No missing appointments
- All fields populated consistently
- Reliable extraction

---

## Priority 1: File-Based Logging ⚠️ UNBLOCKS EVERYTHING

**Why second:** Once scraper is reliable, you need persistent logs so you can debug when things break.

**What to build:**
- Logging endpoint that writes to `logs/sync.log` on disk
- Logger module with: `[TIMESTAMP] [LEVEL] [MESSAGE] {context}`
- Hook it into all sync functions: auth, parsing, mapping, upsert
- Make logs human-readable (for you and for Claude to debug)

**Rough estimate:** 1-2 hours  
**Files:**
- `src/lib/scraper/fileLogger.js` - Logger implementation
- API endpoint for writing logs (could be Vercel function or Express)
- Update vite.config.js to support logging during dev

**Exit criteria:**
- Logs write to `logs/sync.log` on disk
- Include timestamp, level, message, context
- Claude can read logs with the View tool
- You can see progress in real-time as sync runs

---

## Priority 2: Batch Processing + Checkpoints

**Why third:** External sessions expire (~6 min). Long syncs fail and lose progress. Batch processing with checkpoints = resumability.

**What to build:**
1. Create `sync_checkpoints` table (tracks progress, allows resume on failure)
2. Split sync into daily batches (process 1 day at a time)
3. After each batch: save checkpoint, optionally re-authenticate
4. On failure: resume from checkpoint, not from scratch

**What exists:** Pseudocode in SYNC_PLAN_V2.md  
**What's missing:** Actual implementation

**Rough estimate:** 3-4 hours  
**Files:**
- `supabase/migrations/XXX_add_sync_checkpoints.sql` - Checkpoint table
- `src/lib/scraper/batchSync.js` - Batch orchestration logic
- Update `src/lib/scraper/sync.js` to use batches

**Exit criteria:**
- Sync processes 1 day at a time
- Checkpoint saved after each day
- Can resume from checkpoint after interruption
- Logs show clear progress per batch

---

## Priority 3: Sync Changelog Page 🔥 

**Why fourth:** You need visibility into what changed. This is your audit trail + debugging tool + your partner's confidence builder.

**What to build:**
A page showing scrollable changelog of all sync changes:
- Shows last 200 changes by default
- Pagination/infinite scroll for older changes
- Columns: When | Type (add/update/delete) | What Changed
- Can see before/after data by clicking into a change
- Can filter by date range

**Data structure:**
Create `sync_changes` table that logs every create/update/delete:

```sql
CREATE TABLE sync_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID REFERENCES sync_logs(id),
  change_type VARCHAR(20),      -- 'added', 'updated', 'deleted'
  entity_type VARCHAR(50),      -- 'dog', 'boarding'
  entity_id UUID,               -- Which dog or boarding changed
  entity_name TEXT,             -- Human-readable (dog name, dates)
  before_data JSONB,            -- Previous state (for updates/deletes)
  after_data JSONB,             -- New state (for adds/updates)
  created_at TIMESTAMP DEFAULT NOW()
);
```

**Rough estimate:** 2-3 hours  
**Files:**
- `supabase/migrations/XXX_add_sync_changes.sql` - Table schema
- `src/lib/scraper/changeLogger.js` - Log changes during sync
- Update `src/lib/scraper/mapping.js` - Call changeLogger on upsert/delete
- `src/components/SyncChangelog.jsx` - UI component
- `src/pages/SyncChangelogPage.jsx` - Full page
- Update `src/App.jsx` - Add route

**Exit criteria:**
- Page shows all historical changes, not just last sync
- Last 200 changes load by default
- Scrollable list (not truncated)
- Shows dog changes, boarding changes, deletions
- Can click into a change to see before/after data
- Date range filtering works

**Why this matters:**
- Audit trail: know exactly what changed when
- Debugging: trace back which sync caused a problem
- Trust: your partner sees what the sync did
- Confidence: you're in control

---

## Priority 4: One-Day (Then Two-Day) Test Sync

**Why fifth:** Verify everything works with minimal risk before scaling.

**What to do:**
1. Clear any stuck syncs
2. Run batch sync for just 1 day
3. Watch logs in real-time
4. Check sync changelog to verify changes
5. Manually spot-check 5-10 appointments against external source
6. If it works: run 2 days to test batching/checkpoints

**Rough estimate:** 1-2 hours (mostly watching and verifying)

**Exit criteria:**
- 1 day completes without timeout
- Logs show clear progression
- Changelog shows correct changes
- Spot-check matches external source
- No data loss or corruption

---

## Priority 5: Data Validation & Error Handling

**Why sixth:** After you know sync completes, harden it against edge cases.

**What to build:**
- Deduplication logic (same dog, same dates = update not create)
- Deletion detection (appointments that disappeared externally)
- Date boundary validation (no end before start)
- Orphan detection (dogs with no active boardings)
- Conflict resolution (overlapping bookings)

**Rough estimate:** 3-4 hours

**Exit criteria:**
- Handles duplicate appointments correctly (upserts)
- Detects when external appointment deleted
- Validates all date ranges
- Handles missing/partial data gracefully
- Tests cover major edge cases

---

## Priority 6: Full Historical Import (11/1/2025 → today)

**Why last:** Only after 1-5 are solid and tested.

**What to do:**
1. Start batch sync from 11/1/2025
2. Monitor logs
3. Handle any failures (checkpoint resumes you)
4. Verify completion (100% coverage)
5. Spot-check data accuracy

**Rough estimate:** 2-3 hours (mostly watching)

---

## Next Step: **Show Me the Scraper Code**

Before we build anything, I need to see why it's flaky. Paste:
1. `src/lib/scraper/auth.js` - How you handle login/session
2. `src/lib/scraper/schedule.js` - How you fetch and parse appointment list
3. `src/lib/scraper/extraction.js` - How you parse individual appointment details

Once I see the code, we can identify the inconsistency and fix it. **That's the blocker for everything else.**

---

## Token Budget (For Claude Code)

You're on Pro. Rough estimates:
- Fix flaky scraper: 500-1500 tokens
- File-based logging: 500-1000 tokens
- Batch processing: 2000-3000 tokens
- Changelog page: 1500-2000 tokens
- Data validation: 2000-2500 tokens
- Testing: 1500-2000 tokens
- **Total: ~10,000-12,000 tokens**

Very manageable. The key is being surgical: understand what you're building, ask for focused changes, review the output.

---

## Your Partner's Needs

✓ Audit trail (changelog page shows exactly what synced when)  
✓ Reliable sync (batch processing + checkpoints = no data loss)  
✓ Professional & sleek (you own every piece, it'll look great)  
✓ Works perfectly (testing + validation = confidence)  
✓ Understand what she sees (changelog proves correctness)  
✓ Can re-run failed syncs (checkpoints make this automatic)  

→ Role-based access (admin/read-only) - **add this later**, not now

---

## Now: Show Me the Scraper Code

Paste the three files above so we can diagnose the flakiness and fix it.
