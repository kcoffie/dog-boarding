# Dog Boarding Data Scraper Spec

## Overview
Build a web scraper to pull dog boarding appointment data from agirlandyourdog.com (powered by My Own Website/myownwebsite.com platform) and store it in the app's database for automatic syncing.

## Authentication
The site requires session-based authentication. The scraper must either:
1. Use Playwright/Puppeteer with stored cookies from an authenticated browser session
2. Programmatically log in with credentials (username/password) at login page

## Data Source URLs

**Schedule Page (list view):**
```
https://agirlandyourdog.com/schedule
https://agirlandyourdog.com/schedule/days-7/{year}/{month}/{day}  # Week view
https://agirlandyourdog.com/schedule/month/{year}/{month}        # Month view
```

**Individual Appointment Details:**
```
https://agirlandyourdog.com/schedule/a/{appointmentId}/{timestamp}
```
Example: `/schedule/a/C63QgAcM/1766332800`

## Data Fields to Extract

### Appointment Info
- `appointmentId` - from URL (e.g., "C63QgAcM")
- `serviceType` - "Boarding (Days)", "Boarding (Nights)", "Boarding discounted nights for DC full-time", "Daycare", "Playgroup"
- `status` - "In Progress", "Completed", "Scheduled", "Canceled"
- `checkInDateTime` - actual check-in timestamp
- `checkOutDateTime` - actual/scheduled check-out timestamp
- `scheduledCheckIn` - scheduled date (e.g., "PM, Sunday, December 21, 2025")
- `scheduledCheckOut` - scheduled date
- `duration` - "7 nights", "3 days", etc.
- `assignedStaff` - staff member name (may be "No worker set")

### Client Info
- `clientName` - full name
- `primaryEmail`
- `secondaryEmail`
- `mobilePhone`
- `address` - full address string

### Access/Instructions
- `accessInstructions` - "How To Access Home or Apartment" field (may contain door codes, gate info)
- `dropOffInstructions` - arrival instructions
- `specialNotes` - any additional notes

### Pet Info
- `petName`
- `petPhoto` - URL if available
- `birthdate`
- `breed`
- `breedType`
- `foodAllergies`
- `healthAndMobility`
- `medications` - include dosage instructions
- `veterinarian` - name, clinic, address, phone, website
- `behavioral` - behavioral notes
- `biteHistory`

## Scraping Approach
```javascript
// Pseudocode

// 1. Initialize Playwright browser with stored auth cookies
const browser = await playwright.chromium.launch();
const context = await browser.newContext({ storageState: 'auth.json' });
const page = await context.newPage();

// 2. Navigate to schedule page
await page.goto('https://agirlandyourdog.com/schedule');

// 3. Extract all appointment links from the schedule
const appointmentLinks = await page.$$eval('a[href*="/schedule/a/"]', links => 
  links.map(a => ({
    href: a.getAttribute('href'),
    preview: a.innerText
  }))
);

// 4. Filter for boarding appointments only (optional)
const boardingAppts = appointmentLinks.filter(a => 
  a.preview.toLowerCase().includes('boarding') || 
  a.preview.includes('B/O')
);

// 5. For each appointment, visit the detail page and extract full data
for (const appt of boardingAppts) {
  await page.goto(`https://agirlandyourdog.com${appt.href}`);
  const data = await page.evaluate(() => {
    // Parse the appointment detail page
    // Return structured object with all fields
  });
  await saveToDatabase(data);
}
```

## DOM Structure Notes

The appointment detail page structure:
- Service type appears as a heading at the top of the card
- Check-in/out times are in plain text below the heading
- Client info is in a card with email, phone, location sections
- "How To Access Home or Apartment" is a labeled section
- Pet info is in a "Pet Info Card" section with labeled fields
- Each section can be identified by its label text

## Sync Strategy

**Option A: Scheduled Full Sync**
Run every hour/day to pull all appointments within a date range (e.g., next 30 days) and upsert into database.

**Option B: Incremental Sync**
Track last sync timestamp and only process appointments modified since then.

## Error Handling
- Handle authentication expiration (re-login or refresh cookies)
- Handle rate limiting (add delays between requests)
- Log failed extractions for manual review
- Handle missing fields gracefully (some pets may not have all info filled in)

## Database Schema Suggestion
```sql
CREATE TABLE boarding_appointments (
  id UUID PRIMARY KEY,
  external_id VARCHAR(20) UNIQUE,
  service_type VARCHAR(100),
  status VARCHAR(50),
  check_in_datetime TIMESTAMP,
  check_out_datetime TIMESTAMP,
  duration VARCHAR(50),
  assigned_staff VARCHAR(100),
  
  client_name VARCHAR(200),
  client_email_primary VARCHAR(200),
  client_email_secondary VARCHAR(200),
  client_phone VARCHAR(50),
  client_address TEXT,
  
  access_instructions TEXT,
  drop_off_instructions TEXT,
  special_notes TEXT,
  
  pet_name VARCHAR(100),
  pet_birthdate DATE,
  pet_breed VARCHAR(100),
  pet_food_allergies TEXT,
  pet_health_mobility TEXT,
  pet_medications TEXT,
  pet_veterinarian JSONB,
  pet_behavioral TEXT,
  pet_bite_history TEXT,
  
  synced_at TIMESTAMP DEFAULT NOW(),
  source_url VARCHAR(500)
);
```
