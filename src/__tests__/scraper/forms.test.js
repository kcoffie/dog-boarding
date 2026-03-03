/**
 * Forms scraper tests
 * @requirements REQ-501, REQ-502, REQ-503, REQ-504, REQ-505
 */

import { describe, it, expect } from 'vitest';
import {
  parseFormsListPage,
  parseFormDetailPage,
  parseMMDDYYYYtoISO,
  findFormForBoarding,
} from '../../lib/scraper/forms.js';

// ---------------------------------------------------------------------------
// Fixtures — modelled on the actual external site structure
// ---------------------------------------------------------------------------

// /pets/90043/forms — Lilly O'Brien — 8 submissions for form 7913
const FORMS_LIST_HTML = `
<!DOCTYPE html>
<html>
<head><title>Forms - Lilly O'Brien</title></head>
<body>
<div class="forms-list">
  <h2>Boarding Information Form</h2>
  <div class="dt-header dt-row">
    <div class="dt-cell">Date Submitted</div>
    <div class="dt-cell">Form</div>
    <div class="dt-cell">View</div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">2/12/2026</div>
    <div class="dt-cell">Boarding Information Form</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/215">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">1/15/2026</div>
    <div class="dt-cell">Boarding Information Form</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/209">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">12/20/2025</div>
    <div class="dt-cell">Boarding Information Form</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/198">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">11/5/2025</div>
    <div class="dt-cell">Boarding Information Form</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/187">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">10/3/2025</div>
    <div class="dt-cell">Boarding Information Form</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/176">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">8/14/2025</div>
    <div class="dt-cell">Boarding Information Form</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/165">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">7/1/2025</div>
    <div class="dt-cell">Boarding Information Form</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/154">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">5/22/2025</div>
    <div class="dt-cell">Boarding Information Form</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/143">View</a></div>
  </div>
</div>
</body>
</html>
`;

// HTML with both form 7913 and form 11752 ("Pet Info Card")
const FORMS_LIST_MIXED_HTML = `
<!DOCTYPE html>
<html>
<body>
<div class="forms-list">
  <div class="dt-row frm-pets">
    <div class="dt-cell">2/12/2026</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/215">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">1/5/2026</div>
    <div class="dt-cell"><a href="/pets/90043/forms/11752/view/201">View</a></div>
  </div>
  <div class="dt-row frm-pets">
    <div class="dt-cell">12/20/2025</div>
    <div class="dt-cell"><a href="/pets/90043/forms/7913/view/198">View</a></div>
  </div>
</div>
</body>
</html>
`;

// /pets/90043/forms/7913/view/215 — full detail form
const FORM_DETAIL_HTML = `
<!DOCTYPE html>
<html>
<head><title>Boarding Information Form</title></head>
<body>
<div class="form-meta">
  <span class="form-submitted">submitted: 2/12/2026</span>
</div>
<div class="divtable dt-view profile-info">
  <div id="field_184366-wrapper" class="dt-row field-row">
    <div class="field-label">CONFIRM ARRIVAL DATE</div>
    <div class="field-value">2/13/2026</div>
  </div>
  <div id="field_184367-wrapper" class="dt-row field-row">
    <div class="field-label">CONFIRM DEPARTURE DATE</div>
    <div class="field-value">2/17/2026</div>
  </div>
  <div id="field_239541-wrapper" class="dt-row field-row">
    <div class="field-label">ARRIVAL TIME</div>
    <div class="field-value">Between 4-6pm</div>
  </div>
  <div id="field_239567-wrapper" class="dt-row field-row">
    <div class="field-label">DEPARTURE TIME</div>
    <div class="field-value">Morning pickup preferred</div>
  </div>
  <div id="field_184360-wrapper" class="dt-row field-row">
    <div class="field-label">FEEDING INSTRUCTIONS</div>
    <div class="field-value">1 can wet food small amount of dry food separately</div>
  </div>
  <div id="field_184362-wrapper" class="dt-row field-row">
    <div class="field-label">MEDICATIONS/MEDICAL CONDITION</div>
    <div class="field-value">None</div>
  </div>
  <div id="field_184363-wrapper" class="dt-row field-row">
    <div class="field-label">TRAVEL DETAILS AND BEST CONTACT</div>
    <div class="field-value">Flying to Mexico. Cell: 555-123-4567</div>
  </div>
  <div id="field_184364-wrapper" class="dt-row field-row">
    <div class="field-label">EMERGENCY CONTACT</div>
    <div class="field-value">Jane Smith - 555-987-6543</div>
  </div>
  <div id="field_184365-wrapper" class="dt-row field-row">
    <div class="field-label">VETERINARIAN</div>
    <div class="field-value">City Vet Clinic - 555-111-2222</div>
  </div>
</div>
</body>
</html>
`;

// ---------------------------------------------------------------------------
// parseFormsListPage
// ---------------------------------------------------------------------------

