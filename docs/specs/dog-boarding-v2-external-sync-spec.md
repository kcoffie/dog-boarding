# Dog Boarding App v2.0 - External Data Sync Spec

## Overview

Build a web scraper to pull dog boarding appointment data from agirlandyourdog.com (powered by My Own Website/myownwebsite.com platform) and automatically sync it to the app's database.

**Version:** 2.0.0
**Branch:** `develop` (do not merge to main until v2.0 release)
**Dependencies:** v1.3+ complete (auth, shared org data)

---

## Requirements

> **Note:** Add these to `docs/REQUIREMENTS.md` under a new "v2.0: External Data Sync" section.

### REQ-100: External Source Authentication
**Added:** v2.0
**Status:** Planned

Scraper can authenticate with the external booking system.

**Acceptance Criteria:**
- [ ] Can store authentication credentials securely (not in code)
- [ ] Can authenticate using stored session/cookies
- [ ] Can re-authenticate when session expires
- [ ] Authentication failures logged with clear error messages
- [ ] Credentials stored in environment variables, not database

**Tests:** `scraper/auth.test.js`

---

### REQ-101: Appointment List Scraping
**Added:** v2.0
**Status:** Planned

Scraper can retrieve list of appointments from schedule page.

**Acceptance Criteria:**
- [ ] Can navigate to schedule page
- [ ] Can extract all appointment links from page
- [ ] Can filter for boarding appointments only
- [ ] Can handle pagination if present
- [ ] Can specify date range to scrape

**Tests:** `scraper/schedule.test.js`

---

### REQ-102: Appointment Detail Extraction
**Added:** v2.0
**Status:** Planned

Scraper can extract full details from individual appointment pages.

**Acceptance Criteria:**
- [ ] Extracts appointment info (service type, status, dates, duration, staff)
- [ ] Extracts client info (name, emails, phone, address)
- [ ] Extracts access instructions and notes
- [ ] Extracts pet info (name, breed, medical, behavioral)
- [ ] Handles missing fields gracefully (null, not error)
- [ ] Stores source URL for reference

**Tests:** `scraper/extraction.test.js`

---

### REQ-103: Data Mapping to App Schema
**Added:** v2.0
**Status:** Planned

Scraped data maps correctly to existing app data models.

**Acceptance Criteria:**
- [ ] External appointments create/update Dog records
- [ ] External appointments create/update Boarding records
- [ ] Client info stored appropriately (new table or notes)
- [ ] Duplicate detection by external_id
- [ ] Existing manual entries not overwritten without flag

**Tests:** `scraper/mapping.test.js`

---

### REQ-104: Sync Scheduling
**Added:** v2.0
**Status:** Planned

Sync can run automatically on a schedule.

**Acceptance Criteria:**
- [ ] Can configure sync interval (hourly, daily, manual)
- [ ] Sync runs in background without blocking UI
- [ ] Last sync timestamp displayed in app
- [ ] Can trigger manual sync from UI
- [ ] Sync status visible (running, success, failed)

**Tests:** `scraper/scheduler.test.js`, `components/SyncStatus.test.jsx`

---

### REQ-105: Sync Conflict Resolution
**Added:** v2.0
**Status:** Planned

System handles conflicts between external and local data.

**Acceptance Criteria:**
- [ ] External data marked with `source: 'external'`
- [ ] Local edits to external data flagged as overridden
- [ ] Option to prefer external or local on conflict
- [ ] Sync log shows what changed
- [ ] Can revert local changes to external data

**Tests:** `scraper/conflicts.test.js`

---

### REQ-106: Sync Error Handling
**Added:** v2.0
**Status:** Planned

Sync failures are handled gracefully and reported.

**Acceptance Criteria:**
- [ ] Individual appointment failures don't stop full sync
- [ ] Failed extractions logged for manual review
- [ ] Rate limiting handled (automatic delays)
- [ ] Network failures trigger retry with backoff
- [ ] Error notifications to admin (optional)

**Tests:** `scraper/errors.test.js`

---

### REQ-107: Sync Admin UI
**Added:** v2.0
**Status:** Planned

Administrators can manage sync settings and view status.

