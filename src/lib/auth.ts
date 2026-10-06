import { supabase } from './supabase';

export type AuthRole = 'teacher' | 'student';
export type IdentityType = AuthRole;

export type AuthProfile = {
  id: string;
  full_name?: string | null;
  role: AuthRole;
  identity_type?: IdentityType | null;
  program?: string | null;
  year_level?: string | number | null;
  section?: string | null;
  school_name?: string | null;
  onboarding_completed?: boolean;
  created_at?: string;
  updated_at?: string;
};

export function sanitizeReturnTo(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '/';

  const trimmed = value.trim();
  if (!trimmed) return '/';

  const normalized = trimmed.replace(/\\/g, '/');
  if (normalized.startsWith('//') || normalized.includes('://')) return '/';

  const next = normalized.startsWith('/') ? normalized : `/${normalized}`;
  const [pathname, query = ''] = next.split('?', 2);
  const safePatterns = [/^\/join\/[A-Za-z0-9_-]+$/, /^\/teacher(?:\/.*)?$/, /^\/student(?:\/.*)?$/, /^\/onboarding(?:\/.*)?$/, /^\/login(?:\/.*)?$/, /^\/$/];
  const safeQuery = !query || /^(?:joined=1|joinCode=[A-Za-z0-9_-]+)$/.test(query);

  return safeQuery && safePatterns.some((pattern) => pattern.test(pathname)) ? pathname + (query ? `?${query}` : '') : '/';
}

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpUser(payload: { full_name: string; email: string; password: string }) {
  const { full_name, email, password } = payload;
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name,
      },
    },
  });
}

export type OnboardingProfileInput = {
  full_name: string;
  identity_type: AuthRole;
  program?: string;
  year_level?: string;
  section?: string;
  school_name: string;
};

export async function saveOnboardingProfile(userId: string, input: OnboardingProfileInput): Promise<AuthProfile> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || authData.user.id !== userId) throw new Error('Your session has expired. Please sign in again.');
  const values = {
    full_name: input.full_name.trim(),
    identity_type: input.identity_type,
    program: input.identity_type === 'student' ? input.program?.trim() || null : null,
    year_level: input.identity_type === 'student' ? input.year_level?.trim() || null : null,
    section: input.identity_type === 'student' ? input.section?.trim() || null : null,
    school_name: input.school_name.trim(),
    onboarding_completed: true,
  };
  const { data: existing, error: readError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (readError) throw readError;

  if (existing) {
    const { error } = await supabase.from('profiles').update(values).eq('id', userId);
    if (error) throw error;
  } else {
    // A missing profile is recovered as a student account. Identity selection
    // never grants teacher authorization; trusted provisioning owns that role.
    const { error } = await supabase.from('profiles').insert({ id: userId, role: 'student', ...values });
    if (error) throw error;
  }

  const { data: saved, error: savedError } = await supabase
    .from('profiles')
    .select('id, full_name, role, identity_type, program, year_level, section, school_name, onboarding_completed')
    .eq('id', userId)
    .single();
  if (savedError) throw savedError;
  if (!saved.onboarding_completed) throw new Error('Your profile is not yet marked complete.');
  if (saved.role !== 'teacher' && saved.role !== 'student') throw new Error('Your profile role is invalid. Please contact your CHEMLAB administrator.');
  return {
    id: saved.id,
    full_name: saved.full_name,
    role: saved.role,
    identity_type: saved.identity_type,
    program: saved.program,
    year_level: saved.year_level,
    section: saved.section,
    school_name: saved.school_name,
    onboarding_completed: Boolean(saved.onboarding_completed),
  };
}

