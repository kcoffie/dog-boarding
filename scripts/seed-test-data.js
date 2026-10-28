#!/usr/bin/env node
/* global process */
/**
 * Seed Test Data Script
 *
 * Populates the database with realistic test data for development/staging.
 * Uses service role key for admin operations.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-test-data.js
 *
 * Or with npm (after configuring .env):
 *   npm run seed
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL (or VITE_SUPABASE_URL)');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  console.error('\nExample:');
  console.error('   SUPABASE_URL=https://xxx.supabase.co \\');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \\');
  console.error('   node scripts/seed-test-data.js');
  process.exit(1);
}

// Safety check for production
const environment = process.env.VITE_ENVIRONMENT || 'development';
if (environment === 'production') {
  console.error('❌ Cannot seed production database!');
  console.error('   Set VITE_ENVIRONMENT to "development" or "staging"');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_USERS = [
  { email: 'admin@test.com', password: 'TestPass123!' },
  { email: 'user1@test.com', password: 'TestPass123!' },
  { email: 'user2@test.com', password: 'TestPass123!' },
];

const TEST_DOGS = [
  { name: 'Luna', day_rate: 35, night_rate: 45, notes: 'Loves belly rubs', active: true },
  { name: 'Cooper', day_rate: 35, night_rate: 45, notes: 'Needs medication at 8am', active: true },
  { name: 'Bella', day_rate: 40, night_rate: 50, notes: '', active: true },
  { name: 'Max', day_rate: 35, night_rate: 45, notes: 'Good with other dogs', active: true },
  { name: 'Daisy', day_rate: 30, night_rate: 40, notes: 'Senior dog, gentle walks only', active: true },
  { name: 'Charlie', day_rate: 35, night_rate: 45, notes: '', active: true },
  { name: 'Buddy', day_rate: 40, night_rate: 50, notes: 'High energy, needs lots of play', active: true },
  { name: 'Sadie', day_rate: 35, night_rate: 45, notes: '', active: false },
];

const TEST_EMPLOYEES = [
  { name: 'Kate', active: true },
  { name: 'Nick', active: true },
  { name: 'Alex', active: true },
  { name: 'Sam', active: false },
];


export async function seedDatabase() {
  console.log('🌱 Seeding test data...\n');
  console.log(`Environment: ${environment}`);
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  // Create test users
  console.log('Creating test users...');
  let seedUserId = null;
  for (const user of TEST_USERS) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error && !error.message.includes('already') && !error.message.includes('exists')) {
      console.error(`  ✗ ${user.email}: ${error.message}`);
    } else {
      console.log(`  ✓ ${user.email}`);
      // Use first user's ID for seeding data
      if (!seedUserId && data?.user?.id) {
        seedUserId = data.user.id;
      }
    }
  }

  // Get seed user ID if not set (user already existed)
  if (!seedUserId) {
    const { data: users } = await supabase.auth.admin.listUsers();
    const testUser = users?.users?.find(u => u.email === 'admin@test.com');
    seedUserId = testUser?.id;
  }

  if (!seedUserId) {
    console.error('  ⚠ Could not get user ID for seeding, some operations may fail');
  }

  // Create dogs (check if exists first, then insert)
  console.log('\nCreating dogs...');
  for (const dog of TEST_DOGS) {
    // Check if dog already exists
    const { data: existing } = await supabase
      .from('dogs')
      .select('id')
      .eq('name', dog.name)
      .single();

    if (existing) {
      console.log(`  ✓ ${dog.name} (exists)`);
    } else {
      const { error } = await supabase.from('dogs').insert({ ...dog, user_id: seedUserId });
      if (error) {
        console.error(`  ✗ ${dog.name}: ${error.message}`);
      } else {
        console.log(`  ✓ ${dog.name}`);
      }
    }
  }

  // Fetch all dogs for boarding creation
  const { data: dogs } = await supabase.from('dogs').select('id, name');
  const dogList = dogs || [];

  // Create employees (check if exists first, then insert)
  console.log('\nCreating employees...');
  for (const emp of TEST_EMPLOYEES) {
    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('name', emp.name)
      .single();

    if (existing) {
      console.log(`  ✓ ${emp.name} (exists)`);
    } else {
      const { error } = await supabase.from('employees').insert({ ...emp, user_id: seedUserId });
      if (error) {
        console.error(`  ✗ ${emp.name}: ${error.message}`);
      } else {
        console.log(`  ✓ ${emp.name}`);
      }
    }
  }

  // Fetch employees for night assignments
  const { data: employees } = await supabase.from('employees').select('id, name');

  // Create/update settings
  console.log('\nCreating settings...');
  const { data: existingSettings } = await supabase
    .from('settings')
    .select('id')
    .limit(1)
    .single();

  if (existingSettings) {
    const { error: settingsError } = await supabase
      .from('settings')
      .update({ net_percentage: 65 })
      .eq('id', existingSettings.id);
    if (settingsError) {
      console.error(`  ✗ Settings: ${settingsError.message}`);
    } else {
      console.log('  ✓ Default settings updated (65% net)');
    }
  } else {
    const { error: settingsError } = await supabase
      .from('settings')
      .insert({ net_percentage: 65 });
    if (settingsError) {
      console.error(`  ✗ Settings: ${settingsError.message}`);
    } else {
      console.log('  ✓ Default settings created (65% net)');
    }
  }

  // Create sample boardings (past 30 days + next 30 days)
  console.log('\nCreating sample boardings...');
  const today = new Date();
  let boardingCount = 0;

  if (dogList.length > 0) {
    for (let dayOffset = -30; dayOffset < 30; dayOffset++) {
      // ~70% chance of having boardings on any given day
      if (Math.random() < 0.3) continue;

      const numDogs = Math.floor(Math.random() * 4) + 1;
      const selectedDogs = [...dogList].sort(() => Math.random() - 0.5).slice(0, numDogs);

      for (const dog of selectedDogs) {
        // Booking times are site clock values (ADR-009): 2pm San Francisco is stored as 14:00Z
        const arrival = new Date(today);
        arrival.setUTCDate(arrival.getUTCDate() + dayOffset);
        arrival.setUTCHours(14, 0, 0, 0);

        const stayLength = Math.floor(Math.random() * 5) + 1;
        const departure = new Date(arrival);
        departure.setUTCDate(departure.getUTCDate() + stayLength);
        departure.setUTCHours(10, 0, 0, 0);

        const { error } = await supabase.from('boardings').insert({
          dog_id: dog.id,
          arrival_datetime: arrival.toISOString(),
          departure_datetime: departure.toISOString(),
          user_id: seedUserId,
        });

        if (error) {
          // Log first error to help debug
          if (boardingCount === 0) console.error(`    First error: ${error.message}`);
        } else {
          boardingCount++;
        }
      }
    }
    console.log(`  ✓ ${boardingCount} boardings created`);
  } else {
    console.log('  ⚠ No dogs found, skipping boardings');
  }

  // Create night assignments
  console.log('\nCreating night assignments...');
  let assignmentCount = 0;

  if (employees && employees.length > 0) {
    const activeEmployees = employees.filter(e =>
      TEST_EMPLOYEES.find(te => te.name === e.name)?.active !== false
    );

    for (let dayOffset = -7; dayOffset < 14; dayOffset++) {
      const date = new Date(today);
      date.setDate(date.getDate() + dayOffset); // real-moment: a calendar date for night assignments
      const dateStr = date.toISOString().split('T')[0];

      const randomEmployee = activeEmployees[Math.floor(Math.random() * activeEmployees.length)];

      // Check if assignment exists for this date
      const { data: existing } = await supabase
        .from('night_assignments')
        .select('id')
        .eq('date', dateStr)
        .single();

      if (existing) {
        assignmentCount++; // Count as success since it exists
      } else {
        const { error } = await supabase.from('night_assignments').insert({
          date: dateStr,
          employee_id: randomEmployee.id,
          user_id: seedUserId,
        });

        if (error) {
          if (assignmentCount === 0) console.error(`    First error: ${error.message}`);
        } else {
          assignmentCount++;
        }
      }
    }
    console.log(`  ✓ ${assignmentCount} night assignments created`);
  } else {
    console.log('  ⚠ No employees found, skipping night assignments');
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Seeding complete!');
  console.log('═'.repeat(50));
  console.log('\nTest accounts:');
  TEST_USERS.forEach(u => console.log(`  📧 ${u.email} / ${u.password}`));
  console.log('\nData created:');
  console.log(`  🐕 ${dogList.length} dogs`);
  console.log(`  👤 ${employees?.length || 0} employees`);
  console.log(`  📅 ${boardingCount} boardings`);
  console.log(`  🌙 ${assignmentCount} night assignments`);
}

// Run if called directly
seedDatabase().catch(error => {
  console.error('\n❌ Seeding failed:', error.message);
  process.exit(1);
});
