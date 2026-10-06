import { useState } from 'react';
import { signInWithPassword, signUpUser, sanitizeReturnTo } from '../lib/auth';
import { getProfileForUser } from '../lib/AuthContext';
import type { AuthProfile } from '../lib/auth';

type AuthMode = 'login' | 'register';

function destinationFor(profile: AuthProfile | null, returnTo?: string) {
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
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let destination: string | null = null;
      if (mode === 'register') {
        if (password !== confirmPassword) throw new Error('Passwords do not match.');
        const result = await signUpUser({ full_name: fullName, email, password });
        if (result.error) {
          throw result.error;
        }
        if (result.data.user && result.data.session) {
          const profile = await getProfileForUser(result.data.user.id);
          destination = destinationFor(profile, returnTo);
        } else {
          setSuccess('Supabase created the account but did not return a session. To enter CHEMLAB immediately, turn off Email confirmation in Supabase Authentication settings, then sign in.');
        }
      } else {
        const result = await signInWithPassword(email, password);
        if (result.error) {
          throw result.error;
        }
        if (!result.data.user) throw new Error('Supabase did not return an authenticated user.');
        const profile = await getProfileForUser(result.data.user.id);
        const requested = sanitizeReturnTo(returnTo || '/');
        destination = destinationFor(profile, requested);
      }

      if (destination) window.location.assign(destination);
    } catch (caughtError: any) {
      const message = caughtError?.message ?? 'Authentication failed. Please try again.';
      setError(/email not confirmed/i.test(message)
        ? 'Supabase is still requiring email confirmation. CHEMLAB expects immediate sign-in, so ask your administrator to turn off Confirm Email in Supabase Authentication settings.'
        : message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="eyebrow">CHEMLAB ACCESS</span>
          <h1>{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
          <p>{mode === 'login' ? 'Sign in to continue your chemistry activity.' : 'Create your account, then set up your CHEMLAB identity.'}</p>
        </div>

        <div className="auth-toggle">
          <button className={mode === 'login' ? 'active' : ''} type="button" onClick={() => setMode('login')}>Log in</button>
          <button className={mode === 'register' ? 'active' : ''} type="button" onClick={() => setMode('register')}>Register</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'register' && (
            <label>
              <span>Full name</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Alex Student" autoComplete="name" required />
            </label>
          )}

          <label>
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="student@example.com" autoComplete="email" required />
          </label>

          <label>
            <span>Password</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required />
          </label>

          {mode === 'register' && <label><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={6} required /></label>}

          {error && <div className="form-message error">{error}</div>}
          {success && <div className="form-message success">{success}</div>}

          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  );
}
