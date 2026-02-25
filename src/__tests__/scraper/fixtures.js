/**
 * Mock HTML fixtures for scraper tests
 */

export const mockLoginPage = `
<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <form action="/login" method="POST">
    <input type="hidden" name="_token" value="test-csrf-token-123">
    <input type="email" name="username" placeholder="Email">
    <input type="password" name="password" placeholder="Password">
    <button type="submit">Login</button>
  </form>
</body>
</html>
`;

// Schedule page HTML matches the actual external site structure.
// Appointment titles are rendered by JavaScript (not present in static HTML),
// so we extract data from data-* attributes and child elements instead.
export const mockSchedulePage = `
<!DOCTYPE html>
<html>
<head><title>Schedule</title></head>
<body>
  <div class="schedule">
    <a class="day-event a-ABC123"
       data-id="ABC123"
       data-ts="1234567890"
       href="/schedule/a/ABC123/1234567890"
       data-event_type="1"
       data-status="6">
      <div class="time"><div class="day-event-time">Dec 21, 5:00pm - Dec 23, 10:00am</div></div>
      <div class="day-event-title">12/21-12/23am</div>
      <span class="pets">
        <span class="event-client-wrapper"><span class="event-client">John Smith</span></span>
        <div class="event-pets"><span class="event-pet pet-1">Luna Smith</span></div>
      </span>
    </a>
    <a class="day-event a-DEF456"
       data-id="DEF456"
       data-ts="1234567891"
       href="/schedule/a/DEF456/1234567891"
       data-event_type="1"
       data-status="1">
      <div class="time"><div class="day-event-time">Dec 22, 5:00pm - Dec 25, 10:00am</div></div>
      <div class="day-event-title">12/22-12/25am</div>
      <span class="pets">
        <span class="event-client-wrapper"><span class="event-client">Jane Doe</span></span>
        <div class="event-pets"><span class="event-pet pet-2">Cooper Doe</span></div>
      </span>
    </a>
    <a class="day-event a-GHI789"
       data-id="GHI789"
       data-ts="1234567892"
       href="/schedule/a/GHI789/1234567892"
       data-event_type="2"
       data-status="1">
      <div class="time"><div class="day-event-time">Dec 21, 9:00am - Dec 21, 5:00pm</div></div>
      <div class="day-event-title">Day Visit</div>
      <span class="pets">
        <span class="event-client-wrapper"><span class="event-client">Bob Jones</span></span>
        <div class="event-pets"><span class="event-pet pet-3">Max Jones</span></div>
      </span>
    </a>
    <a class="day-event a-JKL012"
       data-id="JKL012"
       data-ts="1234567893"
       href="/schedule/a/JKL012/1234567893"
       data-event_type="1"
       data-status="1">
      <div class="time"><div class="day-event-time">Dec 24, 5:00pm - Dec 26, 10:00am</div></div>
      <div class="day-event-title">12/24-12/26am</div>
      <span class="pets">
        <span class="event-client-wrapper"><span class="event-client">Alice Brown</span></span>
        <div class="event-pets"><span class="event-pet pet-4">Bella Brown</span></div>
      </span>
    </a>
  </div>
  <div class="pagination">
    <a href="/schedule?page=1" class="prev">Previous</a>
    <a href="/schedule?page=3" class="next">Next</a>
  </div>
</body>
</html>
`;

export const mockSchedulePageNoPagination = `
<!DOCTYPE html>
<html>
<head><title>Schedule</title></head>
<body>
  <div class="schedule">
    <a class="day-event a-ABC123"
       data-id="ABC123"
       data-ts="1234567890"
       href="/schedule/a/ABC123/1234567890"
       data-event_type="1"
       data-status="6">
      <div class="time"><div class="day-event-time">Dec 21, 5:00pm - Dec 23, 10:00am</div></div>
      <div class="day-event-title">12/21-12/23am</div>
      <span class="pets">
        <span class="event-client-wrapper"><span class="event-client">John Smith</span></span>
        <div class="event-pets"><span class="event-pet pet-1">Luna Smith</span></div>
      </span>
    </a>
  </div>
</body>
</html>
`;

