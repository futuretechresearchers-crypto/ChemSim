import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import ChemSim from './components/ChemLabSimulator';
import TeacherDashboard from './components/TeacherDashboard';
import { AuthScreen } from './components/AuthScreen';
import { TeacherClassroomManager } from './components/TeacherClassroomManager';
import { TeacherActivityBuilder } from './components/TeacherActivityBuilder';
import { StudentOnboarding } from './components/StudentOnboarding';
import { JoinClassroomPage } from './components/JoinClassroomPage';
import { StudentWorkspace } from './components/StudentWorkspace';
import { formatChemicalFormula } from './engine/formatting';
import { sanitizeReturnTo } from './lib/auth';
import { useAuth } from './lib/AuthContext';

const teacherModules: Record<string, { title: string; description: string }> = {
  '/teacher/analytics': { title: 'Student Analytics', description: 'Student performance analytics will appear here when the analytics module is connected.' },
  '/teacher/reactions': { title: 'Reaction Manager', description: 'Manage custom reactions and compounds for your CHEMLAB classroom.' },
  '/teacher/materials': { title: 'Learning Materials', description: 'Manage chemistry lessons and learning materials.' },
  '/teacher/visualizations': { title: 'Visualization Manager', description: 'Manage classroom visualization settings.' },
  '/teacher/controls': { title: 'Simulation Controls', description: 'Configure simulation controls for your classroom.' },
};

function LoadingScreen() {
  return <main className="auth-page"><div className="auth-card" role="status"><span className="eyebrow">CHEMLAB</span><h1>Loading your account</h1><p>Checking your Supabase session and profile…</p></div></main>;
}

function ProfileProblem({ message, retry, logout }: { message: string; retry: () => void; logout: () => void }) {
  return <main className="auth-page"><div className="auth-card" role="alert"><span className="eyebrow">ACCOUNT PROFILE</span><h1>We couldn't load your profile</h1><p>{message}</p><div className="auth-actions"><button className="primary" onClick={retry}>Try again</button><button className="secondary" onClick={logout}>Log out</button></div></div></main>;
}

