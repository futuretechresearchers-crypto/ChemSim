import { useRef, useState } from 'react';
import { signInWithPassword, sanitizeReturnTo } from '../lib/auth';
import { getProfileForUser } from '../lib/AuthContext';
import type { AuthProfile } from '../lib/auth';
import { EmailOtpFlow } from './EmailOtpFlow';
import { supabase } from '../lib/supabase';

type AuthMode = 'login' | 'register' | 'recovery';

export function destinationFor(profile: AuthProfile | null, returnTo?: string) {
  if (!profile || !profile.onboarding_completed) {
    const joinCode = returnTo?.match(/^\/join\/([A-Za-z0-9_-]+)/)?.[1]
      ?? returnTo?.match(/^\/onboarding\?joinCode=([A-Za-z0-9_-]+)$/)?.[1];
    if (joinCode) return `/onboarding?joinCode=${encodeURIComponent(joinCode)}`;
    return '/onboarding';
  }
  const requested = sanitizeReturnTo(returnTo || '/');
  if (profile.role === 'teacher') return requested.startsWith('/teacher') || requested.startsWith('/join/') ? requested : '/teacher';
  return requested.startsWith('/teacher') ? '/student' : requested.startsWith('/join/') ? requested : '/student';
}

export function AuthScreen({ returnTo, initialMode = 'login' }: { returnTo?: string; initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      let destination: string | null = null;
      {
        const result = await signInWithPassword(email, password);
        if (result.error) {
          throw result.error;
        }
        if (!result.data.user) throw new Error('Supabase did not return an authenticated user.');
        const profile = await getProfileForUser(result.data.user.id);
        const { data: current, error: currentError } = await supabase.auth.getUser();
        if (currentError || current.user?.id !== result.data.user.id) throw new Error('Your account changed. Sign in again.');
        const requested = sanitizeReturnTo(returnTo || '/');
        destination = destinationFor(profile, requested);
      }

      if (destination) window.location.assign(destination);
    } catch (caughtError: any) {
      const message = caughtError?.message ?? 'Authentication failed. Please try again.';
      setError(/email not confirmed/i.test(message)
        ? 'Verify your email with your registration code before signing in.'
        : message);
    } finally {
      inFlight.current = false;
      setPassword('');
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">CHEMLAB ACCESS</span>
          <h1>{mode === 'login' ? 'Welcome back' : mode === 'recovery' ? 'Account recovery' : 'Create account'}</h1>
          <p>{mode === 'login' ? 'Sign in to continue your chemistry activity.' : mode === 'recovery' ? 'Verify a six-digit email code, then choose a new password.' : 'Create your account, then set up your CHEMLAB identity.'}</p>
        </div>

        {mode === 'login' && <div className="auth-toggle">
          <button className={mode === 'login' ? 'active' : ''} type="button" disabled={loading} onClick={() => setMode('login')}>Log in</button>
          <button type="button" disabled={loading} onClick={() => setMode('register')}>Register</button>
        </div>}

        {mode !== 'login' ? <EmailOtpFlow key={mode} recovery={mode === 'recovery'} returnTo={returnTo} cancel={() => mode === 'recovery' ? window.location.assign('/login') : setMode('login')} /> : <form onSubmit={submit} className="auth-form">

          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" autoComplete="email" required />
          </label>

          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required />
          </label>


          {error && <div className="form-message error">{error}</div>}

          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          <button type="button" className="secondary" disabled={loading} onClick={() => window.location.assign('/recover')}>Forgot password?</button>
        </form>}
      </div>
    </main>
  );
}
