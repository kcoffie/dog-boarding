/**
 * Tests for the daytime schedule parser (v4.0 Activity Intelligence).
 * @requirements REQ-600, REQ-601
 *
 * parseDaytimeSchedulePage is a pure function — all tests use fixture HTML
 * strings and require no mocking, no I/O, no Supabase client.
 *
 * @requirements REQ-v4.0
 */

import { describe, it, expect } from 'vitest';
import { parseDaytimeSchedulePage } from '../../lib/scraper/daytimeSchedule.js';

// ---------------------------------------------------------------------------
// Timestamp constants
// 1772668800 = 2026-03-05 00:00:00 UTC  (day column midnight)
// 1772755200 = 2026-03-06 00:00:00 UTC  (day column midnight, next day)
// 1772697600 = 2026-03-05 08:00:00 UTC  (actual 8am check-in)
// ---------------------------------------------------------------------------
const TS_MAR5 = 1772668800;
const TS_MAR6 = 1772755200;
const TS_8AM  = 1772697600;

// ---------------------------------------------------------------------------
// HTML builder helpers — construct minimal but realistic event <a> blocks
// ---------------------------------------------------------------------------

/**
 * Build a single day-event <a> block matching the external site's structure.
 * All params are optional; sensible defaults are provided.
 */
function buildEvent({
  id         = 'C63QgUnJ',
  series     = 'C63QgUl0',
  dayTs      = TS_MAR5,
  startTs    = TS_8AM,
  status     = 1,
  classes    = 'day-event ew-61023 cat-5634 ser-10692',
  title      = 'DC:FT',
  time       = '8am - 6pm',
  clientUid  = 12345,
  clientName = 'Kate Coffie',
  pets       = [{ id: 90043, name: 'Benny' }],
} = {}) {
  const petHtml = pets
    .map(
      p => `
      <div class="event-pet-wrapper" data-pet="${p.id}">
        <span class="event-pet">${p.name}</span>
      </div>`
    )
    .join('');

  return `
<a href="/schedule/a/${id}/${dayTs}"
   data-id="${id}"
   data-series="${series}"
   data-ts="${dayTs}"
   data-start="${startTs}"
   data-status="${status}"
   class="${classes}">
  <div class="day-event-title">${title}</div>
  <div class="day-event-time">${time}</div>
  <div class="event-clients-pets" data-uid="${clientUid}">
    <span class="event-client">${clientName}</span>
    ${petHtml}
  </div>
</a>`;
}

