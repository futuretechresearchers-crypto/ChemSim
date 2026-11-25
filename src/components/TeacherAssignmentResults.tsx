import { useEffect, useState } from 'react';
import { loadAssignmentResults } from '../lib/teacherResults';
import { listClassroomMembers } from '../lib/classrooms';
import { scorePercentage } from '../lib/assessment';
import type { ClassroomMemberProfile } from '../types/teacher';

export function TeacherAssignmentResults({ classroomId, assignmentId, navigate }: { classroomId: string; assignmentId: string; navigate: (to: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAssignmentResults>> | null>(null);
  const [members, setMembers] = useState<ClassroomMemberProfile[]>([]);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setData(null);
    void Promise.all([loadAssignmentResults(classroomId, assignmentId), listClassroomMembers(classroomId)])
      .then(([results, roster]) => { if (active) { setData(results); setMembers(roster); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Results could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classroomId, assignmentId, revision]);
  const date = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
  const rows = data?.results ?? [];
  const missing = members.filter(member => !rows.some(row => row.student_id === member.id));
  return <main className="teacher-builder-shell">
    <div className="teacher-builder-topbar"><div><span className="eyebrow">CLASSROOM RESULTS</span><h1>{data?.title ?? 'Assignment results'}</h1><p>{data?.classroom.name}</p></div><button className="secondary" onClick={() => navigate(`/teacher/classrooms/${classroomId}`)}>Back to classroom</button></div>
    {loading ? <p role="status">Loading results…</p> : error ? <><p role="alert" className="form-message error">{error}</p><button className="secondary" onClick={() => setRevision(value => value + 1)}>Retry</button></> : <section className="builder-card">
      <p>{rows.length} attempts · {rows.filter(row => row.status === 'submitted').length} submissions</p>
      {!rows.length && <p className="muted">No attempts yet. Students who have not started are listed below.</p>}
      <div className="results-table-scroll" role="region" aria-label="Student results" tabIndex={0}><table className="results-table"><thead><tr><th>Student</th><th>Status</th><th>Score</th><th>Total points</th><th>Percentage</th><th>Started at</th><th>Submitted at</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}><td>{row.student?.full_name ?? 'Student (profile unavailable)'}</td><td>{row.status.replaceAll('_', ' ')}</td><td>{row.status === 'submitted' ? row.points_earned : '—'}</td><td>{row.total_points}</td><td>{row.status === 'submitted' ? `${scorePercentage(row.points_earned, row.total_points) ?? 0}%` : '—'}</td><td>{date(row.started_at)}</td><td>{date(row.submitted_at)}</td></tr>)}
        {missing.map(member => <tr key={member.id}><td>{member.full_name ?? 'Student'}</td><td>Not started</td><td colSpan={5}>—</td></tr>)}
      </tbody></table></div>
    </section>}
  </main>;
}
