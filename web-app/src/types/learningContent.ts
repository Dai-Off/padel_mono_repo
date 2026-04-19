// ---------------------------------------------------------------------------
// Tipos de preguntas
// ---------------------------------------------------------------------------

export type QuestionType = 'test_classic' | 'true_false' | 'multi_select' | 'match_columns' | 'order_sequence';
export type QuestionArea = 'technique' | 'tactics' | 'physical' | 'mental' | 'rules';

export interface TestClassicContent {
  question: string;
  options: [string, string, string, string];
  correct_index: 0 | 1 | 2 | 3;
}

export interface TrueFalseContent {
  statement: string;
  correct_answer: boolean;
}

export interface MultiSelectContent {
  question: string;
  options: [string, string, string, string];
  correct_indices: number[];
}

export interface MatchColumnsContent {
  pairs: { left: string; right: string }[];
}

export interface OrderSequenceContent {
  steps: string[];
}

export type QuestionContent =
  | TestClassicContent
  | TrueFalseContent
  | MultiSelectContent
  | MatchColumnsContent
  | OrderSequenceContent;

export interface Question {
  id: string;
  club_id: string;
  type: QuestionType;
  level: number;
  area: QuestionArea;
  has_video: boolean;
  video_url: string | null;
  content: QuestionContent;
  is_active: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Tipos de cursos
// ---------------------------------------------------------------------------

export type CourseStatus = 'draft' | 'pending_review' | 'active';

export interface Course {
  id: string;
  club_id: string;
  title: string;
  description: string | null;
  banner_url: string | null;
  elo_min: number;
  elo_max: number;
  pedagogical_goal: string | null;
  staff_id: string | null;
  status: CourseStatus;
  lesson_count: number;
  created_at: string;
  updated_at: string;
}

export interface CourseLesson {
  id: string;
  course_id: string;
  order: number;
  title: string;
  description: string | null;
  video_url: string | null;
  duration_seconds: number | null;
}

export interface CourseWithLessons extends Course {
  lessons: CourseLesson[];
}
