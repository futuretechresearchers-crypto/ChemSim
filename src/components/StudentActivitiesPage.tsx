import { useEffect, useMemo, useState } from 'react';
import {
  listAssignedActivities,
  startAssignedActivity,
  submitAssignedActivity,
  type StudentActivityAssignment,
  type StudentActivityQuestion,
  type StudentActivityResult,
} from '../lib/studentActivities';

import { remainingSeconds } from '../lib/assessment';

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
  const [deadline, setDeadline] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [classroomFilter, setClassroomFilter] = useState(new URLSearchParams(window.location.search).get('classroom') ?? '');
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
    if (!started || !deadline) return;
    const tick = () => setTimerLeft(remainingSeconds(deadline, Date.now() + clockOffset));
    tick(); const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [started, deadline, clockOffset]);

  const assignment = useMemo(() => activities.find(item => item.id === assignmentId), [activities, assignmentId]);
  const question = questions[currentIndex];

  const start = async () => {
    if (!assignmentId || starting || started) return;
    setStarting(true);
    setMessage('');
    try {
      const payload = await startAssignedActivity(assignmentId);
      if (!payload.attempt?.id) throw new Error('The activity could not be started. Please refresh and try again.');
      setAttemptId(payload.attempt.id);
      setActivityTitle(payload.activity.title);
      setInstructions(payload.activity.instructions);
      setTimeLimitSeconds(payload.activity.time_limit_seconds);
      if (payload.attempt.status !== 'in_progress' || payload.state !== 'available') throw new Error('This attempt is no longer available. Refresh the activity list.');
      const offset = payload.server_now ? Date.parse(payload.server_now) - Date.now() : 0;
      setClockOffset(offset); setDeadline(payload.attempt.effective_deadline);
      setTimerLeft(remainingSeconds(payload.attempt.effective_deadline, Date.now() + offset));
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
    <span className="eyebrow">STUDENT ACTIVITIES</span><h1>Activities and historical results</h1><label>Classroom<select value={classroomFilter} onChange={event => setClassroomFilter(event.target.value)}><option value="">All classrooms</option>{[...new Map(activities.map(item => [item.classroom_id, item.classroom_name])).entries()].map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    {!activities.length ? <p className="muted">No published activities are assigned to your classrooms yet.</p> : <div className="classroom-list">
      {activities.filter(item => !classroomFilter || item.classroom_id === classroomFilter).map(item => <article className="classroom-row" key={item.id}>
        <div><span className={`status-pill ${item.status}`}>{statusLabels[item.status]}</span><h2>{item.title}</h2><p>{item.classroom_name}</p>{item.result?.status === 'submitted' && <p>Score: {item.result.points_earned} / {item.result.total_points} ({item.result.percentage}%)</p>}<p>{item.description || 'No description'} Â· {item.category} Â· {item.difficulty}</p><p>{item.total_questions} questions Â· {item.time_limit_seconds > 0 ? `${Math.ceil(item.time_limit_seconds / 60)} min` : 'No time limit'}</p><p>Available: {formatDate(item.available_from)} Â· Due: {formatDate(item.due_at)}</p></div>
        <button className="primary" disabled={!['not_started', 'in_progress', 'submitted', 'expired'].includes(item.status)} onClick={() => navigate(`/student/activities/${encodeURIComponent(item.id)}`)}>{item.status === 'not_started' ? 'Open activity' : item.status === 'in_progress' ? 'Continue activity' : item.result ? 'View result' : statusLabels[item.status]}</button>
      </article>)}
    </div>}
  </main>;

  if (!assignment) return <main className="simple-page card"><span className="eyebrow">ACTIVITY UNAVAILABLE</span><h1>This activity is not assigned to your account.</h1><p>Only published activities assigned to one of your classrooms appear here.</p><button className="secondary" onClick={() => navigate('/student/activity')}>Back to activities</button></main>;
  if (!result && assignment.result) return <main className="simple-page card"><h1>{assignment.title}</h1><p>Status: {statusLabels[assignment.status]}</p>{assignment.result.status === 'submitted' && <p>Score: {assignment.result.points_earned} / {assignment.result.total_points} ({assignment.result.percentage}%)</p>}<button className="secondary" onClick={() => navigate('/student/activity')}>Back to activities</button></main>;
  if (!result && (assignment.status === 'not_yet_available' || assignment.status === 'past_due' || assignment.status === 'submitted' || assignment.status === 'expired')) return <main className="simple-page card"><span className="eyebrow">{statusLabels[assignment.status].toUpperCase()}</span><h1>{assignment.title}</h1><p>This activity is {statusLabels[assignment.status].toLowerCase()}.</p><button className="secondary" onClick={() => navigate('/student/activity')}>Back to activities</button></main>;
  if (result) return <main className="simple-page card"><span className="eyebrow">ACTIVITY SUBMITTED</span><h1>Results</h1><p>Score: {result.points_earned} / {result.total_points} ({result.percentage}%)</p><p>Time taken: {result.time_taken ?? 0} seconds</p><p>Submitted: {formatDate(result.submitted_at)}</p><p>Status: {result.status}</p><button className="secondary" onClick={() => navigate('/student/activity')}>Back to activities</button></main>;

  return <main className="student-activity-shell">
    <header className="activity-header"><div><span className="eyebrow">ASSIGNED STUDENT ACTIVITY</span><h1>{activityTitle || assignment.title}</h1></div><div className="activity-meta">{timerLeft !== null && <span>{Math.floor(timerLeft / 60)}:{String(timerLeft % 60).padStart(2, '0')} remaining</span>}{started && <span>{currentIndex + 1}/{questions.length}</span>}</div></header>
    <section className="activity-card">
      {!started ? <><p>{assignment.description || 'Complete the assigned activity.'}</p>{(instructions || assignment.instructions) && <p>{instructions || assignment.instructions}</p>}<p>{assignment.total_questions} questions Â· {timeLimitSeconds || assignment.time_limit_seconds ? `${Math.ceil((timeLimitSeconds || assignment.time_limit_seconds) / 60)} minute limit` : 'No time limit'}</p><button className="primary" type="button" disabled={starting} onClick={() => void start()}>{starting ? 'Startingâ€¦' : 'Start activity'}</button></> : question ? <>
        <div className="question-topline"><span>{question.question_type.replaceAll('_', ' ')}</span><strong>{question.points} pts</strong></div><p>Question {currentIndex + 1} of {questions.length}</p><h2>{question.question_text}</h2>
        <StudentQuestion question={question} answer={answers[question.id] ?? ''} onAnswer={value => setAnswers(current => ({ ...current, [question.id]: value }))} />
        <div className="activity-actions"><button className="secondary" type="button" disabled={currentIndex === 0 || submitting} onClick={() => setCurrentIndex(index => Math.max(index - 1, 0))}>Previous</button>{currentIndex < questions.length - 1 && <button className="primary" type="button" disabled={submitting} onClick={() => setCurrentIndex(index => Math.min(index + 1, questions.length - 1))}>Next</button>}<button className="primary" type="button" disabled={submitting} onClick={() => void submit()}>{submitting ? 'Submittingâ€¦' : 'Submit activity'}</button></div>
      </> : <p role="status">No questions were delivered for this activity.</p>}
      {message && <p className="form-message error" role="alert">{message}</p>}
      {started && timerLeft === 0 && <p className="muted" role="status">Your display timer has reached zero. Submit your responses; the server determines whether they are accepted.</p>}
    </section>
  </main>;
}