**Acceptance Criteria:**
- [ ] Settings page has "External Sync" section
- [ ] Can enable/disable automatic sync
- [ ] Can configure sync interval
- [ ] Can view sync history (last 10 syncs)
- [ ] Can view sync errors
- [ ] Can trigger manual sync

**Tests:** `pages/SyncSettings.test.jsx`

---

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         App Frontend                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Matrix    │  │  Calendar   │  │   Settings > Sync       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Supabase                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    dogs     │  │  boardings  │  │   sync_appointments     │  │
│  │             │  │             │  │   sync_logs             │  │
│  │             │  │             │  │   sync_settings         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              Edge Function: sync-appointments                ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ ││
│  │  │  Auth   │→ │ Scrape  │→ │  Map    │→ │ Upsert to DB    │ ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              External: agirlandyourdog.com                       │
│  ┌─────────────┐  ┌─────────────────────────────────────────┐   │
│  │   Login     │  │   /schedule, /schedule/a/{id}           │   │
│  └─────────────┘  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Scraper Location Options

| Option | Pros | Cons |
|--------|------|------|
| **Supabase Edge Function** | Runs in cloud, scheduled via cron, no server needed | Limited to Deno, may hit timeout limits |
| **Vercel Serverless Function** | More runtime options, longer timeouts | Need to set up separately from Supabase |
| **External Worker (Railway/Render)** | Full control, can use Playwright | Additional service to manage |
| **Local Script** | Simple, can use any tools | Must run manually or via local cron |

**Recommendation:** Start with Supabase Edge Function using fetch-based scraping. If the site requires JavaScript rendering, move to external worker with Playwright.

### Database Schema

```sql
-- Migration: 005_add_sync_tables.sql
-- Version: 2.0.0

-- Store raw external appointment data
CREATE TABLE sync_appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  external_id VARCHAR(50) UNIQUE NOT NULL,
  source_url TEXT,
  
  -- Appointment info
  service_type VARCHAR(100),
  status VARCHAR(50),
  check_in_datetime TIMESTAMP WITH TIME ZONE,
  check_out_datetime TIMESTAMP WITH TIME ZONE,
  scheduled_check_in TEXT,
  scheduled_check_out TEXT,
  duration VARCHAR(50),
  assigned_staff VARCHAR(100),
  
  -- Client info
  client_name VARCHAR(200),
  client_email_primary VARCHAR(200),
  client_email_secondary VARCHAR(200),
  client_phone VARCHAR(50),
  client_address TEXT,
  
  -- Instructions
  access_instructions TEXT,
  drop_off_instructions TEXT,
  special_notes TEXT,
  
  -- Pet info
  pet_name VARCHAR(100),
  pet_photo_url TEXT,
  pet_birthdate DATE,
  pet_breed VARCHAR(100),
  pet_breed_type VARCHAR(100),
  pet_food_allergies TEXT,
  pet_health_mobility TEXT,
  pet_medications TEXT,
  pet_veterinarian JSONB,
  pet_behavioral TEXT,
  pet_bite_history TEXT,
  
  -- Metadata
  raw_data JSONB, -- Store full scraped data for debugging
  first_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Link to app data
  mapped_dog_id UUID REFERENCES dogs(id),
  mapped_boarding_id UUID REFERENCES boardings(id)
);

-- Sync configuration
CREATE TABLE sync_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  interval_minutes INTEGER DEFAULT 60,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_status VARCHAR(50), -- 'success', 'partial', 'failed'
  last_sync_message TEXT,
  sync_date_range_days INTEGER DEFAULT 30, -- How far ahead to sync
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sync history log
CREATE TABLE sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(50), -- 'running', 'success', 'partial', 'failed'
  appointments_found INTEGER DEFAULT 0,
  appointments_created INTEGER DEFAULT 0,
  appointments_updated INTEGER DEFAULT 0,
  appointments_failed INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  duration_ms INTEGER
);

-- RLS: All authenticated users can access sync data
ALTER TABLE sync_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users full access" ON sync_appointments
  FOR ALL USING (auth.role() = 'authenticated');
  
CREATE POLICY "Authenticated users full access" ON sync_settings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users full access" ON sync_logs
  FOR ALL USING (auth.role() = 'authenticated');

-- Add source tracking to existing tables
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
ALTER TABLE dogs ADD COLUMN IF NOT EXISTS external_id VARCHAR(50);

ALTER TABLE boardings ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual';
ALTER TABLE boardings ADD COLUMN IF NOT EXISTS external_id VARCHAR(50);

-- Index for external_id lookups
CREATE INDEX IF NOT EXISTS idx_sync_appointments_external_id ON sync_appointments(external_id);
CREATE INDEX IF NOT EXISTS idx_dogs_external_id ON dogs(external_id);
CREATE INDEX IF NOT EXISTS idx_boardings_external_id ON boardings(external_id);
```

