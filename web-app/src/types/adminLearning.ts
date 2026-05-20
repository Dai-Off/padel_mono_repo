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

export interface DailyResponse {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface LearningStats {
  active_questions: number;
  active_courses: number;
  pending_courses: number;
  active_players_7d: number;
  by_type: Record<string, StatBucket>;
  by_area: Record<string, StatBucket>;
  by_level: Record<string, StatBucket>;
  volume_last_7d: number;
  volume_last_30d: number;
  daily_responses_30d: DailyResponse[];
  warnings_by_kind: {
    too_easy: number;
    too_hard: number;
    low_quality: number;
  };
  feedback_up_total: number;
  feedback_down_total: number;
  // Métricas de cursos:
  lessons_completed_7d: number;
  course_players_30d: number;
  course_levels: Record<string, number>; // label de rango → count de cursos activos
  course_completion_rate: number | null; // 0..1, null si no hay datos
  courses_started: number;
  courses_completed: number;
  total_lessons_published: number;
  avg_lessons_per_course: number | null;
  avg_lesson_duration_seconds: number | null;
  courses_with_full_video_rate: number | null;
  avg_depth_completed: number | null;
  // Estadísticas de rachas (solo admin — son por jugador, no por club).
  streaks: {
    players_with_active_streak: number;
    avg_current_streak: number | null;
    longest_ever: number;
    buckets: Record<string, number>;
  };
  questions_by_club: ClubStat[];
  courses_by_club: ClubStat[];
}

// Stats locales de un club, con benchmark global para comparar. Reusan el
// shape de LearningStats donde tiene sentido (sin questions_by_club ni
// courses_by_club, que no aplican en una vista de un solo club).
export interface ClubLearningStats {
  active_questions: number;
  active_courses: number;
  pending_courses: number;
  active_players_7d: number;
  by_type: Record<string, StatBucket>;
  by_area: Record<string, StatBucket>;
  by_level: Record<string, StatBucket>;
  volume_last_7d: number;
  volume_last_30d: number;
  daily_responses_30d: DailyResponse[];
  warnings_by_kind: { too_easy: number; too_hard: number; low_quality: number };
  feedback_up_total: number;
  feedback_down_total: number;
  lessons_completed_7d: number;
  course_players_30d: number;
  course_levels: Record<string, number>;
  course_completion_rate: number | null;
  courses_started: number;
  courses_completed: number;
  total_lessons_published: number;
  avg_lessons_per_course: number | null;
  avg_lesson_duration_seconds: number | null;
  courses_with_full_video_rate: number | null;
  avg_depth_completed: number | null;
  benchmark: {
    success_rate: number | null;
    positive_rate: number | null;
    completion_rate: number | null;
  };
}

// Stats detalladas de UNA pregunta concreta. Solo cuenta logs frescos
// (answered_at >= content_updated_at).
export interface QuestionDetailStats {
  question_id: string;
  content_updated_at: string;
  has_pre_edit_logs: boolean;
  total_attempts: number;
  total_correct: number;
  success_rate: number | null;
  avg_response_ms: number | null;
  votes_up: number;
  votes_down: number;
  daily_responses_30d: DailyResponse[];
  // Distribución de respuestas. NULL para tipos donde no aplica (match_columns,
  // order_sequence).
  answer_distribution: Array<{
    key: string;
    label: string;
    count: number;
    is_correct: boolean;
  }> | null;
  elo_distribution: Array<{ label: string; attempts: number; correct: number }>;
}

// Stats detalladas de UN curso concreto.
export interface CourseDetailStats {
  course_id: string;
  total_lessons: number;
  players_started: number;
  players_completed: number;
  completion_rate: number | null;
  lessons_completed_30d: number;
  lesson_funnel: Array<{
    lesson_id: string;
    order: number;
    title: string;
    duration_seconds: number | null;
    has_video: boolean;
    completions: number;
  }>;
  daily_progress_30d: DailyResponse[];
}
