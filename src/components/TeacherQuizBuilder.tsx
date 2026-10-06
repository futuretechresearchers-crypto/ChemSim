import { useEffect, useState } from 'react';
import { deleteQuizActivity, listTeacherActivities, publishQuizActivity, saveQuizActivity, type QuizActivity, type QuizQuestion, type QuestionType } from '../lib/quizService';
import { assignActivity } from '../lib/quizService';
import { listTeacherClassrooms } from '../lib/classrooms';
import type { TeacherClassroom } from '../types/teacher';

const emptyQuestion = (): QuizQuestion => ({
  question_type: 'multiple_choice',
  question_text: '',
  options: ['Option A', 'Option B', 'Option C', 'Option D'],
  correct_answer: 'Option A',
  explanation: '',
  hint: '',
  question_order: 1,
  points: 1,
  workspace_enabled: false,
  workspace_config: {},
});

const emptyActivity = (): QuizActivity => ({
  title: '',
  description: '',
  instructions: '',
  category: 'General Chemistry',
  difficulty: 'medium',
  time_limit: 15,
  time_limit_seconds: 900,
  is_published: false,
  total_questions: 1,
  published: false,
  activity_type: 'quiz',
  workspace_enabled: false,
  workspace_config: {},
  questions: [emptyQuestion()],
});