### Environment Variables

Add to `.env.example`:

```bash
# External Sync (v2.0)
EXTERNAL_SITE_URL=https://agirlandyourdog.com
EXTERNAL_SITE_USERNAME=        # Set in Supabase secrets, not .env
EXTERNAL_SITE_PASSWORD=        # Set in Supabase secrets, not .env
EXTERNAL_SYNC_ENABLED=false    # Enable in production only after testing
```

---

## Test Data & Mocking

### Mock External Site for Testing

Create a mock server that mimics the external site structure:

```javascript
// test/mocks/external-site.js
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

const mockSchedulePage = `
<html>
  <body>
    <a href="/schedule/a/ABC123/1234567890">
      Boarding - Luna - Dec 21-23
    </a>
    <a href="/schedule/a/DEF456/1234567890">
      Boarding - Cooper - Dec 22-25
    </a>
    <a href="/schedule/a/GHI789/1234567890">
      Daycare - Max - Dec 21
    </a>
  </body>
</html>
`;

const mockAppointmentPage = (id) => `
<html>
  <body>
    <h1>Boarding (Nights)</h1>
    <div class="status">Scheduled</div>
    <div class="check-in">PM, Saturday, December 21, 2025</div>
    <div class="check-out">AM, Monday, December 23, 2025</div>
    <div class="duration">2 nights</div>
    <div class="client-name">John Smith</div>
    <div class="client-email">john@example.com</div>
    <div class="pet-name">Luna</div>
    <div class="pet-breed">Golden Retriever</div>
  </body>
</html>
`;

export const handlers = [
  http.get('https://agirlandyourdog.com/schedule', () => {
    return HttpResponse.html(mockSchedulePage);
  }),
  
  http.get('https://agirlandyourdog.com/schedule/a/:id/:timestamp', ({ params }) => {
    return HttpResponse.html(mockAppointmentPage(params.id));
  }),
  
  http.post('https://agirlandyourdog.com/login', async ({ request }) => {
    const body = await request.formData();
    if (body.get('username') === 'test' && body.get('password') === 'test') {
      return HttpResponse.redirect('/schedule', { status: 302 });
    }
    return HttpResponse.html('Invalid credentials', { status: 401 });
  }),
];

export const mockExternalServer = setupServer(...handlers);
```

### Test Fixtures

```javascript
// test/fixtures/sync-data.js

export const mockExternalAppointments = [
  {
    external_id: 'ABC123',
    service_type: 'Boarding (Nights)',
    status: 'Scheduled',
    check_in_datetime: '2025-12-21T17:00:00Z',
    check_out_datetime: '2025-12-23T10:00:00Z',
    duration: '2 nights',
    client_name: 'John Smith',
    client_email_primary: 'john@example.com',
    pet_name: 'Luna',
    pet_breed: 'Golden Retriever',
  },
  {
    external_id: 'DEF456',
    service_type: 'Boarding (Nights)',
    status: 'Scheduled',
    check_in_datetime: '2025-12-22T17:00:00Z',
    check_out_datetime: '2025-12-25T10:00:00Z',
    duration: '3 nights',
    client_name: 'Jane Doe',
    client_email_primary: 'jane@example.com',
    pet_name: 'Cooper',
    pet_breed: 'Labrador',
  },
];

export const mockSyncLog = {
  id: 'test-sync-1',
  started_at: '2025-12-20T10:00:00Z',
  completed_at: '2025-12-20T10:00:15Z',
  status: 'success',
  appointments_found: 5,
  appointments_created: 2,
  appointments_updated: 3,
  appointments_failed: 0,
  errors: [],
  duration_ms: 15000,
};
```

### Unit Tests

