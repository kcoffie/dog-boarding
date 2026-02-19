/**
 * Data mapping module - maps external data to app schema
 * @requirements REQ-103, REQ-201.1, REQ-201.3
 */

import { createClient } from '@supabase/supabase-js';
import { detectChangesSync } from './changeDetection.js';
import { mappingLogger } from './logger.js';

/**
 * Get Supabase client for database operations
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase URL and key are required');
  }

  return createClient(url, key);
}

/**
 * Map external appointment data to Dog record
 * @param {Object} externalData - Data from scraper
 * @returns {Object} Dog record for database
 */
export function mapToDog(externalData) {
  return {
    name: externalData.pet_name || 'Unknown',
    day_rate: 0, // Default, can be updated manually
    night_rate: 0, // Default, can be updated manually
    active: true,
    source: 'external',
    external_id: externalData.external_id,
    // Store additional info in notes or separate fields if needed
  };
}

/**
 * Map external appointment data to Boarding record
 * @param {Object} externalData - Data from scraper
 * @param {string} dogId - UUID of the mapped dog
 * @returns {Object} Boarding record for database
 */
export function mapToBoarding(externalData, dogId) {
  return {
    dog_id: dogId,
    arrival_datetime: externalData.check_in_datetime,
    departure_datetime: externalData.check_out_datetime,
    source: 'external',
    external_id: externalData.external_id,
  };
}

/**
 * Map external appointment data to sync_appointments record
 * @param {Object} externalData - Data from scraper
 * @param {string} [dogId] - UUID of mapped dog (if exists)
 * @param {string} [boardingId] - UUID of mapped boarding (if exists)
 * @returns {Object} sync_appointments record
 */
export function mapToSyncAppointment(externalData, dogId = null, boardingId = null) {
  return {
    external_id: externalData.external_id,
    source_url: externalData.source_url,

    // Appointment info
    service_type: externalData.service_type,
    status: externalData.status,
    check_in_datetime: externalData.check_in_datetime,
    check_out_datetime: externalData.check_out_datetime,
    scheduled_check_in: externalData.scheduled_check_in,
    scheduled_check_out: externalData.scheduled_check_out,
    duration: externalData.duration,
    assigned_staff: externalData.assigned_staff,

    // Client info
    client_name: externalData.client_name,
    client_email_primary: externalData.client_email_primary,
    client_email_secondary: externalData.client_email_secondary,
    client_phone: externalData.client_phone,
    client_address: externalData.client_address,

    // Instructions
    access_instructions: externalData.access_instructions,
    drop_off_instructions: externalData.drop_off_instructions,
    special_notes: externalData.special_notes,

    // Pet info
    pet_name: externalData.pet_name,
    pet_photo_url: externalData.pet_photo_url,
    pet_birthdate: externalData.pet_birthdate,
    pet_breed: externalData.pet_breed,
    pet_breed_type: externalData.pet_breed_type,
    pet_food_allergies: externalData.pet_food_allergies,
    pet_health_mobility: externalData.pet_health_mobility,
    pet_medications: externalData.pet_medications,
    pet_veterinarian: externalData.pet_veterinarian,
    pet_behavioral: externalData.pet_behavioral,
    pet_bite_history: externalData.pet_bite_history,

    // Store raw data for debugging
    raw_data: externalData,

    // Timestamps
    last_synced_at: new Date().toISOString(),

    // Links to app data
    mapped_dog_id: dogId,
    mapped_boarding_id: boardingId,
  };
}

/**
 * Find existing dog by external_id
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} externalId
 * @returns {Promise<Object|null>}
 */
export async function findDogByExternalId(supabase, externalId) {
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .eq('external_id', externalId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    throw error;
  }

  return data || null;
}

/**
 * Find existing dog by name (for matching manual entries)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
export async function findDogByName(supabase, name) {
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .ilike('name', name)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data || null;
}

/**
 * Find existing boarding by external_id
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} externalId
 * @returns {Promise<Object|null>}
 */
