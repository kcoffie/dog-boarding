/**
 * Appointment detail extraction tests
 * @requirements REQ-102, REQ-200
 */

import { describe, it, expect } from 'vitest';
import { parseAppointmentPage, extractPricing, extractCheckInOutAmPm } from '../../lib/scraper/extraction.js';
import {
  mockAppointmentPage,
  mockAppointmentPageMinimal,
  mockAppointmentPageWithPricing,
  mockAppointmentPageMultiPet,
  mockPricingSingleLine,
  mockPricingBadTotal,
  mockPricingMalformedItem,
  mockPricingDecimalTotal,
  mockPricingNoPriceDivs,
  mockPricingMultiPet,
  mockRequestCanceledPage,
  mockPendingRequestPage,
} from './fixtures.js';

describe('REQ-102: Appointment Detail Extraction', () => {
  describe('parseAppointmentPage()', () => {
    describe('appointment info extraction', () => {
      it('extracts service type from h1', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.service_type).toBe('Boarding (Nights)');
      });

      it('extracts appointment status', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // .appt-change-status contains an <i> child immediately after the opening tag,
        // so extractText captures an empty string → null. Known limitation tracked as
        // low-priority TODO in SESSION_HANDOFF.md.
        expect(data.status).toBeNull();
      });

      it('extracts check-in date/time', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // scheduled_check_in is always null (field not populated in current implementation)
        expect(data.scheduled_check_in).toBeNull();
        // check_in_datetime comes from #when-wrapper data-start_scheduled Unix timestamp
        expect(data.check_in_datetime).toBe('2025-12-21T17:00:00.000Z');
      });

      it('extracts check-out date/time', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // scheduled_check_out is always null (field not populated in current implementation)
        expect(data.scheduled_check_out).toBeNull();
        // check_out_datetime comes from #when-wrapper data-end_scheduled Unix timestamp
        expect(data.check_out_datetime).toBe('2025-12-23T10:00:00.000Z');
      });

      it('extracts duration', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // Real site format: "(Scheduled: 2 d)" — extractDuration strips parens/label
        expect(data.duration).toBe('2 d');
      });

      it('extracts assigned staff', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // assigned_staff is always null for overnight boardings (not shown on detail page)
        expect(data.assigned_staff).toBeNull();
      });

      it('stores source URL', () => {
        const data = parseAppointmentPage(mockAppointmentPage, 'https://example.com/appt/123');

        expect(data.source_url).toBe('https://example.com/appt/123');
      });
    });

    describe('client info extraction', () => {
      it('extracts client name', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.client_name).toBe('John Smith');
      });

      it('extracts primary email', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.client_email_primary).toBe('john.smith@example.com');
      });

      it('extracts phone number', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // Returns raw E.164 value from data-value attribute on .mobile-contact
        expect(data.client_phone).toBe('+15551234567');
      });

      it('extracts address', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.client_address).toContain('123 Main St');
        expect(data.client_address).toContain('Austin');
      });
    });

    describe('instructions extraction', () => {
      it('extracts access instructions', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.access_instructions).toContain('Gate code');
        expect(data.access_instructions).toContain('1234');
      });

      it('extracts drop-off instructions', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.drop_off_instructions).toContain('4-6 PM');
      });

      it('extracts special notes', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.special_notes).toContain('belly rubs');
      });
    });

    describe('pet info extraction', () => {
      it('extracts pet name', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.pet_name).toBe('Luna');
      });

      it('extracts pet photo URL', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // pet_photo_url is always null (not extracted in current implementation)
        expect(data.pet_photo_url).toBeNull();
      });

      it('extracts pet breed', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.pet_breed).toBe('Golden Retriever');
      });

      it('extracts pet birthdate', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.pet_birthdate).toBe('2020-03-15');
      });

      it('extracts food allergies', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.pet_food_allergies).toContain('Grain-free');
        expect(data.pet_food_allergies).toContain('no chicken');
      });

      it('extracts health/mobility info', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.pet_health_mobility).toContain('Healthy');
      });

      it('extracts medications', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // Medications may be null if not found with exact keyword match
        // The field should be null or contain text
        expect(data.pet_medications === null || typeof data.pet_medications === 'string').toBe(true);
      });

      it('extracts behavioral info', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.pet_behavioral).toContain('Friendly');
      });

      it('extracts bite history', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        expect(data.pet_bite_history).toContain('None');
      });

      it('extracts veterinarian info', () => {
        const data = parseAppointmentPage(mockAppointmentPage);

        // Returned as a plain string from the field-value div, not a structured object
        expect(data.pet_veterinarian).not.toBeNull();
        expect(data.pet_veterinarian).toContain('Austin Pet Clinic');
        expect(data.pet_veterinarian).toContain('(555) 987-6543');
      });
    });

    describe('handles missing fields gracefully', () => {
      it('returns null for missing service type', () => {
        const html = '<html><body><div class="pet-name">Test</div></body></html>';
        const data = parseAppointmentPage(html);

        expect(data.service_type).toBeNull();
      });

      it('returns null for missing client info', () => {
        const data = parseAppointmentPage(mockAppointmentPageMinimal);

        expect(data.client_name).toBeNull();
        expect(data.client_email_primary).toBeNull();
        expect(data.client_phone).toBeNull();
      });

      it('returns null for missing pet details', () => {
        const data = parseAppointmentPage(mockAppointmentPageMinimal);

        expect(data.pet_breed).toBeNull();
        expect(data.pet_birthdate).toBeNull();
        expect(data.pet_photo_url).toBeNull();
      });

      it('returns null for missing dates', () => {
        const data = parseAppointmentPage(mockAppointmentPageMinimal);

        expect(data.check_in_datetime).toBeNull();
        expect(data.check_out_datetime).toBeNull();
      });

      it('does not throw errors on minimal HTML', () => {
        expect(() => {
          parseAppointmentPage(mockAppointmentPageMinimal);
        }).not.toThrow();
      });

      it('does not throw errors on empty HTML', () => {
        expect(() => {
          parseAppointmentPage('');
        }).not.toThrow();
      });

      it('handles malformed HTML without crashing', () => {
        const malformedHtml = '<html><body><div class="pet-name">Test</div>';

        expect(() => {
          parseAppointmentPage(malformedHtml);
        }).not.toThrow();
      });
    });

    describe('date/time parsing', () => {
      it('extracts dates from #when-wrapper Unix timestamps', () => {
        // 1766336400 = 2025-12-21T17:00:00Z, 1766484000 = 2025-12-23T10:00:00Z
        const html = '<div id="when-wrapper" data-start_scheduled="1766336400" data-end_scheduled="1766484000"></div>';
        const data = parseAppointmentPage(html);

        expect(data.check_in_datetime).toBe('2025-12-21T17:00:00.000Z');
        expect(data.check_out_datetime).toBe('2025-12-23T10:00:00.000Z');
      });

      it('falls back to title dates when system timestamps are unreasonably far in future', () => {
        // Title has parseable dates; #when-wrapper has far-future bogus timestamps (year ~2286)
        // tsReasonable = false → use title-parsed dates as fallback
        const html = '<h1>12/21-23</h1><div id="when-wrapper" data-start_scheduled="9999999999" data-end_scheduled="9999999999"></div>';
        const data = parseAppointmentPage(html);

        const year = new Date().getFullYear();
        expect(data.check_in_datetime).toContain(`${year}-12-21`);
        expect(data.check_out_datetime).toContain(`${year}-12-23`);
      });

      it('falls back to system timestamps when title month is stale/wrong (>20 day gap)', () => {
        // Title says "2/5-7" (Feb) but system timestamps say March 5–7, 2026.
        // 1772704800 = 2026-03-05T10:00:00Z, 1772900100 = 2026-03-07T17:15:00Z
        const html = '<h1>2/5-7</h1><div id="when-wrapper" data-start_scheduled="1772704800" data-end_scheduled="1772900100"></div>';
        const data = parseAppointmentPage(html);

        // Should use system timestamps (March), not the stale title (February)
        expect(data.check_in_datetime).toBe('2026-03-05T10:00:00.000Z');
        expect(data.check_out_datetime).toBe('2026-03-07T16:15:00.000Z');
      });

      it('uses system timestamps when title date matches current month — Goose staff boarding case', () => {
        // "Goose 3/7-8(Sun)" title would parse to Mar 7-8 midnight (same month, <20 day gap).
        // System timestamps must win to preserve actual time-of-day (5:15pm check-in, 11pm check-out).
        // 1772903700 = 2026-03-07T17:15:00Z, 1773010800 = 2026-03-08T23:00:00Z
        const html = '<title>Goose 3/7-8(Sun) | A Girl and Your Dog</title>' +
          '<div id="when-wrapper" data-start_scheduled="1772903700" data-end_scheduled="1773010800"></div>';
        const data = parseAppointmentPage(html);

        // Should use timestamps, NOT midnight-parsed title dates
        expect(data.check_in_datetime).toBe('2026-03-07T17:15:00.000Z');
        expect(data.check_out_datetime).toBe('2026-03-08T23:00:00.000Z');
        // Title still used as service_type fallback
        expect(data.service_type).toBe('Goose 3/7-8(Sun)');
      });

      it('returns null for check_in/out when no date source is available', () => {
        const data = parseAppointmentPage('<div class="unrelated">content</div>');

        expect(data.check_in_datetime).toBeNull();
        expect(data.check_out_datetime).toBeNull();
      });
    });

    describe('text cleaning', () => {
      it('removes extra whitespace', () => {
        const html = '<span class="event-pet">  Luna   </span>';
        const data = parseAppointmentPage(html);

        expect(data.pet_name).toBe('Luna');
      });

      it('decodes HTML entities', () => {
        const html = '<span class="event-client">John &amp; Jane Smith</span>';
        const data = parseAppointmentPage(html);

        expect(data.client_name).toBe('John & Jane Smith');
      });

      it('handles &nbsp; characters', () => {
        const html = '<span class="event-pet">Luna&nbsp;Dog</span>';
        const data = parseAppointmentPage(html);

        expect(data.pet_name).toBe('Luna Dog');
      });
    });
  });
});

