# External Sync System Documentation

## Overview

The External Sync system imports boarding appointment data from an external booking platform (agirlandyourdog.com) into the Qboard application. It scrapes appointment data, extracts pet and client information, and synchronizes it with the local Supabase database.

### Key Features
- Authenticated web scraping of external booking system
- Automatic data extraction and parsing
- Deduplication and upsert logic (create or update)
- Rate limiting and retry mechanisms
- Progress tracking and error logging
- CORS bypass via server-side proxy

### Requirements Traceability
| Requirement | Description | Module |
|-------------|-------------|--------|
| REQ-100 | External site authentication | `auth.js` |
| REQ-101 | Schedule page parsing | `schedule.js` |
| REQ-102 | Appointment detail extraction | `extraction.js` |
| REQ-103 | Data mapping to app schema | `mapping.js` |
| REQ-104 | Sync orchestration | `sync.js` |
| REQ-106 | Error handling and logging | `sync.js` |

---

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SYNC FLOW                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────┐    ┌──────────────┐    ┌─────────────┐    ┌──────────────────────┐
│  Browser │───▶│  API Proxy   │───▶│  External   │───▶│  agirlandyourdog.com │
│   (UI)   │    │ (sync-proxy) │    │   Site      │    │    Booking System    │
└──────────┘    └──────────────┘    └─────────────┘    └──────────────────────┘
     │                 │
     │                 │ HTML Response
     │                 ▼
     │          ┌─────────────┐
     │          │   Parser    │
     │          │ (schedule,  │
     │          │ extraction) │
     │          └─────────────┘
     │                 │
     │                 │ Structured Data
     │                 ▼
     │          ┌─────────────┐
     │          │   Mapper    │
     │          │ (mapping.js)│
     │          └─────────────┘
     │                 │
     │                 │ DB Records
     │                 ▼
     │          ┌─────────────────────────────────────┐
     │          │           Supabase Database         │
     │          ├─────────────┬───────────┬───────────┤
     │          │    dogs     │ boardings │sync_logs  │
     │          │             │           │sync_appts │
     │          └─────────────┴───────────┴───────────┘
     │                                      │
     └──────────────────────────────────────┘
                    Status Updates
```

### Module Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           src/lib/scraper/                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                    │
│  │  config.js  │     │   auth.js   │     │ schedule.js │                    │
│  │             │     │             │     │             │                    │
│  │ - Base URL  │────▶│ - Login     │────▶│ - Fetch     │                    │
│  │ - Selectors │     │ - Session   │     │   schedule  │                    │
│  │ - Timeouts  │     │ - Cookies   │     │ - Parse     │                    │
│  │ - Retries   │     │             │     │   links     │                    │
│  └─────────────┘     └─────────────┘     └─────────────┘                    │
│         │                   │                   │                            │
│         │                   │                   │                            │
│         ▼                   ▼                   ▼                            │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │                      extraction.js                          │            │
│  │                                                             │            │
│  │  - Fetch appointment details                                │            │
│  │  - Parse HTML to structured data                            │            │
│  │  - Extract: client info, pet info, instructions             │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │                       mapping.js                            │            │
│  │                                                             │            │
│  │  - Map to Dog records                                       │            │
│  │  - Map to Boarding records                                  │            │
│  │  - Map to sync_appointments (raw storage)                   │            │
│  │  - Upsert logic (create or update)                          │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                              │                                               │
│                              ▼                                               │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │                        sync.js                              │            │
│  │                                                             │            │
│  │  - Orchestrates full sync process                           │            │
│  │  - Creates sync_logs entries                                │            │
│  │  - Manages sync_settings                                    │            │
│  │  - Handles retries and rate limiting                        │            │
│  │  - Reports progress via callbacks                           │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### CORS Proxy Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CORS BYPASS MECHANISM                                │
└─────────────────────────────────────────────────────────────────────────────┘

  BROWSER ENVIRONMENT                    SERVER ENVIRONMENT
  ──────────────────                    ────────────────────

  ┌─────────────┐                       ┌─────────────────────┐
  │   auth.js   │                       │                     │
  │             │   POST /api/sync-proxy│   api/sync-proxy.js │
  │ isBrowser() │─────────────────────▶│   (Vercel Edge)     │
  │   = true    │                       │                     │
  └─────────────┘                       │   OR                │
                                        │                     │
                                        │   vite.config.js    │
                                        │   (Dev middleware)  │
                                        └─────────────────────┘
                                                  │
                                                  │ Server-side fetch
                                                  │ (No CORS restrictions)
                                                  ▼
                                        ┌─────────────────────┐
                                        │  External Site      │
                                        │  agirlandyourdog.com│
                                        └─────────────────────┘
```

