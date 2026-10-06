import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import ChemLabSimulator from './ChemLabSimulator';
import { StudentActivitiesPage } from './StudentActivitiesPage';

type StudentClass = { id: string; name: string; join_code: string };
type Section = 'home' | 'activity' | 'classes' | 'profile';

export function StudentWorkspace({ section, navigate, logout, assignmentId }: { section: Section; navigate: (path: string) => void; logout: () => void; assignmentId?: string }) {
  const { user, profile, refreshProfile } = useAuth();
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);
  const [classesError, setClassesError] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [fullName, setFullName] = useState(profile?.full_name ?? '');
  const [program, setProgram] = useState(profile?.program ?? '');
  const [yearLevel, setYearLevel] = useState(profile?.year_level == null ? '' : String(profile.year_level));
  const [classSection, setClassSection] = useState(profile?.section ?? '');
  const [schoolName, setSchoolName] = useState(profile?.school_name ?? '');
  const [profileStatus, setProfileStatus] = useState<string | null>(null);

  const loadClasses = useCallback(async () => {
    if (!user) return;
    setClassesLoading(true); setClassesError(false);
    try {
      const { data, error } = await supabase.from('classroom_members')
        .select('classroom_id, classroom:classrooms(id, name, join_code)')
        .eq('student_id', user.id);
      if (error) throw error;
      const rows = (data ?? []).map((row: any) => Array.isArray(row.classroom) ? row.classroom[0] : row.classroom).filter(Boolean);
      setClasses(rows as StudentClass[]);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Student classroom list failed', error);
      setClassesError(true);
    } finally { setClassesLoading(false); }
  }, [user]);

  useEffect(() => { if (section === 'classes') void loadClasses(); }, [section, loadClasses]);
  useEffect(() => {
    setFullName(profile?.full_name ?? ''); setProgram(profile?.program ?? '');
    setYearLevel(profile?.year_level == null ? '' : String(profile.year_level));
    setClassSection(profile?.section ?? ''); setSchoolName(profile?.school_name ?? '');
  }, [profile]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setProfileStatus(null);
    const { data: updated, error } = await supabase.from('profiles').update({
      full_name: fullName.trim(), program: program.trim() || null, year_level: yearLevel.trim() || null,
      section: classSection.trim() || null, school_name: schoolName.trim() || null,
    }).eq('id', user.id).select('id').maybeSingle();
    if (error || !updated) {
      if (import.meta.env.DEV) console.error('Student profile update failed', error);
      setProfileStatus('Profile could not be saved. Please try again.');
      return;
    }
    await refreshProfile();
    setProfileStatus('Profile saved.');
  };

  return <>
    <header>
      <a className="brand" href="/student" onClick={event => { event.preventDefault(); navigate('/student'); }}><i>⚛</i><span>CHEM<span>LAB</span><small>student workspace</small></span></a>
      <nav>
        <a className={section === 'home' ? 'active' : ''} href="/student" onClick={event => { event.preventDefault(); navigate('/student'); }}>Laboratory</a>
        <a className={section === 'activity' ? 'active' : ''} href="/student/activity" onClick={event => { event.preventDefault(); navigate('/student/activity'); }}>Activities</a>
        <a className={section === 'classes' ? 'active' : ''} href="/student/classes" onClick={event => { event.preventDefault(); navigate('/student/classes'); }}>Classes</a>
        <a className={section === 'profile' ? 'active' : ''} href="/student/profile" onClick={event => { event.preventDefault(); navigate('/student/profile'); }}>Profile</a>
      </nav>
      <button className="secondary" onClick={logout}>Log out</button>
    </header>
    {section === 'home' && <>
      <section className="intro"><div><span className="eyebrow">STUDENT WORKSPACE</span><h1>Welcome{profile?.full_name ? ', ' + profile.full_name : ' to CHEMLAB'}.</h1><p>Explore chemical bonding with the interactive laboratory, open teacher activities, and access your classrooms.</p></div></section>
      <section className="student-shortcuts"><a className="card" href="/student/activity" onClick={event => { event.preventDefault(); navigate('/student/activity'); }}><strong>Teacher activities</strong><span>View activities assigned to your classrooms</span></a><a className="card" href="/student/classes" onClick={event => { event.preventDefault(); navigate('/student/classes'); }}><strong>Your classrooms</strong><span>View or join a class</span></a><a className="card" href="/student/profile" onClick={event => { event.preventDefault(); navigate('/student/profile'); }}><strong>Your profile</strong><span>Update your learning information</span></a></section>
      <section className="intro"><div><span className="eyebrow">DISCOVER CHEMICAL BONDING</span><h1>See atoms <em>connect.</em></h1><p>Build accurate reactant groups, observe electron transfer or sharing, and read the chemistry behind every supported product.</p></div></section>
      <ChemLabSimulator />
    </>}
    {section === 'activity' && <StudentActivitiesPage assignmentId={assignmentId} navigate={navigate} />}
    {section === 'classes' && <main className="simple-page card"><span className="eyebrow">STUDENT CLASSROOMS</span><h1>Your classes</h1><p>Join a classroom using the invitation code from your teacher.</p><form className="student-code-form" onSubmit={event => { event.preventDefault(); const code = joinCode.trim(); if (code) navigate('/join/' + encodeURIComponent(code)); }}><label><span>Classroom join code</span><input value={joinCode} onChange={event => setJoinCode(event.target.value)} required /></label><button className="primary">Join classroom</button></form>{classesLoading ? <p role="status">Loading your classes…</p> : classesError ? <p className="form-message error" role="alert">Your classrooms could not be loaded. Please retry.</p> : classes.length === 0 ? <p className="muted">You have not joined a classroom yet.</p> : <div className="classroom-list">{classes.map(room => <article className="classroom-row" key={room.id}><div><h3>{room.name}</h3><p>Join code: <strong>{room.join_code}</strong></p></div></article>)}</div>}</main>}
    {section === 'profile' && <main className="simple-page card"><span className="eyebrow">LEARNING PROFILE</span><h1>Your profile</h1><p>Role: Student</p><form className="auth-form" onSubmit={saveProfile}><label><span>Full name</span><input value={fullName} onChange={event => setFullName(event.target.value)} required /></label><label><span>Program</span><input value={program} onChange={event => setProgram(event.target.value)} /></label><div className="builder-two-col"><label><span>Year level</span><input value={yearLevel} onChange={event => setYearLevel(event.target.value)} /></label><label><span>Section</span><input value={classSection} onChange={event => setClassSection(event.target.value)} /></label></div><label><span>School name</span><input value={schoolName} onChange={event => setSchoolName(event.target.value)} /></label><button className="primary">Save profile</button>{profileStatus && <p className="form-message" role="status">{profileStatus}</p>}</form></main>}
  </>;
}
