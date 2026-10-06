import { useEffect, useMemo, useState } from 'react';
import {
  listAssignedActivities,
  startAssignedActivity,
  submitAssignedActivity,
  type StudentActivityAssignment,
  type StudentActivityQuestion,
  type StudentActivityResult,
} from '../lib/studentActivities';

const statusLabels = {
  unavailable: 'Unavailable',
  not_yet_available: 'Not yet available',
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  expired: 'Expired',
  past_due: 'Past due',
} as const;

function formatDate(value: string | null) {
  if (!value) return 'No date set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}

function StudentQuestion({ question, answer, onAnswer }: { question: StudentActivityQuestion; answer: string; onAnswer: (value: string) => void }) {
  const options = question.question_type === 'true_false' ? ['True', 'False'] : question.options;
  if (['multiple_choice', 'true_false', 'bond_type'].includes(question.question_type)) {
    return <div className="choice-list">{options.map(option => <button key={option} type="button" className={answer === option ? 'choice selected' : 'choice'} onClick={() => onAnswer(option)}>{option}</button>)}</div>;
  }
  return <label className="answer-field"><span>Response</span><input type="text" value={answer} placeholder="Type your answer" onChange={event => onAnswer(event.target.value)} /></label>;
}

export function StudentActivitiesPage({ assignmentId, navigate }: { assignmentId?: string; navigate: (path: string) => void }) {
  const [activities, setActivities] = useState<StudentActivityAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [questions, setQuestions] = useState<StudentActivityQuestion[]>([]);
  const [activityTitle, setActivityTitle] = useState('');
  const [instructions, setInstructions] = useState<string | null>(null);
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(0);
  const [timerLeft, setTimerLeft] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState<StudentActivityResult | null>(null);
  const [started, setStarted] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    void listAssignedActivities().then(rows => {
      if (active) setActivities(rows);
    }).catch(error => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Assigned activities could not be loaded.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!started || timerLeft === null || timerLeft <= 0) return;
    const timeout = window.setTimeout(() => setTimerLeft(value => value === null ? null : Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [started, timerLeft]);

  const assignment = useMemo(() => activities.find(item => item.id === assignmentId), [activities, assignmentId]);
  const question = questions[currentIndex];

  const start = async () => {
    if (!assignmentId || starting) return;
    setStarting(true);
    setMessage('');
    try {
      const payload = await startAssignedActivity(assignmentId);
      if (!payload.attempt?.id) throw new Error('The activity could not be started. Please refresh and try again.');
      setAttemptId(payload.attempt.id);
      setActivityTitle(payload.activity.title);
      setInstructions(payload.activity.instructions);
      setTimeLimitSeconds(payload.activity.time_limit_seconds);
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(payload.attempt.started_at).getTime()) / 1000));
      setTimerLeft(payload.activity.time_limit_seconds > 0 ? Math.max(0, payload.activity.time_limit_seconds - elapsedSeconds) : null);
      setQuestions([...payload.questions].sort((a, b) => a.question_order - b.question_order));
      setAnswers({});
      setCurrentIndex(0);
      setStarted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The activity could not be started.');
    } finally {
      setStarting(false);
    }
  };

  const submit = async () => {
    if (!assignmentId || !attemptId || submitting || !started) return;
    setSubmitting(true);
    setMessage('');
    const submittedAnswers = questions.map(item => ({ question_id: item.id, answer: answers[item.id] ?? '' }));
    try {
      const safeResult = await submitAssignedActivity({ assignment_id: assignmentId, attempt_id: attemptId, answers: submittedAnswers });
      setResult(safeResult);
      setStarted(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Your answers could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <main className="simple-page card"><p role="status">Loading assigned activitiesâ€¦</p></main>;
  if (loadError) return <main className="simple-page card"><span className="eyebrow">STUDENT ACTIVITIES</span><h1>Activities unavailable</h1><p className="form-message error" role="alert">{loadError}</p></main>;

  if (!assignmentId) return <main className="simple-page card">
    <span className="eyebrow">STUDENT ACTIVITIES</span><h1>Activities assigned to you</h1>
    {!activities.length ? <p className="muted">No published activities are assigned to your classrooms yet.</p> : <div className="classroom-list">
      {activities.map(item => <article className="classroom-row" key={item.id}>
        <div><span className={`status-pill ${item.status}`}>{statusLabels[item.status]}</span><h2>{item.title}</h2><p>{item.description || 'No description'} Â· {item.category} Â· {item.difficulty}</p><p>{item.total_questions} questions Â· {item.time_limit_seconds > 0 ? `${Math.ceil(item.time_limit_seconds / 60)} min` : 'No time limit'}</p><p>Available: {formatDate(item.available_from)} Â· Due: {formatDate(item.due_at)}</p></div>
        <button className="primary" disabled={!['not_started', 'in_progress'].includes(item.status)} onClick={() => navigate(`/student/activities/${encodeURIComponent(item.id)}`)}>{item.status === 'not_started' ? 'Open activity' : item.status === 'in_progress' ? 'Continue activity' : statusLabels[item.status]}</button>
      </article>)}
    </div>}
  </main>;

  if (!assignment) return <main className="simple-page card"><span className="eyebrow">ACTIVITY UNAVAILABLE</span><h1>This activity is not assigned to your account.</h1><p>Only published activities assigned to one of your classrooms appear here.</p><button className="secondary" onClick={() => navigate('/student/activity')}>Back to activities</button></main>;
  if (assignment.status === 'not_yet_available' || assignment.status === 'past_due' || assignment.status === 'submitted' || assignment.status === 'expired') return <main className="simple-page card"><span className="eyebrow">{statusLabels[assignment.status].toUpperCase()}</span><h1>{assignment.title}</h1><p>This activity is {statusLabels[assignment.status].toLowerCase()}.</p><button className="secondary" onClick={() => navigate('/student/activity')}>Back to activities</button></main>;
  if (result) return <main className="simple-page card"><span className="eyebrow">ACTIVITY SUBMITTED</span><h1>Results</h1><p>Score: {result.points_earned} / {result.total_points} ({result.percentage}%)</p><p>Time taken: {result.time_taken ?? 0} seconds</p><p>Submitted: {formatDate(result.submitted_at)}</p><p>Status: {result.status}</p><button className="secondary" onClick={() => navigate('/student/activity')}>Back to activities</button></main>;

  return <main className="student-activity-shell">
    <header className="activity-header"><div><span className="eyebrow">ASSIGNED STUDENT ACTIVITY</span><h1>{activityTitle || assignment.title}</h1></div><div className="activity-meta">{timerLeft !== null && <span>{Math.floor(timerLeft / 60)}:{String(timerLeft % 60).padStart(2, '0')} remaining</span>}{started && <span>{currentIndex + 1}/{questions.length}</span>}</div></header>
    <section className="activity-card">
      {!started ? <><p>{assignment.description || 'Complete the assigned activity.'}</p>{assignment.instructions && <p>{assignment.instructions}</p>}<p>{assignment.total_questions} questions Â· {timeLimitSeconds || assignment.time_limit_seconds ? `${Math.ceil((timeLimitSeconds || assignment.time_limit_seconds) / 60)} minute limit` : 'No time limit'}</p><button className="primary" type="button" disabled={starting} onClick={() => void start()}>{starting ? 'Startingâ€¦' : 'Start activity'}</button></> : question ? <>
        <div className="question-topline"><span>{question.question_type.replaceAll('_', ' ')}</span><strong>{question.points} pts</strong></div><p>Question {currentIndex + 1} of {questions.length}</p><h2>{question.question_text}</h2>
        <StudentQuestion question={question} answer={answers[question.id] ?? ''} onAnswer={value => setAnswers(current => ({ ...current, [question.id]: value }))} />
        <div className="activity-actions"><button className="secondary" type="button" disabled={currentIndex === 0 || submitting} onClick={() => setCurrentIndex(index => Math.max(index - 1, 0))}>Previous</button>{currentIndex < questions.length - 1 && <button className="primary" type="button" disabled={submitting} onClick={() => setCurrentIndex(index => Math.min(index + 1, questions.length - 1))}>Next</button>}<button className="primary" type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Submittingâ€¦' : 'Submit activity'}</button></div>
      </> : <p role="status">No questions were delivered for this activity.</p>}
      {message && <p className="form-message error" role="alert">{message}</p>}
      {started && timerLeft === 0 && <p className="muted" role="status">Your display timer has reached zero. Submit your responses; the server determines whether they are accepted.</p>}
    </section>
  </main>;
}
