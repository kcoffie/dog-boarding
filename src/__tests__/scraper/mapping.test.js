/**
 * Data mapping tests
 * @requirements REQ-103, REQ-201
 */

import { describe, it, expect } from 'vitest';
import {
  mapToDog,
  mapToBoarding,
  mapToSyncAppointment,
  findDogByExternalId,
  findDogByName,
  upsertDog,
  upsertBoarding,
  mapAndSaveAppointment,
} from '../../lib/scraper/mapping.js';
import {
  mockExternalAppointments,
  mockExternalAppointmentWithPricing,
  mockExternalAppointmentNoPricing,
  mockExternalAppointmentSingleLinePricing,
  mockExternalAppointmentDcMidPhrase,
  mockExternalAppointmentMultiPet,
} from './fixtures.js';

// Mock Supabase client
const createMockSupabase = () => {
  const mockData = {
    dogs: [],
    boardings: [],
    sync_appointments: [],
  };

  const createQueryBuilder = (table) => {
    let filters = {};
    let lteFilters = {};
    let gteFilters = {};
    let limitCount = null;
    let isSingle = false;

    const builder = {
      select: () => {
        return builder;
      },
      eq: (field, value) => {
        filters[field] = value;
        return builder;
      },
      ilike: (field, value) => {
        filters[`${field}_ilike`] = value.toLowerCase();
        return builder;
      },
      lte: (field, value) => {
        lteFilters[field] = value;
        return builder;
      },
      gte: (field, value) => {
        gteFilters[field] = value;
        return builder;
      },
      limit: (count) => {
        limitCount = count;
        return builder;
      },
      single: () => {
        isSingle = true;
        return builder.execute();
      },
      execute: () => {
        let results = [...mockData[table]];

        // Apply eq / ilike filters
        for (const [key, value] of Object.entries(filters)) {
          if (key.endsWith('_ilike')) {
            const field = key.replace('_ilike', '');
            results = results.filter(r => r[field]?.toLowerCase() === value);
          } else {
            results = results.filter(r => r[key] === value);
          }
        }

        // Apply range filters (used by findBoardingByDogAndDates)
        for (const [k, v] of Object.entries(lteFilters)) {
          results = results.filter(r => r[k] <= v);
        }
        for (const [k, v] of Object.entries(gteFilters)) {
          results = results.filter(r => r[k] >= v);
        }

        if (limitCount) {
          results = results.slice(0, limitCount);
        }

        if (isSingle) {
          if (results.length === 0) {
            return { data: null, error: { code: 'PGRST116' } };
          }
          return { data: results[0], error: null };
        }

        return { data: results, error: null };
      },
    };

    // Make it thenable for await
    builder.then = (resolve) => resolve(builder.execute());

    return builder;
  };

  const createInsertBuilder = (table) => {
    let insertData = null;

    const builder = {
      insert: (data) => {
        insertData = Array.isArray(data) ? data[0] : data;
        return builder;
      },
      select: () => builder,
      single: () => {
        const newRecord = {
          id: `mock-${Date.now()}-${Math.random()}`,
          ...insertData,
          created_at: new Date().toISOString(),
        };
        mockData[table].push(newRecord);
        return Promise.resolve({ data: newRecord, error: null });
      },
    };

    return builder;
  };

  const createUpdateBuilder = (table) => {
    let updateData = null;
    let filters = {};

    const builder = {
      update: (data) => {
        updateData = data;
        return builder;
      },
      eq: (field, value) => {
        filters[field] = value;
        return builder;
      },
      select: () => builder,
      single: () => {
        const index = mockData[table].findIndex(r => {
          return Object.entries(filters).every(([k, v]) => r[k] === v);
        });

        if (index === -1) {
          return Promise.resolve({ data: null, error: { message: 'Not found' } });
        }

        mockData[table][index] = { ...mockData[table][index], ...updateData };
        return Promise.resolve({ data: mockData[table][index], error: null });
      },
    };

    return builder;
  };

  return {
    from: (table) => ({
      select: (fields) => createQueryBuilder(table).select(fields),
      insert: (data) => createInsertBuilder(table).insert(data),
      update: (data) => createUpdateBuilder(table).update(data),
    }),
    _mockData: mockData,
    _addDog: (dog) => mockData.dogs.push({ id: `dog-${Date.now()}`, ...dog }),
    _addBoarding: (boarding) => mockData.boardings.push({ id: `boarding-${Date.now()}`, ...boarding }),
  };
};