```javascript
// __tests__/scraper/extraction.test.js

/**
 * @requirements REQ-102
 */
describe('REQ-102: Appointment Detail Extraction', () => {
  beforeAll(() => mockExternalServer.listen());
  afterEach(() => mockExternalServer.resetHandlers());
  afterAll(() => mockExternalServer.close());

  it('extracts appointment info from detail page', async () => {
    const data = await extractAppointmentDetails('ABC123', '1234567890');
    
    expect(data.service_type).toBe('Boarding (Nights)');
    expect(data.status).toBe('Scheduled');
    expect(data.duration).toBe('2 nights');
  });

  it('extracts client info from detail page', async () => {
    const data = await extractAppointmentDetails('ABC123', '1234567890');
    
    expect(data.client_name).toBe('John Smith');
    expect(data.client_email_primary).toBe('john@example.com');
  });

  it('extracts pet info from detail page', async () => {
    const data = await extractAppointmentDetails('ABC123', '1234567890');
    
    expect(data.pet_name).toBe('Luna');
    expect(data.pet_breed).toBe('Golden Retriever');
  });

  it('handles missing fields gracefully', async () => {
    mockExternalServer.use(
      http.get('https://agirlandyourdog.com/schedule/a/:id/:ts', () => {
        return HttpResponse.html('<html><body><h1>Boarding</h1></body></html>');
      })
    );
    
    const data = await extractAppointmentDetails('EMPTY', '123');
    
    expect(data.service_type).toBe('Boarding');
    expect(data.pet_name).toBeNull();
    expect(data.client_email_primary).toBeNull();
  });
});
```

```javascript
// __tests__/scraper/mapping.test.js

/**
 * @requirements REQ-103
 */
describe('REQ-103: Data Mapping to App Schema', () => {
  it('creates new dog record from external appointment', async () => {
    const external = mockExternalAppointments[0];
    const result = await mapAndSaveAppointment(external);
    
    expect(result.dog).toBeDefined();
    expect(result.dog.name).toBe('Luna');
    expect(result.dog.source).toBe('external');
    expect(result.dog.external_id).toBe('ABC123');
  });

  it('creates boarding record from external appointment', async () => {
    const external = mockExternalAppointments[0];
    const result = await mapAndSaveAppointment(external);
    
    expect(result.boarding).toBeDefined();
    expect(result.boarding.source).toBe('external');
    expect(result.boarding.arrival_datetime).toBe('2025-12-21T17:00:00Z');
  });

  it('updates existing dog instead of creating duplicate', async () => {
    // First sync
    await mapAndSaveAppointment(mockExternalAppointments[0]);
    
    // Second sync with same external_id
    const result = await mapAndSaveAppointment(mockExternalAppointments[0]);
    
    const dogs = await getDogsByExternalId('ABC123');
    expect(dogs.length).toBe(1); // Not duplicated
  });

  it('does not overwrite manual entries without flag', async () => {
    // Create manual dog
    const manualDog = await createDog({ name: 'Luna', source: 'manual' });
    
    // Sync external with same name
    const external = { ...mockExternalAppointments[0], pet_name: 'Luna' };
    const result = await mapAndSaveAppointment(external, { overwriteManual: false });
    
    // Manual entry unchanged
    const dog = await getDog(manualDog.id);
    expect(dog.source).toBe('manual');
  });
});
```

### E2E Tests

```typescript
// e2e/sync.spec.ts

test.describe('External Sync', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('can trigger manual sync from settings', async ({ page }) => {
    await page.goto('/settings');
    await page.click('text=External Sync');
    await page.click('text=Sync Now');
    
    // Wait for sync to complete
    await expect(page.locator('text=Sync completed')).toBeVisible({ timeout: 30000 });
  });

  test('displays sync history', async ({ page }) => {
    await page.goto('/settings');
    await page.click('text=External Sync');
    
    await expect(page.locator('text=Sync History')).toBeVisible();
    await expect(page.locator('.sync-log-entry')).toHaveCount.greaterThan(0);
  });

  test('shows synced appointments on calendar', async ({ page }) => {
    // Trigger sync
    await page.goto('/settings');
    await page.click('text=External Sync');
    await page.click('text=Sync Now');
    await expect(page.locator('text=Sync completed')).toBeVisible({ timeout: 30000 });
    
    // Check calendar
    await page.goto('/calendar');
    await expect(page.locator('text=Luna')).toBeVisible();
  });

  test('external appointments marked with badge', async ({ page }) => {
    await page.goto('/dogs');
    
    // Find externally synced dog
    const lunaCard = page.locator('.dog-card', { hasText: 'Luna' });
    await expect(lunaCard.locator('.badge-external')).toBeVisible();
  });
});
```

