#!/usr/bin/env node
/* global process */
/**
 * Pre-Deploy Smoke Test
 *
 * Tests critical database operations against a real database before deploying.
 * Run this against a test database before deploying to production.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:smoke
 *
 * Point SUPABASE_URL at a test database, never production.
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

// A fixed synthetic employee, found or made once: since #389 an employee with a payment can't be
// deleted, so the smoke test must never pay a real one (it would be stuck with the history).
const SMOKE_EMPLOYEE = 'zz-smoke-test';
// The service key has no signed-in user, so a soft delete names who did it (#389, migration 032).
const SMOKE_DELETED_BY = 'smoke-test@example.invalid';
const SMOKE_NIGHTS = ['2099-01-15', '2099-01-16', '2099-01-17'];

async function getTestEmployee() {
  const { data: found, error } = await supabase
    .from('employees')
    .select('*')
    .eq('name', SMOKE_EMPLOYEE)
    .limit(1);

  if (error) throw error;
  if (found && found.length > 0) return found[0];

  const { data: made, error: insertError } = await supabase
    .from('employees')
    .insert([{ name: SMOKE_EMPLOYEE, active: false }])
    .select()
    .single();
  if (insertError) throw insertError;
  return made;
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
  // A run that died before cleanup leaves its 2099 payment behind; since #370 a paid night can't be
  // paid again, so release those nights first (a soft delete since #389) or every later run fails.
  await test('Clear leftover 2099 test payments', async () => {
    const { error } = await supabase
      .from('payments')
      .update({ deleted_at: new Date().toISOString(), deleted_by_email: SMOKE_DELETED_BY, delete_note: 'smoke test leftover' })
      .overlaps('dates', SMOKE_NIGHTS)
      .is('deleted_at', null);
    if (error) throw error;
  });

  // Since #389 each paid night must be assigned to the person paid.
  await test('Assign the 2099 test nights to the smoke-test employee', async () => {
    const { error: clearError } = await supabase.from('night_assignments').delete().in('date', SMOKE_NIGHTS);
    if (clearError) throw clearError;
    const { error } = await supabase
      .from('night_assignments')
      .insert(SMOKE_NIGHTS.map((date) => ({ date, employee_id: employee.id, user_id: user.id })));
    if (error) throw error;
  });

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
        // Each night's own amount, adding up to `amount` (#370, migration 031)
        night_amounts: { '2099-01-15': 0.01, '2099-01-16': 0, '2099-01-17': 0 },
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

  await test('A paid night cannot be paid again (#370, 23505)', async () => {
    const { data, error } = await supabase
      .from('payments')
      .insert([{
        employee_id: employee.id,
        amount: 0,
        start_date: '2099-01-16',
        end_date: '2099-01-16',
        nights: 1,
        dates: ['2099-01-16'],
        night_amounts: { '2099-01-16': 0 },
        paid_date: '2099-01-20',
        user_id: user.id,
      }])
      .select()
      .single();

    if (data?.id) cleanup.payments.push(data.id);
    if (!error) throw new Error('A second payment for a paid night was saved');
    if (error.code !== '23505') throw new Error(`Expected 23505, got ${error.code}: ${error.message}`);
  });

  await test('A paid night cannot be changed (#389, QB001)', async () => {
    const { error } = await supabase
      .from('night_assignments')
      .update({ worked_following_day: true })
      .eq('date', '2099-01-16');
    if (!error) throw new Error('A paid night was changed');
    if (error.code !== 'QB001') throw new Error(`Expected QB001, got ${error.code}: ${error.message}`);
  });

  await test('A payment cannot be hard-deleted (#389, QB003)', async () => {
    const { error } = await supabase.from('payments').delete().eq('id', testPayment.id);
    if (!error) throw new Error('A payment was hard-deleted');
    if (error.code !== 'QB003') throw new Error(`Expected QB003, got ${error.code}: ${error.message}`);
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

  // Delete in reverse order of dependencies; a failed delete is reported, not hidden.
  const cleanupErrors = [];
  const remove = async (table, column, value) => {
    const { error } = await supabase.from(table).delete().eq(column, value);
    if (error) cleanupErrors.push(`${table} ${value}: ${error.message}`);
  };
  // Payments are never hard-deleted (#389): soft-delete them, which releases their nights, then
  // remove the nights. The soft-deleted rows and the smoke-test employee stay (one row per run,
  // test database only).
  for (const id of cleanup.payments) {
    const { error } = await supabase
      .from('payments')
      .update({ deleted_at: new Date().toISOString(), deleted_by_email: SMOKE_DELETED_BY, delete_note: 'smoke test cleanup' })
      .eq('id', id)
      .is('deleted_at', null);
    if (error) cleanupErrors.push(`payments ${id}: ${error.message}`);
  }
  for (const date of SMOKE_NIGHTS) await remove('night_assignments', 'date', date);
  for (const id of cleanup.boardings) await remove('boardings', 'id', id);
  for (const id of cleanup.dogs) await remove('dogs', 'id', id);
  await remove('night_assignments', 'date', '2099-12-31');

  if (cleanupErrors.length > 0) {
    testsFailed++;
    console.log(`  ❌ Cleanup failed:\n    ${cleanupErrors.join('\n    ')}`);
  } else {
    console.log('  ✅ Test data cleaned up');
  }

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
