/**
 * Data mapping tests
 * @requirements REQ-103
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
import { mockExternalAppointments } from './fixtures.js';

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
