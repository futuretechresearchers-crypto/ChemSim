import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type AttemptStatus = 'in_progress' | 'submitted' | 'expired';
export type AssignmentStatus = 'unavailable' | 'not_yet_available' | 'not_started' | 'in_progress' | 'submitted' | 'expired' | 'past_due';

export interface AssignedActivity {
  id: string;
  classroom_id: string;
  quiz_id: string;
  available_from: string | null;
  due_at: string | null;
  title: string;
  description: string | null;
  instructions: string | null;
  category: string;
  difficulty: string;
  total_questions: number;
  time_limit_seconds: number;
  status: AssignmentStatus;
}

export type StudentActivityAssignment = AssignedActivity;

export interface SafeQuizQuestion {
  id: string;
  question_type: 'multiple_choice' | 'true_false' | 'short_answer' | 'bond_type' | 'identification' | 'formula_completion';
  question_text: string;
  options: string[];
  question_order: number;
  points: number;
}

export type StudentActivityQuestion = SafeQuizQuestion;

export interface StudentActivityResponse {
  assignment: { id: string; classroom_id: string; quiz_id: string; available_from: string | null; due_at: string | null; is_published: boolean };
  activity: { id: string; title: string; description: string; instructions: string; category: string; difficulty: string; time_limit_seconds: number; total_questions: number; is_published: boolean };
  state: 'available' | 'not_yet_available' | 'past_due';
  questions: StudentActivityQuestion[];
}

export interface StartedAttempt {
  id: string;
  status: AttemptStatus;
  started_at: string;
  total_questions: number;
  total_points: number;
}

export interface StartAttemptResponse extends StudentActivityResponse { attempt: StartedAttempt | null }

export interface StudentAnswer {
  question_id: string;
  answer: string;
}

export interface SubmitAttemptRequest {
  assignment_id: string;
  attempt_id: string;
  answers: StudentAnswer[];
}

export interface SubmitAttemptResponse {
  status: AttemptStatus;
  attempt_id: string;
  score: number;
  total_questions: number;
  points_earned: number;
  total_points: number;
  percentage: number;
  time_taken: number | null;
  submitted_at: string | null;
}

export type StudentActivityResult = SubmitAttemptResponse;

function relation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function assignmentStatus(row: { available_from: string | null; due_at: string | null }, attempts: AttemptStatus[], now: number): AssignmentStatus {
  if (attempts.includes('submitted')) return 'submitted';
  if (attempts.includes('expired')) return 'expired';
  if (row.available_from && new Date(row.available_from).getTime() > now) return 'not_yet_available';
  if (row.due_at && new Date(row.due_at).getTime() < now) return 'past_due';
  if (attempts.includes('in_progress')) return 'in_progress';
  return 'not_started';
}

