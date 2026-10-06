import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { saveOnboardingProfile } from '../lib/auth';

export function StudentOnboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const savedProgram = profile?.program ?? 'BSCS';
  const standardPrograms = ['BSCS', 'BSIT', 'BSIS'];
  const [identity, setIdentity] = useState<'student' | 'teacher'>(profile?.identity_type ?? (profile?.role === 'teacher' ? 'teacher' : 'student'));
  const [fullName, setFullName] = useState(profile?.full_name ?? user?.user_metadata?.full_name ?? '');
  const [program, setProgram] = useState(standardPrograms.includes(savedProgram) ? savedProgram : 'Other');
  const [customProgram, setCustomProgram] = useState(standardPrograms.includes(savedProgram) ? '' : savedProgram);
  const [yearLevel, setYearLevel] = useState(profile?.year_level ? String(profile.year_level) : '');
  const [section, setSection] = useState(profile?.section ?? '');
  const [schoolName, setSchoolName] = useState(profile?.school_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveOnboardingProfile(user.id, {
        full_name: fullName,
        identity_type: identity,
        program: identity === 'student' ? (program === 'Other' ? customProgram : program) : undefined,
        year_level: identity === 'student' ? yearLevel : undefined,
        section: identity === 'student' ? section : undefined,
        school_name: schoolName,
      });
      await refreshProfile();
      const params = new URLSearchParams(window.location.search);
      const joinCode = params.get('joinCode');
      const continueTo = params.get('continueTo');
      // Choosing teacher describes identity only. Only the trusted profile role
      // decides access to the teacher workspace.
      if (joinCode && identity === 'student' && saved.role === 'student') window.location.assign(`/join/${encodeURIComponent(joinCode)}`);
      else if (/^\/student\/activities\/[A-Za-z0-9_-]+$/.test(continueTo ?? '') && saved.role === 'student') window.location.assign(continueTo!);
      else window.location.assign(saved.role === 'teacher' ? '/teacher' : '/student');
    } catch {
      setError('We could not save your profile. Check your connection or ask your CHEMLAB administrator to verify profile permissions.');
    } finally {
      setSaving(false);
    }
  };

  return <main className="auth-page"><section className="auth-card onboarding-card">
    <div className="auth-header"><span className="eyebrow">CHEMLAB · PROFILE SETUP</span><h1>Welcome to CHEMLAB</h1><p>Let's set up your learning profile.</p></div>
    <ol className="onboarding-progress" aria-label="Setup progress"><li>Account</li><li aria-current="step">Identity</li><li>Profile</li><li>CHEMLAB</li></ol>
    <form className="auth-form" onSubmit={submit}>
      <fieldset className="identity-options"><legend>What best describes you?</legend>
        <label className={identity === 'student' ? 'identity-option selected' : 'identity-option'}><input type="radio" name="identity" value="student" checked={identity === 'student'} onChange={() => setIdentity('student')} /><span>Student</span></label>
        <label className={identity === 'teacher' ? 'identity-option selected' : 'identity-option'}><input type="radio" name="identity" value="teacher" checked={identity === 'teacher'} onChange={() => setIdentity('teacher')} /><span>Teacher</span></label>
      </fieldset>
      <label><span>Full Name</span><input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" required /></label>
      {identity === 'student' && <>
        <label><span>Program</span><select value={program} onChange={event => setProgram(event.target.value)}><option>BSCS</option><option>BSIT</option><option>BSIS</option><option>Other</option></select></label>
        {program === 'Other' && <label><span>Program name</span><input value={customProgram} onChange={event => setCustomProgram(event.target.value)} placeholder="Enter your program" required /></label>}
        <div className="builder-two-col"><label><span>Year Level</span><input value={yearLevel} onChange={event => setYearLevel(event.target.value)} placeholder="e.g. 1" required /></label><label><span>Section</span><input value={section} onChange={event => setSection(event.target.value)} required /></label></div>
      </>}
      <label><span>School Name</span><input value={schoolName} onChange={event => setSchoolName(event.target.value)} autoComplete="organization" required /></label>
      {identity === 'teacher' && <p className="muted">Teacher identity does not grant teacher access. Teacher workspace access requires authorization on your CHEMLAB profile.</p>}
      {error && <div role="alert" className="form-message error">{error}</div>}
      <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving profile…' : 'Continue to CHEMLAB'}</button>
    </form>
  </section></main>;
}
