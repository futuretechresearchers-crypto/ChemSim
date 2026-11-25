import { useEffect, useRef, useState } from 'react';
import { createEmailOtpClient, requireVerifiedOtpUser, requestRecoveryCode } from '../lib/emailOtp';
import { supabase } from '../lib/supabase';
import { destinationFor } from './AuthScreen';
import { getProfileForUser } from '../lib/AuthContext';
import { PasswordInput } from './PasswordInput';

export function EmailOtpFlow({ recovery = false, returnTo, cancel }: { recovery?: boolean; returnTo?: string; cancel: () => void }) {
  const [client] = useState(createEmailOtpClient);
  const [step, setStep] = useState<'request' | 'verify' | 'password' | 'complete'>('request');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [identity, setIdentity] = useState<'student' | 'teacher'>('student');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const locked = useRef(false);
  const mounted = useRef(true);
  const recoveryUser = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown > 0]);

  const request = async (resend = false) => {
    if (cooldown) throw new Error('Please wait before requesting another code.');
    setCooldown(60);
    if (recovery) {
      // Existing and unknown addresses receive the same successful UI response.
      await requestRecoveryCode(client, email, window.location.origin);
      setNotice('If this address can receive recovery email, a code has been sent.');
    } else {
      if (!resend && password !== confirm) throw new Error('Passwords do not match.');
      const result = resend
        ? await client.auth.resend({ type: 'signup', email: email.trim() })
        : await client.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim(), identity_type: identity } } });
      if (result.error) throw new Error('Unable to send a code. Please wait and try again.');
      if ('session' in result.data && result.data.session) {
        await client.auth.signOut({ scope: 'local' });
        throw new Error('Email verification is unavailable. Contact your CHEMLAB maintainer.');
      }
      setNotice('Check your email for a verification code.');
    }
    setPassword(''); setConfirm(''); setCode(''); setStep('verify');
  };

  const run = async (action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (caught) { if (mounted.current) setError(caught instanceof Error ? caught.message : 'Please try again.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const submit = async () => {
    if (step === 'request') return request();
    if (step === 'verify') {
      if (!/^\d{6}$/.test(code.trim())) throw new Error('Enter the six-digit verification code.');
      // Current auth-js deprecates signup verification type in favor of email.
      const { data, error: failure } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: recovery ? 'recovery' : 'email' });
      setCode('');
      if (failure || !data.session || !data.user) throw new Error(recovery
        ? 'This code is invalid, expired, or already used. Request a new code.'
        : 'This code is invalid or expired. Request a new code.');
      const user = await requireVerifiedOtpUser(client, data.user.id, email);
      if (!mounted.current) return;
      if (recovery) { recoveryUser.current = user.id; setStep('password'); return; }
      const { data: active } = await supabase.auth.getSession();
      if (active.session && active.session.user.id !== user.id) throw new Error('Another account is signed in. Log out before continuing.');
      const { error: sessionError } = await supabase.auth.setSession(data.session);
      if (sessionError) throw new Error('Sign in again to complete your profile.');
      const profile = await getProfileForUser(user.id);
      const { data: current } = await supabase.auth.getUser();
      if (current.user?.id !== user.id || (profile && profile.id !== user.id)) throw new Error('Your account changed. Sign in again.');
      // AppRoutes may already have routed the confirmed workspace session while
      // the profile/user reads were in flight. A stale handler must not reload
      // onboarding and erase the form that the user has started completing.
      if (!mounted.current) return;
      window.location.assign(destinationFor(profile, returnTo));
      return;
    }
    if (!recoveryUser.current) throw new Error('Verify a recovery code first.');
    if (password !== confirm) throw new Error('Passwords do not match.');
    try { await requireVerifiedOtpUser(client, recoveryUser.current, email); }
    catch {
      recoveryUser.current = null; setPassword(''); setConfirm(''); setStep('request');
      throw new Error('Your recovery session has expired. Request a new code.');
    }
    const { error: failure } = await client.auth.updateUser({ password });
    if (failure) throw new Error('Password could not be updated. Request a new recovery code or check password requirements.');
    // Revoke existing sessions for the recovered account; other workspace accounts are untouched.
    const { error: logoutError } = await client.auth.signOut();
    const recoveredId = recoveryUser.current;
    recoveryUser.current = null; setPassword(''); setConfirm('');
    if (logoutError) { setStep('request'); throw new Error('Password updated, but session revocation failed. Sign in again and log out other sessions.'); }
    const { data: active } = await supabase.auth.getSession();
    if (active.session?.user.id === recoveredId) await supabase.auth.signOut({ scope: 'local' });
    setStep('complete');
  };
  if (step === 'complete') return <>
    <h2>Password updated</h2>
    <p role="status">Your password has been updated. Use your new password next time you sign in.</p>
    <button className="primary" onClick={() => window.location.assign('/login')}>Continue to CHEMLAB</button>
  </>;
  return <>
    <h2>{recovery ? 'Reset password' : 'Verify your email'}</h2>
    {recovery && new URLSearchParams(window.location.search).get('legacy') === '1' && <p role="status">This recovery link cannot be used here. Request a fresh six-digit code below. If your email only contains a link, contact your CHEMLAB maintainer.</p>}
    <form className="auth-form" onSubmit={event => { event.preventDefault(); void run(submit); }}>
      {step === 'request' && <>
        {!recovery && <><label><span>Full name</span><input value={name} onChange={event => setName(event.target.value)} autoComplete="name" required /></label>
          <label><span>Identity</span><select value={identity} onChange={event => setIdentity(event.target.value as 'student' | 'teacher')}><option value="student">Student</option><option value="teacher">Teacher</option></select></label></>}
        <label><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></label>
      </>}
      {(step === 'password' || (step === 'request' && !recovery)) && <>
        <label><span>{recovery ? 'New password' : 'Password'}</span><PasswordInput value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
        <label><span>Confirm password</span><PasswordInput value={confirm} onChange={event => setConfirm(event.target.value)} autoComplete="new-password" minLength={8} required /></label>
      </>}
      {step === 'verify' && <><p>Enter the six-digit code sent to {email}.</p><label><span>Verification code</span><input value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></label></>}
      {error && <p className="form-message error" role="alert">{error}</p>}
      {notice && <p className="form-message success" role="status">{notice}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : step === 'request' ? 'Send code' : step === 'verify' ? 'Verify code' : 'Save new password'}</button>
      {step === 'verify' && <button className="secondary" type="button" disabled={busy || cooldown > 0} onClick={() => void run(() => request(true))}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</button>}
      <button className="secondary" type="button" disabled={busy} onClick={cancel}>Back to login</button>
    </form>
  </>;
}
