import { useState } from 'react';
import { updateActivityAssignment } from '../lib/quizService';

function localDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
}

export function AssignmentScheduleEditor({ assignment, onSaved, onCancel }: { assignment: Record<string, unknown>; onSaved: () => void; onCancel: () => void }) {
  const [available, setAvailable] = useState(localDate(assignment.available_from));
  const [due, setDue] = useState(localDate(assignment.due_at));
  const [published, setPublished] = useState(Boolean(assignment.is_published));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form className="assignment-form" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { await updateActivityAssignment(String(assignment.id), { availableFrom: available ? new Date(available).toISOString() : null, dueAt: due ? new Date(due).toISOString() : null, isPublished: published }); onSaved(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Assignment could not be saved.'); }
    finally { setBusy(false); }
  }}><h3>Edit assignment schedule</h3><p>Existing attempts keep their server-recorded deadline. New dates govern new starts; unpublishing also blocks active submissions under the server contract.</p>
    <label><span>Available from</span><input type="datetime-local" value={available} onChange={event => setAvailable(event.target.value)} /></label>
    <label><span>Due date</span><input type="datetime-local" value={due} onChange={event => setDue(event.target.value)} /></label>
    <label className="toggle-row"><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)} /><span>Published assignment</span></label>
    {error && <p className="form-message error" role="alert">{error}</p>}
    <div className="builder-actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save assignment'}</button><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}
