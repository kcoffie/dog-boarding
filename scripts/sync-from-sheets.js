#!/usr/bin/env node
/* global process */
/**
 * Sync Data from Google Sheets
 *
 * Imports boarding data from Google Sheets matrix format into the database.
 * Handles the conversion from day/night matrix to arrival/departure datetime pairs.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-from-sheets.js
 *
 * Or with npm (after configuring .env):
 *   npm run sync:sheets
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL (or VITE_SUPABASE_URL)');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Google Sheets configuration
const SPREADSHEET_ID = '13bcw4_HwkxuNJ2XR3s-zJ80oVUioe2HCOlByqFljE1Y';
const SHEET_GIDS = [
  { gid: '0', description: 'Nov 18 - Nov 29' },
  { gid: '7893528', description: 'Nov 30 - Dec 13' },
  { gid: '196567038', description: 'Dec 14 - Dec 27' },
  { gid: '1731530850', description: 'Dec 28 - Jan 10' },
];

// Default times for day/night stays
const DAY_ARRIVAL_HOUR = 8;    // 8 AM arrival for day stays
const DAY_DEPARTURE_HOUR = 18; // 6 PM departure for day stays
const NIGHT_ARRIVAL_HOUR = 14; // 2 PM arrival for overnight
const NIGHT_DEPARTURE_HOUR = 11; // 11 AM departure next day

/**
 * Fetch CSV data from Google Sheets
 */