// mockAppointmentPage uses the verified real HTML structure from the external site.
// Selectors confirmed against actual appointment page C63QgKsK (Feb 19, 2026).
//
// Key structural notes:
//  - "Boarding (Nights)" pages have NO <h1>; service_type falls back to <title> tag
//  - status (.appt-change-status) has an <i> child — extractText captures empty string → null
//  - dates come from #when-wrapper Unix timestamps (data-start_scheduled / data-end_scheduled)
//    1766336400 = 2025-12-21T17:00:00Z, 1766484000 = 2025-12-23T10:00:00Z
//  - phone is the raw E.164 value from data-value on .mobile-contact
//  - all label-based fields use <div class="field-label"> / <div class="field-value"> pairs
export const mockAppointmentPage = `
<!DOCTYPE html>
<html>
<head><title>Boarding (Nights) | A Girl and Your Dog</title></head>
<body>
  <!-- No h1 on "Boarding (Nights)" pages — service_type uses <title> fallback -->

  <!-- Status anchor has <i> child; extractText returns null for this field (known limitation) -->
  <a class="appt-change-status"><i class="icon-status"></i> Scheduled</a>

  <!-- Timing: Unix timestamps (seconds) on #when-wrapper -->
  <div id="when-wrapper"
       data-start_scheduled="1766336400"
       data-end_scheduled="1766484000">
    <span class="scheduled-duration">(Scheduled: 2 d)</span>
  </div>

  <!-- Client info -->
  <span class="event-client">John Smith</span>
  <button class="message-client" data-emails= "john.smith@example.com">Message</button>
  <a class="mobile-contact" data-value="+15551234567">Call</a>
  <div class="client-address" data-address="123 Main St, Austin, TX 78701"></div>

  <!-- Pet info -->
  <span class="event-pet">Luna</span>

  <!-- Field label/value pairs (verified real HTML structure) -->
  <div class="field-label">Access Home or Apartment</div>
  <div class="field-value">Gate code is 1234, key under mat</div>

  <div class="field-label">Drop Off</div>
  <div class="field-value">Please arrive between 4-6 PM</div>

  <div class="field-label">Breed(s)</div>
  <div class="field-value">Golden Retriever</div>

  <div class="field-label">Birthdate</div>
  <div class="field-value">March 15, 2020</div>

  <div class="field-label">Food Allergies</div>
  <div class="field-value">Grain-free diet, no chicken</div>

  <div class="field-label">Health and Mobility</div>
  <div class="field-value">Healthy, high energy</div>

  <div class="field-label">Medications</div>
  <div class="field-value">None</div>

  <div class="field-label">Behavioral</div>
  <div class="field-value">Friendly with other dogs</div>

  <div class="field-label">Bite History</div>
  <div class="field-value">None</div>

  <div class="field-label">Veterinarian</div>
  <div class="field-value">Austin Pet Clinic, (555) 987-6543</div>

  <!-- Appointment notes -->
  <div class="notes-wrapper">
    <div class="note">Luna loves belly rubs!</div>
  </div>
</body>
</html>
`;

export const mockAppointmentPageMinimal = `
<!DOCTYPE html>
<html>
<head><title>Boarding | A Girl and Your Dog</title></head>
<body>
  <h1>Boarding</h1>
</body>
</html>
`;

export const mockExternalAppointments = [
  {
    external_id: 'ABC123',
    service_type: 'Boarding (Nights)',
    status: 'Scheduled',
    check_in_datetime: '2025-12-21T17:00:00.000Z',
    check_out_datetime: '2025-12-23T10:00:00.000Z',
    duration: '2 nights',
    client_name: 'John Smith',
    client_email_primary: 'john.smith@example.com',
    pet_name: 'Luna',
    pet_breed: 'Golden Retriever',
  },
  {
    external_id: 'DEF456',
    service_type: 'Boarding (Nights)',
    status: 'Scheduled',
    check_in_datetime: '2025-12-22T17:00:00.000Z',
    check_out_datetime: '2025-12-25T10:00:00.000Z',
    duration: '3 nights',
    client_name: 'Jane Doe',
    client_email_primary: 'jane@example.com',
    pet_name: 'Cooper',
    pet_breed: 'Labrador',
  },
];