---

## Implementation Phases

### Phase 1: Database Setup
1. Create migration `005_add_sync_tables.sql`
2. Run migration on dev Supabase
3. Add `source` and `external_id` columns to existing tables
4. **Checkpoint:** Tables exist, can insert test data manually

### Phase 2: Scraper Core
1. Create scraper module `src/lib/scraper/`
2. Implement authentication
3. Implement schedule page parsing
4. Implement appointment detail parsing
5. Add unit tests with mocked external site
6. **Checkpoint:** Scraper works against mock server

### Phase 3: Data Mapping
1. Implement mapping from external to app schema
2. Implement upsert logic (create or update)
3. Implement duplicate detection
4. Add unit tests for mapping
5. **Checkpoint:** External data correctly maps to dogs/boardings

### Phase 4: Sync Service
1. Create sync orchestration function
2. Implement scheduled sync (Supabase cron or external)
3. Implement sync logging
4. Implement error handling and retry
5. **Checkpoint:** Sync runs automatically, logs results

### Phase 5: Admin UI
1. Add "External Sync" section to Settings
2. Implement sync status display
3. Implement manual sync trigger
4. Implement sync history view
5. Add component tests
6. **Checkpoint:** Can manage sync from UI

### Phase 6: Integration & Polish
1. Add external badge to dogs/boardings from sync
2. Add sync status indicator to header
3. Implement conflict resolution UI (if needed)
4. Run full E2E tests
5. **Checkpoint:** Feature complete

### Phase 7: Testing & Security
1. Security audit (credentials handling, etc.)
2. Run against real external site (staging only)
3. Load test sync with large data sets
4. Update documentation
5. **Checkpoint:** Ready for UAT

### Phase 8: Release
1. Add to CHANGELOG
2. Update README with new feature
3. Update roadmap
4. Tag v2.0.0
5. Deploy to production (sync disabled by default)
6. Enable sync after verification

---

## Security Considerations

- [ ] External site credentials stored in Supabase secrets (not in code or .env)
- [ ] Credentials never logged or exposed in error messages
- [ ] Scraper runs with minimal permissions
- [ ] Rate limiting to avoid overwhelming external site
- [ ] Session cookies not persisted to database
- [ ] External data sanitized before storage (XSS prevention)

---

## Success Metrics & KPIs

### Definition of Done
v2.0 is complete when:
- [ ] All REQ-100 through REQ-107 pass acceptance criteria
- [ ] All tests pass (unit, integration, E2E)
- [ ] Sync runs successfully for 7 consecutive days in production
- [ ] No P1 bugs from UAT

### Key Performance Indicators

| Metric | Target | Measurement |
|--------|--------|-------------|
| Sync Success Rate | ≥ 95% | `appointments_created + appointments_updated / appointments_found` |
| Sync Failure Rate | ≤ 5% | `appointments_failed / appointments_found` |
| Data Accuracy | 100% | Manual spot-check of 10 random appointments post-sync |
| Sync Duration | < 2 min | `duration_ms` in sync_logs for typical sync |
| User Complaints | 0 | GitHub issues tagged `sync-bug` |

### Success Criteria for Go-Live
- [ ] 3 successful syncs in UAT environment
- [ ] Spot-check of 10 appointments shows 100% data accuracy
- [ ] No critical errors in sync_logs for 24 hours
- [ ] UAT sign-off from at least 1 user

---

## Performance Requirements

### Sync Performance

| Metric | Requirement |
|--------|-------------|
| Single appointment extraction | < 5 seconds |
| Full sync (50 appointments) | < 2 minutes |
| Full sync (100 appointments) | < 5 minutes |
| Memory usage | < 256MB |
| Concurrent syncs | Not allowed (mutex/lock) |

### Rate Limiting