---

## Database Schema

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATABASE SCHEMA                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────┐       ┌─────────────────────┐
│       dogs          │       │     boardings       │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │◀──────│ dog_id (FK)         │
│ name                │       │ id (PK)             │
│ day_rate            │       │ arrival_datetime    │
│ night_rate          │       │ departure_datetime  │
│ active              │       │ source              │
│ source              │       │ external_id         │
│ external_id ────────┼───┐   └─────────────────────┘
└─────────────────────┘   │              │
                          │              │
                          │   ┌──────────┘
                          │   │
                          ▼   ▼
┌─────────────────────────────────────────────┐
│            sync_appointments                │
├─────────────────────────────────────────────┤
│ id (PK)                                     │
│ external_id (UNIQUE)                        │
│ source_url                                  │
│ service_type, status                        │
│ check_in_datetime, check_out_datetime       │
│ client_name, client_email, client_phone     │
│ pet_name, pet_breed, pet_medications...     │
│ raw_data (JSONB)                            │
│ mapped_dog_id (FK) ─────────────────────────┼──▶ dogs.id
│ mapped_boarding_id (FK) ────────────────────┼──▶ boardings.id
│ first_synced_at, last_synced_at             │
└─────────────────────────────────────────────┘

┌─────────────────────┐       ┌─────────────────────┐
│    sync_settings    │       │     sync_logs       │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │       │ id (PK)             │
│ enabled             │       │ started_at          │
│ interval_minutes    │       │ completed_at        │
│ last_sync_at        │       │ status              │
│ last_sync_status    │       │ appointments_found  │
│ last_sync_message   │       │ appointments_created│
│ sync_date_range_days│       │ appointments_updated│
└─────────────────────┘       │ appointments_failed │
                              │ errors (JSONB)      │
                              │ duration_ms         │
                              └─────────────────────┘
