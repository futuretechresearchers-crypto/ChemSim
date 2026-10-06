import { supabase } from './supabase';
import type { QuizActivity, QuizQuestion, TeacherQuestionType } from '../types/teacher';

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

export async function listTeacherActivities(): Promise<QuizActivity[]> {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('quizzes').select(quizColumns).eq('teacher_id', teacherId).order('updated_at', { ascending: false });
  if (error) throw error;
  return Promise.all((data ?? []).map(async (row) => ({ ...row, questions: await questionsFor(row.id) } as QuizActivity)));
}

export async function loadTeacherActivity(id: string): Promise<QuizActivity> {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('quizzes').select(quizColumns).eq('id', id).eq('teacher_id', teacherId).single();
  if (error) throw error;
  return { ...data, questions: await questionsFor(data.id) } as QuizActivity;
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
  const teacherId = await currentTeacherId();
  if (activity.is_published) throw new Error('Save the activity as a draft before publishing.');
  if (!activity.title.trim()) throw new Error('Enter an activity title before saving.');
  const validationErrors = validateQuestions(activity.questions);
  if (validationErrors.length) throw new Error(validationErrors.join(' '));

  const quizPayload = {
    title: activity.title.trim(), description: activity.description.trim() || null,
    instructions: activity.instructions?.trim() || null, category: activity.category,
    difficulty: activity.difficulty, time_limit_seconds: activity.time_limit_seconds,
    is_published: false, total_questions: activity.questions.length,
  };
  const query = activity.id
    ? supabase.from('quizzes').update(quizPayload).eq('id', activity.id).eq('teacher_id', teacherId)
    : supabase.from('quizzes').insert({ ...quizPayload, teacher_id: teacherId });
  const { data: quiz, error: quizError } = await query.select(quizColumns).single();
  if (quizError) throw quizError;

  const { error: deleteError } = await supabase.from('quiz_questions').delete().eq('quiz_id', quiz.id);
  if (deleteError) throw deleteError;
  if (activity.questions.length) {
    const rows = activity.questions.map((question, index) => ({
      quiz_id: quiz.id, question_order: index + 1, question_text: question.question_text.trim(),
      question_type: question.question_type, options: question.options.map((option) => option.trim()).filter(Boolean),
      correct_answer: question.correct_answer.trim() || null, points: question.points,
      hint: question.hint.trim() || null, explanation: question.explanation.trim() || null,
    }));
    const { error } = await supabase.from('quiz_questions').insert(rows);
    if (error) throw error;
  }
  return { ...quiz, questions: await questionsFor(quiz.id) } as QuizActivity;
}

export async function publishQuizActivity(activity: QuizActivity): Promise<QuizActivity> {
  const teacherId = await currentTeacherId();
  if (!activity.id) throw new Error('Save this activity as a draft before publishing.');
  if (!activity.title.trim()) throw new Error('Enter an activity title before publishing.');
  if (!activity.questions.length) throw new Error('Add at least one question before publishing.');
  const validationErrors = validateQuestions(activity.questions);
  if (validationErrors.length) throw new Error(validationErrors.join(' '));
  const saved = await saveQuizActivity({ ...activity, is_published: false });
  const { data, error } = await supabase.from('quizzes').update({ is_published: true })
    .eq('id', saved.id).eq('teacher_id', teacherId).select(quizColumns).single();
  if (error) throw error;
  return { ...data, questions: await questionsFor(data.id) } as QuizActivity;
}

export async function deleteQuizActivity(quizId: string): Promise<void> {
  const teacherId = await currentTeacherId();
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
  return data ?? [];
}

export async function assignActivity(input: { classroomId: string; quizId: string; availableFrom?: string; dueAt?: string; isPublished: boolean }) {
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

export async function removeActivityAssignment(id: string): Promise<void> {
  const teacherId = await currentTeacherId();
  const { error } = await supabase.from('classroom_activity_assignments').delete().eq('id', id).eq('assigned_by', teacherId);
  if (error) throw error;
}