/** Wrap one or more event blocks in a minimal schedule page shell. */
function buildPage(...events) {
  return `<html><body><div class="schedule-grid">${events.join('\n')}</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseDaytimeSchedulePage()', () => {
  // --- Basic behaviour ---

  it('returns an empty array for empty HTML', () => {
    expect(parseDaytimeSchedulePage('')).toEqual([]);
    expect(parseDaytimeSchedulePage('<html><body></body></html>')).toEqual([]);
  });

  it('returns an empty array when no day-event links are present', () => {
    const html = '<html><body><a href="/schedule">Home</a></body></html>';
    expect(parseDaytimeSchedulePage(html)).toEqual([]);
  });

  // --- Field extraction: DC event ---

  it('parses all fields from a Daycare event', () => {
    const html = buildPage(buildEvent());
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.external_id).toBe('C63QgUnJ');
    expect(appt.series_id).toBe('C63QgUl0');
    expect(appt.appointment_date).toBe('2026-03-05');
    expect(appt.worker_external_id).toBe(61023);
    expect(appt.service_category).toBe('DC');
    expect(appt.service_cat_id).toBe(5634);
    expect(appt.service_id).toBe(10692);
    expect(appt.title).toBe('DC:FT');
    expect(appt.status).toBe(1);
    expect(appt.start_ts).toBe(TS_8AM);
    expect(appt.day_ts).toBe(TS_MAR5);
    expect(appt.display_time).toBe('8am - 6pm');
    expect(appt.client_uid).toBe(12345);
    expect(appt.client_name).toBe('Kate Coffie');
    expect(appt.pet_ids).toEqual([90043]);
    expect(appt.pet_names).toEqual(['Benny']);
    expect(appt.is_pickup).toBe(false);
    expect(appt.is_multiday_start).toBe(false);
    expect(appt.is_multiday_end).toBe(false);
  });

  // --- Service category resolution ---

  it('resolves service_category="PG" for cat-7431 / ser-15824', () => {
    const html = buildPage(buildEvent({ classes: 'day-event ew-208669 cat-7431 ser-15824' }));
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.service_category).toBe('PG');
    expect(appt.service_cat_id).toBe(7431);
    expect(appt.service_id).toBe(15824);
  });

  it('resolves service_category="Boarding" for cat-5635 / ser-17357', () => {
    const html = buildPage(
      buildEvent({ classes: 'day-event ew-0 cat-5635 ser-17357', title: '3/3-3/7pm' })
    );
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.service_category).toBe('Boarding');
    expect(appt.worker_external_id).toBe(0);
  });

  it('sets service_category=null and still parses event for an unknown cat-id', () => {
    // cat-9999 is not in SERVICE_CATS — parser should warn and continue
    const html = buildPage(
      buildEvent({ id: 'UNKNOWN1', classes: 'day-event ew-61023 cat-9999 ser-99999' }),
      buildEvent({ id: 'KNOWN1' })  // should still be parsed
    );
    const results = parseDaytimeSchedulePage(html);

    expect(results).toHaveLength(2);
    const unknown = results.find(a => a.external_id === 'UNKNOWN1');
    expect(unknown.service_category).toBeNull();
    expect(unknown.service_cat_id).toBe(9999);
  });

  // --- Multi-event page ---

  it('returns all events from a page with multiple events', () => {
    const html = buildPage(
      buildEvent({ id: 'AAA111', series: 'A1' }),
      buildEvent({ id: 'BBB222', series: 'B2', classes: 'day-event ew-208669 cat-7431 ser-15824' }),
      buildEvent({ id: 'CCC333', series: 'C3', classes: 'day-event ew-0 cat-5635 ser-17357' })
    );
    const results = parseDaytimeSchedulePage(html);

    expect(results).toHaveLength(3);
    expect(results.map(a => a.external_id)).toEqual(['AAA111', 'BBB222', 'CCC333']);
  });

  // --- Multi-day span ---

  it('emits two rows when the same external_id appears in two day columns', () => {
    // Boarding spans Mar 5 → Mar 6: same data-id, different data-ts
    const html = buildPage(
      buildEvent({ id: 'SPAN01', dayTs: TS_MAR5, classes: 'day-event ew-0 cat-5635 ser-17357 appt-after' }),
      buildEvent({ id: 'SPAN01', dayTs: TS_MAR6, classes: 'day-event ew-0 cat-5635 ser-17357 appt-before' })
    );
    const results = parseDaytimeSchedulePage(html);

    expect(results).toHaveLength(2);
    expect(results[0].appointment_date).toBe('2026-03-05');
    expect(results[1].appointment_date).toBe('2026-03-06');
    // Both rows share the same external_id
    expect(results[0].external_id).toBe('SPAN01');
    expect(results[1].external_id).toBe('SPAN01');
  });

  it('sets is_multiday_start=true for appt-after class', () => {
    const html = buildPage(
      buildEvent({ classes: 'day-event ew-0 cat-5635 ser-17357 appt-after' })
    );
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.is_multiday_start).toBe(true);
    expect(appt.is_multiday_end).toBe(false);
  });

  it('sets is_multiday_end=true for appt-before class', () => {
    const html = buildPage(
      buildEvent({ classes: 'day-event ew-0 cat-5635 ser-17357 appt-before' })
    );
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.is_multiday_start).toBe(false);
    expect(appt.is_multiday_end).toBe(true);
  });

  it('sets both multiday flags for a middle-day span (appt-before appt-after)', () => {
    const html = buildPage(
      buildEvent({ classes: 'day-event ew-0 cat-5635 ser-17357 appt-before appt-after' })
    );
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.is_multiday_start).toBe(true);
    expect(appt.is_multiday_end).toBe(true);
  });

  // --- Pick-up detection ---

  it('sets is_pickup=true when title contains "Pick-Up"', () => {
    const html = buildPage(buildEvent({ title: 'Pick-Up 9AM-10AM', time: '9am - 10am' }));
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.is_pickup).toBe(true);
  });

  it('sets is_pickup=true when display_time contains "pick-up" (case-insensitive)', () => {
    const html = buildPage(buildEvent({ title: 'DC:FT', time: 'pick-up ( 9 am - 10 am )' }));
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.is_pickup).toBe(true);
  });

  // --- Multiple pets ---

  it('extracts all pet IDs and names when an event has multiple pets', () => {
    const html = buildPage(
      buildEvent({
        pets: [
          { id: 11111, name: 'Chester' },
          { id: 22222, name: 'Billy' },
          { id: 33333, name: 'Buddy' },
        ],
      })
    );
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.pet_ids).toEqual([11111, 22222, 33333]);
    expect(appt.pet_names).toEqual(['Chester', 'Billy', 'Buddy']);
  });

  // --- Graceful degradation ---

  it('stores the event and still parses when worker uid is unknown', () => {
    // uid 999999 is not in KNOWN_WORKERS — should warn and still return the event
    const html = buildPage(buildEvent({ classes: 'day-event ew-999999 cat-5634 ser-10692' }));
    const results = parseDaytimeSchedulePage(html);

    expect(results).toHaveLength(1);
    expect(results[0].worker_external_id).toBe(999999);
  });

  it('skips an event with a missing data-ts and still returns other events on the page', () => {
    // data-ts="0" → tsToDate returns null → event is skipped
    const badEvent = buildEvent({ id: 'BADT5', dayTs: 0 });
    const goodEvent = buildEvent({ id: 'GOODT5' });
    const html = buildPage(badEvent, goodEvent);
    const results = parseDaytimeSchedulePage(html);

    expect(results).toHaveLength(1);
    expect(results[0].external_id).toBe('GOODT5');
  });

  it('ignores <a data-id> links that are not /schedule/a/ appointment links', () => {
    // A nav link that happens to carry data-id should be filtered out
    const navLink = `<a href="/pets/90043/forms" data-id="irrelevant">Pet Forms</a>`;
    const apptEvent = buildEvent({ id: 'REAL01' });
    const html = buildPage(navLink, apptEvent);
    const results = parseDaytimeSchedulePage(html);

    expect(results).toHaveLength(1);
    expect(results[0].external_id).toBe('REAL01');
  });

  it('stores series_id as null when data-series is an empty string', () => {
    const html = buildPage(buildEvent({ series: '' }));
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.series_id).toBeNull();
  });

  it('stores start_ts as null when data-start is 0', () => {
    const html = buildPage(buildEvent({ startTs: 0 }));
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.start_ts).toBeNull();
  });

  // --- HTML entity decoding ---

  it('decodes &quot; in pet names to double-quote characters', () => {
    // Mirrors real data: &quot;Waldo&quot; Ralph McComb-Hernandez
    const html = buildPage(
      buildEvent({ pets: [{ id: 55555, name: '&quot;Waldo&quot; Ralph McComb-Hernandez' }] })
    );
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.pet_names).toEqual(['"Waldo" Ralph McComb-Hernandez']);
  });

  it("decodes &#x27; in pet names to apostrophes", () => {
    // Mirrors real data: Lilly O&#x27;Brien
    const html = buildPage(
      buildEvent({ pets: [{ id: 66666, name: "Lilly O&#x27;Brien" }] })
    );
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.pet_names).toEqual(["Lilly O'Brien"]);
  });

  it('decodes &amp; in client name', () => {
    const html = buildPage(buildEvent({ clientName: 'Smith &amp; Jones', pets: [{ id: 77777, name: 'Rex' }] }));
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.client_name).toBe('Smith & Jones');
  });

  // --- Staff Boarding / empty pets ---

  it('stores empty pet_ids and pet_names for Staff Boarding with no pet wrapper in HTML', () => {
    // Mirrors real "Goose 3/7-8(Sun)" Staff Boarding — source HTML has
    // <span class="pets"></span> with no event-pet-wrapper elements.
    const staffBoardingHtml = `
<a href="/schedule/a/C63QgTXx/${TS_MAR5}"
   data-id="C63QgTXx"
   data-series="C63QgTWl"
   data-ts="${TS_MAR5}"
   data-start="${TS_8AM}"
   data-status="1"
   class="day-event ew-0 cat-5635 ser-22387">
  <div class="day-event-title">Goose 3/7-8(Sun)</div>
  <div class="day-event-time">All day</div>
  <div class="event-clients-pets" data-uid="98765">
    <span class="event-client">Staff Member</span>
    <span class="pets"></span>
  </div>
</a>`;
    const html = buildPage(staffBoardingHtml);
    const [appt] = parseDaytimeSchedulePage(html);

    expect(appt.external_id).toBe('C63QgTXx');
    expect(appt.service_category).toBe('Boarding');
    expect(appt.pet_ids).toEqual([]);
    expect(appt.pet_names).toEqual([]);
  });
});