```

### Sync Status Values

| Status | Description |
|--------|-------------|
| `running` | Sync is currently in progress |
| `success` | All appointments synced without errors |
| `partial` | Some appointments synced, some failed |
| `failed` | Sync failed completely |

---

## Module Reference

### 1. config.js

Configuration constants for the scraper.

```javascript
SCRAPER_CONFIG = {
  baseUrl: 'https://agirlandyourdog.com',
  delayBetweenRequests: 1500,      // Rate limiting
  maxRequestsPerMinute: 30,
  authTimeout: 30000,              // 30s
  pageTimeout: 15000,              // 15s
  syncTimeout: 600000,             // 10 min
  maxRetries: 3,
  retryDelays: [5000, 30000, 300000], // Exponential backoff
  selectors: { ... }               // CSS selectors for parsing
}
```

### 2. auth.js

Handles authentication with the external site.

| Function | Description |
|----------|-------------|
| `authenticate(username, password)` | Login and obtain session cookies |
| `isAuthenticated()` | Check if session is valid |
| `getSessionCookies()` | Get current session cookies |
| `clearSession()` | Clear stored session |
| `authenticatedFetch(url, options)` | Make authenticated requests |

**CORS Handling:** When `isBrowser()` returns true, requests are routed through `/api/sync-proxy` to bypass CORS restrictions.

### 3. schedule.js

Fetches and parses the appointment schedule page.

| Function | Description |
|----------|-------------|
| `parseSchedulePage(html)` | Extract appointment links from HTML |
| `filterBoardingAppointments(appointments)` | Filter to boarding-only |
| `fetchSchedulePage(options)` | Fetch single schedule page |
| `fetchAllSchedulePages(options)` | Fetch all pages with pagination |

### 4. extraction.js

Extracts detailed appointment data from individual pages.

| Function | Description |
|----------|-------------|
| `parseAppointmentPage(html, sourceUrl)` | Parse HTML to structured data |
| `fetchAppointmentDetails(appointmentId, timestamp)` | Fetch and parse a single appointment |

**Extracted Data:**
- Appointment: service_type, status, check_in/out, duration, staff
- Client: name, emails, phone, address
- Pet: name, breed, birthdate, medications, behavioral notes, vet info
- Instructions: access, drop-off, special notes

### 5. mapping.js

Maps extracted data to database records.

| Function | Description |
|----------|-------------|
| `mapToDog(externalData)` | Convert to Dog record |
| `mapToBoarding(externalData, dogId)` | Convert to Boarding record |
| `mapToSyncAppointment(externalData, dogId, boardingId)` | Convert to raw sync record |
| `upsertDog(supabase, dogData, options)` | Create or update Dog |
| `upsertBoarding(supabase, boardingData)` | Create or update Boarding |
| `mapAndSaveAppointment(externalData, options)` | Full mapping and save |

**Upsert Logic:**
1. Check for existing record by `external_id`
2. If found: update existing record
3. If not found: check for matching name (dogs only)
4. If name match and manual source: preserve manual entry
5. Otherwise: create new record

### 6. sync.js

Orchestrates the complete sync process.

| Function | Description |
|----------|-------------|
| `runSync(options)` | Execute full sync |
| `createSyncLog(supabase)` | Create sync log entry |
| `updateSyncLog(supabase, logId, updates)` | Update sync log |
| `getSyncSettings(supabase)` | Get sync configuration |
| `updateSyncSettings(supabase, updates)` | Update sync configuration |
| `getRecentSyncLogs(supabase, limit)` | Get sync history |
| `isSyncRunning(supabase)` | Check if sync in progress |
| `abortStuckSync(supabase, maxAgeMinutes)` | Abort stuck syncs |

---

## Sync Process Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYNC PROCESS SEQUENCE                                │
└─────────────────────────────────────────────────────────────────────────────┘

    runSync()
        │
        ▼
    ┌───────────────────┐
    │ Create sync_log   │ status = 'running'
    │ entry             │
    └───────────────────┘
        │
        ▼
    ┌───────────────────┐
    │ Authenticate      │ If not already authenticated
    │ (with retry)      │
    └───────────────────┘
        │
        ▼
    ┌───────────────────┐
    │ Fetch schedule    │ Get all appointment links
    │ pages             │ (with pagination)
    └───────────────────┘
        │
        ▼
    ┌───────────────────────────────────────────┐
    │ For each appointment:                     │
    │   ├─ Rate limiting delay (1.5s)           │
    │   ├─ Fetch appointment details (w/ retry) │
    │   ├─ Map and save to database             │
    │   │   ├─ Upsert dog                       │
    │   │   ├─ Upsert boarding                  │
    │   │   └─ Upsert sync_appointment          │
    │   └─ Report progress via callback         │
    └───────────────────────────────────────────┘
        │
        ▼
    ┌───────────────────┐
    │ Determine final   │ success / partial / failed
    │ status            │
    └───────────────────┘
        │
        ▼
    ┌───────────────────┐
    │ Update sync_log   │ Final stats and status
    │ Update settings   │ last_sync_at, last_sync_status
    └───────────────────┘
```

