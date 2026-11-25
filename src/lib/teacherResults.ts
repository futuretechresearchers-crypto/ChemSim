import { supabase } from './supabase';
import { getTeacherClassroom } from './classrooms';

export interface TeacherResult {
  id: string; student_id: string; status: string; points_earned: number; total_points: number;
  started_at: string | null; submitted_at: string | null; student: { full_name: string | null } | null;
}

export async function loadAssignmentResults(classroomId: string, assignmentId: string) {
  const classroom = await getTeacherClassroom(classroomId);
  const { data: assignment, error } = await supabase.from('classroom_activity_assignments')
    .select('id, quiz_id, quiz:quizzes!inner(title,teacher_id)')
    .eq('id', assignmentId).eq('classroom_id', classroomId).eq('assigned_by', classroom.teacher_id).single();
  if (error) throw error;
  const quiz = Array.isArray(assignment.quiz) ? assignment.quiz[0] : assignment.quiz;
  if (!quiz || quiz.teacher_id !== classroom.teacher_id) throw new Error('Assignment unavailable.');
  const { data, error: resultsError } = await supabase.from('quiz_attempts')
    .select('id,student_id,status,points_earned,total_points,started_at,submitted_at,student:profiles!quiz_attempts_student_id_fkey(full_name)')
    .eq('assignment_id', assignmentId).eq('quiz_id', assignment.quiz_id).order('started_at', { ascending: false });
  if (resultsError) throw resultsError;
  const results = (data ?? []).map(row => ({ ...row, student: Array.isArray(row.student) ? row.student[0] ?? null : row.student })) as TeacherResult[];
  return { classroom, title: quiz.title, results };
}
