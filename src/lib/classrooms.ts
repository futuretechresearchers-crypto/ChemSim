import { supabase } from './supabase';
import type { ClassroomMemberProfile, TeacherClassroom } from '../types/teacher';

export type Classroom = Pick<TeacherClassroom, 'id' | 'name' | 'join_code'> & Partial<TeacherClassroom>;
export type ClassroomDraft = Pick<TeacherClassroom, 'name'> & Partial<Pick<TeacherClassroom, 'description' | 'program' | 'year_level' | 'section'>>;

async function currentTeacherId() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Sign in with your teacher account to manage classrooms.');
  return data.user.id;
}

const classroomColumns = 'id, teacher_id, name, join_code, description, program, year_level, section, is_active, created_at, updated_at';

export async function listTeacherClassrooms(teacherId?: string): Promise<TeacherClassroom[]> {
  const ownerId = teacherId ?? await currentTeacherId();
  const { data, error } = await supabase.from('classrooms').select(classroomColumns)
    .eq('teacher_id', ownerId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TeacherClassroom[];
}

export async function createClassroom(draft: ClassroomDraft): Promise<TeacherClassroom> {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('classrooms').insert({
    teacher_id: teacherId, name: draft.name.trim(), description: draft.description?.trim() || null,
    program: draft.program?.trim() || null, year_level: draft.year_level?.trim() || null,
    section: draft.section?.trim() || null,
  }).select(classroomColumns).single();
  if (error) throw error;
  return data as TeacherClassroom;
}

export async function updateClassroom(id: string, draft: ClassroomDraft): Promise<TeacherClassroom> {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('classrooms').update({
    name: draft.name.trim(), description: draft.description?.trim() || null,
    program: draft.program?.trim() || null, year_level: draft.year_level?.trim() || null,
    section: draft.section?.trim() || null,
  }).eq('id', id).eq('teacher_id', teacherId).select(classroomColumns).single();
  if (error) throw error;
  return data as TeacherClassroom;
}

export async function setClassroomActive(id: string, isActive: boolean): Promise<void> {
  const teacherId = await currentTeacherId();
  const { error } = await supabase.from('classrooms').update({ is_active: isActive }).eq('id', id).eq('teacher_id', teacherId);
  if (error) throw error;
}

export async function getTeacherClassroom(id: string): Promise<TeacherClassroom> {
  const teacherId = await currentTeacherId();
  const { data, error } = await supabase.from('classrooms').select(classroomColumns).eq('id', id).eq('teacher_id', teacherId).single();
  if (error) throw error;
  return data as TeacherClassroom;
}

export async function listClassroomMembers(classroomId: string): Promise<ClassroomMemberProfile[]> {
  const teacherId = await currentTeacherId();
  const { data: classroom, error: classroomError } = await supabase.from('classrooms').select('id').eq('id', classroomId).eq('teacher_id', teacherId).single();
  if (classroomError) throw classroomError;
  const { data, error } = await supabase.from('classroom_members').select('profile:profiles(id, full_name, program, year_level, section)').eq('classroom_id', classroom.id);
  if (error) throw error;
  return (data ?? []).flatMap((row: { profile: ClassroomMemberProfile | ClassroomMemberProfile[] | null }) => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    return profile ? [profile] : [];
  });
}

export async function getClassroomByCode(joinCode: string): Promise<Classroom | null> {
  const { data, error } = await supabase.from('classrooms').select('id, name, join_code').eq('join_code', joinCode).maybeSingle();
  if (error) throw error;
  return data as Classroom | null;
}

export async function joinClassroomByCode(joinCode: string): Promise<string> {
  const response = await supabase.rpc('join_classroom_by_code', { p_join_code: joinCode });
  // A duplicate membership is an idempotent success for the invitation flow.
  if (response.error?.code === '23505') return '';
  if (response.error) throw response.error;
  const responseValue: unknown = response.data;
  const value: unknown = Array.isArray(responseValue) ? responseValue[0] : responseValue;
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const row = value as Record<string, unknown>;
    const id = row.classroom_id ?? row.join_classroom_by_code ?? row.id;
    if (typeof id === 'string') return id;
  }
  throw new Error('The classroom enrollment function returned an unexpected result.');
}