export default function AppRoutes() {
  const { user, profile, role, loading, profileError, refreshProfile, signOut } = useAuth();
  const [path, setPath] = useState(window.location.pathname);
  const navigate = (to: string, replace = false) => {
    if (replace) window.history.replaceState({}, '', to);
    else window.history.pushState({}, '', to);
    setPath(window.location.pathname);
  };
  const logout = async () => { try { await signOut(); navigate('/login', true); } catch { /* retain screen if sign-out fails */ } };
  const teacherLayout = (children: ReactNode) => <>
    <header>
      <a className="brand" href="/teacher" onClick={(event) => { event.preventDefault(); navigate('/teacher'); }}><i>⚛</i><span>CHEM<span>LAB</span><small>teacher workspace</small></span></a>
      <nav>
        <a href="/teacher" className={path === '/teacher' ? 'active' : ''} onClick={(event) => { event.preventDefault(); navigate('/teacher'); }}>Teacher Dashboard</a>
        <a href="/teacher/classrooms" className={path.startsWith('/teacher/classrooms') ? 'active' : ''} onClick={(event) => { event.preventDefault(); navigate('/teacher/classrooms'); }}>Classrooms</a>
        <a href="/teacher/activities" className={path.startsWith('/teacher/activities') || path === '/teacher/quiz-builder' ? 'active' : ''} onClick={(event) => { event.preventDefault(); navigate('/teacher/activities'); }}>Activities</a>
        {Object.entries(teacherModules).map(([target, item]) => <a key={target} href={target} className={path === target ? 'active' : ''} onClick={(event) => { event.preventDefault(); navigate(target); }}>{item.title}</a>)}
      </nav>
      <button className="secondary" onClick={() => void logout()}>Log out</button>
    </header>
    {children}
  </>;

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (loading) return;
    const returnTo = window.location.pathname + window.location.search;
    const isTeacherPath = path.startsWith('/teacher');
    const isStudentPath = path.startsWith('/student');
    const isProtectedPath = isTeacherPath || isStudentPath || path === '/onboarding' || path === '/' || path === '/lab';
    if (isProtectedPath && !user) {
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`, true);
      return;
    }
    if (user && (isProtectedPath || path.startsWith('/login'))) {
      if (profileError) return;
      if (!profile || !profile.onboarding_completed) {
        if (path !== '/onboarding') {
          const activityPath = path.match(/^\/student\/activities\/[A-Za-z0-9_-]+$/)?.[0];
          navigate('/onboarding' + (activityPath ? '?continueTo=' + encodeURIComponent(activityPath) : ''), true);
        }
        return;
      }
      if (path === '/onboarding' || path === '/login' || path === '/') navigate(profile.role === 'teacher' ? '/teacher' : '/student', true);
      else if (isTeacherPath && role !== 'teacher') navigate('/student', true);
      else if (isStudentPath && role !== 'student') navigate('/teacher', true);
      else if (path === '/lab' && role === 'teacher') navigate('/teacher', true);
    }
  }, [path, user, profile, role, loading, profileError]);

  if (path.startsWith('/login')) {
    if (loading) return <LoadingScreen />;
    if (user && profileError) return <ProfileProblem message={profileError} retry={() => void refreshProfile()} logout={() => void logout()} />;
    if (user && profile?.onboarding_completed) return <LoadingScreen />;
    if (user) return <LoadingScreen />;
    const params = new URLSearchParams(window.location.search);
    return <AuthScreen returnTo={sanitizeReturnTo(params.get('returnTo'))} initialMode={params.get('mode') === 'register' ? 'register' : 'login'} />;
  }
  if (path === '/') {
    if (loading) return <LoadingScreen />;
    if (!user) return <AuthScreen />;
    if (profileError) return <ProfileProblem message={profileError} retry={() => void refreshProfile()} logout={() => void logout()} />;
    return <LoadingScreen />;
  }
  if (path === '/lab') {
    if (loading || !user) return <LoadingScreen />;
    if (profileError) return <ProfileProblem message={profileError} retry={() => void refreshProfile()} logout={() => void logout()} />;
    if (profile?.role === 'student' && profile.onboarding_completed) return <StudentWorkspace section="home" navigate={navigate} logout={() => void logout()} />;
    return <LoadingScreen />;
  }
  if (path === '/onboarding') {
    if (loading) return <LoadingScreen />;
    if (!user) return <LoadingScreen />;
    if (profileError) return <ProfileProblem message={profileError} retry={() => void refreshProfile()} logout={() => void logout()} />;
    if (profile?.onboarding_completed) return <LoadingScreen />;
    return <StudentOnboarding />;
  }
  if (path.startsWith('/join/')) return <JoinClassroomPage joinCode={path.slice('/join/'.length).split('/')[0] ?? ''} />;
  if (path.startsWith('/teacher') || path.startsWith('/student')) {
    if (loading) return <LoadingScreen />;
    if (!user) return <LoadingScreen />;
    if (profileError) {
      return <ProfileProblem message={profileError ?? 'Your account profile is incomplete.'} retry={() => void refreshProfile()} logout={() => void signOut().then(() => navigate('/login', true))} />;
    }
    if (!profile) return <StudentOnboarding />;
    if (!profile.onboarding_completed) return <StudentOnboarding />;
    if (path.startsWith('/teacher') && role !== 'teacher') return <LoadingScreen />;
    if (path.startsWith('/student') && role !== 'student') return <LoadingScreen />;
    if (path.startsWith('/student/activities/')) return <StudentWorkspace section="activity" assignmentId={path.slice('/student/activities/'.length).split('/')[0] ?? ''} navigate={navigate} logout={() => void logout()} />;
    if (path === '/teacher') return teacherLayout(<TeacherDashboard />);
    if (path === '/teacher/classrooms' || path.startsWith('/teacher/classrooms/')) return teacherLayout(<TeacherClassroomManager path={path} navigate={navigate} />);
    if (path === '/teacher/activities' || path.startsWith('/teacher/activities/') || path === '/teacher/quiz-builder') return teacherLayout(<TeacherActivityBuilder path={path} navigate={navigate} />);
    const module = teacherModules[path];
    if (module && role === 'teacher') return teacherLayout(<main className="simple-page card"><span className="eyebrow">TEACHER MODULE</span><h1>{module.title}</h1><p>{module.description}</p><a className="primary" href="/teacher" onClick={(event) => { event.preventDefault(); navigate('/teacher'); }}>Back to Teacher Dashboard</a></main>);
    if (path.startsWith('/teacher/')) return teacherLayout(<main className="simple-page card"><h1>Teacher page not found</h1><a href="/teacher" onClick={(event) => { event.preventDefault(); navigate('/teacher'); }}>Return to Teacher Dashboard</a></main>);
    if (path !== '/student' && !['/student/classes', '/student/profile', '/student/activity'].includes(path)) return <main className="simple-page card"><h1>Student page not found</h1><a href="/student" onClick={event => { event.preventDefault(); navigate('/student', true); }}>Return to your workspace</a></main>;
    const section = path === '/student/classes' ? 'classes' : path === '/student/profile' ? 'profile' : path === '/student/activity' ? 'activity' : 'home';
    return <StudentWorkspace section={section} navigate={navigate} logout={() => void logout()} />;
  }

  const page = path === '/quizzes' ? 'quizzes' : 'lab';
  if (path !== '/quizzes' && path !== '/lab') return <main className="simple-page card"><h1>Page not found</h1><a className="primary" href="/login">Go to CHEMLAB login</a></main>;
  if (path === '/lab') return <LoadingScreen />;
  return <>
    <header>
      <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }}><i>⚛</i><span>CHEM<span>LAB</span><small>interactive chemistry laboratory</small></span></a>
      <nav><a className={page === 'lab' ? 'active' : ''} href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }}>Laboratory</a><a className={page === 'quizzes' ? 'active' : ''} href="/quizzes" onClick={(event) => { event.preventDefault(); navigate('/quizzes'); }}>Quizzes</a>{role === 'teacher' && <a href="/teacher" onClick={(event) => { event.preventDefault(); navigate('/teacher'); }}>Teacher Dashboard</a>}</nav>
      {user ? <button className="secondary" onClick={() => void logout()}>Log out</button> : <button className="secondary" onClick={() => navigate('/login')}>Log in</button>}
    </header>
    {page === 'lab' ? <><section className="intro"><div><span className="eyebrow">DISCOVER CHEMICAL BONDING</span><h1>See atoms <em>connect.</em></h1><p>Build accurate reactant groups, observe electron transfer or sharing, and read the chemistry behind every supported product.</p></div><div className="formula">{formatChemicalFormula('H2O')} <b>+</b> {formatChemicalFormula('CO2')} <b>+</b> {formatChemicalFormula('NaCl')}</div></section><ChemSim /></> : <section className="simple-page card"><span className="eyebrow">KNOWLEDGE CHECK</span><h1>Bonding quizzes</h1><p>Open a quiz shared by your teacher to get started.</p></section>}
  </>;
}
