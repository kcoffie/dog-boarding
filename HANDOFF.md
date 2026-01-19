# Handoff Document: External Sync Feature

**Last Updated**: 2026-01-12
**Related Issues**: #14 (closed), #22 (open)
**Branch**: `develop`

---

## Current State

The external sync feature is **partially working** but needs testing and improvements.

### What Works
- RLS policy fixed (migration 006 applied)
- Server-side CORS proxy created (`api/sync-proxy.js`)
- Vite dev middleware for local API proxy
- Authentication via proxy succeeds (~1 second)
- Schedule page fetching via proxy works (~1 second per page)
- Comprehensive timing/debug logging added
- All 486 tests pass

### What's Untested/Unknown
- Full end-to-end sync completion (user reported it was "still fetching")
- Whether appointments are actually being parsed from HTML
- Whether data is being saved to database after fetch
- Performance with many appointments

---

## Architecture Overview

```
Browser → Vite Middleware (dev) or Vercel Edge (prod) → External Site
                          ↓
                   Parse HTML → Extract Appointments
                          ↓
                   Save to Supabase (dogs, boardings, sync_appointments)
```

### Key Files

| File | Purpose |
|------|---------|
| `api/sync-proxy.js` | Vercel Edge function - proxies requests to external site |
| `vite.config.js` | Contains `localApiProxy()` middleware for dev |
| `src/lib/scraper/auth.js` | Authentication + `authenticatedFetch()` via proxy |
| `src/lib/scraper/schedule.js` | Fetches/parses schedule pages |
| `src/lib/scraper/extraction.js` | Extracts appointment details from HTML |
| `src/lib/scraper/mapping.js` | Maps external data → DB records |
| `src/lib/scraper/sync.js` | Orchestrates full sync process |
| `src/hooks/useSyncSettings.js` | React hook for UI |

---

## What Was Tried

### Problem 1: RLS Policy Error
**Error**: `new row violates row-level security policy for table "sync_logs"`

**Root Cause**: Migration 005 had `USING` clause but missing `WITH CHECK` for INSERT.

**Solution**: Created migration 006:
```sql
DROP POLICY IF EXISTS "Authenticated users full access" ON sync_logs;
CREATE POLICY "Authenticated users full access" ON sync_logs
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
```

**Status**: ✅ Fixed - User ran SQL in Supabase dashboard

### Problem 2: CORS Error
**Error**: `Authentication failed: Authentication error: Failed to fetch`

**Root Cause**: Browser blocking cross-origin requests to `agirlandyourdog.com`

**Solution**:
1. Created `api/sync-proxy.js` - Vercel Edge function that proxies requests
2. Updated `auth.js` to detect browser environment and route through proxy
3. Added `localApiProxy()` to `vite.config.js` for local dev

**Status**: ✅ Fixed - Auth succeeds via proxy

### Problem 3: Vercel Dev Blank Page
**Error**: `vercel dev` showed blank page at localhost:3000

**Root Cause**: Unknown - possibly conflict with vercel.json rewrites

**Solution**: Abandoned `vercel dev`, added Vite middleware instead

**Status**: ✅ Workaround - Use `npm run dev` with built-in middleware

### Problem 4: Sync Taking Long Time
**Observation**: User reported sync was "still fetching" after multiple schedule page fetches

**Investigation**:
- Added detailed timing logs to all sync stages
- Added logging to `schedule.js` to show pagination behavior
- Logs showed 3 consecutive fetches to `/schedule` (pages 1, 2, 3)

**Possible Causes**:
1. External site is slow (~1 second per request)
2. Pagination might be looping incorrectly
3. HTML parser might not be finding appointments (returns 0)
4. Rate limiting delay (1.5s between requests) adds up

**Status**: ⚠️ Needs investigation - Check console logs for:
```
[Schedule] 🔍 Parsed X appointment links from HTML
[Schedule] 📄 Page N: hasNextPage=true/false
```

---

## How to Test

### 1. Start Dev Server
```bash
npm run dev
```
Server runs at http://localhost:5173/

