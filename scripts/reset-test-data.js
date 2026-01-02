#!/usr/bin/env node
/* global process */
/**
 * Reset Test Data Script
 *
 * Wipes all data and re-seeds the database.
 * Only works on development/staging environments.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/reset-test-data.js
 *
 * Or with npm (after configuring .env):
 *   npm run reset-db
 */

import { createClient } from '@supabase/supabase-js';
import { seedDatabase } from './seed-test-data.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL (or VITE_SUPABASE_URL)');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nExample:');
  console.error('   SUPABASE_URL=https://xxx.supabase.co \\');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \\');
  console.error('   node scripts/reset-test-data.js');
  process.exit(1);
}

// Safety check for production
const environment = process.env.VITE_ENVIRONMENT || 'development';
if (environment === 'production') {
  console.error('❌ Cannot reset production database!');
  console.error('   Set VITE_ENVIRONMENT to "development" or "staging"');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetDatabase() {
  console.log('🗑️  Resetting database...\n');
  console.log(`Environment: ${environment}`);
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  // Clear existing data in dependency order
  console.log('Clearing existing data...');

  // Night assignments (depends on employees)
  const { error: nightError } = await supabase
    .from('night_assignments')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
  if (nightError && !nightError.message.includes('does not exist')) {
    console.error(`  ✗ night_assignments: ${nightError.message}`);
  } else {
    console.log('  ✓ night_assignments cleared');
  }

  // Boardings (depends on dogs)
  const { error: boardingsError } = await supabase
    .from('boardings')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (boardingsError && !boardingsError.message.includes('does not exist')) {
    console.error(`  ✗ boardings: ${boardingsError.message}`);
  } else {
    console.log('  ✓ boardings cleared');
  }

  // Employees
  const { error: employeesError } = await supabase
    .from('employees')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (employeesError && !employeesError.message.includes('does not exist')) {
    console.error(`  ✗ employees: ${employeesError.message}`);
  } else {
    console.log('  ✓ employees cleared');
  }

  // Dogs
  const { error: dogsError } = await supabase
    .from('dogs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (dogsError && !dogsError.message.includes('does not exist')) {
    console.error(`  ✗ dogs: ${dogsError.message}`);
  } else {
    console.log('  ✓ dogs cleared');
  }

  // Invite codes
  const { error: inviteError } = await supabase
    .from('invite_codes')
    .delete()
    .neq('code', '');
  if (inviteError && !inviteError.message.includes('does not exist')) {
    console.error(`  ✗ invite_codes: ${inviteError.message}`);
  } else {
    console.log('  ✓ invite_codes cleared');
  }

  // Settings
  const { error: settingsError } = await supabase
    .from('settings')
    .delete()
    .neq('id', '');
  if (settingsError && !settingsError.message.includes('does not exist')) {
    console.error(`  ✗ settings: ${settingsError.message}`);
  } else {
    console.log('  ✓ settings cleared');
  }

  // Net percentage history
  const { error: netHistoryError } = await supabase
    .from('net_percentage_history')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (netHistoryError && !netHistoryError.message.includes('does not exist')) {
    // This table may not exist, which is fine
    if (!netHistoryError.message.includes('does not exist')) {
      console.log(`  ⚠ net_percentage_history: ${netHistoryError.message}`);
    }
  } else {
    console.log('  ✓ net_percentage_history cleared');
  }

  console.log('\nData cleared. Re-seeding...\n');
  console.log('═'.repeat(50));

  // Re-run seed
  await seedDatabase();
}

resetDatabase().catch(error => {
  console.error('\n❌ Reset failed:', error.message);
  process.exit(1);
});
