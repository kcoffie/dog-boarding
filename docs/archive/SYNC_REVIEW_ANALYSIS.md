# Dog Boarding App - Sync Feature: Senior Engineer Review

**Date:** February 2, 2026  
**Status:** Partially implemented, needs hardening and completion  
**Context:** Moving from work (paid) to personal (Pro subscription)

---

## What You Have: Honest Assessment

### ✅ The Solid Foundation
1. **Database schema** - Clean, normalized, with RLS policies in place
2. **Sync proxy** (`api/sync-proxy.js`) - Authentication and CORS bypass working
3. **Architecture plan** - Well-documented (EXTERNAL_SYNC.md, SYNC_PLAN_V2.md)
4. **Tech stack** - Solid choices (Supabase, React 18, Vite, testing infrastructure)
5. **Project structure** - Organized, with scripts for management
6. **Shared access model** - All authenticated users see all data (one boarding house)

### ⚠️ What Exists But Needs Review
From your docs, these modules should exist but I can't verify they're fully implemented:
- `src/lib/scraper/auth.js` - Authentication logic
- `src/lib/scraper/schedule.js` - Schedule parsing
- `src/lib/scraper/extraction.js` - Data extraction
- `src/lib/scraper/mapping.js` - Data mapping and upsert logic
- `src/lib/scraper/sync.js` - Orchestration
- `src/lib/scraper/config.js` - Configuration

**Question:** Do these files exist? Are they complete?

### 🔴 What's Missing or Risky

#### 1. **Batch Processing with Checkpoints (CRITICAL)**
Your SYNC_PLAN_V2.md says this is Priority 2, but I don't see:
- A `sync_checkpoints` table
- Batch processing logic (daily splits, resumability)
- Session persistence between batches

**Why this matters:** External sessions expire (~6 minutes). Long syncs fail and lose progress. Right now, if a sync of 500 appointments fails halfway through, you have to re-authenticate and restart from scratch.

**Risk Level:** HIGH - Your partner's business depends on this not losing data.

#### 2. **File-Based Logging (CRITICAL)**
SYNC_PLAN_V2.md Priority 1. I see:
- Browser console logs only (useless for debugging long-running syncs)
- A stub in `SYNC_PLAN_ADDITIONS.md` mentioning localStorage/IndexedDB
- A `/logs/sync.log` directory mentioned but no code to write to it

**Why this matters:** When something goes wrong (and it will), you need to see what happened. Browser console disappears when you close the tab or refresh.

**Risk Level:** HIGH - You can't debug issues without logs.

#### 3. **No Tests for Sync Logic**
You have test infrastructure (Vitest + RTL), but sync tests are likely minimal or mocked.

**Why this matters:** Scraping is fragile. HTML changes break parsers. You need confidence that:
- Parsing still works after external site updates
- Upsert logic handles duplicates correctly
- Date boundaries are handled right

**Risk Level:** MEDIUM - You'll find bugs in production.

#### 4. **Data Validation & Conflict Resolution**
Scraping can produce:
- Duplicate records (same dog, same dates)
- Partial data (missing pet breed, client email)
- Conflicting times (overlapping boardings)
- Stale data (appointment cancelled externally but still in your DB)

