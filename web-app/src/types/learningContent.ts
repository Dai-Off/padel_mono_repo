// ---------------------------------------------------------------------------
// Tipos de preguntas
// ---------------------------------------------------------------------------

export type QuestionType = 'test_classic' | 'true_false' | 'multi_select' | 'match_columns' | 'order_sequence' | 'puzzle';
export type QuestionArea = 'technique' | 'tactics' | 'physical' | 'mental' | 'rules';

// ---------------------------------------------------------------------------
// Tipos del puzzle (sub-árbol que vive en learning_puzzles, mergeado en
// content por el backend en GET /learning/questions y daily-lesson).
// Reglas en docs/learning/Puzzles/IMPLEMENTATION_PLAN.md §1.
// Sistema de coordenadas: pista 10 m × 20 m. Equipo 1 (usuario) abajo
// [0..10, 10..20]; equipo 2 (rival) arriba [0..10, 0..10].
// ---------------------------------------------------------------------------

export type PuzzleCourtPosition = 'left' | 'right' | 'both';
export type PuzzleShotType = 'lob' | 'chiquita';
export type PuzzleSpin = 'clockwise' | 'counter-clockwise' | 'random';
export type PuzzlePlayerFacing = 'face' | 'back';

export interface PuzzlePlayer {
  id: number;
  team: 1 | 2;
  x: number;
  y: number;
  facing?: PuzzlePlayerFacing;
  speech_label?: string;
}

export interface PuzzleBall {
  x: number;
  y: number;
  shot_type?: PuzzleShotType;
  spin?: PuzzleSpin;
}

export type PuzzleShape =
  | { id: number; type: 'arrow'; color?: string; start: { x: number; y: number }; end: { x: number; y: number }; control?: { x: number; y: number }; pointer_at_start?: boolean; pointer_at_end?: boolean; tag_text?: string }
  | { id: number; type: 'circle'; color?: string; cx: number; cy: number; r: number; dashed?: boolean }
  | { id: number; type: 'rect'; color?: string; x: number; y: number; w: number; h: number }
  | { id: number; type: 'triangle'; color?: string; points: number[] }
  | { id: number; type: 'text_tag'; color?: string; text: string; x: number; y: number; font_size?: number };

export interface PuzzleFrame {
  players: PuzzlePlayer[];
  ball: PuzzleBall;
  shapes?: PuzzleShape[];
  duration_ms?: number;
}

export interface PuzzleOption {
  id: 1 | 2 | 3;
  text: string;
  explanation: string;
  points: 0 | 1 | 2;
  badge_position?: { x: number; y: number };
  reveal_frame?: PuzzleFrame;
}

export interface PuzzleContent {
  schema_version?: 1;
  statement: string;
  court_position?: PuzzleCourtPosition;
  general_explanation?: string;
  initial_frame: PuzzleFrame;
  options: PuzzleOption[];
}

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
  | OrderSequenceContent
  | PuzzleContent;

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
  // Solo presente si type='puzzle'. Metadata de la fila learning_puzzles (id propio,
  // thumbnail_url, timestamps). El árbol también se mergea en content.
  puzzle?: {
    id: string;
    question_id: string;
    schema_version: number;
    statement: string;
    court_position: PuzzleCourtPosition;
    general_explanation: string | null;
    initial_frame: PuzzleFrame;
    options: PuzzleOption[];
    thumbnail_url: string | null;
    created_at: string;
    updated_at: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Tipos de cursos
// ---------------------------------------------------------------------------

export type CourseStatus = 'draft' | 'pending_review' | 'active' | 'inactive';

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
  review_notes: string | null;
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
