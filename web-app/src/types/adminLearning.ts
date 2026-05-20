import type { Course, CourseLesson, Question, WarningKind } from './learningContent';

export interface AdminCourse extends Course {
  club_name: string;
}

export interface AdminCourseWithLessons extends AdminCourse {
  lessons: CourseLesson[];
}

export interface AdminQuestion extends Omit<Question, 'club_id'> {
  club_id: string;
  club_name: string;
  // Campos de moderación añadidos en migración 062. Pueden venir null en
  // preguntas que ningún admin ha tocado todavía.
  moderation_notes?: string | null;
  last_admin_edit_at?: string | null;
  // Agregados de valoración (like/dislike) — mismo formato que Question.
  feedback_up?: number;
  feedback_down?: number;
  attempts_count?: number;
  correct_count?: number;
}

// Forma que devuelve el endpoint de warnings: una pregunta admin enriquecida
// con su array `warnings`. WarningKind viene de learningContent.ts.
export type AdminQuestionWithWarnings = AdminQuestion & { warnings: WarningKind[] };
export type { WarningKind };

export interface ClubStat {
  club_id: string;
  club_name: string;
  count: number;
}

// Desglose por categoría (tipo / área / nivel): count + agregados de respuestas.
export interface StatBucket {
  count: number;
  attempts: number;
  correct: number;
}

export interface TopAnsweredEntry {
  question_id: string;
  preview: string;
  attempts: number;
  success_rate: number; // 0..1
}

export interface LearningStats {
  total_questions: number;
  active_questions: number;
  total_courses: number;
  active_courses: number;
  pending_courses: number;
  by_type: Record<string, StatBucket>;
  by_area: Record<string, StatBucket>;
  by_level: Record<string, StatBucket>;
  top_answered: TopAnsweredEntry[];
  volume_last_7d: number;
  volume_last_30d: number;
  questions_by_club: ClubStat[];
  courses_by_club: ClubStat[];
}
