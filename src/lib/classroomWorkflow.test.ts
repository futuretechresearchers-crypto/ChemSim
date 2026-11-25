import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  replies: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
  calls: [] as Array<{ table: string; method: string; args: unknown[] }>,
  invoke: vi.fn(), rpc: vi.fn(),
}));
vi.mock('./supabase', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'teacher-1' } }, error: null }) },
  functions: { invoke: fake.invoke }, rpc: fake.rpc,
  from(table: string) {
    const query: Record<string, unknown> = {};
    for (const method of ['select','eq','in','order','limit','insert','update','delete','single','maybeSingle']) query[method] = (...args: unknown[]) => { fake.calls.push({ table, method, args }); return query; };
    query.then = (resolve: (value: unknown) => void) => resolve(fake.replies[table]?.shift() ?? { data: [], error: null });
    return query;
  },
} }));

import { assignActivity, publishQuizActivity, saveQuizActivity, setActivityPublication, updateActivityAssignment } from './quizService';
import { createClassroom, joinClassroomByCode } from './classrooms';
import { loadAssignmentResults } from './teacherResults';
import { listAssignedActivities, startAssignedActivity, submitAssignedActivity } from './studentActivities';
import type { QuizActivity } from '../types/teacher';
vi.mock('./assessmentContract', () => ({ requireLocalAssessmentContract: () => {} }));

const activity: QuizActivity = { id: 'quiz-1', title: 'Bonding', description: '', instructions: '', category: 'bonding', difficulty: 'easy', time_limit_seconds: 60, is_published: false, total_questions: 1, questions: [{ question_order: 1, question_type: 'true_false', question_text: 'A question', correct_answer: 'True', options: [], points: 2, hint: '', explanation: '' }] };
const reply = (table: string, data: unknown, error: unknown = null) => (fake.replies[table] ??= []).push({ data, error });
beforeEach(() => { fake.replies = {}; fake.calls = []; fake.invoke.mockReset(); fake.rpc.mockReset(); });

