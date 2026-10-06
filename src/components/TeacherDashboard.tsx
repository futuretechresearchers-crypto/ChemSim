import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { getTeacherDashboardData } from '../lib/teacherDashboard';
import type { TeacherDashboardData, TeacherDashboardResult } from '../types/teacherDashboard';
import { listClassroomMembers, listTeacherClassrooms } from '../lib/classrooms';
import { listTeacherActivities } from '../lib/quizService';
import './TeacherDashboard.css';

type IconName = 'clipboard'|'users'|'award'|'trend'|'chart'|'flask'|'book'|'layers'|'settings';
function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, ReactNode> = {
    clipboard: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M9 10h6M9 14h6M9 18h3"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    award: <><circle cx="12" cy="8" r="6"/><path d="m8.2 13-1.1 8 4.9-2.7 4.9 2.7-1.1-8"/></>,
    trend: <><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
    chart: <><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="13" y="8" width="3" height="10" rx="1"/><rect x="19" y="5" width="2" height="13" rx="1"/></>,
    flask: <><path d="M9 3h6M10 3v7l-5.4 8.2A2.5 2.5 0 0 0 6.7 22h10.6a2.5 2.5 0 0 0 2.1-3.8L14 10V3M8 16h8"/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.4.8l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.4-.8l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.6l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.4-.8l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.4.8l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.6Z"/></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

const modules: { title: string; description: string; path: string; color: string; icon: IconName }[] = [
  { title: 'Quiz Builder', description: 'Create and manage chemistry quizzes', path: '/teacher/quiz-builder', color: 'violet', icon: 'clipboard' },
  { title: 'Student Analytics', description: 'Monitor student performance and scores', path: '/teacher/analytics', color: 'blue', icon: 'chart' },
  { title: 'Reaction Manager', description: 'Add custom reactions and compounds', path: '/teacher/reactions', color: 'green', icon: 'flask' },
  { title: 'Learning Materials', description: 'Manage educational content and lessons', path: '/teacher/materials', color: 'amber', icon: 'book' },
  { title: 'Visualization Manager', description: 'Customize animations and bond visuals', path: '/teacher/visualizations', color: 'cyan', icon: 'layers' },
  { title: 'Simulation Controls', description: 'Configure workspace settings', path: '/teacher/controls', color: 'rose', icon: 'settings' },
];

function StatCard({ label, value, color, icon }: { label: string; value: string | number; color: string; icon: IconName }) {
  return <article className={`td-stat td-${color}`}><Icon name={icon} className="td-stat-icon"/><p className="td-stat-value">{value}</p><p className="td-stat-label">{label}</p></article>;
}

function ResultRow({ result }: { result: TeacherDashboardResult }) {
  const safePct = Number.isFinite(result.percentage) ? Math.max(0, Math.min(100, result.percentage)) : 0;
  const time = Number.isFinite(result.timeTaken) ? result.timeTaken : 0;
  return <article className="td-result-row">
    <div className={`td-score ${safePct >= 80 ? 'td-score-good' : safePct >= 50 ? 'td-score-mid' : 'td-score-low'}`} aria-label={`Score ${safePct} percent`}>{safePct}%</div>
    <div className="td-result-main"><p className="td-result-title">{result.quizTitle || 'Quiz'}</p><p className="td-result-meta">{result.studentName || 'Student'} · {time}s</p></div>
    <span className="td-result-points">{result.score}/{result.totalQuestions}</span>
  </article>;
}

export default function TeacherDashboard() {
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceStats, setWorkspaceStats] = useState<{ classrooms: number; activities: number; published: number; students: number } | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getTeacherDashboardData()); }
    catch (e) { setData(null); setError(e instanceof Error ? e.message : 'Dashboard data could not be loaded. Please try again.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    void Promise.all([listTeacherClassrooms(), listTeacherActivities()]).then(async ([classrooms, activities]) => {
      const memberships = await Promise.all(classrooms.map(classroom => listClassroomMembers(classroom.id)));
      if (active) setWorkspaceStats({ classrooms: classrooms.length, activities: activities.length, published: activities.filter(activity => activity.is_published).length, students: memberships.reduce((count, members) => count + members.length, 0) });
    }).catch(() => { if (active) setWorkspaceStats(null); });
    return () => { active = false; };
  }, []);

  const stats = data?.stats;
  const avg = stats && Number.isFinite(stats.avgScore) ? `${Math.round(stats.avgScore)}%` : '—';
  return <main className="td-page">
    <div className="td-container">
      <div className="td-heading"><h1>Teacher Dashboard</h1><p>Welcome back, {data?.teacherName || 'Teacher'} — manage your chemistry classroom.</p><div className="builder-actions"><a className="primary" href="/teacher/classrooms/new">Create Classroom</a><a className="secondary" href="/teacher/activities/new">Create Activity</a></div></div>
      <section className="td-stats" aria-label="Dashboard statistics">
        <StatCard icon="users" label="Classrooms" value={workspaceStats?.classrooms ?? '—'} color="violet"/>
        <StatCard icon="clipboard" label="Activities" value={workspaceStats?.activities ?? '—'} color="blue"/>
        <StatCard icon="award" label="Published Activities" value={workspaceStats?.published ?? '—'} color="green"/>
        <StatCard icon="users" label="Students across classrooms" value={workspaceStats?.students ?? '—'} color="amber"/>
      </section>
      <section className="td-section">
        <h2>Modules</h2>
        <div className="td-modules">{modules.map((mod, index) => <a key={mod.path} href={mod.path} className={`td-module td-${mod.color}`} style={{ animationDelay: `${index * 50}ms` }}>
          <Icon name={mod.icon} className="td-module-icon"/><h3>{mod.title}</h3><p>{mod.description}</p>
        </a>)}</div>
      </section>
      <section className="td-section">
        <h2>Recent Quiz Results</h2>
        {loading ? <div className="td-results td-state" role="status">Loading...</div>
          : error ? <div className="td-results td-state td-error" role="alert"><p>{error}</p><button className="td-retry" onClick={() => void load()}>Try again</button></div>
          : !data?.recentResults.length ? <div className="td-results td-state td-empty"><Icon name="clipboard" className="td-empty-icon"/><p>No quiz results yet. Create a quiz and assign it to students!</p></div>
          : <div className="td-results">{data.recentResults.map(result => <ResultRow key={result.id} result={result}/>)}</div>}
      </section>
    </div>
  </main>;
}