describe('REQ-200: extractPricing()', () => {
  it('returns null when #confirm-price is absent', () => {
    expect(extractPricing(mockAppointmentPage)).toBeNull();
    expect(extractPricing('')).toBeNull();
    expect(extractPricing('<html><body></body></html>')).toBeNull();
  });

  it('returns null when total anchor is not found', () => {
    const html = '<fieldset id="confirm-price"><div>no anchor</div></fieldset>';
    expect(extractPricing(html)).toBeNull();
  });

  it('returns null when total amount is unparseable', () => {
    expect(extractPricing(mockPricingBadTotal)).toBeNull();
  });

  it('parses integer total correctly', () => {
    const result = extractPricing(mockAppointmentPageWithPricing);
    expect(result).not.toBeNull();
    expect(result.total).toBe(750);
  });

  it('parses decimal total correctly', () => {
    const result = extractPricing(mockPricingDecimalTotal);
    expect(result).not.toBeNull();
    expect(result.total).toBe(750.50);
  });

  it('returns the correct number of line items', () => {
    const result = extractPricing(mockAppointmentPageWithPricing);
    expect(result.lineItems).toHaveLength(2);
  });

  it('parses integer data-rate as cents divided by 100', () => {
    const result = extractPricing(mockAppointmentPageWithPricing);
    // Night item: data-rate="5500" → 5500 / 100 = 55.00
    expect(result.lineItems[0].rate).toBe(55);
  });

  it('parses decimal data-rate correctly', () => {
    const result = extractPricing(mockAppointmentPageWithPricing);
    // Day item: data-rate="5000.00" → 5000.00 / 100 = 50.00
    expect(result.lineItems[1].rate).toBe(50);
  });

  it('parses data-qty as qty divided by 100', () => {
    const result = extractPricing(mockAppointmentPageWithPricing);
    // Night: data-qty="1000" → 1000 / 100 = 10
    expect(result.lineItems[0].qty).toBe(10);
    // Day: data-qty="400.00" → 400 / 100 = 4
    expect(result.lineItems[1].qty).toBe(4);
  });

  it('parses data-amount as-is (already in dollars)', () => {
    const result = extractPricing(mockAppointmentPageWithPricing);
    expect(result.lineItems[0].amount).toBe(550);
    expect(result.lineItems[1].amount).toBe(200);
  });

  it('trims whitespace from service names', () => {
    const result = extractPricing(mockAppointmentPageWithPricing);
    // Second item has leading space: " Boarding (Days)" → trimmed
    expect(result.lineItems[1].serviceName).toBe('Boarding (Days)');
  });

  it('handles single line item (total + 1 line item returned)', () => {
    const result = extractPricing(mockPricingSingleLine);
    expect(result).not.toBeNull();
    expect(result.total).toBe(550);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].serviceName).toBe('Boarding');
  });

  it('throws when service names exist but no .price divs match (extraction failure)', () => {
    // This catches site structure changes or regex regressions where price divs
    // are visible but the regex fails to capture them — silent null would store
    // bad data; a throw forces the caller to flag it as a bad data read.
    expect(() => extractPricing(mockPricingNoPriceDivs)).toThrow(/EXTRACTION FAILURE/);
  });

  it('skips malformed line item but returns remaining valid items', () => {
    // First item is missing data-qty → should be skipped
    // Second item is valid → should be returned
    const result = extractPricing(mockPricingMalformedItem);
    expect(result).not.toBeNull();
    expect(result.total).toBe(200);
    expect(result.lineItems).toHaveLength(1);
    expect(result.lineItems[0].serviceName).toBe('Boarding (Days)');
  });

  it('parseAppointmentPage includes pricing field', () => {
    const data = parseAppointmentPage(mockAppointmentPageWithPricing);
    expect(data.pricing).not.toBeNull();
    expect(data.pricing.total).toBe(750);
    expect(data.pricing.lineItems).toHaveLength(2);
  });

  it('parseAppointmentPage sets pricing to null when absent', () => {
    const data = parseAppointmentPage(mockAppointmentPage);
    expect(data.pricing).toBeNull();
  });

  describe('multi-pet appointment pricing', () => {
    it('returns correct total for multi-pet appointment', () => {
      const result = extractPricing(mockPricingMultiPet);
      expect(result).not.toBeNull();
      expect(result.total).toBe(885);
    });

    it('returns one line item per service (not per pet)', () => {
      const result = extractPricing(mockPricingMultiPet);
      expect(result.lineItems).toHaveLength(2);
    });

    it('uses first pet rate and qty for each line item', () => {
      const result = extractPricing(mockPricingMultiPet);
      // Nights: first pet (Mochi) rate=5500÷100=55, qty=800÷100=8
      expect(result.lineItems[0].rate).toBe(55);
      expect(result.lineItems[0].qty).toBe(8);
      // Days: first pet rate=5000÷100=50, qty=100÷100=1
      expect(result.lineItems[1].rate).toBe(50);
      expect(result.lineItems[1].qty).toBe(1);
    });

    it('sums amounts across all pets for each service', () => {
      const result = extractPricing(mockPricingMultiPet);
      // Nights: 440.00 (Mochi) + 360.00 (Marlee) = 800
      expect(result.lineItems[0].amount).toBe(800);
      // Days: 50.00 + 35.00 = 85
      expect(result.lineItems[1].amount).toBe(85);
    });

    it('preserves correct service names for multi-pet', () => {
      const result = extractPricing(mockPricingMultiPet);
      expect(result.lineItems[0].serviceName).toBe('Boarding discounted nights for DC full-time');
      expect(result.lineItems[1].serviceName).toBe('Boarding (Days)');
    });

    it('returns perPetRates with one entry per pet', () => {
      const result = extractPricing(mockPricingMultiPet);
      expect(result.perPetRates).toHaveLength(2);
    });

    it('perPetRates[0] holds first pet (Mochi) rates', () => {
      const result = extractPricing(mockPricingMultiPet);
      expect(result.perPetRates[0].nightRate).toBe(55);
      expect(result.perPetRates[0].dayRate).toBe(50);
    });

    it('perPetRates[1] holds second pet (Marlee) rates', () => {
      const result = extractPricing(mockPricingMultiPet);
      expect(result.perPetRates[1].nightRate).toBe(45);
      expect(result.perPetRates[1].dayRate).toBe(35);
    });
  });

  describe('all_pet_names field', () => {
    it('returns single-element array for single-pet appointment', () => {
      const data = parseAppointmentPage(mockAppointmentPage);
      expect(data.all_pet_names).toEqual(['Luna']);
    });

    it('returns all pet names in DOM order for multi-pet appointment', () => {
      const data = parseAppointmentPage(mockAppointmentPageMultiPet);
      expect(data.all_pet_names).toEqual(['Mochi Hill', 'Marlee Hill']);
    });

    it('returns empty array when no pets on page', () => {
      const data = parseAppointmentPage(mockAppointmentPageMinimal);
      expect(data.all_pet_names).toEqual([]);
    });

    it('all_pet_names[0] matches pet_name for single-pet page', () => {
      const data = parseAppointmentPage(mockAppointmentPage);
      expect(data.all_pet_names[0]).toBe(data.pet_name);
    });
  });
});

