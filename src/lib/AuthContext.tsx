import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { AuthProfile, AuthRole } from './auth';
import { createLatestRequest } from './latestRequest';

type AuthContextValue = {
  user: User | null;
  profile: AuthProfile | null;
  role: AuthRole | null;
  loading: boolean;
  profileError: string | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function readProfile(userId: string): Promise<AuthProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, identity_type, program, year_level, section, school_name, onboarding_completed')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.id !== userId) throw new Error('Your account profile does not match your session.');
  if (data.role !== 'teacher' && data.role !== 'student') {
    throw new Error('Your account has an invalid role. Please contact your CHEMLAB administrator.');
  }

  return {
    id: data.id,
    full_name: data.full_name,
    role: data.role,
    identity_type: data.identity_type,
    program: data.program,
    year_level: data.year_level,
    section: data.section,
    school_name: data.school_name,
    onboarding_completed: Boolean(data.onboarding_completed),
  };
}

export async function getProfileForUser(userId: string): Promise<AuthProfile | null> {
  try { return await readProfile(userId); }
  catch (error) {
    if (import.meta.env.DEV) console.error('CHEMLAB signup profile load failed', error);
    throw new Error('Your CHEMLAB profile could not be loaded. Please retry.');
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const requests = useRef(createLatestRequest());
  const mounted = useRef(false);

  const loadProfile = useCallback(async (request: number, nextUser: User | null) => {
    const current = () => mounted.current && requests.current.isCurrent(request);
    if (!current()) return;
    setUser(nextUser);
    setProfile(null);
    setProfileError(null);
    setLoading(true);
    try {
      const nextProfile = nextUser ? await readProfile(nextUser.id) : null;
      if (current()) setProfile(nextProfile);
    } catch (caught) {
      if (current()) {
        if (import.meta.env.DEV) console.error('CHEMLAB profile load failed', caught);
        setProfileError('Your account profile could not be loaded. Please retry or log out.');
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const request = requests.current.begin();
    const current = () => mounted.current && requests.current.isCurrent(request);
    setLoading(true);
    setProfile(null);
    setProfileError(null);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      await loadProfile(request, data.session?.user ?? null);
    } catch (caught) {
      if (current()) {
        setUser(null);
        setProfile(null);
        setProfileError('Supabase authentication is unavailable. Please refresh and try again.');
        setLoading(false);
      }
    }
  }, [loadProfile]);

  useEffect(() => {
    mounted.current = true;
    void refreshProfile();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Invalidate old reads now; query after the auth callback releases its lock.
      const request = requests.current.begin();
      setProfile(null);
      setLoading(true);
      window.setTimeout(() => { void loadProfile(request, session?.user ?? null); }, 0);
    });

    return () => {
      mounted.current = false;
      requests.current.invalidate();
      subscription.unsubscribe();
    };
  }, [loadProfile, refreshProfile]);

  const signOut = useCallback(async () => {
    // Invalidate reads before awaiting the network; an old role must not survive logout.
    const request = requests.current.begin();
    setProfile(null);
    setUser(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      if (mounted.current && requests.current.isCurrent(request)) setLoading(false);
    } catch (error) {
      if (mounted.current && requests.current.isCurrent(request)) await refreshProfile();
      throw error;
    }
  }, [refreshProfile]);

  const value = useMemo<AuthContextValue>(() => ({
    user, profile, role: profile?.role ?? null, loading, profileError,
    refreshProfile,
    signOut,
  }), [user, profile, loading, profileError, refreshProfile, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
