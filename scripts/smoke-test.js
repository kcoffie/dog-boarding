#!/usr/bin/env node
/* global process */
/**
 * Pre-Deploy Smoke Test
 *
 * Tests critical database operations against a real database before deploying.
 * Run this against your staging/UAT database before deploying to production.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:smoke
 *
 * Or use the UAT database:
 *   npm run test:smoke:uat
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Track created records for cleanup
const cleanup = {
  payments: [],
  boardings: [],
  dogs: [],
};

let testsPassed = 0;
let testsFailed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    testsFailed++;
  }
}

async function getTestUser() {
  const { data: { users } } = await supabase.auth.admin.listUsers();
  if (!users || users.length === 0) {
    throw new Error('No users found in database');
  }
  return users[0];
}

async function getTestEmployee() {
  const { data: employees, error } = await supabase
    .from('employees')
    .select('*')
    .limit(1);

  if (error) throw error;
  if (!employees || employees.length === 0) {
    throw new Error('No employees found in database');
  }
  return employees[0];
}

async function runSmokeTests() {
  console.log('\n🔥 Running Pre-Deploy Smoke Tests\n');
  console.log(`   Database: ${supabaseUrl}\n`);

  const user = await getTestUser();
  const employee = await getTestEmployee();

  // ============================================
  // DOG OPERATIONS
  // ============================================
  console.log('📦 Dog Operations');

  let testDog;
  await test('Create dog with all required fields', async () => {
    const { data, error } = await supabase
      .from('dogs')
      .insert([{
        name: '_SMOKE_TEST_DOG_',
        day_rate: 35,
        night_rate: 45,
        notes: 'Smoke test - safe to delete',
        active: true,
        user_id: user.id,
      }])
      .select()
      .single();

    if (error) throw error;
    if (!data.id) throw new Error('Dog ID not returned');
    testDog = data;
    cleanup.dogs.push(data.id);
  });

  await test('Read dog back', async () => {
    const { data, error } = await supabase
      .from('dogs')
      .select('*')
      .eq('id', testDog.id)
      .single();

    if (error) throw error;
    if (data.name !== '_SMOKE_TEST_DOG_') throw new Error('Dog name mismatch');
  });

  await test('Update dog', async () => {
    const { error } = await supabase
      .from('dogs')
      .update({ notes: 'Updated by smoke test' })
      .eq('id', testDog.id);

    if (error) throw error;
  });

  // ============================================
  // BOARDING OPERATIONS
  // ============================================
  console.log('\n📅 Boarding Operations');

  let testBoarding;
  await test('Create boarding with all required fields', async () => {
    const { data, error } = await supabase
      .from('boardings')
      .insert([{
        dog_id: testDog.id,
        arrival_datetime: '2099-01-15T14:00:00Z',
        departure_datetime: '2099-01-18T10:00:00Z',
        user_id: user.id,
      }])
      .select()
      .single();

    if (error) throw error;
    if (!data.id) throw new Error('Boarding ID not returned');
    testBoarding = data;
    cleanup.boardings.push(data.id);
  });

  await test('Read boarding back', async () => {
    const { data, error } = await supabase
      .from('boardings')
      .select('*')
      .eq('id', testBoarding.id)
      .single();

    if (error) throw error;
    if (data.dog_id !== testDog.id) throw new Error('Boarding dog_id mismatch');
  });

  // ============================================
  // PAYMENT OPERATIONS (Critical - caught the bug!)
  // ============================================
  console.log('\n💰 Payment Operations');

  let testPayment;
  await test('Create payment with user_id (REQ-041 bug fix)', async () => {
    const { data, error } = await supabase
      .from('payments')
      .insert([{
        employee_id: employee.id,
        amount: 0.01,
        start_date: '2099-01-15',
        end_date: '2099-01-17',
        nights: 3,
        dates: ['2099-01-15', '2099-01-16', '2099-01-17'],
        paid_date: '2099-01-20',
        user_id: user.id,  // This was the bug!
      }])
      .select()
      .single();

    if (error) throw error;
    if (!data.id) throw new Error('Payment ID not returned');
    testPayment = data;
    cleanup.payments.push(data.id);
  });

  await test('Read payment back with correct fields', async () => {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('id', testPayment.id)
      .single();

    if (error) throw error;
    if (!data.user_id) throw new Error('Payment missing user_id');
    if (!data.dates) throw new Error('Payment missing dates array');
    if (!data.paid_date) throw new Error('Payment missing paid_date');
    if (data.nights !== 3) throw new Error('Payment nights mismatch');
  });

  await test('Payment appears in list query', async () => {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('employee_id', employee.id)
      .order('paid_date', { ascending: false });

    if (error) throw error;
    const found = data.find(p => p.id === testPayment.id);
    if (!found) throw new Error('Payment not found in list');
  });

  // ============================================
  // NIGHT ASSIGNMENT OPERATIONS
  // ============================================
  console.log('\n🌙 Night Assignment Operations');

  let testAssignment;
  await test('Create night assignment', async () => {
    // Delete any existing assignment for this date first
    await supabase.from('night_assignments').delete().eq('date', '2099-12-31');

    const { data, error } = await supabase
      .from('night_assignments')
      .insert([{
        date: '2099-12-31',
        employee_id: employee.id,
        user_id: user.id,
      }])
      .select()
      .single();

    if (error) throw error;
    if (!data.id) throw new Error('Assignment ID not returned');
    testAssignment = data;
  });

  await test('Read night assignment back', async () => {
    const { data, error } = await supabase
      .from('night_assignments')
      .select('*')
      .eq('id', testAssignment.id)
      .single();

    if (error) throw error;
    if (data.employee_id !== employee.id) throw new Error('Assignment employee mismatch');
  });

  // ============================================
  // CLEANUP
  // ============================================
  console.log('\n🧹 Cleanup');

  // Delete in reverse order of dependencies
  for (const id of cleanup.payments) {
    await supabase.from('payments').delete().eq('id', id);
  }
  for (const id of cleanup.boardings) {
    await supabase.from('boardings').delete().eq('id', id);
  }
  for (const id of cleanup.dogs) {
    await supabase.from('dogs').delete().eq('id', id);
  }
  await supabase.from('night_assignments').delete().eq('date', '2099-12-31');

  console.log('  ✅ Test data cleaned up');

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '═'.repeat(50));
  console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('═'.repeat(50));

  if (testsFailed > 0) {
    console.log('\n❌ SMOKE TESTS FAILED - Do not deploy!\n');
    process.exit(1);
  } else {
    console.log('\n✅ All smoke tests passed - Safe to deploy!\n');
    process.exit(0);
  }
}

runSmokeTests().catch(error => {
  console.error('\n❌ Smoke test crashed:', error.message);
  process.exit(1);
});
