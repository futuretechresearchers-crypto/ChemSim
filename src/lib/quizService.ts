import { supabase } from './supabase';
import type { QuizActivity, QuizQuestion, TeacherQuestionType } from '../types/teacher';
import { validateSchedule } from './assessment';
import { requireLocalAssessmentContract } from './assessmentContract';

export type { QuizActivity, QuizQuestion } from '../types/teacher';
export type QuestionType = TeacherQuestionType;

const quizColumns = 'id, teacher_id, title, description, instructions, category, difficulty, time_limit_seconds, is_published, published_at, total_questions, created_at, updated_at';
const questionColumns = 'id, quiz_id, question_order, question_text, question_type, options, correct_answer, points, hint, explanation, created_at, updated_at';

async function currentTeacherId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Please sign in with your teacher account.');
  return data.user.id;
}

async function questionsFor(quizId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase.from('quiz_questions').select(questionColumns).eq('quiz_id', quizId).order('question_order');
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row, options: Array.isArray(row.options) ? row.options : [], correct_answer: row.correct_answer ?? '', hint: row.hint ?? '', explanation: row.explanation ?? '' })) as QuizQuestion[];
}

export async function activityHasAttempts(quizId: string): Promise<boolean> {
  const teacherId = await currentTeacherId();
  const { error: ownerError } = await supabase.from('quizzes').select('id').eq('id', quizId).eq('teacher_id', teacherId).single();
  if (ownerError) throw ownerError;
  const { data, error } = await supabase.from('quiz_attempts').select('id').eq('quiz_id', quizId).limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

export async function setActivityPublication(quizId: string, published: boolean): Promise<void> {
  const teacherId = await currentTeacherId();
  if (published) {
    const activity = await loadTeacherActivity(quizId);
    if (!activity.questions.length) throw new Error('Add at least one question before publishing.');
    const errors = validateQuestions(activity.questions);
    if (errors.length) throw new Error(errors.join(' '));
  }
  const { data, error } = await supabase.from('quizzes').update({ is_published: published }).eq('id', quizId).eq('teacher_id', teacherId).select('id').single();
  if (error || !data) throw error ?? new Error('Activity publication could not be changed.');
}

export async function listTeacherActivities(): Promise<QuizActivity[]> {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('quizzes').select(quizColumns).eq('teacher_id', teacherId).order('updated_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (row) => ({ ...row, description: row.description ?? '', instructions: row.instructions ?? '', questions: await questionsFor(row.id) } as QuizActivity)));
}

export async function loadTeacherActivity(id: string): Promise<QuizActivity> {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('quizzes').select(quizColumns).eq('id', id).eq('teacher_id', teacherId).single();
  if (error) throw error;
  return { ...data, description: data.description ?? '', instructions: data.instructions ?? '', questions: await questionsFor(data.id) } as QuizActivity;
}

function validateQuestions(questions: QuizQuestion[]) {
  const errors: string[] = [];
  questions.forEach((question, index) => {
    const label = `Question ${index + 1}`;
    if (!question.question_text.trim()) errors.push(`${label}: enter question text.`);
    if (!Number.isInteger(question.points) || question.points < 1) errors.push(`${label}: points must be a positive whole number.`);
    const options = question.options.map((option) => option.trim());
    if (options.some((option) => !option)) errors.push(`${label}: remove empty options.`);
    if (question.question_type === 'multiple_choice' || question.question_type === 'bond_type') {
      if (options.filter(Boolean).length < 2) errors.push(`${label}: add at least two options.`);
      if (!options.includes(question.correct_answer.trim())) errors.push(`${label}: select a correct answer from the options.`);
    } else if (question.question_type === 'true_false') {
      if (!['True', 'False'].includes(question.correct_answer)) errors.push(`${label}: choose True or False as the answer.`);
    } else if (!question.correct_answer.trim()) errors.push(`${label}: enter a correct answer.`);
  });
  return errors;
}

export async function saveQuizActivity(activity: QuizActivity): Promise<QuizActivity> {
  if (activity.is_published) throw new Error('Save the activity as a draft before publishing.');
  return saveAssessment(activity, false);
}

async function saveAssessment(activity: QuizActivity, published: boolean): Promise<QuizActivity> {
  requireLocalAssessmentContract();
  await currentTeacherId();
  if (!activity.title.trim()) throw new Error('Enter an activity title before saving.');
  if (!Number.isInteger(activity.time_limit_seconds) || activity.time_limit_seconds < 0) throw new Error('Time limit must be a nonnegative whole number of seconds.');
  if (activity.id && await activityHasAttempts(activity.id)) throw new Error('Quiz structure is locked after the first attempt. Publication can still be changed.');
  const validationErrors = validateQuestions(activity.questions);
  if (validationErrors.length) throw new Error(validationErrors.join(' '));

  const quizPayload = {
    title: activity.title.trim(), description: activity.description.trim() || null,
    instructions: activity.instructions?.trim() || null, category: activity.category,
    difficulty: activity.difficulty, time_limit_seconds: activity.time_limit_seconds,
  };
  const questions = activity.questions.map((question) => ({
      question_text: question.question_text.trim(),
      question_type: question.question_type, options: question.options.map((option) => option.trim()).filter(Boolean),
      correct_answer: question.correct_answer.trim() || null, points: question.points,
      hint: question.hint.trim() || null, explanation: question.explanation.trim() || null,
    }));
  const { data, error } = await supabase.rpc('phase7_save_assessment', {
    p_quiz_id: activity.id || null, p_metadata: quizPayload, p_questions: questions, p_publish: published,
  });
  if (error) throw error;
  if (!data?.id || !Array.isArray(data.questions)) throw new Error('Assessment save returned an invalid response.');
  return { ...data, description: data.description ?? '', instructions: data.instructions ?? '',
    questions: data.questions.map((row: QuizQuestion) => ({ ...row,
      options: Array.isArray(row.options) ? row.options : [], correct_answer: row.correct_answer ?? '',
      hint: row.hint ?? '', explanation: row.explanation ?? '',
    })),
  } as QuizActivity;
}

export async function publishQuizActivity(activity: QuizActivity): Promise<QuizActivity> {
  if (!activity.title.trim()) throw new Error('Enter an activity title before publishing.');
  if (!activity.questions.length) throw new Error('Add at least one question before publishing.');
  const validationErrors = validateQuestions(activity.questions);
  if (validationErrors.length) throw new Error(validationErrors.join(' '));
  return saveAssessment(activity, true);
}

export async function deleteQuizActivity(quizId: string): Promise<void> {
  const teacherId = await currentTeacherId();
  if (await activityHasAttempts(quizId)) throw new Error('Quiz history must be preserved after the first attempt.');
  const { error } = await supabase.from('quizzes').delete().eq('id', quizId).eq('teacher_id', teacherId);
  if (error) throw error;
}

export async function listActivityAssignments(quizId: string) {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('classroom_activity_assignments')
    .select('id, classroom_id, quiz_id, assigned_by, available_from, due_at, is_published, created_at, updated_at, classroom:classrooms!inner(id, name, program, year_level, section)')
    .eq('quiz_id', quizId).eq('assigned_by', teacherId);
  if (error) throw error;
  return data ?? [];
}

export async function listClassroomAssignments(classroomId: string) {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('classroom_activity_assignments')
    .select('id, classroom_id, quiz_id, assigned_by, available_from, due_at, is_published, created_at, updated_at, quiz:quizzes!inner(id, title, category, difficulty, total_questions, time_limit_seconds, is_published)')
    .eq('classroom_id', classroomId).eq('assigned_by', teacherId).order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: attempts, error: attemptError } = await supabase.from('quiz_attempts').select('assignment_id,status').in('assignment_id', rows.map(row => row.id));
  if (attemptError) throw attemptError;
  return rows.map(row => ({ ...row, quiz: Array.isArray(row.quiz) ? row.quiz[0] : row.quiz,
    attempt_count: (attempts ?? []).filter(attempt => attempt.assignment_id === row.id).length,
    submission_count: (attempts ?? []).filter(attempt => attempt.assignment_id === row.id && attempt.status === 'submitted').length,
  }));
}

export async function assignActivity(input: { classroomId: string; quizId: string; availableFrom?: string; dueAt?: string; isPublished: boolean }) {
  validateSchedule(input.availableFrom, input.dueAt);
  const teacherId = await currentTeacherId();
  const { data: classroom, error: classError } = await supabase.from('classrooms').select('id').eq('id', input.classroomId).eq('teacher_id', teacherId).single();
  if (classError || !classroom) throw new Error('Choose one of your own classrooms.');
  const { data: quiz, error: quizError } = await supabase.from('quizzes').select('id, is_published').eq('id', input.quizId).eq('teacher_id', teacherId).single();
  if (quizError || !quiz) throw new Error('Choose one of your own activities.');
  if (input.isPublished && !quiz.is_published) throw new Error('Publish the activity before publishing its classroom assignment.');
  const { error } = await supabase.from('classroom_activity_assignments').insert({
    classroom_id: input.classroomId, quiz_id: input.quizId, assigned_by: teacherId,
    available_from: input.availableFrom || null, due_at: input.dueAt || null, is_published: input.isPublished,
  });
  if (error?.code === '23505') throw new Error('This activity is already assigned to that classroom.');
  if (error) throw error;
}

export async function updateActivityAssignment(id: string, input: { availableFrom: string | null; dueAt: string | null; isPublished: boolean }): Promise<void> {
  validateSchedule(input.availableFrom, input.dueAt);
  const teacherId = await currentTeacherId();
  const { data: assignment, error: readError } = await supabase.from('classroom_activity_assignments').select('id, classroom_id, quiz_id').eq('id', id).eq('assigned_by', teacherId).single();
  if (readError || !assignment) throw readError ?? new Error('Assignment unavailable.');
  const { data: room, error: roomError } = await supabase.from('classrooms').select('id').eq('id', assignment.classroom_id).eq('teacher_id', teacherId).single();
  if (roomError || !room) throw new Error('Choose one of your own classrooms.');
  const { data: quiz, error: quizError } = await supabase.from('quizzes').select('id, is_published').eq('id', assignment.quiz_id).eq('teacher_id', teacherId).single();
  if (quizError || !quiz) throw new Error('Choose one of your own activities.');
  if (input.isPublished && !quiz.is_published) throw new Error('Publish the activity before publishing its classroom assignment.');
  const { error } = await supabase.from('classroom_activity_assignments').update({ available_from: input.availableFrom, due_at: input.dueAt, is_published: input.isPublished }).eq('id', id).eq('assigned_by', teacherId).select('id').single();
  if (error) throw error;
}

export async function removeActivityAssignment(id: string): Promise<void> {
  const teacherId = await currentTeacherId();
  const { data: owned, error: ownerError } = await supabase.from('classroom_activity_assignments').select('id').eq('id', id).eq('assigned_by', teacherId).single();
  if (ownerError || !owned) throw ownerError ?? new Error('Assignment unavailable.');
  const { data: attempts, error: attemptsError } = await supabase.from('quiz_attempts').select('id').eq('assignment_id', id).limit(1);
  if (attemptsError) throw attemptsError;
  if (attempts?.length) throw new Error('Assignments with attempts must be retained. Unpublish the assignment instead.');
  const { error } = await supabase.from('classroom_activity_assignments').delete().eq('id', id).eq('assigned_by', teacherId);
  if (error) throw error;
}