describe('parseFormsListPage()', () => {
  it('returns 8 submissions from list HTML', () => {
    const submissions = parseFormsListPage(FORMS_LIST_HTML);
    expect(submissions).toHaveLength(8);
  });

  it('first submission has id=215 and date=2/12/2026', () => {
    const submissions = parseFormsListPage(FORMS_LIST_HTML);
    expect(submissions[0].submissionId).toBe(215);
    expect(submissions[0].submittedDate).toBe('2/12/2026');
  });

  it('submission URLs contain the correct path', () => {
    const submissions = parseFormsListPage(FORMS_LIST_HTML);
    expect(submissions[0].submissionUrl).toBe('/pets/90043/forms/7913/view/215');
    expect(submissions[1].submissionId).toBe(209);
  });

  it('filters to form 7913 only (excludes form 11752)', () => {
    const submissions = parseFormsListPage(FORMS_LIST_MIXED_HTML);
    // Should have 2 (7913 form) and 0 from form 11752
    expect(submissions).toHaveLength(2);
    expect(submissions.every(s => s.submissionUrl.includes('/forms/7913/'))).toBe(true);
  });

  it('returns empty array for HTML with no form links', () => {
    const submissions = parseFormsListPage('<html><body><p>No forms</p></body></html>');
    expect(submissions).toHaveLength(0);
  });

  it('deduplicates repeated submission IDs', () => {
    const html = `
      <a href="/pets/90043/forms/7913/view/215">View</a>
      <a href="/pets/90043/forms/7913/view/215">View again</a>
      <a href="/pets/90043/forms/7913/view/209">View</a>
    `;
    const submissions = parseFormsListPage(html);
    expect(submissions).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// parseFormDetailPage
// ---------------------------------------------------------------------------

describe('parseFormDetailPage()', () => {
  it('extracts form_arrival_date from field_184366', () => {
    const result = parseFormDetailPage(FORM_DETAIL_HTML);
    expect(result.form_arrival_date).toBe('2026-02-13');
  });

  it('extracts form_departure_date from field_184367', () => {
    const result = parseFormDetailPage(FORM_DETAIL_HTML);
    expect(result.form_departure_date).toBe('2026-02-17');
  });

  it('extracts feeding instructions value for field_184360', () => {
    const result = parseFormDetailPage(FORM_DETAIL_HTML);
    const feedingField = result.allFields.find(f => f.fieldId === 'field_184360');
    expect(feedingField).toBeDefined();
    expect(feedingField.value).toBe('1 can wet food small amount of dry food separately');
  });

  it('extracts formSubmittedAt from .form-submitted', () => {
    const result = parseFormDetailPage(FORM_DETAIL_HTML);
    expect(result.formSubmittedAt).toBe('2/12/2026');
  });

  it('returns allFields array with expected length', () => {
    const result = parseFormDetailPage(FORM_DETAIL_HTML);
    // 9 field divs in FORM_DETAIL_HTML
    expect(result.allFields.length).toBe(9);
  });

  it('returns null dates for form with no date fields', () => {
    const html = '<html><body><div class="form-meta"><span class="form-submitted">submitted: 3/1/2026</span></div></body></html>';
    const result = parseFormDetailPage(html);
    expect(result.form_arrival_date).toBeNull();
    expect(result.form_departure_date).toBeNull();
    expect(result.formSubmittedAt).toBe('3/1/2026');
  });
});

// ---------------------------------------------------------------------------
// parseMMDDYYYYtoISO
// ---------------------------------------------------------------------------

describe('parseMMDDYYYYtoISO()', () => {
  it('converts 2/13/2026 → 2026-02-13', () => {
    expect(parseMMDDYYYYtoISO('2/13/2026')).toBe('2026-02-13');
  });

  it('converts 12/1/2025 → 2025-12-01', () => {
    expect(parseMMDDYYYYtoISO('12/1/2025')).toBe('2025-12-01');
  });

  it('returns null for null input', () => {
    expect(parseMMDDYYYYtoISO(null)).toBeNull();
  });

  it('returns null for unparseable string', () => {
    expect(parseMMDDYYYYtoISO('not a date')).toBeNull();
    expect(parseMMDDYYYYtoISO('')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findFormForBoarding
// ---------------------------------------------------------------------------

describe('findFormForBoarding()', () => {
  const makeBoarding = (arrivalDateStr) => ({
    arrival_datetime: new Date(arrivalDateStr + 'T12:00:00').toISOString(),
    departure_datetime: new Date(arrivalDateStr + 'T12:00:00').toISOString(),
  });

  it('returns null for empty submissions array', () => {
    const boarding = makeBoarding('2026-02-13');
    expect(findFormForBoarding([], boarding)).toBeNull();
  });

  it('returns null for null submissions', () => {
    const boarding = makeBoarding('2026-02-13');
    expect(findFormForBoarding(null, boarding)).toBeNull();
  });

  it('returns submission submitted 1 day before arrival (within 7-day window)', () => {
    // Feb 12 submitted, Feb 13 arrival → 1 day before → in window
    const submissions = [
      { submissionId: 215, submittedDate: '2/12/2026' },
      { submissionId: 209, submittedDate: '1/15/2026' },
    ];
    const boarding = makeBoarding('2026-02-13');
    expect(findFormForBoarding(submissions, boarding)).toBe(215);
  });

  it('returns submission submitted exactly 7 days before arrival', () => {
    // Feb 13 arrival − 7 days = Feb 6 → boundary, should be included
    const submissions = [
      { submissionId: 215, submittedDate: '2/6/2026' },
    ];
    const boarding = makeBoarding('2026-02-13');
    expect(findFormForBoarding(submissions, boarding)).toBe(215);
  });

  it('returns null when best submission is 8 days before arrival (outside window)', () => {
    // Feb 12 arrival − 8 days = Feb 4 → outside window
    const submissions = [
      { submissionId: 215, submittedDate: '2/4/2026' },
      { submissionId: 209, submittedDate: '1/15/2026' },
    ];
    const boarding = makeBoarding('2026-02-12');
    expect(findFormForBoarding(submissions, boarding)).toBeNull();
  });

  it('returns null when all submissions are after boarding arrival (no fallback)', () => {
    const submissions = [
      { submissionId: 215, submittedDate: '3/1/2026' },
      { submissionId: 209, submittedDate: '2/15/2026' },
    ];
    // Boarding arrival Jan 1 — both submissions are after → no fallback
    const boarding = makeBoarding('2026-01-01');
    expect(findFormForBoarding(submissions, boarding)).toBeNull();
  });

  it('includes submissions submitted on the same day as boarding arrival', () => {
    // Submitted Feb 13 = arrival day → in window
    const submissions = [
      { submissionId: 215, submittedDate: '2/13/2026' },
    ];
    const boarding = makeBoarding('2026-02-13');
    expect(findFormForBoarding(submissions, boarding)).toBe(215);
  });

  it('excludes submissions with no submitted date', () => {
    const submissions = [
      { submissionId: 215, submittedDate: null },
      { submissionId: 209, submittedDate: '1/15/2026' },
    ];
    // 215 has no date → excluded. 209 is Jan 15, boarding Feb 13 → 29 days before → outside window
    const boarding = makeBoarding('2026-02-13');
    expect(findFormForBoarding(submissions, boarding)).toBeNull();
  });

  it('returns most recent when multiple submissions are within the window', () => {
    // Both within 7 days of Feb 13; submissions are newest-first → 215 returned
    const submissions = [
      { submissionId: 215, submittedDate: '2/12/2026' },
      { submissionId: 209, submittedDate: '2/8/2026' },
    ];
    const boarding = makeBoarding('2026-02-13');
    expect(findFormForBoarding(submissions, boarding)).toBe(215);
  });
});

// ---------------------------------------------------------------------------
// date_mismatch detection
// ---------------------------------------------------------------------------

describe('date_mismatch detection logic', () => {
  it('detects mismatch when form dates differ from booking dates', () => {
    // Form says Feb 15–19, booking says Feb 13–17
    const form_arrival_date = '2026-02-15';
    const form_departure_date = '2026-02-19';
    const boardingArrivalISO = '2026-02-13';
    const boardingDepartureISO = '2026-02-17';

    const date_mismatch =
      (form_arrival_date !== null && form_arrival_date !== boardingArrivalISO) ||
      (form_departure_date !== null && form_departure_date !== boardingDepartureISO);

    expect(date_mismatch).toBe(true);
    // form dates are stored (form wins)
    expect(form_arrival_date).toBe('2026-02-15');
  });

  it('no mismatch when form dates match booking dates exactly', () => {
    const form_arrival_date = '2026-02-13';
    const form_departure_date = '2026-02-17';
    const boardingArrivalISO = '2026-02-13';
    const boardingDepartureISO = '2026-02-17';

    const date_mismatch =
      (form_arrival_date !== null && form_arrival_date !== boardingArrivalISO) ||
      (form_departure_date !== null && form_departure_date !== boardingDepartureISO);

    expect(date_mismatch).toBe(false);
  });

  it('no mismatch when form dates are null (no date fields in form)', () => {
    const form_arrival_date = null;
    const form_departure_date = null;
    const boardingArrivalISO = '2026-02-13';
    const boardingDepartureISO = '2026-02-17';

    const date_mismatch =
      (form_arrival_date !== null && form_arrival_date !== boardingArrivalISO) ||
      (form_departure_date !== null && form_departure_date !== boardingDepartureISO);

    expect(date_mismatch).toBe(false);
  });
});
