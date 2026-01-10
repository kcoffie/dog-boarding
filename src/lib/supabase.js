import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Log Supabase configuration on init (always, for debugging)
console.log('[Supabase] Initialized with URL:', supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
