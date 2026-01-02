/**
 * Run SQL migration against Supabase database
 * Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/run-migration.js <migration-file>
 */
/* global process */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('Error: Migration file path required');
  console.error('Usage: node scripts/run-migration.js <migration-file>');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  const filePath = resolve(process.cwd(), migrationFile);
  console.log(`Reading migration from: ${filePath}`);

  const sql = readFileSync(filePath, 'utf-8');

  // Split by semicolons but keep track of what we're executing
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute`);
  console.log(`Target database: ${supabaseUrl}`);
  console.log('---');

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const preview = statement.substring(0, 60).replace(/\n/g, ' ');

    console.log(`[${i + 1}/${statements.length}] ${preview}...`);

    const { error } = await supabase.rpc('exec_sql', { sql: statement });

    if (error) {
      // For DDL, we need to use the REST API directly
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ sql: statement }),
      });

      if (!response.ok) {
        console.log(`  ⚠ Skipped (may need manual execution): ${error.message || 'Unknown error'}`);
        errorCount++;
      } else {
        console.log('  ✓ Success');
        successCount++;
      }
    } else {
      console.log('  ✓ Success');
      successCount++;
    }
  }

  console.log('---');
  console.log(`Migration complete: ${successCount} succeeded, ${errorCount} need manual review`);

  if (errorCount > 0) {
    console.log('\nNote: Some statements may need to be run directly in Supabase SQL Editor.');
    console.log('This is common for CREATE TABLE and ALTER TABLE statements.');
  }
}

runMigration().catch(console.error);