describe('REQ-103: Data Mapping to App Schema', () => {
  describe('mapToDog()', () => {
    it('maps external data to dog record', () => {
      const external = mockExternalAppointments[0];
      const dog = mapToDog(external);

      expect(dog.name).toBe('Luna');
      expect(dog.source).toBe('external');
      expect(dog.external_id).toBe('ABC123');
      expect(dog.active).toBe(true);
    });

    it('sets default rates to 0', () => {
      const external = mockExternalAppointments[0];
      const dog = mapToDog(external);

      expect(dog.day_rate).toBe(0);
      expect(dog.night_rate).toBe(0);
    });

    it('handles missing pet name', () => {
      const external = { external_id: 'TEST123' };
      const dog = mapToDog(external);

      expect(dog.name).toBe('Unknown');
    });
  });

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

  describe('findDogByExternalId()', () => {
    it('finds existing dog by external_id', async () => {
      const supabase = createMockSupabase();
      supabase._addDog({ external_id: 'ABC123', name: 'Luna', source: 'external' });

      const dog = await findDogByExternalId(supabase, 'ABC123');

      expect(dog).not.toBeNull();
      expect(dog.name).toBe('Luna');
    });

    it('returns null if dog not found', async () => {
      const supabase = createMockSupabase();

      const dog = await findDogByExternalId(supabase, 'NONEXISTENT');

      expect(dog).toBeNull();
    });
  });

  describe('findDogByName()', () => {
    it('finds dog by name (case insensitive)', async () => {
      const supabase = createMockSupabase();
      supabase._addDog({ name: 'Luna', source: 'manual' });

      const dog = await findDogByName(supabase, 'luna');

      expect(dog).not.toBeNull();
      expect(dog.name).toBe('Luna');
    });

    it('returns null if no match', async () => {
      const supabase = createMockSupabase();

      const dog = await findDogByName(supabase, 'Unknown');

      expect(dog).toBeNull();
    });
  });

  describe('upsertDog()', () => {
    it('creates new dog if not exists', async () => {
      const supabase = createMockSupabase();
      const dogData = mapToDog(mockExternalAppointments[0]);

      const result = await upsertDog(supabase, dogData);

      expect(result.created).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.dog.name).toBe('Luna');
      expect(result.dog.external_id).toBe('ABC123');
    });

    it('updates existing dog with same external_id', async () => {
      const supabase = createMockSupabase();
      supabase._addDog({ external_id: 'ABC123', name: 'Old Name', source: 'external' });
      const dogData = mapToDog(mockExternalAppointments[0]);

      const result = await upsertDog(supabase, dogData);

      expect(result.created).toBe(false);
      expect(result.updated).toBe(true);
      expect(result.dog.name).toBe('Luna');
    });

    it('does not overwrite manual entries by default', async () => {
      const supabase = createMockSupabase();
      supabase._addDog({ name: 'Luna', source: 'manual', day_rate: 50 });
      const dogData = mapToDog(mockExternalAppointments[0]);

      const result = await upsertDog(supabase, dogData, { overwriteManual: false });

      expect(result.created).toBe(false);
      // When a manual dog has no external_id, upsertDog links the external_id to it
      // (soft link — preserves source: 'manual' and all manual fields like day_rate).
      // This counts as an update even though no manual data was overwritten.
      expect(result.updated).toBe(true);
      expect(result.dog.source).toBe('manual');
      expect(result.dog.external_id).toBe('ABC123');
    });

    it('links manual entry when overwriteManual is true', async () => {
      const supabase = createMockSupabase();
      supabase._addDog({ name: 'Luna', source: 'manual' });
      const dogData = mapToDog(mockExternalAppointments[0]);

      const result = await upsertDog(supabase, dogData, { overwriteManual: true });

      expect(result.updated).toBe(true);
      expect(result.dog.external_id).toBe('ABC123');
      expect(result.dog.source).toBe('external');
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

  describe('mapAndSaveAppointment()', () => {
    it('creates dog, boarding, and sync_appointment', async () => {
      const supabase = createMockSupabase();
      const external = mockExternalAppointments[0];

      const result = await mapAndSaveAppointment(external, { supabase });

      expect(result.dog).toBeDefined();
      expect(result.boarding).toBeDefined();
      expect(result.syncAppointment).toBeDefined();
      expect(result.stats.dogCreated).toBe(true);
      expect(result.stats.boardingCreated).toBe(true);
      expect(result.stats.syncCreated).toBe(true);
    });

    it('returns stats about what was created/updated', async () => {
      const supabase = createMockSupabase();
      supabase._addDog({ external_id: 'ABC123', name: 'Luna', source: 'external' });
      const external = mockExternalAppointments[0];

      const result = await mapAndSaveAppointment(external, { supabase });

      expect(result.stats.dogCreated).toBe(false);
      expect(result.stats.dogUpdated).toBe(true);
    });

    it('skips boarding if no valid dates', async () => {
      const supabase = createMockSupabase();
      const external = {
        external_id: 'NODATES',
        pet_name: 'NoDates Dog',
      };

      const result = await mapAndSaveAppointment(external, { supabase });

      expect(result.dog).toBeDefined();
      expect(result.boarding).toBeNull();
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

    describe('mapToDog() with pricing', () => {
      it('sets night_rate from non-day line item when pricing available', () => {
        const dog = mapToDog(mockExternalAppointmentWithPricing);
        expect(dog.night_rate).toBe(55);
      });

      it('sets day_rate from day-matching line item when pricing available', () => {
        const dog = mapToDog(mockExternalAppointmentWithPricing);
        expect(dog.day_rate).toBe(50);
      });

      it('defaults rates to 0 when pricing is null (existing behavior)', () => {
        const dog = mapToDog(mockExternalAppointments[0]);
        expect(dog.night_rate).toBe(0);
        expect(dog.day_rate).toBe(0);
      });

      it('defaults rates to 0 when pricing is null (explicit null)', () => {
        const dog = mapToDog(mockExternalAppointmentNoPricing);
        expect(dog.night_rate).toBe(0);
        expect(dog.day_rate).toBe(0);
      });

      it('classifies single non-day line item as night_rate=55, day_rate=0', () => {
        const dog = mapToDog(mockExternalAppointmentSingleLinePricing);
        // Single "Boarding" line → nightItem classified → night_rate=55; no day item → 0
        expect(dog.night_rate).toBe(55);
        expect(dog.day_rate).toBe(0);
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

      it('sets dog night_rate from the non-day line even when service name contains "DC" mid-phrase', () => {
        const dog = mapToDog(mockExternalAppointmentDcMidPhrase);
        expect(dog.night_rate).toBe(55);
        expect(dog.day_rate).toBe(50);
      });
    });

    describe('upsertDog() rate update behavior', () => {
      it('updates rates on existing external dog when updateRates is true', async () => {
        const supabase = createMockSupabase();
        supabase._addDog({ external_id: 'PRC123', name: 'Old', night_rate: 0, day_rate: 0, source: 'external' });
        const dogData = mapToDog(mockExternalAppointmentWithPricing);

        const result = await upsertDog(supabase, dogData, { updateRates: true });

        expect(result.dog.night_rate).toBe(55);
        expect(result.dog.day_rate).toBe(50);
      });

      it('preserves rates on existing external dog when updateRates is false', async () => {
        const supabase = createMockSupabase();
        // external_id must match mockExternalAppointmentNoPricing.external_id ('NOP123')
        supabase._addDog({ external_id: 'NOP123', name: 'Luna', night_rate: 65, day_rate: 45, source: 'external' });
        const dogData = mapToDog(mockExternalAppointmentNoPricing);

        // No pricing → updateRates false → rates not touched
        const result = await upsertDog(supabase, dogData, { updateRates: false });

        expect(result.dog.night_rate).toBe(65);
        expect(result.dog.day_rate).toBe(45);
      });

      it('updates rates on external dog found by name when updateRates is true', async () => {
        const supabase = createMockSupabase();
        // Dog exists with a different external_id but same name — simulates Mochi Hill scenario
        supabase._addDog({ external_id: 'OTHER123', name: 'Maverick', night_rate: 0, day_rate: 0, source: 'external' });
        const dogData = mapToDog(mockExternalAppointmentWithPricing);
        // dogData.external_id = 'PRC123' ≠ 'OTHER123' → findDogByExternalId returns null
        // findDogByName finds 'Maverick' → name-match path → rates should be written
        const result = await upsertDog(supabase, dogData, { updateRates: true });

        expect(result.dog.night_rate).toBe(55);
        expect(result.dog.day_rate).toBe(50);
      });

      it('updates rates from single-line pricing when non-day service classified', async () => {
        const supabase = createMockSupabase();
        supabase._addDog({ external_id: 'SNG123', name: 'Cooper', night_rate: 65, day_rate: 0, source: 'external' });
        const dogData = mapToDog(mockExternalAppointmentSingleLinePricing);
        // Single "Boarding" → now classified as night → night_rate: 55
        expect(dogData.night_rate).toBe(55);

        // updateRates: true + rate > 0 → overwrites existing 65 with extracted 55
        const result = await upsertDog(supabase, dogData, { updateRates: true });

        expect(result.dog.night_rate).toBe(55);
      });
    });
  });

  describe('multi-pet appointments', () => {
    it('creates a dog record for each pet', async () => {
      const supabase = createMockSupabase();

      await mapAndSaveAppointment(mockExternalAppointmentMultiPet, { supabase });

      const dogs = supabase._mockData.dogs;
      expect(dogs.length).toBe(2);
      const names = dogs.map(d => d.name);
      expect(names).toContain('Mochi Hill');
      expect(names).toContain('Marlee Hill');
    });

    it('creates a boarding for each pet with same dates', async () => {
      const supabase = createMockSupabase();

      await mapAndSaveAppointment(mockExternalAppointmentMultiPet, { supabase });

      const boardings = supabase._mockData.boardings;
      expect(boardings.length).toBe(2);
      boardings.forEach(b => {
        expect(b.arrival_datetime).toBe('2026-03-06T00:00:00.000Z');
        expect(b.departure_datetime).toBe('2026-03-14T00:00:00.000Z');
      });
    });

    it('stores per-pet night rates on each dog', async () => {
      const supabase = createMockSupabase();

      await mapAndSaveAppointment(mockExternalAppointmentMultiPet, { supabase });

      const mochi = supabase._mockData.dogs.find(d => d.name === 'Mochi Hill');
      const marlee = supabase._mockData.dogs.find(d => d.name === 'Marlee Hill');
      expect(mochi.night_rate).toBe(55);
      expect(marlee.night_rate).toBe(45);
    });

    it('stores per-pet day rates on each dog', async () => {
      const supabase = createMockSupabase();

      await mapAndSaveAppointment(mockExternalAppointmentMultiPet, { supabase });

      const mochi = supabase._mockData.dogs.find(d => d.name === 'Mochi Hill');
      const marlee = supabase._mockData.dogs.find(d => d.name === 'Marlee Hill');
      expect(mochi.day_rate).toBe(50);
      expect(marlee.day_rate).toBe(35);
    });

    it('stores per-pet night rates on each boarding', async () => {
      const supabase = createMockSupabase();

      await mapAndSaveAppointment(mockExternalAppointmentMultiPet, { supabase });

      const dogs = supabase._mockData.dogs;
      const mochiDog = dogs.find(d => d.name === 'Mochi Hill');
      const marleeDog = dogs.find(d => d.name === 'Marlee Hill');
      const boardings = supabase._mockData.boardings;
      const mochiBoarding = boardings.find(b => b.dog_id === mochiDog.id);
      const marleeBoarding = boardings.find(b => b.dog_id === marleeDog.id);
      expect(mochiBoarding.night_rate).toBe(55);
      expect(marleeBoarding.night_rate).toBe(45);
    });

    it('gives secondary boarding a unique external_id suffix', async () => {
      const supabase = createMockSupabase();

      await mapAndSaveAppointment(mockExternalAppointmentMultiPet, { supabase });

      const boardings = supabase._mockData.boardings;
      const ids = boardings.map(b => b.external_id);
      expect(ids).toContain('MPT123');
      expect(ids).toContain('MPT123_p1');
    });

    it('does not create duplicates on re-sync', async () => {
      const supabase = createMockSupabase();

      await mapAndSaveAppointment(mockExternalAppointmentMultiPet, { supabase });
      await mapAndSaveAppointment(mockExternalAppointmentMultiPet, { supabase });

      expect(supabase._mockData.dogs.length).toBe(2);
      expect(supabase._mockData.boardings.length).toBe(2);
    });
  });

  describe('duplicate detection', () => {
    it('detects duplicate by external_id', async () => {
      const supabase = createMockSupabase();

      // First save
      await mapAndSaveAppointment(mockExternalAppointments[0], { supabase });

      // Second save with same external_id
      const result = await mapAndSaveAppointment(mockExternalAppointments[0], { supabase });

      expect(result.stats.dogCreated).toBe(false);
      expect(result.stats.dogUpdated).toBe(true);

      // Should only have one dog
      expect(supabase._mockData.dogs.length).toBe(1);
    });

    it('detects duplicate by pet name for manual entries', async () => {
      const supabase = createMockSupabase();
      supabase._addDog({ name: 'Luna', source: 'manual', day_rate: 50 });

      const result = await mapAndSaveAppointment(mockExternalAppointments[0], {
        supabase,
        overwriteManual: false,
      });

      // Should not create new dog
      expect(result.stats.dogCreated).toBe(false);
      // upsertDog links external_id to the manual dog (soft link, source stays 'manual')
      // so dogUpdated is true even though no manual data was overwritten
      expect(result.stats.dogUpdated).toBe(true);

      // Original manual dog source preserved
      expect(result.dog.source).toBe('manual');
    });
  });
});
