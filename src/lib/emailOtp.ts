import { createClient } from '@supabase/supabase-js';

// OTP and recovery sessions must not replace the active workspace session.
export function createEmailOtpClient() {
  return createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'chemlab-email-otp' },
  });
}

export async function requestRecoveryCode(client: ReturnType<typeof createEmailOtpClient>, email: string, origin: string) {
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origin}/recover` });
  if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
    throw new Error('Too many recovery requests. Please wait before requesting another code.');
  }
  if (error && error.code !== 'email_not_found') {
    throw new Error('Recovery email could not be requested. Please wait and try again.');
  }
}

export async function requireVerifiedOtpUser(client: ReturnType<typeof createEmailOtpClient>, expectedId: string, email: string) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.id !== expectedId || !data.user.email_confirmed_at
    || data.user.email?.toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error('Verification could not be confirmed. Request a new code.');
  }
  return data.user;
}