### 2. Login
- Email: `admin@test.com`
- Password: `TestPass123!`

### 3. Trigger Sync
- Go to Settings → External Sync
- Click "Sync Now"
- Open browser DevTools (F12) → Console tab

### 4. Watch for These Logs
```
[Sync] ⏱️ createSyncLog: Xms
[Auth] 🔐 Using server-side proxy for authentication...
[Auth] ✅ Authentication successful via proxy (Xms)
[Schedule] 📄 Fetching page 1 (initial)
[Schedule] 🔍 Parsed X appointment links from HTML (Y chars)
[Schedule] 🔗 No pagination link found  ← Should stop here
[Sync] 📋 Found X appointments
[Sync] ⏱️ Appointment 1/X: fetch=Xms, save=Xms
...
[Sync] ═══════════════════════════════════════════════════
[Sync] ✅ SYNC COMPLETED - SUCCESS
```

### 5. External Site Credentials
```
Username: admin@agirlandyourdog.com
Password: daisylovesdogs3247
```
(stored in `.env.local`)

---

## Likely Next Steps

### If Sync Completes But No Appointments Found
1. Check `[Schedule] 🔍 Parsed X appointment links` - if X=0, HTML structure changed
2. Manually fetch schedule page and inspect HTML for link patterns
3. Update regex in `schedule.js`:
   ```javascript
   const linkPattern = /href="([^"]*\/schedule\/a\/([^/"]+)\/(\d+)[^"]*)"/gi;
   ```

### If Sync Hangs on Pagination
1. Check `[Schedule] 📄 Page N: hasNextPage=true, nextPageUrl=...`
2. If nextPageUrl keeps returning same URL, pagination regex is wrong
3. Added safeguard in `schedule.js`:
   ```javascript
   if (result.nextPageUrl === currentUrl) {
     console.log(`[Schedule] ⚠️ Breaking loop - nextPageUrl same as current`);
     break;
   }
   ```

### If Sync Errors on Save
1. Check for Supabase errors in console
2. Verify RLS policies are applied (run migration 006)
3. Check `sync_logs` table in Supabase for error details

---

## Future Improvements (Issue #22)

Full requirements in `docs/requirements/SYNC_REQUIREMENTS_V2.md`:

| Phase | Requirements |
|-------|--------------|
| Phase 1 | REQ-200 (Initial vs Incremental), REQ-201 (Change Detection), REQ-204 (Reporting) |
| Phase 2 | REQ-202 (Deletion Detection), REQ-206 (Audit Trail) |
| Phase 3 | REQ-203 (Integrity), REQ-205 (Recovery), REQ-207-209 (UX, Perf, Config) |

Key improvements:
- First sync: 90 days back, subsequent: 30 days back
- Content hash to detect changes (skip unchanged records)
- Detect deleted bookings after 3 consecutive missing syncs
- All requirements must have tests (REQ-210)

---

## Files Changed in This Session

```
Modified:
- src/hooks/useSyncSettings.js (error logging)
- src/lib/scraper/auth.js (proxy integration, timing)
- src/lib/scraper/schedule.js (debug logging)
- src/lib/scraper/sync.js (timing logs)
- supabase/migrations/005_add_sync_tables.sql (WITH CHECK fix)
- vite.config.js (localApiProxy middleware)

Created:
- api/sync-proxy.js (Vercel Edge proxy)
- supabase/migrations/006_fix_sync_rls_policies.sql
- docs/EXTERNAL_SYNC.md (architecture docs)
- docs/requirements/SYNC_REQUIREMENTS_V2.md (future requirements)
- scripts/generate-sheet-report.js (CSV utility)
```

---

## Commands Reference

```bash
# Run dev server (with API proxy)
npm run dev

# Run tests
npm run test:run

# Check git status
git status

# View open issues
gh issue list --repo kcoffie/dog-boarding --state open
```

---

## Contact/Context

- Production URL: https://qboarding.vercel.app (or similar)
- External site being scraped: https://agirlandyourdog.com
- Supabase project: Check `.env.local` for URLs