| Setting | Value | Reason |
|---------|-------|--------|
| Delay between requests | 1-2 seconds | Avoid overwhelming external site |
| Max requests per minute | 30 | Stay under typical rate limits |
| Retry delay (on failure) | 5 seconds, then 30s, then 5min | Exponential backoff |
| Max retries per appointment | 3 | Don't get stuck on broken pages |

### Timeout Limits

| Operation | Timeout |
|-----------|---------|
| Authentication | 30 seconds |
| Page load | 15 seconds |
| Full sync | 10 minutes (abort if exceeded) |

### Scalability

| Scenario | Expected Behavior |
|----------|-------------------|
| 0-50 appointments | Normal sync |
| 50-200 appointments | Paginated sync, may take 5-10 min |
| 200+ appointments | Consider date range filtering |

---

## Risk Assessment

### High Risk

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| External site changes HTML structure | Medium | High - Sync breaks completely | Pin selectors in config, add selector validation tests, monitor for extraction failures |
| External site blocks scraping | Low | High - Feature unusable | Respect rate limits, use realistic User-Agent, have backup manual import option |
| Credentials compromised | Low | High - Security breach | Store in Supabase secrets only, rotate periodically, never log |

### Medium Risk

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sync creates duplicate dogs | Medium | Medium - Data quality issues | Robust duplicate detection by external_id AND pet name |
| External site is slow/down | Medium | Medium - Sync fails | Retry with backoff, alert on repeated failures |
| Data mapping errors | Medium | Medium - Incorrect boardings | Comprehensive mapping tests, manual review in UAT |

### Low Risk

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Rate limit hit | Low | Low - Temporary slowdown | Built-in delays, exponential backoff |
| Timezone issues | Medium | Low - Wrong dates | Explicit timezone handling, tests with various timezones |

### Contingency Plans

| Scenario | Response |
|----------|----------|
| Sync completely broken | Disable sync, notify users, continue with manual entry |
| Data corruption from sync | Rollback (delete external data), investigate, re-sync |
| External site blocks us | Contact site owner, or switch to manual CSV import |
| Credentials expired | Alert admin, prompt for re-authentication |

---

## Monitoring & Alerting

### Health Checks

| Check | Frequency | Alert Threshold |
|-------|-----------|-----------------|
| Last sync timestamp | Every hour | No sync in 24+ hours (if enabled) |
| Sync failure rate | Per sync | > 20% appointments failed |
| Auth failures | Per sync | Any auth failure |
| Extraction errors | Per sync | > 5 consecutive extraction errors |

### Logging

| Event | Log Level | Includes |
|-------|-----------|----------|
| Sync started | INFO | Timestamp, date range |
| Appointment extracted | DEBUG | External ID, pet name |
| Appointment saved | INFO | External ID, dog_id, boarding_id |
| Extraction failed | WARN | External ID, error message, URL |
| Sync completed | INFO | Stats (found, created, updated, failed) |
| Auth failed | ERROR | Error message (NOT credentials) |
| Sync aborted | ERROR | Reason, partial stats |

### Dashboard (Settings > Sync)

Display in UI:
- [ ] Current sync status (idle, running, last run time)
- [ ] Last 10 sync results (success/partial/failed)
- [ ] Total appointments synced (all time)
- [ ] Quick stats: created today, updated today, failed today

### Alerts (Optional - Phase 2)

| Alert | Channel | Trigger |
|-------|---------|---------|
| Sync failed 3x in a row | Email to admin | 3 consecutive `status: failed` |
| No sync in 48 hours | Email to admin | `last_sync_at` > 48 hours |
| Auth expired | In-app notification | Auth failure detected |

---

## UAT Test Checklist

### Prerequisites
- [ ] UAT tester has account on production
- [ ] Sync is enabled in UAT/staging environment
- [ ] Test data exists in external site (or use real upcoming bookings)

### Test Script for UAT Testers

#### 1. Sync Settings (REQ-107)
- [ ] Navigate to Settings > External Sync
- [ ] Verify sync status shows "Enabled" or "Disabled"
- [ ] Verify last sync timestamp is displayed
- [ ] Verify sync interval setting is visible

#### 2. Manual Sync (REQ-104, REQ-107)
- [ ] Click "Sync Now" button
- [ ] Verify loading indicator appears
- [ ] Verify sync completes within 2 minutes
- [ ] Verify success message shows appointments found/created/updated

