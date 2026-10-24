/**
 * Data mapping module - maps external data to app schema
 * @requirements REQ-103, REQ-201
 */

import { createClient } from '@supabase/supabase-js';
import { SCRAPER_CONFIG } from './config.js';
import { detectChangesSync } from './changeDetection.js';
import { mappingLogger } from './logger.js';
import { enqueue } from './syncQueue.js';

/**
 * Identify night and day line items from a pricing result.
 * Night = first line item whose name does NOT match SCRAPER_CONFIG.dayServicePatterns.
 * Day   = first line item whose name DOES match any dayServicePattern.
 * Works for 1 or more line items — a single non-day service is unambiguously a night
 * service and is classified accordingly (REQ-201).
 *
 * @param {{ total: number, lineItems: Array } | null} pricing
 * @returns {{ nightItem: Object|null, dayItem: Object|null }}
 */
function classifyPricingItems(pricing) {
  if (!pricing || !pricing.lineItems || pricing.lineItems.length === 0) {
    return { nightItem: null, dayItem: null };
  }
  const { dayServicePatterns } = SCRAPER_CONFIG;
  const nightItem = pricing.lineItems.find(
    item => !dayServicePatterns.some(p => p.test(item.serviceName))
  ) ?? null;
  const dayItem = pricing.lineItems.find(
    item => dayServicePatterns.some(p => p.test(item.serviceName))
  ) ?? null;
  mappingLogger.log(
    `[Mapping] classifyPricingItems: ${pricing.lineItems.length} item(s) →`,
    `night=${nightItem ? `$${nightItem.rate} (${nightItem.serviceName})` : 'none'}`,
    `day=${dayItem ? `$${dayItem.rate} (${dayItem.serviceName})` : 'none'}`
  );
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
 * A booking's night and day rates from its pricing when it has one pet (REQ-201): the first non-day
 * line item's rate and the first day line item's. Null for a rate the pricing doesn't hold.
 *
 * @param {{ total: number, lineItems: Array } | null} pricing
 * @returns {{ nightRate: number|null, dayRate: number|null }}
 */
export function ratesFromPricing(pricing) {
  const { nightItem, dayItem } = classifyPricingItems(pricing);
  return { nightRate: nightItem ? nightItem.rate : null, dayRate: dayItem ? dayItem.rate : null };
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
    arrival_ampm: externalData.check_in_ampm ?? null,
    departure_ampm: externalData.check_out_ampm ?? null,
    source: 'external',
    external_id: externalData.external_id,
    billed_amount:  pricing ? pricing.total : null,
    night_rate:     nightItem ? nightItem.rate : null,
    day_rate:       dayItem   ? dayItem.rate   : null,
    booking_status: externalData.booking_status ?? 'confirmed',
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

const norm = (text) => (text ?? '').trim().toLowerCase();

/**
 * Dogs holding this booking-site pet ID. Two at most are read: more than one means the unique index
 * (migration 030) isn't in place yet and the data is wrong (#344).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} petId
 * @returns {Promise<Object[]>}
 */
export async function findDogsByPetId(supabase, petId) {
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .eq('external_pet_id', petId)
    .limit(2);

  if (error) throw error;

  return data;
}

/**
 * Dogs with exactly this name, ignoring case and outer spaces (#344). The LIKE pattern escapes its
 * wildcards and allows spaces around the stored name; the exact comparison then drops anything else.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} name
 * @returns {Promise<Object[]>}
 */
export async function findDogsByName(supabase, name) {
  const { data, error } = await supabase
    .from('dogs')
    .select('*')
    .ilike('name', `%${name.trim().replace(/[\\%_]/g, '\\$&')}%`);

  if (error) throw error;

  return data.filter((dog) => norm(dog.name) === norm(name));
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
    .maybeSingle();

  if (error) throw error;

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
    .maybeSingle();

  if (error) throw error;

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
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

// ── Dog identity (#344, ADR-008) ───────────────────────────────────────────────────────────────
// A dog is its booking-site pet ID, read from the pet's own element on the booking's page. The sync
// never renames a dog and never changes a stored pet ID; what it can't decide becomes a notice for
// Kate's one alert per run. `dogs.external_id` is no longer written.

// A dog the booking site still books is active again, unless Kate entered it by hand (her choice stands)
const activeField = (dog) => (dog.source === 'manual' ? {} : { active: true });

// The rate fields to write: only when this sync read pricing, and never a 0 over a stored rate (REQ-201)
function rateFields(rates, updateRates) {
  const fields = {};
  if (!updateRates || !rates) return fields;
  if (rates.nightRate > 0) fields.night_rate = rates.nightRate;
  if (rates.dayRate > 0) fields.day_rate = rates.dayRate;
  return fields;
}

// The dog this pet already is: refresh its rates, never its name. A different name on the site is a notice.
async function takeDog(supabase, dog, pet, rates, updateRates) {
  const notice = norm(dog.name) === norm(pet.name) ? null
    : `pet ${pet.id} is "${pet.name}" on the booking site but "${dog.name}" in the app (not renamed)`;
  const { data, error } = await supabase
    .from('dogs')
    .update({ ...activeField(dog), ...rateFields(rates, updateRates) })
    .eq('id', dog.id)
    .select()
    .single();
  if (error) throw error;
  return { dog: data, created: false, updated: true, notice };
}

// Who the booking's client is, by ID where both sides have one, else by name. null = can't tell.
function sameClient(syncRow, page) {
  const storedUid = syncRow.raw_data?.client_uid ?? null;
  if (storedUid && page.clientUid) return storedUid === page.clientUid;
  const storedName = norm(syncRow.client_name);
  if (storedName && norm(page.clientName)) return storedName === norm(page.clientName);
  return null;
}

/**
 * What the stored bookings say about linking this pet to a same-name dog that has no pet ID yet
 * (Kate, 2026-10-24: link only with evidence). Any booking of the dog's from another client rules it
 * out. Otherwise this same booking already holding a boarding on the dog, or the dog's bookings
 * naming this client, is evidence.
 *
 * @returns {Promise<'other_client'|'this_booking'|'same_client'|'none'>}
 */
async function linkEvidence(supabase, dog, page) {
  const { data: dogBoardings, error: boardingsErr } = await supabase
    .from('boardings')
    .select('external_id')
    .eq('dog_id', dog.id);
  if (boardingsErr) throw boardingsErr;
  const bookingIds = [...new Set(dogBoardings.map((b) => (b.external_id ?? '').replace(/_p\d+$/, '')).filter(Boolean))];

  const syncRows = [];
  if (bookingIds.length > 0) {
    const { data, error } = await supabase
      .from('sync_appointments')
      .select('external_id, client_name, raw_data')
      .in('external_id', bookingIds);
    if (error) throw error;
    syncRows.push(...data);
  }
  const { data: mapped, error: mappedErr } = await supabase
    .from('sync_appointments')
    .select('external_id, client_name, raw_data')
    .eq('mapped_dog_id', dog.id);
  if (mappedErr) throw mappedErr;
  syncRows.push(...mapped);

  const verdicts = syncRows.map((row) => sameClient(row, page));
  if (verdicts.includes(false)) return 'other_client';
  if (page.bookingBoardings.some((b) => b.dog_id === dog.id)) return 'this_booking';
  return verdicts.includes(true) ? 'same_client' : 'none';
}

// Write the pet ID onto a dog only while it has none, in the same query; another run may get there first.
// A link is reported too, with its evidence: Kate can see each one the sync made (#344).
async function linkPetId(supabase, dog, pet, rates, updateRates, evidence) {
  const { data, error } = await supabase
    .from('dogs')
    .update({ external_pet_id: pet.id, ...activeField(dog), ...rateFields(rates, updateRates) })
    .eq('id', dog.id)
    .is('external_pet_id', null)
    .select();
  if (error && error.code !== '23505') throw error;
  if (!error && data.length === 1) {
    const why = evidence === 'this_booking' ? 'this booking already had a boarding on it' : 'its bookings name this client';
    return { dog: data[0], created: false, updated: true,
      notice: `linked pet ${pet.id} ("${pet.name}") to the app's dog of that name (${dog.id}): ${why}` };
  }
  // 23505: another dog got this pet ID; 0 rows: this dog got a pet ID. Either way, read who holds it now.
  const holders = await findDogsByPetId(supabase, pet.id);
  if (holders.length === 1) return takeDog(supabase, holders[0], pet, rates, updateRates);
  return { dog: null, created: false, updated: false,
    notice: `"${pet.name}" (pet ${pet.id}): another sync run gave the app's dog with that name a different pet ID first; nothing saved for this pet` };
}

// A dog for a pet nobody has yet. A duplicate (23505) means another run created it first: use that one.
async function createDog(supabase, row, pet, rates, updateRates) {
  const { data, error } = await supabase.from('dogs').insert(row).select().single();
  if (error?.code === '23505' && pet) {
    const holders = await findDogsByPetId(supabase, pet.id);
    if (holders.length === 1) return takeDog(supabase, holders[0], pet, rates, updateRates);
  }
  if (error) throw error;
  mappingLogger.log(`[Mapping] ➕ Created dog ${data.id}${pet ? ` for pet ${pet.id}` : ' (no pet on the page)'}`);
  return { dog: data, created: true, updated: false, notice: null };
}

/**
 * The dog for one pet on a booking's page (#344, ADR-008):
 *   - a dog holding the pet ID is the dog (name differences are a notice, never a rename);
 *   - else exactly one same-name dog without a pet ID, with evidence it's this pet, is linked;
 *   - else, when no same-name dog lacks a pet ID, a new dog is created with the ID;
 *   - anything else writes nothing for this pet and returns a notice.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ id: string|null, name: string }} pet
 * @param {{ rates: Object|null, updateRates: boolean, page: { clientUid: string|null, clientName: string|null, bookingBoardings: Object[] } }} context
 * @returns {Promise<{ dog: Object|null, created: boolean, updated: boolean, notice: string|null }>}
 */
export async function resolvePetDog(supabase, pet, { rates, updateRates, page }) {
  const nothing = (notice) => ({ dog: null, created: false, updated: false, notice });
  if (!pet.id) return nothing(`"${pet.name}": the page gave no usable pet ID, so nothing was saved for this pet`);

  const holders = await findDogsByPetId(supabase, pet.id);
  if (holders.length > 1) return nothing(`pet ${pet.id} ("${pet.name}") is on ${holders.length} dogs in the app; nothing saved for this pet`);
  if (holders.length === 1) return takeDog(supabase, holders[0], pet, rates, updateRates);

  const withoutId = (await findDogsByName(supabase, pet.name)).filter((dog) => !dog.external_pet_id);
  if (withoutId.length > 1) {
    return nothing(`"${pet.name}" (pet ${pet.id}): ${withoutId.length} dogs in the app have that name and no pet ID; nothing saved for this pet`);
  }
  if (withoutId.length === 1) {
    const evidence = await linkEvidence(supabase, withoutId[0], page);
    if (evidence === 'other_client') {
      return nothing(`"${pet.name}" (pet ${pet.id}): the app's dog with that name has bookings from another client; not linked, nothing saved for this pet`);
    }
    if (evidence === 'none') {
      return nothing(`"${pet.name}" (pet ${pet.id}): the app has a dog with that name, but nothing shows it's this pet; not linked, nothing saved for this pet`);
    }
    return linkPetId(supabase, withoutId[0], pet, rates, updateRates, evidence);
  }

  return createDog(supabase, {
    name: pet.name,
    external_pet_id: pet.id,
    night_rate: rates?.nightRate ?? 0,
    day_rate: rates?.dayRate ?? 0,
    active: true,
    source: 'external',
  }, pet, rates, updateRates);
}

/**
 * The dog for a booking page with no pet element: a staff member's own dog, named only in the title
 * (#49; Kate, 2026-10-24). Such a dog never has a pet ID: exactly one same-name dog without one is it,
 * none means a new one, more than one writes nothing and returns a notice.
 *
 * @returns {Promise<{ dog: Object|null, created: boolean, updated: boolean, notice: string|null }>}
 */
export async function resolveTitleDog(supabase, name, { rates, updateRates }) {
  if (!name) return { dog: null, created: false, updated: false, notice: 'no pet on the page and no name in its title; nothing saved' };
  const withoutId = (await findDogsByName(supabase, name)).filter((dog) => !dog.external_pet_id);
  if (withoutId.length > 1) {
    return { dog: null, created: false, updated: false,
      notice: `"${name}" (no pet on the page): ${withoutId.length} dogs in the app have that name and no pet ID; nothing saved` };
  }
  if (withoutId.length === 1) {
    const { data, error } = await supabase
      .from('dogs')
      .update({ ...activeField(withoutId[0]), ...rateFields(rates, updateRates) })
      .eq('id', withoutId[0].id)
      .select()
      .single();
    if (error) throw error;
    return { dog: data, created: false, updated: true, notice: null };
  }
  return createDog(supabase, {
    name,
    night_rate: rates?.nightRate ?? 0,
    day_rate: rates?.dayRate ?? 0,
    active: true,
    source: 'external',
  }, null, rates, updateRates);
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
  // Three overlap cases:
  //   1. No external_id on overlap → manual boarding waiting to be linked — claim it.
  //   2. Same external_id on overlap → .single() returned 406 because multiple boardings
  //      share this external_id (data integrity issue). Reuse the overlap instead of
  //      creating yet another duplicate. Warn so the issue is visible in logs.
  //   3. Different external_id → amended appointment, create a new boarding.
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
    } else if (overlap && overlap.external_id === boardingData.external_id) {
      // Same external_id: findBoardingByExternalId returned 406 (multiple rows for this
      // external_id in the DB). Reuse the overlap rather than creating another duplicate.
      existing = overlap;
      mappingLogger.warn(
        `[Mapping] ⚠️  Multiple boardings with external_id ${boardingData.external_id} — reusing overlap ${overlap.id}.`,
        'DB has duplicate boardings that need cleanup (delete extras, keep one).'
      );
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
    if (boardingData.arrival_ampm   != null) updateFields.arrival_ampm   = boardingData.arrival_ampm;
    if (boardingData.departure_ampm != null) updateFields.departure_ampm = boardingData.departure_ampm;
    if (boardingData.booking_status != null) updateFields.booking_status = boardingData.booking_status;
    mappingLogger.log(
      `[Mapping] Updating boarding ${existing.id} (${boardingData.external_id}) —`,
      `billed=$${updateFields.billed_amount ?? 'null'},`,
      `night=$${updateFields.night_rate ?? 'null'},`,
      `day=$${updateFields.day_rate ?? 'null'}`
    );

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
  mappingLogger.log(
    `[Mapping] Creating new boarding for ${boardingData.external_id} —`,
    `billed=$${boardingData.billed_amount ?? 'null'},`,
    `night=$${boardingData.night_rate ?? 'null'},`,
    `day=$${boardingData.day_rate ?? 'null'}`
  );
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
      // Just update the last_synced_at timestamp, skip full update.
      // Exception: always write pricing fields when extracted — they are excluded from
      // HASH_FIELDS intentionally, so an unchanged record may still have null pricing
      // from before pricing extraction was deployed (REQ-201).
      const unchangedPayload = {
        last_synced_at: now,
        last_change_type: 'unchanged',
      };
      if (syncData.appointment_total != null)  unchangedPayload.appointment_total  = syncData.appointment_total;
      if (syncData.pricing_line_items != null) unchangedPayload.pricing_line_items = syncData.pricing_line_items;
      const { data, error } = await supabase
        .from('sync_appointments')
        .update(unchangedPayload)
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

// The booking's boardings: its own ID for one pet, `<id>_pN` for the others
async function findBookingBoardings(supabase, bookingId) {
  const { data, error } = await supabase
    .from('boardings')
    .select('*')
    .like('external_id', `${bookingId}%`);
  if (error) throw error;
  const escaped = bookingId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ownId = new RegExp(`^${escaped}(_p\\d+)?$`);
  return data.filter((b) => ownId.test(b.external_id ?? ''));
}

// The first of `<id>`, `<id>_p1`, `<id>_p2`… that no boarding holds
function freeSlot(bookingId, taken) {
  if (!taken.has(bookingId)) return bookingId;
  let n = 1;
  while (taken.has(`${bookingId}_p${n}`)) n++;
  return `${bookingId}_p${n}`;
}

// A form job for a current or upcoming boarding whose form isn't stored yet (REQ-501)
async function enqueueFormJob(supabase, boarding, petId, petName) {
  const departureDate = new Date(boarding.departure_datetime);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  if (departureDate < todayMidnight) {
    mappingLogger.log(`[Mapping] ⏭️ Form fetch skipped for boarding ${boarding.id} — departure ${boarding.departure_datetime} is in the past`);
    return;
  }
  try {
    // Skip enqueue only if the form is already stored — re-enqueue if the job
    // ran previously but no form was found yet (client hadn't submitted it yet).
    const { data: storedForm, error: formCheckErr } = await supabase
      .from('boarding_forms')
      .select('id')
      .eq('boarding_id', boarding.id)
      .maybeSingle();
    if (formCheckErr) throw formCheckErr;

    if (storedForm) {
      mappingLogger.log(`[Mapping] ⏭️ Form already stored for boarding ${boarding.id} — skipping enqueue`);
      return;
    }
    await enqueue(supabase, {
      external_id: `form_${boarding.id}`,
      source_url: `/pets/${petId}/forms`,
      title: petName,
      type: 'form',
      meta: { boarding_id: boarding.id, external_pet_id: petId },
      resetIfDone: true,
    });
    mappingLogger.log(`[Mapping] 🔄 Form fetch queued: boarding ${boarding.id}, pet ${petId}`);
  } catch (enqErr) {
    // Log but don't fail the sync for a failed form enqueue
    mappingLogger.warn(`[Mapping] ⚠️ Failed to enqueue form job for boarding ${boarding.id}: ${enqErr.message}`);
  }
}

// Each pet's rates. One pet (or none): every price on the page is its own. Several: only the price divs
// carrying the pet's ID are (#344); a pet without one gets no rates.
function ratesForPet(externalData, pet, petCount) {
  const pricing = externalData.pricing ?? null;
  if (!pricing) return null;
  if (petCount <= 1) return ratesFromPricing(pricing);
  return pet.id ? pricing.ratesByPet?.[pet.id] ?? null : null;
}

/**
 * Map and save a single external appointment to the database.
 *
 * Each pet on the page is resolved to its dog by pet ID (#344, ADR-008; see resolvePetDog). Each dog
 * keeps the boarding it already has on this booking, so a change in pet order never moves a boarding
 * to another dog; a pet without one takes the first free of `<id>`, `<id>_p1`… The `<id>` boarding
 * carries the booking's total. What the sync can't decide is returned in `notices`, not written.
 *
 * @param {Object} externalData - Data from scraper (`pets` from extractPets; `pet_name` is the title
 *   fallback for a page with no pet element)
 * @param {Object} [options]
 * @param {boolean} [options.forceUpdate=false] - Force update even if unchanged
 * @param {import('@supabase/supabase-js').SupabaseClient} [options.supabase] - Supabase client
 * @param {string[]} [options.schedulePetIds] - The schedule's pet IDs for this booking: a cross-check only
 * @returns {Promise<{dog: Object|null, boarding: Object|null, syncAppointment: Object|null, stats: Object, changeDetails: Object|null, notices: string[], skipped?: 'dateless_page'}>}
 */
export async function mapAndSaveAppointment(externalData, options = {}) {
  const { forceUpdate = false, supabase = getSupabaseClient(), schedulePetIds = [] } = options;

  const stats = {
    dogCreated: false,
    dogUpdated: false,
    boardingCreated: false,
    boardingUpdated: false,
    syncCreated: false,
    syncUpdated: false,
    syncUnchanged: false,
  };
  const notices = [];

  // 0. A booking page always has its dates. One without them isn't a booking (the week schedule
  // once came back here), so nothing from it is written: no dog, boarding or sync row (#344).
  if (!externalData.check_in_datetime || !externalData.check_out_datetime) {
    mappingLogger.warn(`[Mapping] ⛔ ${externalData.external_id}: no check-in/check-out on the page, nothing written`);
    return { dog: null, boarding: null, syncAppointment: null, stats, changeDetails: null, notices, skipped: 'dateless_page' };
  }

  const bookingId = externalData.external_id;
  const pets = externalData.pets ?? [];
  const updateRates = externalData.pricing != null;
  const bookingBoardings = await findBookingBoardings(supabase, bookingId);
  const page = { clientUid: externalData.client_uid ?? null, clientName: externalData.client_name ?? null, bookingBoardings };

  // The schedule's pet IDs are a cross-check only (#344)
  const pagePetIds = new Set(pets.map((p) => p.id).filter(Boolean));
  const missing = schedulePetIds.filter((id) => !pagePetIds.has(id));
  if (missing.length > 0) mappingLogger.warn(`[Mapping] ⚠️ ${bookingId}: schedule lists pet ID(s) ${missing.join(',')} that the booking's page doesn't`);

  // 1. Each pet's dog
  const resolved = [];
  if (pets.length === 0 && externalData.has_client_block) {
    // A client's booking whose pets can't be read: the page's layout may have changed (#344)
    notices.push('the page has a client but no pet the sync could read (layout change?); nothing saved for it');
  } else if (pets.length === 0) {
    const rates = ratesForPet(externalData, null, 0);
    const result = await resolveTitleDog(supabase, externalData.pet_name, { rates, updateRates });
    if (result.notice) notices.push(result.notice);
    if (result.dog) resolved.push({ pet: null, dog: result.dog, rates });
    stats.dogCreated ||= result.created;
    stats.dogUpdated ||= result.updated;
  }
  for (const pet of pets) {
    const rates = ratesForPet(externalData, pet, pets.length);
    // Rates by pet ID were confirmed on the rendered page only; until the raw page shows them, say so (#344)
    if (pets.length > 1 && externalData.pricing && pet.id && !rates) {
      notices.push(`pet ${pet.id} ("${pet.name}"): no price on the page carries its ID, so its rates weren't read (stored ones kept)`);
    }
    const result = await resolvePetDog(supabase, pet, { rates, updateRates, page });
    if (result.notice) notices.push(result.notice);
    stats.dogCreated ||= result.created;
    stats.dogUpdated ||= result.updated;
    if (!result.dog) continue;
    if (resolved.some((r) => r.dog.id === result.dog.id)) {
      notices.push(`two pets on the page are the same dog in the app (${result.dog.id}); the second wasn't saved`);
      continue;
    }
    resolved.push({ pet, dog: result.dog, rates });
  }

  // 2. Each dog's boarding: the one it already has on this booking, else a free slot
  const taken = new Set(bookingBoardings.map((b) => b.external_id));
  const base = mapToBoarding(externalData, null);
  const saved = [];
  for (const { pet, dog, rates } of resolved) {
    // The dog's own boarding on this booking, the booking's own ID first. Two of them is old data to check.
    const owned = bookingBoardings.filter((b) => b.dog_id === dog.id);
    const own = owned.find((b) => b.external_id === bookingId) ?? owned[0];
    if (owned.length > 1) {
      notices.push(`one dog (${dog.id}) has ${owned.length} boardings on this booking (${owned.map((b) => b.external_id).join(', ')}); only ${own.external_id} was updated`);
    }
    const externalId = own ? own.external_id : freeSlot(bookingId, taken);
    taken.add(externalId);
    const boardingData = { ...base, dog_id: dog.id, external_id: externalId, billed_amount: externalId === bookingId ? base.billed_amount : null };
    if (rates) {
      boardingData.night_rate = rates.nightRate;
      boardingData.day_rate = rates.dayRate;
    } else if (pets.length > 1 && externalData.pricing) {
      // Rates not read for this pet: keep what the boarding has
      delete boardingData.night_rate;
      delete boardingData.day_rate;
    } else {
      boardingData.night_rate = null;
      boardingData.day_rate = null;
    }
    const { boarding, created, updated } = await upsertBoarding(supabase, boardingData);
    stats.boardingCreated ||= created;
    stats.boardingUpdated ||= updated;
    saved.push({ pet, dog, boarding });

    // 2b. The form is fetched by this pet's own ID (REQ-501)
    if (pet?.id) await enqueueFormJob(supabase, boarding, pet.id, pet.name);
    else mappingLogger.log(`[Mapping] ⏭️ Form fetch skipped for boarding ${boarding.id} — no pet ID`);
  }

  // A boarding of this booking on a dog that isn't on its page now is left alone and reported
  if (resolved.length === pets.length) {
    for (const b of bookingBoardings) {
      if (!resolved.some((r) => r.dog.id === b.dog_id)) {
        notices.push(`boarding ${b.external_id} is on a dog that isn't on this booking's page now; left as it is`);
      }
    }
  }

  // 3. Upsert sync_appointment (raw data storage) with change detection, linked to the `<id>` boarding's dog
  const primary = saved.find((s) => s.boarding.external_id === bookingId) ?? saved[0] ?? null;
  const syncData = mapToSyncAppointment(externalData, primary?.dog.id ?? null, primary?.boarding.id ?? null);
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

  for (const notice of notices) mappingLogger.warn(`[Mapping] ⚠️ ${bookingId}: ${notice}`);

  return {
    dog: primary?.dog ?? null,
    boarding: primary?.boarding ?? null,
    syncAppointment,
    stats,
    changeDetails,
    notices,
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
  ratesFromPricing,
  mapToBoarding,
  mapToSyncAppointment,
  findDogsByPetId,
  findDogsByName,
  findBoardingByExternalId,
  findSyncAppointmentByExternalId,
  resolvePetDog,
  resolveTitleDog,
  upsertBoarding,
  upsertSyncAppointment,
  mapAndSaveAppointment,
  mapAndSaveAppointments,
};