export async function findBoardingByExternalId(supabase, externalId) {
  const { data, error } = await supabase
    .from('boardings')
    .select('*')
    .eq('external_id', externalId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data || null;
}

/**
 * Find existing boarding by dog + overlapping dates (for duplicate matching)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} dogId - Dog UUID
 * @param {string} checkIn - Check-in datetime ISO string
 * @param {string} checkOut - Check-out datetime ISO string
 * @returns {Promise<Object|null>}
 */
export async function findBoardingByDogAndDates(supabase, dogId, checkIn, checkOut) {
  // Find boardings for this dog that overlap with the given date range
  const { data, error } = await supabase
    .from('boardings')
    .select('*')
    .eq('dog_id', dogId)
    .lte('arrival_datetime', checkOut)
    .gte('departure_datetime', checkIn)
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data || null;
}

/**
 * Find existing sync_appointment by external_id
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} externalId
 * @returns {Promise<Object|null>}
 */
export async function findSyncAppointmentByExternalId(supabase, externalId) {
  const { data, error } = await supabase
    .from('sync_appointments')
    .select('*')
    .eq('external_id', externalId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data || null;
}

/**
 * Upsert a dog record
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} dogData
 * @param {Object} [options]
 * @param {boolean} [options.overwriteManual=false] - Whether to overwrite manual entries
 * @returns {Promise<{dog: Object, created: boolean, updated: boolean}>}
 */
export async function upsertDog(supabase, dogData, options = {}) {
  const { overwriteManual = false } = options;

  // First, check if dog exists by external_id
  const existingByExternalId = await findDogByExternalId(supabase, dogData.external_id);

  if (existingByExternalId) {
    // Update existing external dog
    const { data, error } = await supabase
      .from('dogs')
      .update({
        name: dogData.name,
        // Don't overwrite rates - they're set manually
        active: dogData.active,
      })
      .eq('id', existingByExternalId.id)
      .select()
      .single();

    if (error) throw error;

    return { dog: data, created: false, updated: true };
  }

  // Check if a manual dog with same name exists
  const existingByName = await findDogByName(supabase, dogData.name);

  if (existingByName) {
    if (existingByName.source === 'manual' && !overwriteManual) {
      // Link external_id to manual entry but preserve manual data
      if (!existingByName.external_id) {
        mappingLogger.log(`[Mapping] Linking dog "${existingByName.name}" (id: ${existingByName.id}) to external_id ${dogData.external_id}`);
        const { data, error } = await supabase
          .from('dogs')
          .update({
            external_id: dogData.external_id,
            // Keep source as 'manual' to preserve manual flag
          })
          .eq('id', existingByName.id)
          .select()
          .single();

        if (error) throw error;
        return { dog: data, created: false, updated: true };
      }
      // Already linked, just return it
      return { dog: existingByName, created: false, updated: false };
    }

    // Update the existing dog with external_id
    const { data, error } = await supabase
      .from('dogs')
      .update({
        external_id: dogData.external_id,
        source: 'external',
      })
      .eq('id', existingByName.id)
      .select()
      .single();

    if (error) throw error;

    return { dog: data, created: false, updated: true };
  }

  // Create new dog
  const { data, error } = await supabase
    .from('dogs')
    .insert(dogData)
    .select()
    .single();

  if (error) throw error;

  return { dog: data, created: true, updated: false };
}

/**
 * Upsert a boarding record with duplicate matching
 * Matches by external_id first, then by dog + overlapping dates
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} boardingData
 * @returns {Promise<{boarding: Object, created: boolean, updated: boolean}>}
 */
export async function upsertBoarding(supabase, boardingData) {
  // Check if boarding exists by external_id
  let existing = await findBoardingByExternalId(supabase, boardingData.external_id);

  // If not found by external_id, try matching by dog + overlapping dates
  if (!existing && boardingData.dog_id && boardingData.arrival_datetime && boardingData.departure_datetime) {
    existing = await findBoardingByDogAndDates(
      supabase,
      boardingData.dog_id,
      boardingData.arrival_datetime,
      boardingData.departure_datetime
    );

    // If we found a match by date overlap, link the external_id
    if (existing && !existing.external_id) {
      mappingLogger.log(`[Mapping] Linking boarding ${existing.id} to external_id ${boardingData.external_id}`);
    }
  }

  if (existing) {
    // Update existing boarding - preserve any manual notes
    const { data, error } = await supabase
      .from('boardings')
      .update({
        arrival_datetime: boardingData.arrival_datetime,
        departure_datetime: boardingData.departure_datetime,
        dog_id: boardingData.dog_id,
        external_id: boardingData.external_id,
        source: 'external',
        // Don't overwrite notes if they exist - they may be manual
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;

    return { boarding: data, created: false, updated: true };
  }

  // Create new boarding
  const { data, error } = await supabase
    .from('boardings')
    .insert(boardingData)
    .select()
    .single();

  if (error) throw error;

  return { boarding: data, created: true, updated: false };
}

/**
 * Upsert a sync_appointment record with content hash change detection
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} syncData
 * @param {Object} [options]
 * @param {boolean} [options.forceUpdate=false] - Force update even if hash matches
 * @returns {Promise<{syncAppointment: Object, created: boolean, updated: boolean, unchanged: boolean, changeDetails: Object|null}>}
 */
export async function upsertSyncAppointment(supabase, syncData, options = {}) {
  const { forceUpdate = false } = options;
  const existing = await findSyncAppointmentByExternalId(supabase, syncData.external_id);

  // Detect changes using content hash
  const changeResult = detectChangesSync(existing, syncData);
  const now = new Date().toISOString();

  if (existing) {
    // Check if unchanged (and not forcing update)
    if (changeResult.type === 'unchanged' && !forceUpdate) {
      // Just update the last_synced_at timestamp, skip full update
      const { data, error } = await supabase
        .from('sync_appointments')
        .update({
          last_synced_at: now,
          last_change_type: 'unchanged',
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;

      return {
        syncAppointment: data,
        created: false,
        updated: false,
        unchanged: true,
        changeDetails: null,
      };
    }

    // Update existing with change tracking
    const { data, error } = await supabase
      .from('sync_appointments')
      .update({
        ...syncData,
        content_hash: changeResult.hash,
        last_change_type: changeResult.type,
        last_changed_at: now,
        last_synced_at: now,
        previous_data: changeResult.previousData,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;

    return {
      syncAppointment: data,
      created: false,
      updated: true,
      unchanged: false,
      changeDetails: {
        external_id: syncData.external_id,
        dog_name: syncData.pet_name,
        action: changeResult.type,
        check_in: syncData.check_in_datetime,
        check_out: syncData.check_out_datetime,
        status: syncData.status,
        changes: changeResult.changedFields,
      },
    };
  }

  // Create new
  const { data, error } = await supabase
    .from('sync_appointments')
    .insert({
      ...syncData,
      content_hash: changeResult.hash,
      last_change_type: 'created',
      last_changed_at: now,
      first_synced_at: now,
      last_synced_at: now,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    syncAppointment: data,
    created: true,
    updated: false,
    unchanged: false,
    changeDetails: {
      external_id: syncData.external_id,
      dog_name: syncData.pet_name,
      action: 'created',
      check_in: syncData.check_in_datetime,
      check_out: syncData.check_out_datetime,
      status: syncData.status,
      changes: null,
    },
  };
}

/**
 * Map and save a single external appointment to the database
 * @param {Object} externalData - Data from scraper
 * @param {Object} [options]
 * @param {boolean} [options.overwriteManual=false] - Whether to overwrite manual entries
 * @param {boolean} [options.forceUpdate=false] - Force update even if unchanged
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase] - Supabase client
 * @returns {Promise<{dog: Object, boarding: Object, syncAppointment: Object, stats: Object, changeDetails: Object|null}>}
 */
export async function mapAndSaveAppointment(externalData, options = {}) {
  const { overwriteManual = false, forceUpdate = false, supabase = getSupabaseClient() } = options;

  const stats = {
    dogCreated: false,
    dogUpdated: false,
    boardingCreated: false,
    boardingUpdated: false,
    syncCreated: false,
    syncUpdated: false,
    syncUnchanged: false,
  };

  // 1. Upsert dog
  const dogData = mapToDog(externalData);
  const { dog, created: dogCreated, updated: dogUpdated } = await upsertDog(
    supabase,
    dogData,
    { overwriteManual }
  );
  stats.dogCreated = dogCreated;
  stats.dogUpdated = dogUpdated;

  // 2. Upsert boarding (only if we have valid dates)
  let boarding = null;
  if (externalData.check_in_datetime && externalData.check_out_datetime) {
    const boardingData = mapToBoarding(externalData, dog.id);
    const result = await upsertBoarding(supabase, boardingData);
    boarding = result.boarding;
    stats.boardingCreated = result.created;
    stats.boardingUpdated = result.updated;
  }

  // 3. Upsert sync_appointment (raw data storage) with change detection
  const syncData = mapToSyncAppointment(externalData, dog.id, boarding?.id);
  const {
    syncAppointment,
    created: syncCreated,
    updated: syncUpdated,
    unchanged: syncUnchanged,
    changeDetails,
  } = await upsertSyncAppointment(supabase, syncData, { forceUpdate });
  stats.syncCreated = syncCreated;
  stats.syncUpdated = syncUpdated;
  stats.syncUnchanged = syncUnchanged;

  return {
    dog,
    boarding,
    syncAppointment,
    stats,
    changeDetails,
  };
}

/**
 * Map and save multiple appointments
 * @param {Array<Object>} appointments - Array of external appointment data
 * @param {Object} [options]
 * @returns {Promise<{results: Array, summary: Object}>}
 */
export async function mapAndSaveAppointments(appointments, options = {}) {
  const results = [];
  const summary = {
    total: appointments.length,
    dogsCreated: 0,
    dogsUpdated: 0,
    boardingsCreated: 0,
    boardingsUpdated: 0,
    syncsCreated: 0,
    syncsUpdated: 0,
    failed: 0,
    errors: [],
  };

  for (const appointment of appointments) {
    try {
      const result = await mapAndSaveAppointment(appointment, options);
      results.push({ success: true, ...result });

      if (result.stats.dogCreated) summary.dogsCreated++;
      if (result.stats.dogUpdated) summary.dogsUpdated++;
      if (result.stats.boardingCreated) summary.boardingsCreated++;
      if (result.stats.boardingUpdated) summary.boardingsUpdated++;
      if (result.stats.syncCreated) summary.syncsCreated++;
      if (result.stats.syncUpdated) summary.syncsUpdated++;
    } catch (error) {
      summary.failed++;
      summary.errors.push({
        external_id: appointment.external_id,
        error: error.message,
      });
      results.push({
        success: false,
        external_id: appointment.external_id,
        error: error.message,
      });
    }
  }

  return { results, summary };
}

export default {
  mapToDog,
  mapToBoarding,
  mapToSyncAppointment,
  findDogByExternalId,
  findDogByName,
  findBoardingByExternalId,
  findSyncAppointmentByExternalId,
  upsertDog,
  upsertBoarding,
  upsertSyncAppointment,
  mapAndSaveAppointment,
  mapAndSaveAppointments,
};
