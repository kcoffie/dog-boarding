/**
 * Data mapping tests
 * @requirements REQ-103, REQ-201
 */

import { describe, it, expect } from 'vitest';
import {
  ratesFromPricing,
  mapToBoarding,
  mapToSyncAppointment,
  upsertBoarding,
  mapAndSaveAppointment,
} from '../../lib/scraper/mapping.js';
import {
  mockExternalAppointments,
  mockExternalAppointmentWithPricing,
  mockExternalAppointmentNoPricing,
  mockExternalAppointmentSingleLinePricing,
  mockExternalAppointmentDcMidPhrase,
} from './fixtures.js';
import { createFakeSupabase } from './fakeSupabase.js';

// The database boundary: an in-memory Supabase (fakeSupabase.js)
const createMockSupabase = () => createFakeSupabase();

describe('REQ-103: Data Mapping to App Schema', () => {
  describe('mapToBoarding()', () => {
    it('maps external data to boarding record', () => {
      const external = mockExternalAppointments[0];
      const boarding = mapToBoarding(external, 'dog-uuid-123');

      expect(boarding.dog_id).toBe('dog-uuid-123');
      expect(boarding.arrival_datetime).toBe('2025-12-21T17:00:00.000Z');
      expect(boarding.departure_datetime).toBe('2025-12-23T10:00:00.000Z');
      expect(boarding.source).toBe('external');
      expect(boarding.external_id).toBe('ABC123');
    });
  });

  describe('mapToSyncAppointment()', () => {
    it('maps all external fields to sync_appointment', () => {
      const external = mockExternalAppointments[0];
      const sync = mapToSyncAppointment(external, 'dog-id', 'boarding-id');

      expect(sync.external_id).toBe('ABC123');
      expect(sync.service_type).toBe('Boarding (Nights)');
      expect(sync.status).toBe('Scheduled');
      expect(sync.client_name).toBe('John Smith');
      expect(sync.pet_name).toBe('Luna');
      expect(sync.mapped_dog_id).toBe('dog-id');
      expect(sync.mapped_boarding_id).toBe('boarding-id');
    });

    it('stores raw data for debugging', () => {
      const external = mockExternalAppointments[0];
      const sync = mapToSyncAppointment(external);

      expect(sync.raw_data).toEqual(external);
    });

    it('sets last_synced_at timestamp', () => {
      const external = mockExternalAppointments[0];
      const sync = mapToSyncAppointment(external);

      expect(sync.last_synced_at).toBeDefined();
      expect(new Date(sync.last_synced_at)).toBeInstanceOf(Date);
    });
  });

  describe('upsertBoarding()', () => {
    it('creates new boarding if not exists', async () => {
      const supabase = createMockSupabase();
      const boardingData = mapToBoarding(mockExternalAppointments[0], 'dog-123');

      const result = await upsertBoarding(supabase, boardingData);

      expect(result.created).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.boarding.dog_id).toBe('dog-123');
    });

    it('updates existing boarding with same external_id', async () => {
      const supabase = createMockSupabase();
      supabase._addBoarding({
        external_id: 'ABC123',
        dog_id: 'old-dog',
        arrival_datetime: '2025-01-01T00:00:00Z',
      });
      const boardingData = mapToBoarding(mockExternalAppointments[0], 'new-dog');

      const result = await upsertBoarding(supabase, boardingData);

      expect(result.created).toBe(false);
      expect(result.updated).toBe(true);
      expect(result.boarding.dog_id).toBe('new-dog');
    });

    it('links overlap match when existing boarding has no external_id (manual boarding)', async () => {
      const supabase = createMockSupabase();
      // Manual boarding: same dog, overlapping dates, no external_id yet
      supabase._addBoarding({
        dog_id: 'dog-luna',
        arrival_datetime: '2025-12-21T00:00:00Z',
        departure_datetime: '2025-12-24T00:00:00Z',
        // no external_id
      });
      const boardingData = {
        external_id: 'ABC123',
        dog_id: 'dog-luna',
        arrival_datetime: '2025-12-21T17:00:00.000Z',
        departure_datetime: '2025-12-23T10:00:00.000Z',
        billed_amount: null,
        night_rate: null,
        day_rate: null,
        source: 'external',
      };

      const result = await upsertBoarding(supabase, boardingData);

      // Should update (link) the manual boarding, not create a new one
      expect(result.created).toBe(false);
      expect(result.updated).toBe(true);
    });

    it('does not overwrite boarding already linked to a different external_id', async () => {
      const supabase = createMockSupabase();
      // Existing boarding linked to original appointment C63QgH5K (March 3–19)
      supabase._addBoarding({
        external_id: 'C63QgH5K',
        dog_id: 'dog-millie',
        arrival_datetime: '2026-03-03T00:00:00Z',
        departure_datetime: '2026-03-19T00:00:00Z',
      });
      // Incoming: amended appointment C63QgNHs with overlapping dates (March 4–19)
      const boardingData = {
        external_id: 'C63QgNHs',
        dog_id: 'dog-millie',
        arrival_datetime: '2026-03-04T00:00:00Z',
        departure_datetime: '2026-03-19T00:00:00Z',
        billed_amount: null,
        night_rate: null,
        day_rate: null,
        source: 'external',
      };

      const result = await upsertBoarding(supabase, boardingData);

      // Should create a NEW boarding, not overwrite the H5K one
      expect(result.created).toBe(true);
      expect(result.updated).toBe(false);

      // The original H5K boarding should be untouched
      const original = supabase._mockData.boardings.find(b => b.external_id === 'C63QgH5K');
      expect(original).toBeDefined();
      expect(original.arrival_datetime).toBe('2026-03-03T00:00:00Z');
    });
  });

  describe('REQ-201: pricing fields', () => {
    describe('mapToBoarding() with pricing', () => {
      it('populates billed_amount from pricing.total', () => {
        const boarding = mapToBoarding(mockExternalAppointmentWithPricing, 'dog-id');
        expect(boarding.billed_amount).toBe(750);
      });

      it('populates night_rate from first non-day line item', () => {
        const boarding = mapToBoarding(mockExternalAppointmentWithPricing, 'dog-id');
        // "Boarding" does not match any dayServicePattern → night item
        expect(boarding.night_rate).toBe(55);
      });

      it('populates day_rate from day-matching line item', () => {
        const boarding = mapToBoarding(mockExternalAppointmentWithPricing, 'dog-id');
        // "Boarding (Days)" matches /day/i → day item
        expect(boarding.day_rate).toBe(50);
      });

      it('sets billed_amount null when pricing is absent', () => {
        const boarding = mapToBoarding(mockExternalAppointmentNoPricing, 'dog-id');
        expect(boarding.billed_amount).toBeNull();
      });

      it('sets night_rate and day_rate null when pricing is absent', () => {
        const boarding = mapToBoarding(mockExternalAppointmentNoPricing, 'dog-id');
        expect(boarding.night_rate).toBeNull();
        expect(boarding.day_rate).toBeNull();
      });

      it('classifies single non-day line item as night_rate', () => {
        const boarding = mapToBoarding(mockExternalAppointmentSingleLinePricing, 'dog-id');
        // Single "Boarding" line → not a day service → nightItem classified → rate extracted
        expect(boarding.night_rate).toBe(55);
        expect(boarding.day_rate).toBeNull();
        expect(boarding.billed_amount).toBe(550);
      });
    });

    describe('ratesFromPricing() (one pet on the booking)', () => {
      it('the night rate is the non-day line item\'s rate', () => {
        expect(ratesFromPricing(mockExternalAppointmentWithPricing.pricing).nightRate).toBe(55);
      });

      it('the day rate is the day-matching line item\'s rate', () => {
        expect(ratesFromPricing(mockExternalAppointmentWithPricing.pricing).dayRate).toBe(50);
      });

      it('no pricing gives no rates', () => {
        expect(ratesFromPricing(null)).toEqual({ nightRate: null, dayRate: null });
      });

      it('a single non-day line item is the night rate, with no day rate', () => {
        expect(ratesFromPricing(mockExternalAppointmentSingleLinePricing.pricing)).toEqual({ nightRate: 55, dayRate: null });
      });
    });

    describe('mapToSyncAppointment() with pricing', () => {
      it('populates appointment_total from pricing.total', () => {
        const sync = mapToSyncAppointment(mockExternalAppointmentWithPricing, 'dog-id', 'boarding-id');
        expect(sync.appointment_total).toBe(750);
      });

      it('populates pricing_line_items from lineItems array', () => {
        const sync = mapToSyncAppointment(mockExternalAppointmentWithPricing, 'dog-id', 'boarding-id');
        expect(sync.pricing_line_items).toHaveLength(2);
        expect(sync.pricing_line_items[0].serviceName).toBe('Boarding');
        expect(sync.pricing_line_items[1].serviceName).toBe('Boarding (Days)');
      });

      it('sets appointment_total and pricing_line_items null when no pricing', () => {
        const sync = mapToSyncAppointment(mockExternalAppointmentNoPricing, 'dog-id', 'boarding-id');
        expect(sync.appointment_total).toBeNull();
        expect(sync.pricing_line_items).toBeNull();
      });
    });

    describe('upsertSyncAppointment() pricing on unchanged records', () => {
      it('writes pricing fields on unchanged sync_appointment when pricing was absent before', async () => {
        const supabase = createMockSupabase();

        // First sync: no pricing (before pricing extraction was deployed)
        await mapAndSaveAppointment(mockExternalAppointmentNoPricing, { supabase });
        expect(supabase._mockData.sync_appointments).toHaveLength(1);
        expect(supabase._mockData.sync_appointments[0].appointment_total).toBeNull();

        // Second sync: same identity fields, but now pricing is extracted.
        // HASH_FIELDS excludes pricing → hash still matches → unchanged path runs.
        const withPricing = {
          ...mockExternalAppointmentNoPricing,
          pricing: {
            total: 550,
            lineItems: [{ serviceName: 'Boarding', rate: 55, qty: 10, amount: 550 }],
          },
        };
        await mapAndSaveAppointment(withPricing, { supabase });

        // Bug 1 fix: pricing fields written even on unchanged record
        const updated = supabase._mockData.sync_appointments[0];
        expect(updated.appointment_total).toBe(550);
        expect(updated.pricing_line_items).toHaveLength(1);
      });
    });

    describe('"DC" mid-phrase false-positive fix', () => {
      it('classifies line 1 as night when "DC" appears mid-phrase (not at start)', () => {
        // "Boarding discounted nights for DC full-time" contains "DC" but does NOT
        // start with it — should be treated as the night service, not day.
        const boarding = mapToBoarding(mockExternalAppointmentDcMidPhrase, 'dog-id');
        expect(boarding.night_rate).toBe(55);
        expect(boarding.day_rate).toBe(50);
      });

      it('the rates read the non-day line as the night rate even when its name contains "DC" mid-phrase', () => {
        expect(ratesFromPricing(mockExternalAppointmentDcMidPhrase.pricing)).toEqual({ nightRate: 55, dayRate: 50 });
      });
    });
  });
});
