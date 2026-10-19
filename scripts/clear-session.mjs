import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
for (const line of envFile.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 0) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
  if (!process.env[key]) process.env[key] = val;
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const { data, error } = await supabase.from('sync_settings').select('id').order('id', { ascending: true }).limit(1).maybeSingle();
if (error) throw new Error(`sync_settings read failed: ${error.message}`);
if (data) {
  await supabase.from('sync_settings').update({
    session_cookies: null,
    session_expires_at: null,
  }).eq('id', data.id);
  console.log('Session cleared.');
} else {
  console.log('No sync_settings row found.');
}
