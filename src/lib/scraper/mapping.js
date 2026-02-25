/**
 * Data mapping module - maps external data to app schema
 * @requirements REQ-103, REQ-201
 */

import { createClient } from '@supabase/supabase-js';
import { SCRAPER_CONFIG } from './config.js';
import { detectChangesSync } from './changeDetection.js';
import { mappingLogger } from './logger.js';

/**
 * Identify night and day line items from a pricing result.
 * Night = first line item whose name does NOT match SCRAPER_CONFIG.dayServicePatterns.
 * Day   = first line item whose name DOES match any dayServicePattern.
 * Returns null for both when fewer than 2 line items (cannot classify safely — REQ-201).
 *
 * @param {{ total: number, lineItems: Array } | null} pricing
 * @returns {{ nightItem: Object|null, dayItem: Object|null }}
 */
function classifyPricingItems(pricing) {
  if (!pricing || !pricing.lineItems || pricing.lineItems.length < 2) {
    return { nightItem: null, dayItem: null };
  }
  const { dayServicePatterns } = SCRAPER_CONFIG;
  const nightItem = pricing.lineItems.find(
    item => !dayServicePatterns.some(p => p.test(item.serviceName))
  ) ?? null;
  const dayItem = pricing.lineItems.find(
    item => dayServicePatterns.some(p => p.test(item.serviceName))
  ) ?? null;
  return { nightItem, dayItem };
}

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
 * Map external appointment data to Dog record.
 * Sets night_rate/day_rate from extracted pricing when available (REQ-201).
 * Falls back to 0 when pricing is absent (new dogs get a $0 default).
 *
 * @param {Object} externalData - Data from scraper (may include .pricing)
 * @returns {Object} Dog record for database
 */
export function mapToDog(externalData) {
  const { nightItem, dayItem } = classifyPricingItems(externalData.pricing);
  return {
    name: externalData.pet_name || 'Unknown',
    night_rate: nightItem ? nightItem.rate : 0,
    day_rate:   dayItem   ? dayItem.rate   : 0,
    active: true,
    source: 'external',
    external_id: externalData.external_id,
  };
}

/**
 * Map external appointment data to Boarding record.
 * Populates billed_amount, night_rate, day_rate from pricing when available (REQ-201).
 * All three are null when pricing is absent — no error.
 *
 * @param {Object} externalData - Data from scraper (may include .pricing)
 * @param {string} dogId - UUID of the mapped dog
 * @returns {Object} Boarding record for database
 */
