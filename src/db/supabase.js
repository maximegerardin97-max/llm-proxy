import { createClient } from '@supabase/supabase-js';
import config from '../config/index.js';

let supabasePublic = null;
let supabaseAdmin = null;

try {
  if (config.supabase.url && config.supabase.anonKey) {
    supabasePublic = createClient(
      config.supabase.url,
      config.supabase.anonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  } else {
    console.warn('Supabase public client not initialized: SUPABASE_URL or SUPABASE_ANON_KEY missing');
  }

  if (config.supabase.url && config.supabase.serviceRoleKey) {
    supabaseAdmin = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        db: {
          schema: 'public',
        },
      }
    );
  } else {
    console.warn('Supabase admin client not initialized: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing');
  }
} catch (e) {
  console.error('Failed to initialize Supabase clients:', e?.message);
}

export { supabasePublic, supabaseAdmin };