// ---------------------------------------------------------------------------
// Pricing fixtures (REQ-200)
// ---------------------------------------------------------------------------

// Appointment page with two pricing line items: one night service, one day service.
// Night: "Boarding" ($55/night × 10 nights = $550), data-rate in cents (5500 ÷ 100 = $55),
//        data-qty × 100 (1000 ÷ 100 = 10 nights)
// Day:   "Boarding (Days)" ($50/day × 4 days = $200), data-rate="5000.00" (decimal string ok)
// Total: $750
export const mockAppointmentPageWithPricing = `
<!DOCTYPE html>
<html>
<head><title>Boarding (Nights) | A Girl and Your Dog</title></head>
<body>
  <div id="when-wrapper" data-start_scheduled="1766336400" data-end_scheduled="1766484000"></div>
  <span class="event-pet">Maverick</span>
  <span class="event-client">Sasha Basso</span>
  <fieldset id="confirm-price" class="no-legend">
    <a class="btn toggle-field text quote">Total $750 <i class="fa fa-fw"></i></a>
    <div class="toggle-field-content hidden">
      <div class="service-wrapper" data-service="22215-0">
        <span class="service-name">Boarding</span>
        <div class="price p-0 has-outstanding" data-amount="550.00" data-rate="5500" data-qty="1000">
          <span class="qty-rate">$55 x 10</span>
        </div>
      </div>
      <div class="service-wrapper" data-service="11778-0">
        <span class="service-name"> Boarding (Days)</span>
        <div class="price p-1 has-outstanding" data-amount="200.00" data-rate="5000.00" data-qty="400.00">
          <span class="qty-rate">$50 x 4</span>
        </div>
      </div>
    </div>
  </fieldset>
</body>
</html>
`;

// Single pricing line item — cannot classify as night or day (REQ-200 rule)
export const mockPricingSingleLine = `
<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $550 <i class="fa fa-fw"></i></a>
  <div class="toggle-field-content hidden">
    <div class="service-wrapper" data-service="22215-0">
      <span class="service-name">Boarding</span>
      <div class="price p-0 has-outstanding" data-amount="550.00" data-rate="5500" data-qty="1000">
        <span class="qty-rate">$55 x 10</span>
      </div>
    </div>
  </div>
</fieldset>
`;

// Pricing section with unparseable total
export const mockPricingBadTotal = `
<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total TBD <i class="fa fa-fw"></i></a>
  <div class="toggle-field-content hidden">
    <div class="service-wrapper" data-service="1-0">
      <span class="service-name">Boarding</span>
      <div class="price p-0 has-outstanding" data-amount="550.00" data-rate="5500" data-qty="1000">
        <span class="qty-rate">$55 x 10</span>
      </div>
    </div>
  </div>
</fieldset>
`;

// Pricing section missing data-qty on first item (malformed line item)
export const mockPricingMalformedItem = `
<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $200 <i class="fa fa-fw"></i></a>
  <div class="toggle-field-content hidden">
    <div class="service-wrapper" data-service="1-0">
      <span class="service-name">Boarding</span>
      <div class="price p-0 has-outstanding" data-amount="550.00" data-rate="5500">
        <span class="qty-rate">missing qty</span>
      </div>
    </div>
    <div class="service-wrapper" data-service="2-0">
      <span class="service-name">Boarding (Days)</span>
      <div class="price p-1 has-outstanding" data-amount="200.00" data-rate="5000" data-qty="400">
        <span class="qty-rate">$50 x 4</span>
      </div>
    </div>
  </div>
</fieldset>
`;

// Decimal total
export const mockPricingDecimalTotal = `
<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $750.50 <i class="fa fa-fw"></i></a>
  <div class="toggle-field-content hidden">
    <div class="service-wrapper" data-service="1-0">
      <span class="service-name">Boarding</span>
      <div class="price p-0 has-outstanding" data-amount="750.50" data-rate="5500" data-qty="1000">
        <span class="qty-rate">$55 x 10</span>
      </div>
    </div>
  </div>
</fieldset>
`;

