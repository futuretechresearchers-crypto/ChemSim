import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { getClassroomByCode, joinClassroomByCode, type Classroom } from '../lib/classrooms';

export function JoinClassroomPage({ joinCode }: { joinCode: string }) {
  const { user, profile, loading: authLoading } = useAuth();
  const [classroom, setClassroom] = useState<Classroom>({ id: '', name: '', join_code: '' });
  const [checking, setChecking] = useState(true);
  const [joinState, setJoinState] = useState<'idle' | 'joining' | 'joined' | 'error'>('idle');
  const startedFor = useRef('');
  const code = joinCode.trim().toUpperCase();

  useEffect(() => {
    setClassroom({ id: '', name: '', join_code: '' }); setJoinState('idle'); startedFor.current = '';
    setChecking(authLoading);
  }, [code, authLoading]);

  useEffect(() => {
    if (!user || authLoading || !profile || profile.role !== 'student' || !profile.onboarding_completed) return;
    const key = `${user.id}:${code}`;
    if (startedFor.current === key) return;
    startedFor.current = key;
    let active = true;
    setChecking(true);
    setJoinState('joining');
    // Resolve and join through the secure RPC before any classroom SELECT.
    void joinClassroomByCode(code).then(async () => {
      const joinedClassroom = await getClassroomByCode(code);
      if (!joinedClassroom) throw new Error('Invitation unavailable.');
      if (active) { setClassroom(joinedClassroom); setJoinState('joined'); }
    }).catch(() => { if (active) setJoinState('error'); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [user, profile, authLoading, code]);

  useEffect(() => {
    if (joinState !== 'joined') return;
    const timeout = window.setTimeout(() => window.location.assign('/student?joined=1'), 1400);
    return () => window.clearTimeout(timeout);
  }, [joinState]);

  const joinPath = `/join/${encodeURIComponent(code)}`;
  if (checking || authLoading) return <main className="auth-page"><section className="auth-card" role="status"><p>Checking classroom invitation…</p></section></main>;
  if (user && profile?.role === 'teacher') return <main className="auth-page"><section className="auth-card"><span className="eyebrow">STUDENT INVITATION</span><h1>This invitation is for student enrollment.</h1><p>You are signed in with a teacher account.</p><a className="secondary" href="/teacher">Go to teacher workspace</a></section></main>;
  if (joinState === 'joining') return <main className="auth-page"><section className="auth-card" role="status"><span className="eyebrow">{classroom.name}</span><h1>Joining classroom…</h1></section></main>;
  if (joinState === 'joined') return <main className="auth-page"><section className="auth-card" role="status"><span className="eyebrow">CLASSROOM JOINED</span><h1>You're in {classroom.name}.</h1><p>Opening your CHEMLAB student workspace…</p><a className="primary" href="/student">Continue now</a></section></main>;
  if (joinState === 'error') return <main className="auth-page"><section className="auth-card"><span className="eyebrow">CLASSROOM ENROLLMENT</span><h1>We couldn't join this classroom.</h1><p>Your account may not be authorized for student enrollment. Please contact your teacher or CHEMLAB administrator.</p><a className="secondary" href="/student">Go to CHEMLAB</a></section></main>;
  if (user && (!profile || !profile.onboarding_completed)) return <main className="auth-page"><section className="auth-card"><h1>Complete your student profile first.</h1><a className="primary" href={`/onboarding?joinCode=${encodeURIComponent(code)}`}>Continue profile setup</a></section></main>;
  return <main className="auth-page"><section className="auth-card"><span className="eyebrow">STUDENT CLASSROOM INVITATION</span><h1>Join a CHEMLAB classroom</h1><p>Sign in or create a student account to validate this invitation and join securely.</p><div className="join-actions"><a className="primary" href={`/login?mode=register&returnTo=${encodeURIComponent(joinPath)}`}>Create Student Account</a><a className="secondary" href={`/login?returnTo=${encodeURIComponent(joinPath)}`}>Log In</a></div></section></main>;
}
