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

export type PuzzleShotType = 'lob' | 'chiquita';
export type PuzzleSpin = 'clockwise' | 'counter-clockwise' | 'random';
export type PuzzlePlayerFacing = 'face' | 'back';

export interface PuzzlePlayer {
  id: number;
  team: 1 | 2;
  x: number;
  y: number;
  is_user?: boolean;
  facing?: PuzzlePlayerFacing;
  speech_label?: string;
}

export interface PuzzleBall {
  x: number;
  y: number;
  shot_type?: PuzzleShotType;
  spin?: PuzzleSpin;
}

// Preset visual de la shape. Define color/animación/borde/etc., sustituye al uso libre
// de color/dashed/fillColor cuando está presente.
//   - trajectory     → trayectoria de pelota (curva naranja con dashes marchando + halo origen + punta perpendicular)
//   - movement       → movimiento de jugador (dashes finos azul + punta perpendicular)
//   - highlight      → halo radial pulsante (resaltar posición)
//   - good_zone      → área correcta (verde con gradient suave, transparente)
//   - bad_zone       → área a evitar (rojo con gradient + diagonales hatch)
//   - neutral_zone   → área aceptable (amarillo con gradient suave, mismo estilo que good/bad)
//   - measure        → anotación numérica (pill blanca + texto oscuro)
//   - tactical       → anotación táctica (pill naranja + mayúsculas)
//   - speech_bubble  → bocadillo de jugador (no se usa como shape directa, lo aplica el player)
export type ShapePreset =
  | 'trajectory'
  | 'movement'
  | 'highlight'
  | 'good_zone'
  | 'bad_zone'
  | 'neutral_zone'
  | 'measure'
  | 'tactical';

interface PuzzleShapeBase {
  id: string;
  style?: ShapePreset;
  color?: string;
}

export type PuzzleShape =
  | (PuzzleShapeBase & { type: 'circle'; x: number; y: number; radius: number; dashed?: boolean })
  | (PuzzleShapeBase & { type: 'arrow'; startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; controlPoint?: { x: number; y: number }; dashed?: boolean; pointerAtBeginning?: boolean; tagText?: string; tagPosition?: number })
  | (PuzzleShapeBase & { type: 'rect'; x: number; y: number; width: number; height: number; fillColor?: string; fillOpacity?: number })
  | (PuzzleShapeBase & { type: 'line'; points: number[]; strokeWidth?: number })
  | (PuzzleShapeBase & { type: 'text'; x: number; y: number; text: string; fontSize?: number })
  | (PuzzleShapeBase & { type: 'triangle'; points: number[]; fillColor?: string; fillOpacity?: number })
  | (PuzzleShapeBase & { type: 'speechbubble'; x: number; y: number; text: string; fontSize?: number });

export interface PuzzleFrame {
  players: PuzzlePlayer[];
  ball: PuzzleBall;
  shapes?: PuzzleShape[];
  duration_ms?: number;
  // Si true (default), el visor genera automáticamente una shape `trajectory`
  // desde la pelota del frame anterior hasta la actual + dos `highlight` en
  // origen y destino, sin que esas shapes estén guardadas en `shapes`. Las
  // shapes manuales en `shapes` se renderizan encima. Si false, solo se ven
  // las manuales (útil para rebotes en la pared u otras trayectorias custom).
  auto_trajectory?: boolean;
}

export interface PuzzleOption {
  id: 1 | 2 | 3;
  text: string;
  explanation: string;
  is_correct: boolean;
  badge_position?: { x: number; y: number };
  select_frame?: PuzzleFrame;
  confirmation_frame?: PuzzleFrame;
}

export interface PuzzleContent {
  schema_version?: 2;
  statement: string;
  // intro_frame opcional: si existe, al cargar el puzzle el visor reproduce
  // automáticamente la transición `intro_frame → initial_frame` antes de quedar
  // estático esperando respuesta. Útil para "previas" que añaden contexto
  // (un golpe que ya ha ocurrido, una posición inicial diferente, etc.).
  intro_frame?: PuzzleFrame;
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
  // Enunciado opcional en draft; obligatorio al publicar (validado en backend).
  question?: string;
  pairs: { left: string; right: string }[];
}

export interface OrderSequenceContent {
  question?: string;
  steps: string[];
}

export type QuestionContent =
  | TestClassicContent
  | TrueFalseContent
  | MultiSelectContent
  | MatchColumnsContent
  | OrderSequenceContent
  | PuzzleContent;

export type QuestionStatus = 'draft' | 'published' | 'inactive';

export interface Question {
  id: string;
  club_id: string;
  type: QuestionType;
  level: number;
  area: QuestionArea;
  has_video: boolean;
  video_url: string | null;
  content: QuestionContent;
  // Estado de la pregunta. Solo 'published' se sirve en las lecciones del mobile.
  //   - 'draft'     → en progreso, content puede ser inválido.
  //   - 'published' → válida y servida en lecciones.
  //   - 'inactive'  → pausada (no se sirve, conserva contenido válido).
  status: QuestionStatus;
  // Nota de moderación escrita por un admin. Visible para el club al editar.
  // NULL = sin nota.
  moderation_notes?: string | null;
  // Timestamp de la última edición por un admin (server-side). El cliente no
  // lo modifica; viene del backend.
  last_admin_edit_at?: string | null;
  // Timestamp de la última vez que el club abrió la pregunta tras recibir una
  // nota. Se usa para calcular "nota no vista" comparando contra
  // last_admin_edit_at. NULL = nunca vista tras la nota más reciente.
  notes_seen_at?: string | null;
  // Agregados de valoración (like/dislike) por pregunta. Se cuenta el voto
  // más reciente por jugador → un usuario que vio la pregunta varias veces
  // influye una sola vez. Útil para detectar preguntas mal redactadas.
  feedback_up?: number;
  feedback_down?: number;
  // Agregados de respuestas. attempts_count cuenta cada fila de
  // learning_question_log (todos los intentos). correct_count cuántos
  // fueron acertados. Útil para mostrar % de acierto y detectar preguntas
  // muy fáciles / muy difíciles.
  attempts_count?: number;
  correct_count?: number;
  created_at: string;
  // Solo presente si type='puzzle'. Metadata de la fila learning_puzzles (id propio,
  // thumbnail_url, timestamps). El árbol también se mergea en content.
  puzzle?: {
    id: string;
    question_id: string;
    schema_version: number;
    statement: string;
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

// Avisos que el backend puede señalar sobre una pregunta. Coincide con
// detectWarnings() en backend/src/routes/learningClubQuestions.ts.
export type WarningKind = 'too_easy' | 'too_hard' | 'low_quality';

export type QuestionWithWarnings = Question & { warnings: WarningKind[] };