export function TeacherQuizBuilder() {
  const [activities, setActivities] = useState<QuizActivity[]>([]);
  const [editor, setEditor] = useState<QuizActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [assigning, setAssigning] = useState<QuizActivity | null>(null);
  const [classrooms, setClassrooms] = useState<TeacherClassroom[]>([]);
  const [classroomId, setClassroomId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const loadActivities = async () => {
    try {
      const next = await listTeacherActivities();
      setActivities(next);
      setError(null);
    } catch (caughtError) {
      if (import.meta.env.DEV) console.error('Teacher activities load failed', caughtError);
      setError('Activities could not be loaded. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadActivities();
  }, []);

  const startNewActivity = () => {
    setEditor(emptyActivity());
    setStatus(null);
  };

  const updateActivityField = <K extends keyof QuizActivity>(key: K, value: QuizActivity[K]) => {
    if (!editor) return;
    setEditor({ ...editor, [key]: value });
  };

  const updateQuestionField = (questionIndex: number, field: keyof QuizQuestion, value: QuizQuestion[keyof QuizQuestion]) => {
    if (!editor) return;
    const nextQuestions = [...editor.questions];
    nextQuestions[questionIndex] = {
      ...nextQuestions[questionIndex],
      [field]: value,
    };
    setEditor({ ...editor, questions: nextQuestions });
  };

  const addQuestion = () => {
    if (!editor) return;
    setEditor({
      ...editor,
      questions: [...editor.questions, { ...emptyQuestion(), question_order: editor.questions.length + 1 }],
    });
  };

  const removeQuestion = (index: number) => {
    if (!editor) return;
    const nextQuestions = editor.questions.filter((_, currentIndex) => currentIndex !== index);
    setEditor({ ...editor, questions: nextQuestions.length ? nextQuestions : [emptyQuestion()] });
  };

  const saveDraft = async () => {
    if (!editor) return;
    try {
      const payload = { ...editor, published: false };
      const next = await saveQuizActivity(payload);
      setEditor(next);
      setStatus('Draft saved successfully.');
      await loadActivities();
    } catch (caughtError) {
      if (import.meta.env.DEV) console.error('Quiz draft save failed', caughtError);
      setError('The draft could not be saved. Please retry.');
    }
  };

  const publish = async () => {
    if (!editor) return;

    const validTitle = editor.title.trim().length > 0;
    const validQuestions = editor.questions.length > 0 && editor.questions.every((question) => question.question_text.trim().length > 0);

    if (!validTitle || !validQuestions) {
      setError('Add a title and complete every question before publishing.');
      return;
    }

    try {
      const next = await publishQuizActivity({ ...editor, published: true });
      setEditor(next);
      setStatus('Activity published. Share link is ready below.');
      await loadActivities();
    } catch (caughtError) {
      if (import.meta.env.DEV) console.error('Quiz publish failed', caughtError);
      setError('The activity could not be published. Please retry.');
    }
  };

  const copyLink = async (shareCode: string) => {
    const link = `${window.location.origin}/activity/${shareCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setStatus('Activity link copied to the clipboard.');
    } catch {
      setStatus(`Copy this link manually: ${link}`);
    }
  };

  const deleteActivity = async (quizId: string) => {
    try {
      await deleteQuizActivity(quizId);
      await loadActivities();
      if (editor?.id === quizId) setEditor(null);
      setStatus('Activity deleted.');
    } catch (caughtError) {
      if (import.meta.env.DEV) console.error('Quiz delete failed', caughtError);
      setError('The activity could not be deleted. Please retry.');
    }
  };

  const publishExisting = async (activity: QuizActivity) => {
    try {
      const next = await publishQuizActivity({ ...activity, published: true, share_code: activity.share_code || '' });
      setActivities(current => current.map(item => item.id === next.id ? next : item));
      setStatus('Activity published. Share link is ready.'); setError(null);
    } catch (caughtError) {
      if (import.meta.env.DEV) console.error('Quiz publish failed', caughtError);
      setError('The activity could not be published. Please retry.');
    }
  };

  const openAssignment = async (activity: QuizActivity) => {
    setError(null); setStatus(null);
    try { setClassrooms(await listTeacherClassrooms()); setClassroomId(''); setDueAt(''); setAssigning(activity); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Classrooms could not be loaded.'); }
  };
  const submitAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!assigning || !classroomId) return;
    try {
      await assignActivity({ classroomId, quizId: assigning.id ?? '', dueAt: dueAt ? new Date(dueAt).toISOString() : undefined, isPublished: true });
      setAssigning(null); setStatus('Activity assigned to classroom.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Activity could not be assigned.'); }
  };

  const currentShareLink = editor?.share_code ? `${window.location.origin}/activity/${editor.share_code}` : '';

  if (editor) {
    return (
      <main className="teacher-builder-shell">
        <div className="teacher-builder-topbar">
          <div>
            <span className="eyebrow">TEACHER QUIZ BUILDER</span>
            <h1>{editor.title || 'New activity'}</h1>
          </div>
          <div className="builder-actions">
            <button type="button" className="secondary" onClick={() => setEditor(null)}>Back to list</button>
            <button type="button" className="primary" onClick={saveDraft}>Save draft</button>
            <button type="button" className="primary" onClick={publish}>Publish</button>
          </div>
        </div>

        <section className="builder-editor-grid">
          <div className="builder-card">
            <h2>Activity settings</h2>
            <label>
              <span>Title</span>
              <input value={editor.title} onChange={(event) => updateActivityField('title', event.target.value)} placeholder="Chemical Bonding Basics" />
            </label>
            <label>
              <span>Description</span>
              <textarea value={editor.description ?? ''} onChange={(event) => updateActivityField('description', event.target.value)} rows={4} placeholder="Students learn about bonding and electron transfer." />
            </label>
            <div className="builder-two-col">
              <label>
                <span>Category</span>
                <input value={editor.category ?? ''} onChange={(event) => updateActivityField('category', event.target.value)} />
              </label>
              <label>
                <span>Difficulty</span>
                <select value={editor.difficulty ?? 'medium'} onChange={(event) => updateActivityField('difficulty', event.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>
            <div className="builder-two-col">
              <label>
                <span>Time limit (mins)</span>
                <input type="number" min={1} value={editor.time_limit ?? 15} onChange={(event) => updateActivityField('time_limit', Number(event.target.value) || 15)} />
              </label>
              <label>
                <span>Activity type</span>
                <select value={editor.activity_type ?? 'quiz'} onChange={(event) => updateActivityField('activity_type', event.target.value)}>
                  <option value="quiz">Quiz</option>
                  <option value="activity">Activity</option>
                </select>
              </label>
            </div>
            <label className="toggle-row">
              <input type="checkbox" checked={Boolean(editor.workspace_enabled)} onChange={(event) => updateActivityField('workspace_enabled', event.target.checked)} />
              <span>ChemLab workspace enabled</span>
            </label>
          </div>

          <div className="builder-card">
            <div className="builder-card-header">
              <h2>Questions</h2>
              <button type="button" className="secondary" onClick={addQuestion}>+ Add question</button>
            </div>

            {editor.questions.map((question, index) => (
              <div key={index} className="question-editor-block">
                <div className="question-editor-header">
                  <strong>Question {index + 1}</strong>
                  <button type="button" className="link-button" onClick={() => removeQuestion(index)}>Remove</button>
                </div>

                <label>
                  <span>Type</span>
                  <select value={question.question_type} onChange={(event) => updateQuestionField(index, 'question_type', event.target.value as QuestionType)}>
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="bond_type">Bond type</option>
                    <option value="identification">Identification</option>
                    <option value="formula_completion">Formula completion</option>
                  </select>
                </label>

                <label>
                  <span>Question text</span>
                  <textarea value={question.question_text} onChange={(event) => updateQuestionField(index, 'question_text', event.target.value)} rows={3} />
                </label>

                {(question.question_type === 'multiple_choice' || question.question_type === 'bond_type') && (
                  <>
                    <label>
                      <span>Choices</span>
                      <textarea
                        value={(question.options ?? []).join('\n')}
                        onChange={(event) => updateQuestionField(index, 'options', event.target.value.split('\n').map((option) => option.trim()).filter(Boolean))}
                        rows={4}
                      />
                    </label>
                    <label>
                      <span>Correct answer</span>
                      <input value={question.correct_answer ?? ''} onChange={(event) => updateQuestionField(index, 'correct_answer', event.target.value)} />
                    </label>
                  </>
                )}

                {(question.question_type === 'identification' || question.question_type === 'formula_completion') && (
                  <label>
                    <span>Correct answer</span>
                    <input value={question.correct_answer ?? ''} onChange={(event) => updateQuestionField(index, 'correct_answer', event.target.value)} />
                  </label>
                )}

                <div className="builder-two-col">
                  <label>
                    <span>Points</span>
                    <input type="number" min={1} value={question.points ?? 1} onChange={(event) => updateQuestionField(index, 'points', Number(event.target.value) || 1)} />
                  </label>
                  <label>
                    <span>Workspace enabled</span>
                    <input type="checkbox" checked={Boolean(question.workspace_enabled)} onChange={(event) => updateQuestionField(index, 'workspace_enabled', event.target.checked)} />
                  </label>
                </div>

                <label>
                  <span>Hint</span>
                  <input value={question.hint ?? ''} onChange={(event) => updateQuestionField(index, 'hint', event.target.value)} />
                </label>
                <label>
                  <span>Explanation</span>
                  <textarea value={question.explanation ?? ''} onChange={(event) => updateQuestionField(index, 'explanation', event.target.value)} rows={3} />
                </label>
              </div>
            ))}
          </div>
        </section>

        {editor.published && currentShareLink && (
          <section className="share-panel">
            <span className="eyebrow">ACTIVITY PUBLISHED</span>
            <h3>Student activity link</h3>
            <div className="share-link-box">
              <span>{currentShareLink}</span>
            </div>
            <div className="builder-actions">
              <button type="button" className="primary" onClick={() => copyLink(editor.share_code ?? '')}>Copy link</button>
              <button type="button" className="secondary" onClick={() => window.open(currentShareLink, '_blank', 'noopener,noreferrer')}>Open activity</button>
            </div>
          </section>
        )}

        {error && <div className="form-message error">{error}</div>}
        {status && <div className="form-message success">{status}</div>}
      </main>
    );
  }

  return (
    <main className="teacher-builder-shell">
      <div className="teacher-builder-topbar">
        <div>
          <span className="eyebrow">CHEMLAB TEACHER</span>
          <h1>Activities</h1>
        </div>
        <button type="button" className="primary" onClick={startNewActivity}>+ New Activity</button>
      </div>

      <section className="activity-list">
        {loading ? <p>Loading activities…</p> : activities.length === 0 ? (
          <div className="empty-state-card">
            <h2>No activities yet.</h2>
            <p>Create a new activity to begin building your chemistry lesson.</p>
            <button type="button" className="primary" onClick={startNewActivity}>+ New Activity</button>
          </div>
        ) : (
          activities.map((activity) => (
            <article key={activity.id ?? activity.title} className="activity-list-item">
              <div>
                <div className="activity-meta-row">
                  <h3>{activity.title}</h3>
                  <span className={`status-pill ${activity.published ? 'published' : 'draft'}`}>{activity.published ? 'Published' : 'Draft'}</span>
                </div>
                <p>{activity.description || 'No description yet.'}</p>
                <div className="activity-badges">
                  <span>{activity.category || 'General'}</span>
                  <span>{activity.difficulty || 'medium'}</span>
                  <span>{activity.questions?.length ?? 0} questions</span>
                  <span>{activity.time_limit ? `${activity.time_limit} min` : 'No timer'}</span>
                  <span>{activity.activity_type || 'quiz'}</span>
                </div>
              </div>
              <div className="activity-list-actions">
                <button type="button" className="secondary" onClick={() => setEditor(activity)}>Edit</button>
                <button type="button" className="secondary" onClick={() => deleteActivity(activity.id ?? '')}>Delete</button>
                <button type="button" className="secondary" onClick={() => void openAssignment(activity)}>Assign</button>
                <button type="button" className="secondary" onClick={() => copyLink(activity.share_code ?? '')}>Copy link</button>
                <button type="button" className="primary" onClick={() => void publishExisting(activity)}>Publish</button>
              </div>
            </article>
          ))
        )}
      </section>

      {error && <div className="form-message error">{error}</div>}
      {status && <div className="form-message success">{status}</div>}
      {assigning && <div className="modal-backdrop" role="presentation"><form className="builder-card assignment-dialog" role="dialog" aria-modal="true" aria-labelledby="assign-title" onSubmit={submitAssignment}><h2 id="assign-title">Assign {assigning.title}</h2><label><span>Classroom</span><select required value={classroomId} onChange={event => setClassroomId(event.target.value)}><option value="">Choose your classroom</option>{classrooms.map(room => <option key={room.id} value={room.id}>{room.name}{room.program ? ` — ${room.program}` : ''}{room.section ? ` ${room.section}` : ''}</option>)}</select></label><label><span>Due date (optional)</span><input type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)}/></label><div className="builder-actions"><button type="button" className="secondary" onClick={() => setAssigning(null)}>Cancel</button><button className="primary">Assign Activity</button></div></form></div>}
    </main>
  );
}
