export type ActivityCategory = 'bonding' | 'lewis_structures' | 'periodic_table' | 'reactions' | 'general';
export type ActivityDifficulty = 'easy' | 'medium' | 'hard';
export type TeacherQuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'bond_type' | 'identification' | 'formula_completion';

export interface TeacherClassroom {
  id: string;
  teacher_id: string;
  name: string;
  join_code: string;
  description: string | null;
  program: string | null;
  year_level: string | null;
  section: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuizQuestion {
  id?: string;
  quiz_id?: string;
  question_order: number;
  question_text: string;
  question_type: TeacherQuestionType;
  options: string[];
  correct_answer: string;
  points: number;
  hint: string;
  explanation: string;
  workspace_enabled?: boolean;
  workspace_config?: Record<string, unknown>;
}

export interface QuizActivity {
  id?: string;
  teacher_id?: string;
  title: string;
  description: string;
  instructions: string;
  category: ActivityCategory | string;
  difficulty: ActivityDifficulty | string;
  time_limit_seconds: number;
  is_published: boolean;
  published_at?: string | null;
  total_questions: number;
  created_at?: string;
  updated_at?: string;
  questions: QuizQuestion[];
  /** Legacy editor fields retained while older components are migrated. */
  time_limit?: number | null;
  published?: boolean;
  share_code?: string;
  activity_type?: string;
  workspace_enabled?: boolean;
  workspace_config?: Record<string, unknown>;
}

export interface ClassroomActivityAssignment {
  id: string;
  classroom_id: string;
  quiz_id: string;
  assigned_by: string;
  available_from: string | null;
  due_at: string | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClassroomMemberProfile {
  id: string;
  full_name: string | null;
  program: string | null;
  year_level: string | null;
  section: string | null;
}