export function mapToBoarding(externalData, dogId) {
  const pricing = externalData.pricing ?? null;
  const { nightItem, dayItem } = classifyPricingItems(pricing);
  return {
    dog_id: dogId,
    arrival_datetime: externalData.check_in_datetime,
    departure_datetime: externalData.check_out_datetime,
    source: 'external',
    external_id: externalData.external_id,
    billed_amount: pricing ? pricing.total : null,
    night_rate:    nightItem ? nightItem.rate : null,
    day_rate:      dayItem   ? dayItem.rate   : null,
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

    // Pricing (REQ-200/201)
    appointment_total: externalData.pricing?.total ?? null,
    pricing_line_items: externalData.pricing?.lineItems?.length
      ? externalData.pricing.lineItems
      : null,

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
  const { overwriteManual = false, updateRates = false } = options;

  // First, check if dog exists by external_id (skip when none provided — secondary pets)
  let existingByExternalId = null;
  if (dogData.external_id) {
    existingByExternalId = await findDogByExternalId(supabase, dogData.external_id);
  }

  if (existingByExternalId) {
    // Update existing external dog.
    // Only update rates when pricing was extracted this sync (REQ-201):
    // external site is source of truth for rates, but don't overwrite with 0
    // when pricing data was simply absent from this appointment.
    const updateFields = {
      name: dogData.name,
      active: dogData.active,
    };
    if (updateRates) {
      // Only write rates when a non-zero value was actually classified from pricing.
      // mapToDog returns 0 when no night/day item was found (e.g. single service line);
      // don't overwrite existing rates with 0 in that case (see comment above).
      if (dogData.night_rate > 0) updateFields.night_rate = dogData.night_rate;
      if (dogData.day_rate   > 0) updateFields.day_rate   = dogData.day_rate;
    }
    const { data, error } = await supabase
      .from('dogs')
      .update(updateFields)
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
      // Link external_id to manual entry but preserve manual data.
      // Only link when we have an external_id to set (secondary pets don't have one).
      if (!existingByName.external_id && dogData.external_id) {
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
      // Already linked (or no external_id to set), just return it
      return { dog: existingByName, created: false, updated: false };
    }

    // Update the existing dog — only include external_id when provided
    const nameMatchUpdate = { source: 'external' };
    if (dogData.external_id) nameMatchUpdate.external_id = dogData.external_id;
    const { data, error } = await supabase
      .from('dogs')
      .update(nameMatchUpdate)
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

  // If not found by external_id, try matching by dog + overlapping dates.
  // Only use the overlap match when the found boarding has no external_id yet
  // (i.e., a manually created boarding waiting to be linked). If the overlapping
  // boarding is already linked to a different appointment, skip it and let a new
  // boarding be created — prevents amended appointments from overwriting each other.
  if (!existing && boardingData.dog_id && boardingData.arrival_datetime && boardingData.departure_datetime) {
    const overlap = await findBoardingByDogAndDates(
      supabase,
      boardingData.dog_id,
      boardingData.arrival_datetime,
      boardingData.departure_datetime
    );

    if (overlap && !overlap.external_id) {
      // Manual boarding waiting to be linked — safe to claim it
      existing = overlap;
      mappingLogger.log(`[Mapping] Linking boarding ${overlap.id} to external_id ${boardingData.external_id}`);
    } else if (overlap && overlap.external_id !== boardingData.external_id) {
      // Already linked to a different appointment — create a new boarding instead
      mappingLogger.log(`[Mapping] Overlap match boarding ${overlap.id} already linked to ${overlap.external_id}; creating new boarding for ${boardingData.external_id}`);
    }
  }

  if (existing) {
    // Update existing boarding - preserve any manual notes.
    // Pricing fields only written when present in boardingData (REQ-201).
    const updateFields = {
      arrival_datetime: boardingData.arrival_datetime,
      departure_datetime: boardingData.departure_datetime,
      dog_id: boardingData.dog_id,
      external_id: boardingData.external_id,
      source: 'external',
    };
    if ('billed_amount' in boardingData) updateFields.billed_amount = boardingData.billed_amount;
    if ('night_rate'    in boardingData) updateFields.night_rate    = boardingData.night_rate;
    if ('day_rate'      in boardingData) updateFields.day_rate      = boardingData.day_rate;

    const { data, error } = await supabase
      .from('boardings')
      .update(updateFields)
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
  // Pass updateRates=true when pricing was extracted so existing dogs get
  // their rates refreshed from the external site (source of truth, REQ-201).
  const dogData = mapToDog(externalData);
  const { dog, created: dogCreated, updated: dogUpdated } = await upsertDog(
    supabase,
    dogData,
    { overwriteManual, updateRates: externalData.pricing != null }
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

  // 2b. Process secondary pets for multi-pet appointments.
  // Each secondary pet gets their own dog record and boarding (same dates),
  // using their individual rates from pricing.perPetRates.
  const allPetNames = externalData.all_pet_names ?? [];
  const perPetRates = externalData.pricing?.perPetRates ?? [];
  for (let p = 1; p < allPetNames.length; p++) {
    const petName = allPetNames[p];
    const petRates = perPetRates[p] ?? {};
    const secondaryDogData = {
      name: petName,
      night_rate: petRates.nightRate ?? 0,
      day_rate: petRates.dayRate ?? 0,
      active: true,
      source: 'external',
      // No external_id — secondary pets are matched by name, not appointment id
    };
    const { dog: secondaryDog } = await upsertDog(
      supabase,
      secondaryDogData,
      { overwriteManual, updateRates: externalData.pricing != null }
    );
    if (externalData.check_in_datetime && externalData.check_out_datetime) {
      await upsertBoarding(supabase, {
        dog_id: secondaryDog.id,
        arrival_datetime: externalData.check_in_datetime,
        departure_datetime: externalData.check_out_datetime,
        source: 'external',
        external_id: `${externalData.external_id}_p${p}`,
        billed_amount: null,
        night_rate: petRates.nightRate ?? null,
        day_rate: petRates.dayRate ?? null,
      });
    }
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
