#!/usr/bin/env node
/* global process */
/**
 * Cleanup Test Data Script
 *
 * Removes seeded test data from a database.
 * Uses service role key for admin operations.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_USER_EMAILS = ['admin@test.com', 'user1@test.com', 'user2@test.com'];
const TEST_DOG_NAMES = ['Luna', 'Cooper', 'Bella', 'Max', 'Daisy', 'Charlie', 'Buddy', 'Sadie'];
const TEST_EMPLOYEE_NAMES = ['Kate', 'Nick', 'Alex', 'Sam'];
const TEST_INVITE_CODES = ['TESTCODE1', 'TESTCODE2', 'TESTCODE3'];

async function cleanupTestData() {
  console.log('🧹 Cleaning up test data...\n');
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  // Get test user IDs first
  console.log('Finding test users...');
  const { data: users } = await supabase.auth.admin.listUsers();
  const testUserIds = users?.users
    ?.filter(u => TEST_USER_EMAILS.includes(u.email))
    ?.map(u => u.id) || [];
  console.log(`  Found ${testUserIds.length} test users`);

  // Delete boardings created by test users
  if (testUserIds.length > 0) {
    console.log('\nDeleting boardings created by test users...');
    const { error: boardingsError, count } = await supabase
      .from('boardings')
      .delete({ count: 'exact' })
      .in('user_id', testUserIds);
    if (boardingsError) {
      console.error(`  ✗ ${boardingsError.message}`);
    } else {
      console.log(`  ✓ Deleted ${count || 0} boardings`);
    }

    // Delete night assignments created by test users
    console.log('\nDeleting night assignments created by test users...');
    const { error: assignmentsError, count: assignCount } = await supabase
      .from('night_assignments')
      .delete({ count: 'exact' })
      .in('user_id', testUserIds);
    if (assignmentsError) {
      console.error(`  ✗ ${assignmentsError.message}`);
    } else {
      console.log(`  ✓ Deleted ${assignCount || 0} night assignments`);
    }

    // Delete payments created by test users
    console.log('\nDeleting payments created by test users...');
    const { error: paymentsError, count: payCount } = await supabase
      .from('payments')
      .delete({ count: 'exact' })
      .in('user_id', testUserIds);
    if (paymentsError) {
      console.error(`  ✗ ${paymentsError.message}`);
    } else {
      console.log(`  ✓ Deleted ${payCount || 0} payments`);
    }

    // Delete settings created by test users
    console.log('\nDeleting settings created by test users...');
    const { error: settingsError, count: settingsCount } = await supabase
      .from('settings')
      .delete({ count: 'exact' })
      .in('user_id', testUserIds);
    if (settingsError) {
      console.error(`  ✗ ${settingsError.message}`);
    } else {
      console.log(`  ✓ Deleted ${settingsCount || 0} settings records`);
    }
  }

  // Delete test dogs (by name AND user_id to be safe)
  console.log('\nDeleting test dogs...');
  if (testUserIds.length > 0) {
    const { error: dogsError, count: dogsCount } = await supabase
      .from('dogs')
      .delete({ count: 'exact' })
      .in('name', TEST_DOG_NAMES)
      .in('user_id', testUserIds);
    if (dogsError) {
      console.error(`  ✗ ${dogsError.message}`);
    } else {
      console.log(`  ✓ Deleted ${dogsCount || 0} test dogs`);
    }
  }

  // Delete test employees (by name AND user_id to be safe)
  console.log('\nDeleting test employees...');
  if (testUserIds.length > 0) {
    const { error: empError, count: empCount } = await supabase
      .from('employees')
      .delete({ count: 'exact' })
      .in('name', TEST_EMPLOYEE_NAMES)
      .in('user_id', testUserIds);
    if (empError) {
      console.error(`  ✗ ${empError.message}`);
    } else {
      console.log(`  ✓ Deleted ${empCount || 0} test employees`);
    }
  }

  // Delete test invite codes
  console.log('\nDeleting test invite codes...');
  const { error: inviteError, count: inviteCount } = await supabase
    .from('invite_codes')
    .delete({ count: 'exact' })
    .in('code', TEST_INVITE_CODES);
  if (inviteError) {
    console.error(`  ✗ ${inviteError.message}`);
  } else {
    console.log(`  ✓ Deleted ${inviteCount || 0} test invite codes`);
  }

  // Delete test users
  console.log('\nDeleting test users...');
  for (const userId of testUserIds) {
    const user = users?.users?.find(u => u.id === userId);
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`  ✗ ${user?.email}: ${error.message}`);
    } else {
      console.log(`  ✓ ${user?.email}`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Cleanup complete!');
  console.log('═'.repeat(50));
}

cleanupTestData().catch(error => {
  console.error('\n❌ Cleanup failed:', error.message);
  process.exit(1);
});