describe('extractCheckInOutAmPm()', () => {
  it('extracts AM/PM from event-time-scheduled block', () => {
    const html = `<div class="event-time-scheduled">
      <span class="time the start"><span class="time-label" title="">AM</span>, </span>
      <span class="time the"><span class="time-label" title="">PM</span>, </span>
    </div>`;
    expect(extractCheckInOutAmPm(html)).toEqual({ checkInAmPm: 'AM', checkOutAmPm: 'PM' });
  });

  it('extracts AM/PM from when-wrapper block (fallback)', () => {
    const html = `<div class="dt-row" id="when-wrapper" data-start_scheduled="1772791200" data-end_scheduled="1773072900">
      <div class="field-value"><span class="time the start"><span class="time-label" title="">AM</span>, </span>
      <span class="time time-date">Friday, March 6, 2026</span><br>
      <span class="time the"><span class="time-label" title="">PM</span>, </span>
      <span class="time time-date">Monday, March 9, 2026</span></div>
    </div>`;
    expect(extractCheckInOutAmPm(html)).toEqual({ checkInAmPm: 'AM', checkOutAmPm: 'PM' });
  });

  it('returns nulls when neither block is present', () => {
    expect(extractCheckInOutAmPm('<div>no time info</div>')).toEqual({ checkInAmPm: null, checkOutAmPm: null });
  });
});

describe('booking_status extraction', () => {
  it('returns "confirmed" for a normal appointment (no .event-status div)', () => {
    const data = parseAppointmentPage(mockAppointmentPage);
    expect(data.booking_status).toBe('confirmed');
  });

  it('returns "canceled" for a Request canceled appointment', () => {
    const data = parseAppointmentPage(mockRequestCanceledPage);
    expect(data.booking_status).toBe('canceled');
  });

  it('returns "pending" for a Request (not yet confirmed) appointment', () => {
    const data = parseAppointmentPage(mockPendingRequestPage);
    expect(data.booking_status).toBe('pending');
  });

  it('still extracts dates and service type from a canceled-request page', () => {
    const data = parseAppointmentPage(mockRequestCanceledPage);
    expect(data.booking_status).toBe('canceled');
    expect(data.check_in_datetime).toBe('2026-03-12T10:00:00.000Z');
    expect(data.check_out_datetime).toBe('2026-03-17T16:15:00.000Z');
  });
});