Your mapping.js likely handles some of this, but I can't tell if it handles:
- Deletion detection (appointments that existed but now don't)
- Date range conflicts
- Orphaned records (dogs with no active boardings)

**Risk Level:** MEDIUM - Data integrity issues are silent and compound over time.

#### 5. **No Rate Limiting on Upserts**
The sync proxy has good rate limiting (1.5s between requests), but the upsert logic (inserting/updating dogs and boardings) doesn't throttle database writes.

**Risk Level:** LOW-MEDIUM - Supabase rate limits per project. If you sync 1000 appointments at once, you might hit limits.

#### 6. **Session/Auth Token Management**
sync-proxy.js handles login, but:
- No way to know if stored cookies are still valid
- No explicit session refresh between batches
- Cookies are passed around as strings (error-prone)

**Risk Level:** MEDIUM - Silent auth failures (re-login needed but it doesn't).

#### 7. **Role-Based Access Control (Future)**
Currently: All authenticated users see all data (shared boarding house model)  
Eventually: You want Admin (full access) and Read-Only roles

**What this means:**
- Right now: Not urgent, but plan for it
- Will need: Supabase auth custom claims or a separate `user_roles` table
- RLS policies: Update to check role on INSERT/UPDATE/DELETE
- UI: Hide edit/sync buttons from read-only users

**Risk Level:** LOW (not critical now, but good to plan before more users join)

---

## What You Built Right

1. **CORS Proxy Strategy** - Using Vercel edge function (or vite middleware) is correct
2. **Error Sanitization** - Not leaking URLs, passwords, sensitive data
3. **Schema Design** - Separate `sync_appointments` table for raw data is smart (lets you compare before/after)
4. **Shared Access Model** - RLS policies allow all authenticated users to see all data (one boarding house, one team)
5. **Documentation** - Your EXTERNAL_SYNC.md is thorough and accurate

---

## What Needs to Happen (In Priority Order)

### Priority 1: File-Based Logging ⚠️ UNBLOCKS EVERYTHING
**Why first:** Without logs, you can't debug. You can't tell if a sync succeeded or why it failed.

**What to build:**
- A logging endpoint (`/api/log` or similar) that writes to `logs/sync.log`
- Logger module that writes: `[TIMESTAMP] [LEVEL] [MESSAGE] {context}`
- Hook it into all sync functions (auth, parsing, mapping, upsert)
- Make logs readable for a human (and Claude)

**Rough estimate:** 1-2 hours  
**Files:**
- `src/lib/scraper/fileLogger.js` - Logger implementation
- `server/logEndpoint.js` (or Vercel function) - Endpoint
- Update vite.config.js or package.json scripts

**Exit criteria:**
- Sync logs to `logs/sync.log` on disk
- Include timestamp, level, message, context
- Claude can read logs with the View tool
- You can see progress in real-time

---

### Priority 2: Batch Processing + Checkpoints
**Why second:** Once you have logging, you need resumability.

**What to build:**
1. Create `sync_checkpoints` table (tracks progress, resumes on failure)
2. Split sync into daily batches
3. After each batch: save checkpoint, re-authenticate
4. On failure: resume from last checkpoint

**What exists:** Rough pseudocode in SYNC_PLAN_V2.md  
**What's missing:** Actual implementation

**Rough estimate:** 3-4 hours  
**Files:**
- `src/lib/scraper/batchSync.js` - Batch orchestration
- `supabase/migrations/XXX_add_sync_checkpoints.sql` - Schema
- Update `src/lib/scraper/sync.js` to use batches

**Exit criteria:**
- Sync processes 1 day at a time
- Checkpoint saved after each day
- Can resume after failure
- Logs show clear progress

---

### Priority 3: Sync Changelog Page 🔥 NEW
**Why here:** You need to see what actually changed. This is your audit trail and debugging tool.

**What to build:**
A new page in your app showing a scrollable changelog of every sync:

```
SYNC CHANGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When               │ Type      │ What
───────────────────┼───────────┼──────────────────────────────
2:34 PM Feb 2      │ ADDED     │ Dog: Buddy (day_rate: $35)
2:34 PM Feb 2      │ ADDED     │ Boarding: Buddy, Jan 28-30
2:35 PM Feb 2      │ UPDATED   │ Dog: Max (night_rate: $45→$50)
2:35 PM Feb 2      │ DELETED   │ Boarding: Charlie, Jan 25-26
2:36 PM Feb 2      │ ADDED     │ Dog: Luna (day_rate: $35)
```

**Data structure needed:**
Create a `sync_changes` table that tracks every create/update/delete:

```sql
CREATE TABLE sync_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id UUID REFERENCES sync_logs(id),
  change_type VARCHAR(20),  -- 'added', 'updated', 'deleted'
  entity_type VARCHAR(50),  -- 'dog', 'boarding'
  entity_id UUID,           -- Which dog or boarding changed
  entity_name TEXT,         -- Human-readable (dog name, boarding details)
  before_data JSONB,        -- Previous state (for updates/deletes)
  after_data JSONB,         -- New state (for adds/updates)
  created_at TIMESTAMP DEFAULT NOW()
);
```

**What to build:**
1. Update mapping.js: before upsert/delete, log the change to `sync_changes`
2. Create `SyncChangelog.jsx` page with scrollable list
3. Add route to your app (`/sync/changelog` or similar)
4. Format output as: timestamp | change type | what changed

**Rough estimate:** 2-3 hours  
**Files:**
- `supabase/migrations/XXX_add_sync_changes.sql` - Table schema
- `src/lib/scraper/changeLogger.js` - Log changes during sync
- Update `src/lib/scraper/mapping.js` - Call changeLogger on upsert/delete
- `src/components/SyncChangelog.jsx` - UI component
- `src/pages/SyncChangelogPage.jsx` - Full page
- Update `src/App.jsx` - Add route

**Exit criteria:**
- Sync changelog page shows all historical changes (not just last sync)
- Display last 200 changes by default, with pagination/infinite scroll for older changes
- Can see: when, type (add/update/delete), what changed
- Scrollable list (not truncated)
- Shows dog name changes, boarding date changes, deletions
- You can click into a change and see before/after data
- Search/filter by date range to drill into specific syncs

**Why this matters:**
- Audit trail: you know exactly what changed when
- Debugging: if data looks wrong, you can trace back to the sync that changed it
- Trust: your partner can see what the sync did
- Confidence: you're in control and can verify correctness

---

### Priority 4: One-Day (Then Two-Day) Test Sync
**Why fourth:** Verify everything works with minimal risk before scaling.

**What to do:**
1. Clear any stuck syncs
2. Run batch sync for just 1 day (yesterday or last Thursday)
3. Watch logs in real-time
4. Check sync changelog page to see what changed
5. Manually verify 5-10 appointments against external source
6. If it works: run 2 days to test batching and checkpoints

**Rough estimate:** 1-2 hours (mostly watching and verifying)

**Exit criteria:**
- 1 day completes without timeout
- Logs show clear progression
- Changelog shows correct changes
- Counts match external source spot-check
- No data loss or corruption

---

### Priority 5: Data Validation & Error Handling
**Why fifth:** After you know the sync completes, harden it against edge cases.

**What to build:**
- Deduplication logic (same dog, same dates = update, not create)
- Deletion detection (appointments that disappeared from external source)
- Date boundary validation (no appointments ending before they start)
- Orphan detection (dogs with no active boardings, safe to flag or delete)
- Conflict resolution (overlapping bookings, what's the truth?)

**What exists:** Partial logic in mapping.js (I assume)  
**What's missing:** Comprehensive edge case handling

**Rough estimate:** 3-4 hours

**Exit criteria:**
- Can handle duplicate appointments (upserts correctly)
- Detects when external appointment is deleted
- Validates all date ranges
- Handles missing/partial data gracefully
- Tests cover major edge cases

---

### Priority 6: Full Historical Import
**Why last:** Only after 1-5 are solid.

**What to do:**
1. Start batch sync from 11/1/2025
2. Monitor logs
3. Handle failures (checkpoint resumes you)
4. Verify completion (100% coverage)
5. Spot-check data accuracy

**Rough estimate:** 2-3 hours (mostly hands-on watching, with breaks)

---

## Architecture: What Should Exist

```
src/lib/scraper/
├── config.js                 # Constants (base URL, selectors, delays)
├── logger.js                 # Shared logging with timestamps ← NEW
├── auth.js                   # Login, session management
├── schedule.js               # Fetch and parse schedule pages
├── extraction.js             # Parse individual appointment details
├── mapping.js                # Map to Dogs/Boardings/SyncAppointments
├── validation.js             # Validate extracted data ← NEW
├── deduplication.js          # Handle duplicate appointments ← NEW
├── batchSync.js              # Batch orchestration + checkpoints ← NEW
├── sync.js                   # Main orchestration (uses batchSync)
└── index.js                  # Public exports

supabase/
└── migrations/
    └── XXX_add_sync_checkpoints.sql  # Checkpoint table ← NEW

api/
└── logEndpoint.js            # Log writing endpoint ← NEW
   (or Vercel function)
```

---

## Key Questions for You

Before we start building, I need to know:

1. **Do the scraper modules (auth.js, schedule.js, etc.) already exist?**
   - If yes: Are they complete and working?
   - If no: We need to build them from scratch

2. **What's the external site structure?** (High-level overview)
   - Is there a schedule page listing all appointments?
   - Does each appointment have its own detail page?
   - What HTML selectors can we count on?

3. **What's your partner's auth situation?**
   - Does she have admin access to the external site?
   - Can you use static credentials in .env, or does it need to refresh?

4. **How many appointments are we talking about?**
   - Last 7 days: ~10? ~50? ~200?
   - Historical (9/1/2024 to now): ~500? ~5000?
   - This affects batch sizing and timeout planning

5. **What does "professional" mean to you for this app?**
   - Error messages your partner can understand?
   - Audit trail of what synced when?
   - Ability to re-run a failed sync?
   - Manual overrides (if scraper gets something wrong)?

---

## Your Path Forward

**Today (1-2 hours):**
1. Answer the 5 questions above
2. Show me if the scraper modules exist (paste a couple files)
3. We'll decide: build from scratch or harden what exists

**This week (if you have Pro):**
1. Implement file-based logging (Priority 1)
2. Build batch processing (Priority 2)
3. Run 7-day test sync and watch it work

**Next week:**
1. Full historical import (if test passed)
2. Data validation hardening
3. Ship it to your partner for real use

---

## Token Budget (For Claude Code)

You're on Pro. Rough token estimates for each piece:

- File-based logging: 500-1000 tokens
- Batch processing: 2000-3000 tokens
- Sync changelog page: 1500-2000 tokens
- Data validation: 2000-2500 tokens
- Testing: 1500-2000 tokens
- **Total: ~9000-12,000 tokens**

That's well within reasonable use for a feature like this. The key is being surgical: understand what you're building, ask for focused changes, review the output.

**Note:** Changelog page is in Priority 3 because it's critical for understanding what the sync actually did. Build it right after batching so you can use it to verify your test syncs.

---

## Next Action

Go back to your project and answer those 5 questions. Then paste me:
- One of your existing scraper modules (e.g., auth.js or schedule.js) so I can see what's already built
- A sample of the HTML from the external site (paste just the key parts—a schedule list, an appointment detail page)

Then we can nail down the exact scope and get building.