// Multi-pet pricing fixture: 2 pets (Mochi + Marlee), 2 services.
// The `pets-2` class on the wrapper signals 2 price divs per service.
// Nights: Mochi @ $55 × 8 = $440, Marlee @ $45 × 8 = $360 → combined $800
// Days:   Mochi @ $50 × 1 = $50,  Marlee @ $50 × 1 = $35  → combined $85
// Total:  $885
export const mockPricingMultiPet = `
<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $885 <i class="fa fa-fw"></i></a>
  <div class="pricing-appt-wrapper pets-2 services-2">
    <div class="service-wrapper">
      <span class="service-name">Boarding discounted nights for DC full-time</span>
      <div class="price p-0 has-outstanding" data-rate="5500" data-qty="800" data-amount="440.00"></div>
      <div class="price p-1 has-outstanding" data-rate="4500" data-qty="800" data-amount="360.00"></div>
    </div>
    <div class="service-wrapper">
      <span class="service-name">Boarding (Days)</span>
      <div class="price p-2 has-outstanding" data-rate="5000" data-qty="100" data-amount="50.00"></div>
      <div class="price p-3 has-outstanding" data-rate="5000" data-qty="100" data-amount="35.00"></div>
    </div>
  </div>
</fieldset>
`;

// Pricing section where service names exist but price divs use a non-matching class.
// Simulates a site structure change — should trigger a throw (not silent null).
export const mockPricingNoPriceDivs = `
<fieldset id="confirm-price" class="no-legend">
  <a class="btn toggle-field text quote">Total $550 <i class="fa fa-fw"></i></a>
  <div class="toggle-field-content hidden">
    <div class="service-wrapper" data-service="1-0">
      <span class="service-name">Boarding</span>
      <div class="pricing-row" data-amount="550.00" data-rate="5500" data-qty="1000">
        <span class="qty-rate">$55 x 10</span>
      </div>
    </div>
  </div>
</fieldset>
`;

// External appointment data with pricing (for mapping tests)
export const mockExternalAppointmentWithPricing = {
  external_id: 'PRC123',
  pet_name: 'Maverick',
  check_in_datetime: '2026-02-13T00:00:00.000Z',
  check_out_datetime: '2026-02-18T00:00:00.000Z',
  pricing: {
    total: 750,
    lineItems: [
      { serviceName: 'Boarding', rate: 55, qty: 10, amount: 550 },
      { serviceName: 'Boarding (Days)', rate: 50, qty: 4, amount: 200 },
    ],
  },
};

// External appointment data without pricing
export const mockExternalAppointmentNoPricing = {
  external_id: 'NOP123',
  pet_name: 'Luna',
  check_in_datetime: '2026-02-15T00:00:00.000Z',
  check_out_datetime: '2026-02-20T00:00:00.000Z',
  pricing: null,
};

// Two-line pricing where line 1 has "DC" mid-phrase (not at start of service name).
// Real-world case: "Boarding discounted nights for DC full-time" is a night service
// but previously false-positived against /DC /i. Line 2 is a genuine day service.
export const mockExternalAppointmentDcMidPhrase = {
  external_id: 'DCM123',
  pet_name: 'Captain',
  check_in_datetime: '2026-03-01T00:00:00.000Z',
  check_out_datetime: '2026-03-06T00:00:00.000Z',
  pricing: {
    total: 375,
    lineItems: [
      { serviceName: 'Boarding discounted nights for DC full-time', rate: 55, qty: 5, amount: 275 },
      { serviceName: 'Boarding (Days)', rate: 50, qty: 2, amount: 100 },
    ],
  },
};

// Single-line pricing (total only, no night/day breakdown)
export const mockExternalAppointmentSingleLinePricing = {
  external_id: 'SNG123',
  pet_name: 'Cooper',
  check_in_datetime: '2026-02-10T00:00:00.000Z',
  check_out_datetime: '2026-02-15T00:00:00.000Z',
  pricing: {
    total: 550,
    lineItems: [
      { serviceName: 'Boarding', rate: 55, qty: 10, amount: 550 },
    ],
  },
};

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
