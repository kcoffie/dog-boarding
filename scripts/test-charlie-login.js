#!/usr/bin/env node
/* global process */
/**
 * Charlie User Login Test
 *
 * Tests that the charlie user can successfully authenticate with the new password.
 * This verifies the fix for GitHub issue #12.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/test-charlie-login.js
 *
 * Or with npm:
 *   npm run test:charlie-login
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL (or VITE_SUPABASE_URL)');
  console.error('   SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

// Use anon key for client-side auth (same as app uses)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Charlie's credentials (Issue #12 fix)
const CHARLIE_EMAIL = 'charlie@agirlandyourdog.com';
const CHARLIE_PASSWORD = 'CharliePass123!';

async function testCharlieLogin() {
  console.log('\n🔐 Testing Charlie User Login (Issue #12 Fix)\n');
  console.log(`   Database: ${supabaseUrl}`);
  console.log(`   Email: ${CHARLIE_EMAIL}\n`);

  try {
    // Attempt login with charlie's credentials
    const { data, error } = await supabase.auth.signInWithPassword({
      email: CHARLIE_EMAIL,
      password: CHARLIE_PASSWORD,
    });

    if (error) {
      console.log('❌ LOGIN FAILED');
      console.log(`   Error: ${error.message}`);
      console.log('\n   This indicates the password reset did NOT work.\n');
      process.exit(1);
    }

    if (!data.user) {
      console.log('❌ LOGIN FAILED');
      console.log('   No user data returned');
      process.exit(1);
    }

    // Verify user details
    console.log('✅ LOGIN SUCCESSFUL');
    console.log(`   User ID: ${data.user.id}`);
    console.log(`   Email: ${data.user.email}`);
    console.log(`   Email Confirmed: ${data.user.email_confirmed_at ? 'Yes' : 'No'}`);

    // Sign out after test
    await supabase.auth.signOut();
    console.log('   Signed out after test');

    console.log('\n' + '═'.repeat(50));
    console.log('✅ Issue #12 Fix Verified - Charlie can log in!');
    console.log('═'.repeat(50) + '\n');

    process.exit(0);
  } catch (err) {
    console.error('❌ Test crashed:', err.message);
    process.exit(1);
  }
}

testCharlieLogin();