export async function listAssignedActivities(): Promise<StudentActivityAssignment[]> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Please sign in to view your assigned activities.');

  const { data: memberships, error: membershipError } = await supabase
    .from('classroom_members').select('classroom_id').eq('student_id', auth.user.id);
  if (membershipError) throw new Error('Assigned activities could not be loaded. Please try again.');
  const classroomIds = [...new Set((memberships ?? []).map(row => row.classroom_id))];
  if (!classroomIds.length) return [];

  const { data, error } = await supabase.from('classroom_activity_assignments')
    .select('id, classroom_id, quiz_id, available_from, due_at, is_published, quiz:quizzes!inner(id, title, description, instructions, category, difficulty, total_questions, time_limit_seconds, is_published)')
    .in('classroom_id', classroomIds).eq('is_published', true).order('created_at', { ascending: false });
  if (error) throw new Error('Assigned activities could not be loaded. Please try again.');

  const rows = (data ?? []).flatMap(row => {
    const quiz = relation(row.quiz as unknown as Record<string, unknown> | Record<string, unknown>[] | null);
    if (!quiz || quiz.is_published !== true) return [];
    return [{
      id: row.id,
      classroom_id: row.classroom_id,
      quiz_id: row.quiz_id,
      available_from: row.available_from,
      due_at: row.due_at,
      title: String(quiz.title ?? 'Untitled activity'),
      description: typeof quiz.description === 'string' ? quiz.description : null,
      instructions: typeof quiz.instructions === 'string' ? quiz.instructions : null,
      category: String(quiz.category ?? ''),
      difficulty: String(quiz.difficulty ?? ''),
      total_questions: Number(quiz.total_questions ?? 0),
      time_limit_seconds: Number(quiz.time_limit_seconds ?? 0),
    }];
  });

  if (!rows.length) return [];
  const assignmentIds = [...new Set(rows.map(row => row.id))];
  const { data: attempts, error: attemptsError } = await supabase.from('quiz_attempts')
    .select('assignment_id, status').eq('student_id', auth.user.id).in('assignment_id', assignmentIds);
  if (attemptsError) throw new Error('Activity progress could not be loaded. Please refresh the page.');
  const statusesByAssignment = new Map<string, AttemptStatus[]>();
  for (const attempt of attempts ?? []) {
    if (!attempt.assignment_id || !['in_progress', 'submitted', 'expired'].includes(attempt.status)) continue;
    const statuses = statusesByAssignment.get(attempt.assignment_id) ?? [];
    statuses.push(attempt.status as AttemptStatus);
    statusesByAssignment.set(attempt.assignment_id, statuses);
  }
  const now = Date.now();

  return rows.map(row => ({ ...row, status: assignmentStatus(row, statusesByAssignment.get(row.id) ?? [], now) }));
}

function userFacingStatus(status: number, responseBody?: unknown): string {
  const responseStatus = responseBody && typeof responseBody === 'object' && 'status' in responseBody
    ? (responseBody as { status?: unknown }).status
    : undefined;
  const responseState = responseBody && typeof responseBody === 'object' && 'state' in responseBody
    ? (responseBody as { state?: unknown }).state
    : undefined;
  if (status === 401) return 'Your session has expired. Sign in again to continue.';
  if (status === 403) return 'You are not authorized to access this activity.';
  if (status === 404) return 'This activity or attempt could not be found.';
  if (status === 409 && responseStatus === 'expired') return 'This attempt has expired and can no longer be submitted.';
  if (status === 409 && responseState === 'past_due') return 'This activity is past its due date and can no longer be started.';
  if (status === 409 && responseState === 'not_yet_available') return 'This activity is not available yet.';
  if (status === 409) return 'This attempt changed or was already submitted. Refresh the activity list to see its current status.';
  if (status === 400 || status === 422) return 'The activity submission is invalid. Review your answers and try again.';
  if (status === 410) return 'This activity is past its due date and can no longer be submitted.';
  return 'The secure activity service is unavailable. Please try again later.';
}

async function callStudentActivityBackend<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('student-activities', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let responseBody: unknown;
      try { responseBody = await error.context.json(); } catch { /* map using status only */ }
      throw new Error(userFacingStatus(error.context.status, responseBody));
    }
    throw new Error('The secure activity service is unavailable. Please try again later.');
  }
  if (!data || typeof data !== 'object' || data.error) {
    throw new Error('The activity could not be loaded. Please try again.');
  }
  return data as T;
}

/** Fetches safe question data through the authenticated trusted operation. */
export function getAssignedActivity(assignmentId: string): Promise<StudentActivityResponse> {
  return callStudentActivityBackend({ action: 'get', assignment_id: assignmentId });
}

/** Starts an assignment only after the backend validates membership and availability. */
export function startAssignedActivity(assignmentId: string): Promise<StartAttemptResponse> {
  return callStudentActivityBackend({ action: 'start', assignment_id: assignmentId });
}

/** Sends only the assignment, server-created attempt, and student answers. */
export function submitAssignedActivity(request: SubmitAttemptRequest): Promise<SubmitAttemptResponse> {
  return callStudentActivityBackend({ action: 'submit', ...request });
}
