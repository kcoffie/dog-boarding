# Dog Boarding App — Session Handoff (v2.1)
**Started:** February 23, 2026
**Status:** v2.1 in progress — 2 of 3 items done

---

## Production State (as of Feb 23)
- All 553 tests pass. main deployed to Vercel.
- 3 crons live: cron-auth 0:00 UTC → cron-schedule 0:05 UTC → cron-detail 0:10 UTC
- Manual sync confirmed working end-to-end in production.
- Vercel env vars confirmed set: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, VITE_EXTERNAL_SITE_USERNAME, VITE_EXTERNAL_SITE_PASSWORD

> **Check first thing each session:** Did overnight crons run?
> Vercel dashboard → Functions logs → filter by [CronAuth], [CronSchedule], [CronDetail]

---

## v2.1 Scope

| # | Item | Status | Commit | REQ |
|---|------|--------|--------|-----|
| 1 | Fix `/api/log` 405 in production | ✅ Done | `a363b09` | — |
| 2 | Update GitHub README (v2.0 external sync / cron docs) | ✅ Done | `c31e24d` | — |
| 3 | REQ-110: HTML parse degradation detection | ⬜ Next | — | REQ-110 |

**Low priority (not v2.1):**
- REQ-107: Sync history UI + enable/disable toggle
- Status extraction always null (`.appt-change-status` selector)
- Pre-detail-fetch date filter (perf optimization, ~48s saved per sync)

---

## v2.1 Work Log

### Fix 1: `/api/log` 405 in production (`a363b09`, Feb 23)
`logger.js` and `fileLogger.js` were POSTing to `/api/log` unconditionally.
This endpoint only exists in local dev (Vite handles it); it's never deployed to Vercel.
**Fix:** Guard all `/api/log` calls with `if (!import.meta.env?.DEV)`.

Files changed:
- `src/lib/scraper/logger.js` — guarded `sendToFile()` and `clearLogFile()`
- `src/lib/scraper/fileLogger.js` — guarded `sendLog()`, `clearLog()`, `getRecentLogs()`

Also in this commit: archived v2.0 SESSION_HANDOFF, created fresh v2.1 handoff, updated
REQUIREMENTS.md version table (v2.0 → Complete, v2.1 → In Progress).

### Fix 2: GitHub README (`c31e24d`, Feb 23)
README was v1-only with no mention of external sync.
**Added:** External Sync section (manual + cron), env var table, cron architecture diagram,
cron local dev instructions, expanded project structure with `api/` and `src/lib/scraper/`.
Corrected "each user sees own data" → shared org model.

---

## v2.2 Planning (upcoming — rates feature)
Questions to answer before designing:
1. Are rates per-dog fixed, or can they vary per boarding?
2. Do synced dogs come in with zero rates and need manual entry?
3. Goal: revenue reporting only, or also invoicing?
4. Multiple rate tiers? (holiday surcharge, multi-dog discount, etc.)

---

## Known Data Issues (self-resolving on next sync of date range)
- Null service_types: C63QgKsL, C63QfyoF, C63QgNGU, C63QgP2y, C63QgOHe
- Amended appts not yet archived: C63QgNGU→C63QfyoF (4/1-13), C63QgH5K→C63QgNHs (3/3-19)

---

## Useful SQL Snippets

### If sync gets stuck
```sql
UPDATE sync_logs SET status = 'failed', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '5 minutes';
```

### If queue gets stuck
```sql
UPDATE sync_queue SET status = 'pending', processing_started_at = NULL
WHERE status = 'processing' AND processing_started_at < NOW() - INTERVAL '10 minutes';

SELECT status, count(*), min(queued_at), max(retry_count)
FROM sync_queue GROUP BY status;
```

---

## Archive
Full v2.0 session history (Feb 19–23, Sessions 1–12): `docs/archive/SESSION_HANDOFF_v2.0_final.md`
