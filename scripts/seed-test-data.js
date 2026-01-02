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

const TEST_INVITE_CODES = ['TESTCODE1', 'TESTCODE2', 'TESTCODE3'];

export async function seedDatabase() {
  console.log('🌱 Seeding test data...\n');
  console.log(`Environment: ${environment}`);
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  // Create test users
  console.log('Creating test users...');
  for (const user of TEST_USERS) {
    const { error } = await supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error && !error.message.includes('already') && !error.message.includes('exists')) {
      console.error(`  ✗ ${user.email}: ${error.message}`);
    } else {
      console.log(`  ✓ ${user.email}`);
    }
  }

  // Create invite codes
  console.log('\nCreating invite codes...');
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  for (const code of TEST_INVITE_CODES) {
    const { error } = await supabase.from('invite_codes').upsert(
      { code, expires_at: expiresAt },
      { onConflict: 'code' }
    );
    if (error) {
      console.error(`  ✗ ${code}: ${error.message}`);
    } else {
      console.log(`  ✓ ${code}`);
    }
  }

  // Create dogs
  console.log('\nCreating dogs...');
  const insertedDogs = [];
  for (const dog of TEST_DOGS) {
    const { data, error } = await supabase
      .from('dogs')
      .upsert(dog, { onConflict: 'name' })
      .select()
      .single();
    if (error) {
      console.error(`  ✗ ${dog.name}: ${error.message}`);
    } else {
      console.log(`  ✓ ${dog.name}`);
      insertedDogs.push(data);
    }
  }

  // If upsert doesn't return data, fetch all dogs
  let dogs = insertedDogs.filter(Boolean);
  if (dogs.length === 0) {
    const { data } = await supabase.from('dogs').select('id, name');
    dogs = data || [];
  }

  // Create employees
  console.log('\nCreating employees...');
  for (const emp of TEST_EMPLOYEES) {
    const { error } = await supabase
      .from('employees')
      .upsert(emp, { onConflict: 'name' });
    if (error) {
      console.error(`  ✗ ${emp.name}: ${error.message}`);
    } else {
      console.log(`  ✓ ${emp.name}`);
    }
  }

  // Fetch employees for night assignments
  const { data: employees } = await supabase.from('employees').select('id, name');

  // Create settings
  console.log('\nCreating settings...');
  const { error: settingsError } = await supabase.from('settings').upsert({
    id: 'default',
    net_percentage: 65,
  });
  if (settingsError) {
    console.error(`  ✗ Settings: ${settingsError.message}`);
  } else {
    console.log('  ✓ Default settings (65% net)');
  }

  // Create sample boardings (past 30 days + next 30 days)
  console.log('\nCreating sample boardings...');
  const today = new Date();
  let boardingCount = 0;

  if (dogs.length > 0) {
    for (let dayOffset = -30; dayOffset < 30; dayOffset++) {
      // ~70% chance of having boardings on any given day
      if (Math.random() < 0.3) continue;

      const numDogs = Math.floor(Math.random() * 4) + 1;
      const selectedDogs = [...dogs].sort(() => Math.random() - 0.5).slice(0, numDogs);

      for (const dog of selectedDogs) {
        const arrival = new Date(today);
        arrival.setDate(arrival.getDate() + dayOffset);
        arrival.setHours(14, 0, 0, 0);

        const stayLength = Math.floor(Math.random() * 5) + 1;
        const departure = new Date(arrival);
        departure.setDate(departure.getDate() + stayLength);
        departure.setHours(10, 0, 0, 0);

        const { error } = await supabase.from('boardings').insert({
          dog_id: dog.id,
          dog_name: dog.name,
          arrival_datetime: arrival.toISOString(),
          departure_datetime: departure.toISOString(),
        });

        if (!error) boardingCount++;
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
      date.setDate(date.getDate() + dayOffset);
      const dateStr = date.toISOString().split('T')[0];

      const randomEmployee = activeEmployees[Math.floor(Math.random() * activeEmployees.length)];

      const { error } = await supabase.from('night_assignments').upsert(
        { date: dateStr, employee_id: randomEmployee.id },
        { onConflict: 'date' }
      );

      if (!error) assignmentCount++;
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
  console.log('\nTest invite codes:');
  TEST_INVITE_CODES.forEach(c => console.log(`  🎟️  ${c}`));
  console.log('\nData created:');
  console.log(`  🐕 ${dogs.length} dogs`);
  console.log(`  👤 ${TEST_EMPLOYEES.length} employees`);
  console.log(`  📅 ${boardingCount} boardings`);
  console.log(`  🌙 ${assignmentCount} night assignments`);
}

// Run if called directly
seedDatabase().catch(error => {
  console.error('\n❌ Seeding failed:', error.message);
  process.exit(1);
});