---

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_EXTERNAL_SITE_URL` | External site base URL | No (default: agirlandyourdog.com) |
| `VITE_EXTERNAL_SITE_USERNAME` | Login username | Yes (for sync) |
| `VITE_EXTERNAL_SITE_PASSWORD` | Login password | Yes (for sync) |
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Yes |

### Rate Limiting

The system implements several rate limiting mechanisms:

1. **Delay Between Requests:** 1.5 seconds between each page fetch
2. **Max Requests Per Minute:** 30 requests
3. **Retry Delays:** Exponential backoff (5s, 30s, 5min)
4. **Jitter:** Random 20% variance added to delays

---

## Error Handling

### Error Sanitization

All error messages are sanitized before logging or storage:
- URLs are replaced with `[URL]`
- Credentials are replaced with `[REDACTED]`
- Long messages are truncated to 200 characters

### Retry Logic

```javascript
withRetry(fn, { maxRetries: 3, delays: [5000, 30000, 300000] })
```

Operations are retried with exponential backoff on failure.

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "Not authenticated" | Session expired or never started | Re-authenticate |
| "Failed to fetch" | CORS or network issue | Check proxy configuration |
| "RLS policy violation" | Missing WITH CHECK clause | Run migration 006 |
| "Session expired" | Login page detected in response | Re-authenticate |

---

## Troubleshooting Guide

### Sync Not Starting

1. Check environment variables are set:
   ```bash
   echo $VITE_EXTERNAL_SITE_USERNAME
   echo $VITE_EXTERNAL_SITE_PASSWORD
   ```

2. Verify Supabase connection:
   - Check browser console for Supabase errors
   - Verify RLS policies are correctly configured

### Authentication Failures

1. **CORS errors in browser:**
   - Ensure running with `npm run dev` (includes proxy)
   - Or use Vercel deployment (includes serverless proxy)

2. **Invalid credentials:**
   - Verify username/password in `.env.local`
   - Try logging into external site manually

### Database Errors

1. **RLS policy errors:**
   ```sql
   -- Run this in Supabase SQL Editor
   -- Check if policies exist
   SELECT * FROM pg_policies WHERE tablename IN ('sync_logs', 'sync_settings', 'sync_appointments');
   ```

2. **Missing tables:**
   - Run migration 005 and 006 in order

### Performance Issues

1. **Sync too slow:**
   - Reduce `maxPages` parameter
   - Check network latency to external site

2. **Rate limiting:**
   - Increase `delayBetweenRequests` if getting blocked

---

## Testing

### Unit Tests

```bash
npm run test:run
```

Test files:
- `src/__tests__/scraper/auth.test.js`
- `src/__tests__/scraper/schedule.test.js`
- `src/__tests__/scraper/extraction.test.js`
- `src/__tests__/scraper/mapping.test.js`
- `src/__tests__/scraper/sync.test.js`

### Manual Testing

1. Start dev server: `npm run dev`
2. Login at http://localhost:5173
3. Go to Settings > External Sync
4. Click "Sync Now"
5. Watch browser console for `[Sync]` and `[Auth]` logs

---

## File Locations

```
dog-boarding/
├── api/
│   └── sync-proxy.js              # Vercel serverless proxy
├── src/
│   ├── lib/
│   │   └── scraper/
│   │       ├── config.js          # Configuration
│   │       ├── auth.js            # Authentication
│   │       ├── schedule.js        # Schedule parsing
│   │       ├── extraction.js      # Data extraction
│   │       ├── mapping.js         # Data mapping
│   │       ├── sync.js            # Orchestration
│   │       └── index.js           # Public exports
│   ├── hooks/
│   │   └── useSyncSettings.js     # React hook for UI
│   └── components/
│       ├── SyncSettings.jsx       # Settings UI
│       └── SyncStatusIndicator.jsx # Status display
├── supabase/
│   └── migrations/
│       ├── 005_add_sync_tables.sql    # Schema
│       └── 006_fix_sync_rls_policies.sql # RLS fix
└── vite.config.js                 # Dev proxy middleware
```

---

## Future Improvements

1. **Scheduled Sync:** Implement automatic background sync using `sync_settings.interval_minutes`
2. **Webhook Support:** Add webhooks from external site for real-time updates
3. **Conflict Resolution UI:** Allow users to manually resolve data conflicts
4. **Selective Sync:** Choose specific date ranges or appointments to sync
5. **Audit Trail:** Track all changes made by sync for rollback capability
