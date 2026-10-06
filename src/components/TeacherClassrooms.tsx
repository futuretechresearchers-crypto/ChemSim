import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { createClassroom, listTeacherClassrooms, type Classroom } from '../lib/classrooms';

export function TeacherClassrooms() {
  const { user } = useAuth();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setClassrooms(await listTeacherClassrooms(user.id)); setError(null); }
    catch { setError('Classrooms could not be loaded. Please verify your teacher access and try again.'); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { void load(); }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !name.trim()) return;
    setSaving(true); setError(null); setStatus(null);
    try {
      const created = await createClassroom({ name });
      setClassrooms(current => [created, ...current]); setName(''); setStatus('Classroom created. Share its invitation link with your students.');
    } catch { setError('Classroom could not be created. Please verify that classroom creation is enabled for your teacher account.'); }
    finally { setSaving(false); }
  };
  const copyInvite = async (code: string) => {
    const url = `${window.location.origin}/join/${encodeURIComponent(code)}`;
    try { await navigator.clipboard.writeText(url); setStatus('Invitation link copied.'); }
    catch { setStatus(`Invitation link: ${url}`); }
  };

  return <section className="classroom-panel card">
    <div className="section-title"><div><span className="eyebrow">TEACHER CLASSROOMS</span><h2>Your classrooms</h2></div></div>
    <form className="classroom-create" onSubmit={submit}><label><span>Classroom name</span><input value={name} onChange={event => setName(event.target.value)} placeholder="CHEMISTRY 101" required maxLength={120} /></label><button className="primary" disabled={saving}>{saving ? 'Creating…' : 'Create classroom'}</button></form>
    {error && <p className="form-message error" role="alert">{error}</p>}{status && <p className="form-message success" role="status">{status}</p>}
    {loading ? <p className="muted">Loading classrooms…</p> : classrooms.length === 0 ? <p className="muted">No classrooms yet. Create one to invite students.</p> : <div className="classroom-list">{classrooms.map(room => <article className="classroom-row" key={room.id}><div><h3>{room.name}</h3><p>Join code: <strong>{room.join_code}</strong></p><p className="classroom-url">{window.location.origin}/join/{room.join_code}</p></div><button type="button" className="secondary" onClick={() => void copyInvite(room.join_code)}>Copy invitation</button></article>)}</div>}
  </section>;
}