async function fetchSheetCSV(gid) {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet ${gid}: ${response.status}`);
  }
  return await response.text();
}

/**
 * Parse CSV into rows
 */
function parseCSV(csvText) {
  const lines = csvText.split('\n');
  const rows = [];

  for (const line of lines) {
    // Simple CSV parsing - handle quoted values
    const row = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }

  return rows;
}

/**
 * Parse date from header like "Mon  18 Nov" or "Sat  28 Dec"
 */
function parseDateFromHeader(header, year = 2025) {
  if (!header) return null;

  const match = header.match(/(\d+)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (!match) return null;

  const day = parseInt(match[1]);
  const monthStr = match[2].toLowerCase();
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const month = months[monthStr];

  if (month === undefined) return null;

  // Handle year rollover (Nov/Dec 2024, Jan 2025)
  const actualYear = month <= 1 ? year + 1 : year;

  return new Date(actualYear, month, day);
}

/**
 * Parse a sheet's matrix format into dog data and presence records
 */
function parseSheetMatrix(rows) {
  const dogs = [];
  const presence = []; // Array of { dogName, date, hasDay, hasNight, dayRate, nightRate }

  if (rows.length < 2) return { dogs, presence };

  // Parse header row to get dates
  const headerRow = rows[0];
  const subHeaderRow = rows[1]; // Contains 'd' and 'n' markers

  // Find date columns - build a more robust mapping
  const dateColumns = [];
  let lastDateInfo = null;

  // First pass: identify all date columns
  for (let i = 4; i < headerRow.length; i++) {
    const header = headerRow[i];
    const subHeader = subHeaderRow[i]?.toLowerCase() || '';
    const date = parseDateFromHeader(header);

    if (date) {
      // New date found
      const nextSubHeader = subHeaderRow[i + 1]?.toLowerCase() || '';

      // Check if this date has d/n split or is a single column
      if (subHeader === 'n' || subHeader === 'd') {
        // d/n marker on the date column itself
        lastDateInfo = {
          date,
          dayCol: subHeader === 'd' ? i : (subHeader === 'n' ? null : i),
          nightCol: subHeader === 'n' ? i : null,
        };
        dateColumns.push(lastDateInfo);
      } else if (nextSubHeader === 'n') {
        // Date header, followed by n (night first pattern like sheet gid=0)
        lastDateInfo = {
          date,
          dayCol: null,  // Will be set when we find 'd'
          nightCol: null, // Will be set when we find 'n'
        };
        dateColumns.push(lastDateInfo);
      } else {
        // Standard pattern: date header spans d and n columns
        lastDateInfo = {
          date,
          dayCol: i,
          nightCol: i + 1,
        };
        dateColumns.push(lastDateInfo);
      }
    } else if (lastDateInfo) {
      // This might be a d or n column following the date
      if (subHeader === 'd') {
        lastDateInfo.dayCol = i;
      } else if (subHeader === 'n') {
        lastDateInfo.nightCol = i;
      }
    }
  }

  // Parse dog rows
  for (let rowIdx = 2; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];

    // Skip empty rows or summary rows
    const dogName = row[1]?.trim();
    if (!dogName || dogName === '' || dogName.toLowerCase().includes('num of dogs') ||
        dogName.toLowerCase().includes('total rate') || dogName.toLowerCase() === 'kat' ||
        dogName.toLowerCase() === 'max' || dogName.toLowerCase() === 'myles' ||
        dogName.toLowerCase() === 'kintaro' || dogName.toLowerCase() === 'kentaro' ||
        dogName.toLowerCase() === 'stephen' || dogName.toLowerCase() === 'sierra') {
      continue;
    }

    // Get rates - handle both column orders (day/night and night/day)
    let dayRate = parseFloat(row[2]) || parseFloat(row[3]) || 50;
    let nightRate = parseFloat(row[3]) || parseFloat(row[2]) || 60;

    // Detect column order from header row
    const col2Header = headerRow[2]?.toLowerCase() || '';

    if (col2Header.includes('night')) {
      // Swap if night rate comes first
      [dayRate, nightRate] = [nightRate, dayRate];
    }

    // Add dog info
    const existingDog = dogs.find(d => d.name.toLowerCase() === dogName.toLowerCase());
    if (!existingDog) {
      dogs.push({
        name: dogName,
        dayRate,
        nightRate,
      });
    }

    // Check each date for presence
    for (const { date, dayCol, nightCol } of dateColumns) {
      const dayValue = dayCol !== null ? row[dayCol]?.trim() : '';
      const nightValue = nightCol !== null ? row[nightCol]?.trim() : '';

      // Check if there's a booking (non-empty value that's a number = rate paid)
      const hasDay = dayValue && !isNaN(parseFloat(dayValue));
      const hasNight = nightValue && !isNaN(parseFloat(nightValue));

      if (hasDay || hasNight) {
        presence.push({
          dogName,
          date: date.toISOString().split('T')[0],
          hasDay,
          hasNight,
          dayRate: parseFloat(dayValue) || dayRate,
          nightRate: parseFloat(nightValue) || nightRate,
        });
      }
    }
  }

  return { dogs, presence };
}

/**
 * Convert presence records into boarding records with arrival/departure times
 */
function convertPresenceToBoardings(presence) {
  // Group presence by dog
  const byDog = {};
  for (const p of presence) {
    if (!byDog[p.dogName]) {
      byDog[p.dogName] = [];
    }
    byDog[p.dogName].push(p);
  }

  const boardings = [];

  for (const [dogName, dogPresence] of Object.entries(byDog)) {
    // Sort by date
    dogPresence.sort((a, b) => a.date.localeCompare(b.date));

    // Find consecutive stays
    let currentBoarding = null;

    for (let i = 0; i < dogPresence.length; i++) {
      const p = dogPresence[i];
      const pDate = new Date(p.date);

      if (!currentBoarding) {
        // Start new boarding
        const arrivalDate = new Date(pDate);
        if (p.hasDay) {
          arrivalDate.setHours(DAY_ARRIVAL_HOUR, 0, 0, 0);
        } else if (p.hasNight) {
          arrivalDate.setHours(NIGHT_ARRIVAL_HOUR, 0, 0, 0);
        }

        currentBoarding = {
          dogName,
          arrivalDate,
          lastDate: pDate,
          hasNightOnLastDay: p.hasNight,
        };
      } else {
        // Check if this is consecutive
        const prevDate = new Date(currentBoarding.lastDate);
        const dayDiff = (pDate - prevDate) / (1000 * 60 * 60 * 24);

        if (dayDiff <= 1) {
          // Extend current boarding
          currentBoarding.lastDate = pDate;
          currentBoarding.hasNightOnLastDay = p.hasNight;
        } else {
          // End current boarding and start new one
          const departureDate = new Date(currentBoarding.lastDate);
          if (currentBoarding.hasNightOnLastDay) {
            // Departure next day at 11 AM
            departureDate.setDate(departureDate.getDate() + 1);
            departureDate.setHours(NIGHT_DEPARTURE_HOUR, 0, 0, 0);
          } else {
            // Same day departure at 6 PM
            departureDate.setHours(DAY_DEPARTURE_HOUR, 0, 0, 0);
          }

          boardings.push({
            dogName,
            arrivalDateTime: currentBoarding.arrivalDate.toISOString(),
            departureDateTime: departureDate.toISOString(),
          });

          // Start new boarding
          const arrivalDate = new Date(pDate);
          if (p.hasDay) {
            arrivalDate.setHours(DAY_ARRIVAL_HOUR, 0, 0, 0);
          } else if (p.hasNight) {
            arrivalDate.setHours(NIGHT_ARRIVAL_HOUR, 0, 0, 0);
          }

          currentBoarding = {
            dogName,
            arrivalDate,
            lastDate: pDate,
            hasNightOnLastDay: p.hasNight,
          };
        }
      }
    }

    // Finish last boarding
    if (currentBoarding) {
      const departureDate = new Date(currentBoarding.lastDate);
      if (currentBoarding.hasNightOnLastDay) {
        departureDate.setDate(departureDate.getDate() + 1);
        departureDate.setHours(NIGHT_DEPARTURE_HOUR, 0, 0, 0);
      } else {
        departureDate.setHours(DAY_DEPARTURE_HOUR, 0, 0, 0);
      }

      boardings.push({
        dogName,
        arrivalDateTime: currentBoarding.arrivalDate.toISOString(),
        departureDateTime: departureDate.toISOString(),
      });
    }
  }

  return boardings;
}

/**
 * Main sync function
 */
async function syncFromSheets() {
  console.log('🔄 Starting sync from Google Sheets...\n');

  const allDogs = [];
  const allPresence = [];

  // Fetch and parse all sheets
  for (const { gid, description } of SHEET_GIDS) {
    console.log(`📥 Fetching sheet: ${description} (gid=${gid})...`);
    try {
      const csvText = await fetchSheetCSV(gid);
      const rows = parseCSV(csvText);
      const { dogs, presence } = parseSheetMatrix(rows);

      console.log(`   Found ${dogs.length} dogs, ${presence.length} presence records`);

      // Merge dogs (avoid duplicates)
      for (const dog of dogs) {
        if (!allDogs.find(d => d.name.toLowerCase() === dog.name.toLowerCase())) {
          allDogs.push(dog);
        }
      }

      allPresence.push(...presence);
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  console.log(`\n📊 Total: ${allDogs.length} unique dogs, ${allPresence.length} presence records\n`);

  // Convert presence to boardings
  const boardings = convertPresenceToBoardings(allPresence);
  console.log(`📅 Converted to ${boardings.length} boarding records\n`);

  // Get existing data
  const { data: existingDogs } = await supabase.from('dogs').select('id, name');
  const { data: existingBoardings } = await supabase.from('boardings').select('id, dog_id, arrival_datetime, departure_datetime');

  console.log(`📁 Existing: ${existingDogs?.length || 0} dogs, ${existingBoardings?.length || 0} boardings\n`);

  // Get a user ID for seeding
  const { data: users } = await supabase.auth.admin.listUsers();
  const seedUserId = users?.users?.[0]?.id;

  if (!seedUserId) {
    console.error('❌ No users found in database. Please create a user first.');
    process.exit(1);
  }

  // Create missing dogs
  console.log('🐕 Creating missing dogs...');
  let dogsCreated = 0;
  const dogNameToId = {};

  // Map existing dogs
  for (const dog of existingDogs || []) {
    dogNameToId[dog.name.toLowerCase()] = dog.id;
  }

  for (const dog of allDogs) {
    const key = dog.name.toLowerCase();
    if (!dogNameToId[key]) {
      const { data, error } = await supabase
        .from('dogs')
        .insert({
          name: dog.name,
          day_rate: dog.dayRate,
          night_rate: dog.nightRate,
          active: true,
          user_id: seedUserId,
        })
        .select()
        .single();

      if (error) {
        console.error(`   ❌ ${dog.name}: ${error.message}`);
      } else {
        dogNameToId[key] = data.id;
        dogsCreated++;
        console.log(`   ✓ ${dog.name} (created)`);
      }
    } else {
      console.log(`   ✓ ${dog.name} (exists)`);
    }
  }

  console.log(`\n   Created ${dogsCreated} new dogs\n`);

  // Create boardings (skip duplicates by checking date ranges)
  console.log('📅 Creating boardings...');
  let boardingsCreated = 0;
  let boardingsSkipped = 0;

  for (const boarding of boardings) {
    const dogId = dogNameToId[boarding.dogName.toLowerCase()];
    if (!dogId) {
      console.error(`   ❌ Unknown dog: ${boarding.dogName}`);
      continue;
    }

    // Check for existing boarding with same dog and overlapping dates
    const existingOverlap = existingBoardings?.find(eb => {
      if (eb.dog_id !== dogId) return false;

      const existStart = new Date(eb.arrival_datetime);
      const existEnd = new Date(eb.departure_datetime);
      const newStart = new Date(boarding.arrivalDateTime);
      const newEnd = new Date(boarding.departureDateTime);

      // Check for overlap
      return newStart < existEnd && newEnd > existStart;
    });

    if (existingOverlap) {
      boardingsSkipped++;
      continue;
    }

    const { error } = await supabase.from('boardings').insert({
      dog_id: dogId,
      arrival_datetime: boarding.arrivalDateTime,
      departure_datetime: boarding.departureDateTime,
      user_id: seedUserId,
    });

    if (error) {
      console.error(`   ❌ ${boarding.dogName}: ${error.message}`);
    } else {
      boardingsCreated++;
    }
  }

  console.log(`   Created ${boardingsCreated} new boardings`);
  console.log(`   Skipped ${boardingsSkipped} existing/overlapping boardings\n`);

  // Summary
  console.log('═'.repeat(50));
  console.log('✅ Sync complete!');
  console.log('═'.repeat(50));
  console.log(`\n🐕 Dogs: ${dogsCreated} created, ${allDogs.length - dogsCreated} existing`);
  console.log(`📅 Boardings: ${boardingsCreated} created, ${boardingsSkipped} skipped`);
}

// Run
syncFromSheets().catch(error => {
  console.error('\n❌ Sync failed:', error.message);
  process.exit(1);
});
