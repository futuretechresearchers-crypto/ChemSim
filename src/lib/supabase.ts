import { createClient } from '@supabase/supabase-js';
import { prepareRecoveryRoute } from './recoveryRoute';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file.');
}

/** The sole browser-safe Supabase client for CHEMLAB. */
const recoveryEntry = prepareRecoveryRoute();
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { detectSessionInUrl: recoveryEntry ? false : (_url, params) => params.type !== 'recovery'
    && Boolean(params.access_token || params.error || params.error_description || params.error_code) },
});