#### 3. Sync Results (REQ-101, REQ-102, REQ-103)
- [ ] Navigate to Dogs page
- [ ] Verify new dogs from external site appear
- [ ] Verify dogs from sync have "External" badge
- [ ] Click on a synced dog, verify details are correct

#### 4. Boarding Data (REQ-103)
- [ ] Navigate to Calendar/Matrix
- [ ] Verify boardings from external site appear on correct dates
- [ ] Verify check-in and check-out times are correct
- [ ] Compare 3 random boardings against external site (spot check)

#### 5. Sync History (REQ-107)
- [ ] Return to Settings > External Sync
- [ ] Verify sync history shows recent syncs
- [ ] Verify each entry shows: timestamp, status, counts

#### 6. Error Handling (REQ-106)
- [ ] (If possible) Trigger a sync with network issues
- [ ] Verify error is logged and displayed
- [ ] Verify app continues to function normally

#### 7. Conflict Handling (REQ-105)
- [ ] Edit a dog that was synced from external
- [ ] Trigger another sync
- [ ] Verify your local edit is preserved (not overwritten)
- [ ] Verify "local override" indicator appears

### UAT Sign-Off

| Tester | Date | Result | Notes |
|--------|------|--------|-------|
| | | Pass / Fail | |
| | | Pass / Fail | |

### Bug Reporting
Report issues at: https://github.com/kcoffie/dog-boarding/issues/new/choose
- Use "UAT Bug Report" template
- Tag with `v2.0` and `sync`

---

## Legal & Compliance

### Terms of Service
- [ ] Verify scraping is permitted by external site's TOS
- [ ] Document any rate limits or usage restrictions
- [ ] Consider reaching out to site owner for API access

### Data Privacy
- [ ] Client emails/phones are stored - ensure compliant with privacy policy
- [ ] Add data retention policy for sync_appointments
- [ ] Consider: Do users consent to their data being synced?
- [ ] GDPR: Right to deletion should include synced data

### Data Retention

| Data | Retention |
|------|-----------|
| sync_appointments | 1 year (configurable) |
| sync_logs | 90 days |
| raw_data (JSONB) | 30 days, then cleared |

---

## Graceful Degradation

### If Sync Fails

| Scenario | User Experience |
|----------|-----------------|
| Sync disabled | App works normally, no sync features visible |
| Sync fails | Banner: "Sync failed - data may be outdated", app works normally |
| External site down | Sync skipped, retries next interval, app works normally |
| Auth expired | Prompt in Settings to re-authenticate, app works normally |

### Manual Fallback

If sync is completely broken, users can:
1. Disable sync in Settings
2. Add dogs/boardings manually (existing functionality)
3. Use CSV import if bulk data needed

---

## Rollback Plan

If sync causes issues in production:

1. **Disable sync:** Set `enabled: false` in sync_settings
2. **Revert data:** Delete records where `source = 'external'`
3. **Investigate:** Review sync_logs for errors
4. **Fix & re-enable:** After fixing, clear sync_appointments and re-sync

```sql
-- Emergency rollback
UPDATE sync_settings SET enabled = false;

-- If needed: remove all external data
DELETE FROM boardings WHERE source = 'external';
DELETE FROM dogs WHERE source = 'external';
DELETE FROM sync_appointments;
```

---

## Documentation Updates

Before release, update:

- [ ] `README.md` - Add External Sync to features list
- [ ] `docs/REQUIREMENTS.md` - Add REQ-100 through REQ-107
- [ ] `docs/API.md` - Document sync-related endpoints/functions
- [ ] `docs/DEPLOYMENT.md` - Add secrets configuration
- [ ] `CHANGELOG.md` - Document v2.0 changes

---

## Prompt for Claude Code

> "I'm starting work on v2.0 - external data sync. Read `docs/v2.0-external-sync-spec.md` and:
>
> 1. Switch to the `develop` branch
> 2. Create the database migration for sync tables
> 3. Add the v2.0 requirements to REQUIREMENTS.md
> 4. Set up the test mocks for the external site
> 5. Start with Phase 1: Database setup
>
> This is v2 work - don't touch main branch. Make sure all new code has tests that reference the requirement IDs."