describe('classroom contract boundaries', () => {
  it('rejects an empty name without issuing a database write', async () => {
    await expect(createClassroom({ name: '  ' })).rejects.toThrow('name');
    expect(fake.calls).toHaveLength(0);
  });
  it('rejects malformed join codes before the RPC', async () => {
    await expect(joinClassroomByCode('bad')).rejects.toThrow('eight');
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it('accepts an idempotent duplicate membership response', async () => {
    fake.rpc.mockResolvedValue({ error: { code: '23505' } });
    await expect(joinClassroomByCode('ABCDEFGH')).resolves.toBe('');
  });
  it('locks quiz structure before any write when an attempt exists', async () => {
    reply('quizzes', { id: 'quiz-1' }); reply('quiz_attempts', [{ id: 'attempt-1' }]);
    await expect(saveQuizActivity(activity)).rejects.toThrow('locked');
    expect(fake.calls.some(call => ['update','insert','delete'].includes(call.method))).toBe(false);
  });
  it('saves metadata and questions in one RPC without trusted ownership or count fields', async () => {
    reply('quizzes', { id: 'quiz-1' }); reply('quiz_attempts', []);
    fake.rpc.mockResolvedValue({ data: activity, error: null });
    await saveQuizActivity(activity);
    expect(fake.rpc).toHaveBeenCalledTimes(1);
    const [name, payload] = fake.rpc.mock.calls[0];
    expect(name).toBe('phase7_save_assessment');
    expect(payload.p_metadata).not.toHaveProperty('total_questions');
    expect(payload.p_metadata).not.toHaveProperty('teacher_id');
    expect(payload.p_questions[0]).not.toHaveProperty('quiz_id');
    expect(fake.calls.some(call => ['update','insert','delete'].includes(call.method))).toBe(false);
  });
  it('changes publication without modifying question structure or attempt history', async () => {
    reply('quizzes', { id: 'quiz-1' });
    await setActivityPublication('quiz-1', false);
    expect(fake.calls.find(call => call.method === 'update')?.args[0]).toEqual({ is_published: false });
    expect(fake.calls.some(call => call.table === 'quiz_questions')).toBe(false);
  });
  it('publishes in the save transaction and propagates failure without separate writes', async () => {
    reply('quizzes', { id: 'quiz-1' }); reply('quiz_attempts', []);
    fake.rpc.mockResolvedValue({ data: null, error: new Error('transaction rolled back') });
    await expect(publishQuizActivity(activity)).rejects.toThrow('rolled back');
    expect(fake.rpc.mock.calls[0][1].p_publish).toBe(true);
    expect(fake.calls.some(call => ['update','insert','delete'].includes(call.method))).toBe(false);
  });
  it('can save again when the RPC returns nullable optional question fields', async () => {
    for (let n=0; n<2; n++) { reply('quizzes', { id: 'quiz-1' }); reply('quiz_attempts', []); }
    fake.rpc.mockResolvedValue({ data: { ...activity, description: null, instructions: null,
      questions: [{ ...activity.questions[0], hint: null, explanation: null }] }, error: null });
    const saved = await saveQuizActivity(activity);
    expect(saved.questions[0].hint).toBe('');
    await expect(saveQuizActivity(saved)).resolves.toHaveProperty('id', 'quiz-1');
    expect(fake.rpc).toHaveBeenCalledTimes(2);
  });
  it('discovers only own terminal history when there are no current memberships', async () => {
    reply('quiz_attempts', [{ id: 'attempt-1', assignment_id: 'hidden-assignment', quiz_id: 'quiz-1', status: 'submitted',
      score: 1, total_questions: 1, points_earned: 2, total_points: 2, time_taken: 10, submitted_at: '2026-10-07T00:00:00Z' }]);
    reply('classroom_members', []);
    const rows = await listAssignedActivities();
    expect(rows).toHaveLength(1); expect(rows[0].historical).toBe(true);
    expect(rows[0].result?.percentage).toBe(100);
    expect(fake.calls.some(call => call.table === 'quiz_questions' || call.table === 'quizzes')).toBe(false);
    expect(fake.invoke).not.toHaveBeenCalled();
    expect(fake.calls).toContainEqual({ table: 'quiz_attempts', method: 'eq', args: ['student_id', 'teacher-1'] });
  });
  it('rejects a reversed schedule before assignment queries', async () => {
    await expect(assignActivity({ classroomId: 'room-1', quizId: 'quiz-1', availableFrom: '2026-10-08', dueAt: '2026-10-07', isPublished: true })).rejects.toThrow('later');
    expect(fake.calls).toHaveLength(0);
  });
  it('rejects publication of a draft quiz assignment', async () => {
    reply('classrooms', { id: 'room-1' }); reply('quizzes', { id: 'quiz-1', is_published: false });
    await expect(assignActivity({ classroomId: 'room-1', quizId: 'quiz-1', isPublished: true })).rejects.toThrow('Publish the activity');
    expect(fake.calls.some(call => call.method === 'insert')).toBe(false);
  });
  it('updates only the granted schedule/publication columns', async () => {
    reply('classroom_activity_assignments', { id: 'assignment-1', classroom_id: 'room-1', quiz_id: 'quiz-1' });
    reply('classrooms', { id: 'room-1' }); reply('quizzes', { id: 'quiz-1', is_published: true }); reply('classroom_activity_assignments', { id: 'assignment-1' });
    await updateActivityAssignment('assignment-1', { availableFrom: null, dueAt: null, isPublished: true });
    expect(fake.calls.find(call => call.method === 'update')?.args[0]).toEqual({ available_from: null, due_at: null, is_published: true });
  });
  it('does not query results when classroom ownership cannot be verified', async () => {
    reply('classrooms', null, new Error('Not owned'));
    await expect(loadAssignmentResults('other-room', 'assignment-1')).rejects.toThrow('Not owned');
    expect(fake.calls.some(call => call.table === 'quiz_attempts')).toBe(false);
  });
  it('sends only identifiers and answers to the authenticated grading service', async () => {
    fake.invoke.mockResolvedValue({ data: { status: 'submitted' }, error: null });
    await startAssignedActivity('assignment-1');
    expect(fake.invoke).toHaveBeenLastCalledWith('student-activities', { body: { action: 'start', assignment_id: 'assignment-1' } });
    await submitAssignedActivity({ assignment_id: 'assignment-1', attempt_id: 'attempt-1', answers: [{ question_id: 'question-1', answer: 'True' }] });
    expect(fake.invoke.mock.calls[1][1].body).toEqual({ action: 'submit', assignment_id: 'assignment-1', attempt_id: 'attempt-1', answers: [{ question_id: 'question-1', answer: 'True' }] });
  });
});
